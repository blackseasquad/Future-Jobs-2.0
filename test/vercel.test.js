// Тестове за режима на Vercel: база във Vercel Blob, Vercel Cron, req.body, времеви бюджет.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { testConfig, fakeFetch, memDb } from './helpers.js';
import { blobProvider, StorageConflictError } from '../src/storage.js';
import { createHandler } from '../src/server.js';
import { runRefresh } from '../src/pipeline.js';
import { getMeta } from '../src/db.js';

/** Фалшив Vercel Blob със същата семантика като @vercel/blob (get/put, ETag, ifMatch, ifNoneMatch). */
function fakeBlob() {
  const store = new Map();
  const calls = { get: 0, put: 0 };
  return {
    calls, store,
    async get(pathname, opts) {
      calls.get++;
      assert.equal(opts.access, 'private');
      const b = store.get(pathname);
      if (!b) return null;
      if (opts.ifNoneMatch && opts.ifNoneMatch === b.etag) return { statusCode: 304, stream: null, blob: { etag: b.etag } };
      return { statusCode: 200, stream: new Blob([b.bytes]).stream(), blob: { etag: b.etag, size: b.bytes.length } };
    },
    async put(pathname, bytes, opts) {
      calls.put++;
      assert.equal(opts.access, 'private');
      const cur = store.get(pathname);
      if (opts.ifMatch && (!cur || cur.etag !== opts.ifMatch)) throw Object.assign(new Error('Precondition failed: ETag mismatch'), { name: 'BlobPreconditionFailedError' });
      if (cur && !opts.allowOverwrite) throw new Error('exists');
      const etag = `"${crypto.createHash('md5').update(bytes).digest('hex')}-${calls.put}"`;
      store.set(pathname, { bytes: Buffer.from(bytes), etag });
      return { etag, pathname };
    },
  };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fj-'));
const refresh = (o = {}) => (db) => runRefresh(db, { config: testConfig(), trigger: 'manual', force: true, fetchJson: fakeFetch(o), log: () => {}, politeDelayMs: 0 });

test('Blob: празна база до първия импорт, после данните са видими и от нова инстанция', async () => {
  const blob = fakeBlob();
  const a = blobProvider({ blob, dir: tmp(), checkIntervalMs: 0, log: () => {} });
  const empty = await a.read();
  assert.equal(getMeta(empty, 'last_successful_import_at'), null);

  const r = await a.write(refresh());
  assert.equal(r.status, 'success');
  assert.equal(blob.calls.put, 1);
  assert.ok(getMeta(await a.read(), 'last_successful_import_at'), 'инстанцията, която е писала, вижда новите данни');

  // „Студен старт“ на друга инстанция
  const b = blobProvider({ blob, dir: tmp(), checkIntervalMs: 0, log: () => {} });
  const db = await b.read();
  assert.ok(getMeta(db, 'last_successful_import_at'));
  assert.ok(Number(db.prepare('SELECT COUNT(*) n FROM job_postings').get().n) > 200);

  // Без промяна → 304, същият handle
  assert.equal(await b.read(), db);
});

test('Blob: паралелен запис от друга инстанция не презаписва данните (ifMatch)', async () => {
  const blob = fakeBlob();
  const a = blobProvider({ blob, dir: tmp(), checkIntervalMs: 0, log: () => {} });
  await a.write(refresh());
  const b = blobProvider({ blob, dir: tmp(), checkIntervalMs: 0, log: () => {} });
  /** @type {any} */ let release;
  const gate = new Promise((r) => { release = r; });
  // b започва импорт, a завършва друг междувременно → b трябва да получи конфликт
  const pb = b.write(async (db) => { await gate; return refresh()(db); });
  await new Promise((r) => setTimeout(r, 30));
  await a.write(refresh());
  release();
  await assert.rejects(pb, StorageConflictError);
});

test('Blob: при недостъпен Blob се ползва последната изтеглена версия', async () => {
  const blob = fakeBlob();
  const p = blobProvider({ blob, dir: tmp(), checkIntervalMs: 0, log: () => {} });
  await p.write(refresh());
  const db = await p.read();
  blob.get = async () => { throw new Error('network down'); };
  assert.equal(await p.read(), db);
});

test('Blob: неуспешен импорт също се записва (история на грешките)', async () => {
  const blob = fakeBlob();
  const p = blobProvider({ blob, dir: tmp(), checkIntervalMs: 0, log: () => {} });
  const r = await p.write(refresh({ down: ['eurostat', 'esco', 'arbeitnow', 'remotive'] }));
  assert.equal(r.status, 'failed');
  const db = await p.read();
  assert.equal(db.prepare("SELECT status FROM refresh_runs ORDER BY id DESC").get().status, 'failed');
});

async function serve(handler, { preParseBody = false } = {}) {
  // preParseBody имитира Vercel Node runtime, който предоставя req.body
  const server = http.createServer(async (req, res) => {
    if (preParseBody && req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const text = Buffer.concat(chunks).toString();
      Object.defineProperty(req, 'body', { value: text ? JSON.parse(text) : {}, configurable: true });
    }
    return handler(req, res);
  });
  await new Promise((r) => server.listen(0, () => r(null)));
  return { server, base: `http://127.0.0.1:${/** @type {any} */ (server.address()).port}` };
}

test('Vercel Cron: GET /api/cron/daily изисква CRON_SECRET и пуска импорт само в 06:xx София', async () => {
  const blob = fakeBlob();
  const seen = [];
  const provider = blobProvider({ blob, dir: tmp(), checkIntervalMs: 0, log: () => {} });
  const handler = createHandler({ provider, config: testConfig({ refreshBudgetMs: 240000 }),
    refreshImpl: async (db, opts) => { seen.push(opts); return { status: 'skipped', reason: 'test' }; } });
  const { server, base } = await serve(handler);
  try {
    assert.equal((await fetch(`${base}/api/cron/daily`)).status, 401);
    assert.equal((await fetch(`${base}/api/cron/daily`, { headers: { authorization: 'Bearer nope' } })).status, 401);
    const ok = await fetch(`${base}/api/cron/daily`, { headers: { authorization: `Bearer ${'c'.repeat(40)}` } });
    assert.equal(ok.status, 200, 'на Vercel изпълнението винаги се изчаква (няма фонови задачи)');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].onlyInSofiaHour, 6);
    assert.equal(seen[0].trigger, 'scheduled');
    assert.equal(seen[0].deadlineMs, 240000);
  } finally { server.close(); }
});

test('Vercel: заявки с вече парснато req.body работят; статусът показва хранилището', async () => {
  const blob = fakeBlob();
  const provider = blobProvider({ blob, dir: tmp(), checkIntervalMs: 0, log: () => {} });
  await provider.write(refresh());
  const sent = [];
  const handler = createHandler({ provider, config: testConfig({ smtp: { host: 'x', port: 1, secure: false, user: '', pass: '', from: 'a@b.bg' } }),
    sendMail: async (_s, m) => { sent.push(m); }, aiImpl: /** @type {any} */ (async () => ({ enabled: false })) });
  const { server, base } = await serve(handler, { preParseBody: true });
  try {
    const answers = { afternoon: 'code', subjects: ['it'], workwith: 'data', tech_attitude: 'build', environment: 'office', values: 'income', study: 'course', english: 'good' };
    const rec = await fetch(`${base}/api/recommendations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers }) });
    assert.equal(rec.status, 200);
    assert.equal((await rec.json()).horizons.length, 3);
    const em = await fetch(`${base}/api/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers, email: 'a@b.bg', consent: true }) });
    assert.equal(em.status, 200);
    assert.equal(sent.length, 1);
    const st = await (await fetch(`${base}/api/status`)).json();
    assert.equal(st.storage.mode, 'vercel-blob');
    assert.equal(st.storage.warning, null);
    assert.equal(st.stale, false);
    const putsBefore = blob.calls.put;
    assert.equal(blob.calls.put, putsBefore, 'потребителските заявки не пишат в Blob');
  } finally { server.close(); }
});

test('времеви бюджет: източниците след крайния срок се пропускат, без да се губят данни', async () => {
  const db = memDb();
  const slow = fakeFetch();
  const r = await runRefresh(db, { config: testConfig(), trigger: 'cli', log: () => {}, politeDelayMs: 0, deadlineMs: 50,
    fetchJson: async (u) => { await new Promise((x) => setTimeout(x, 30)); return slow(u); } });
  const skipped = r.results.filter((x) => x.status === 'skipped').map((x) => x.source);
  assert.ok(skipped.includes('esco'), JSON.stringify(r.results.map((x) => [x.source, x.status])));
  assert.ok(r.results.find((x) => x.source === 'eurostat').status === 'success');
  assert.notEqual(r.status, 'failed');
});
