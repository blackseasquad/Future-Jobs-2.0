// Къде живее базата данни.
//  • local – обикновен SQLite файл (сървър/VPS, локална разработка, тестове).
//  • blob  – за Vercel: файловата система там е временна, затова SQLite базата се пази
//            като един private файл във Vercel Blob. Всяка инстанция я изтегля в /tmp
//            и проверява за нова версия най-много веднъж на `checkIntervalMs`.
//            Само ежедневният импорт (и ръчното обновяване) записват – чрез условно
//            качване (ifMatch по ETag), така два паралелни импорта не могат да се презапишат.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { openDb } from './db.js';

/** @typedef {import('node:sqlite').DatabaseSync} Db */
/** @typedef {{ mode:string, persistent:boolean, read:()=>Promise<Db>, write:<T>(fn:(db:Db)=>Promise<T>)=>Promise<T>, userWrites:boolean, info:()=>any }} Provider */

export class StorageConflictError extends Error {}

/** @returns {Provider} */
export function localProvider(db, { persistent = true, mode = 'local' } = {}) {
  /** @type {Promise<any>} */
  let chain = Promise.resolve();
  return {
    mode, persistent, userWrites: true,
    read: async () => db,
    // записите се изпълняват последователно в рамките на процеса
    write: (fn) => { const p = chain.then(() => fn(db)); chain = p.catch(() => {}); return p; },
    info: () => ({ mode, persistent }),
  };
}

/** Зарежда @vercel/blob само когато е нужен (локално пакетът не е задължителен). */
export async function loadVercelBlob() {
  // @ts-ignore – пакетът се инсталира от Vercel при deploy (dependencies)
  const mod = await import('@vercel/blob');
  return { get: mod.get, put: mod.put };
}

/**
 * @param {{ blob:{get:Function, put:Function}, pathname?:string, dir?:string, checkIntervalMs?:number, log?:(m:string)=>void }} o
 * @returns {Provider}
 */
export function blobProvider({ blob, pathname = 'future-jobs/db.sqlite', dir = os.tmpdir(), checkIntervalMs = 60_000, log = console.log }) {
  let current = null;      // { db, etag, file }
  let lastCheck = 0;
  let loading = null;
  let writing = null;
  let lastUpload = null;

  const newFile = () => path.join(dir, `future-jobs-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`);
  const openSnapshot = (file) => openDb(file, { journalMode: 'DELETE' });

  function retire(old) {
    if (!old) return;
    // старата версия може още да се ползва от текуща заявка – затваряме я по-късно
    const t = setTimeout(() => {
      try { old.db.close(); } catch { /* вече затворена */ }
      fs.rm(old.file, { force: true }, () => {});
    }, 120_000);
    t.unref?.();
  }

  /** Изтегля най-новата версия (ако е различна от `etag`). */
  async function download(etag) {
    const res = await blob.get(pathname, { access: 'private', useCache: false, ...(etag ? { ifNoneMatch: etag } : {}) });
    if (!res) return { notFound: true };
    if (res.statusCode === 304) return { notModified: true };
    const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
    const file = newFile();
    fs.writeFileSync(file, buf);
    return { file, etag: res.blob.etag, size: buf.length };
  }

  async function refreshCurrent(force = false) {
    if (!force && current && Date.now() - lastCheck < checkIntervalMs) return current;
    if (loading) return loading;
    loading = (async () => {
      try {
        const r = await download(current?.etag);
        lastCheck = Date.now();
        if (r.notModified && current) return current;
        if (r.notFound) {
          if (!current) {
            const file = newFile();
            current = { db: openSnapshot(file), etag: null, file }; // празна база до първия импорт
          }
          return current;
        }
        const next = { db: openSnapshot(r.file), etag: r.etag, file: r.file };
        const old = current;
        current = next;
        retire(old);
        return current;
      } catch (err) {
        // при недостъпен Blob продължаваме с последната изтеглена версия
        log(`[storage] неуспешна проверка за нова версия: ${err.message}`);
        if (current) return current;
        throw err;
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  return {
    mode: 'vercel-blob', persistent: true, userWrites: false,
    async read() { return (await refreshCurrent()).db; },
    async write(fn) {
      if (writing) throw new StorageConflictError('В тази инстанция вече тече обновяване');
      writing = (async () => {
        // работим върху собствено копие на най-новата версия
        const r = await download(null);
        const file = r.file || newFile();
        const db = openSnapshot(file);
        const baseEtag = r.notFound ? null : r.etag;
        let result;
        try { result = await fn(db); } catch (err) { try { db.close(); } catch { /* */ } throw err; }
        // качваме и при неуспешен импорт, за да се пази историята на грешките
        const bytes = fs.readFileSync(file);
        try {
          const up = await blob.put(pathname, bytes, {
            access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/vnd.sqlite3',
            cacheControlMaxAge: 60, ...(baseEtag ? { ifMatch: baseEtag } : {}),
          });
          lastUpload = { at: new Date().toISOString(), size: bytes.length };
          const old = current;
          current = { db, etag: up?.etag || null, file };
          lastCheck = Date.now();
          retire(old);
        } catch (err) {
          try { db.close(); } catch { /* */ }
          if (/precondition|etag/i.test(String(err?.name) + String(err?.message))) {
            throw new StorageConflictError('Друго обновяване записа данни междувременно – резултатът от това изпълнение не е записан.');
          }
          throw err;
        }
        return result;
      })();
      try { return await writing; } finally { writing = null; }
    },
    info: () => ({ mode: 'vercel-blob', persistent: true, pathname, etag: current?.etag || null, lastUpload }),
  };
}
