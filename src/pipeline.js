// Ежедневен импорт: извличане → валидиране → нормализиране → дедупликация →
// запис с история → преизчисляване на показателите → лог на изпълнението.
import { SOURCE_META, syncSources } from './sources/index.js';
import { computeSkillMetrics } from './model/scoring.js';
import { fetchJson as realFetchJson } from './lib/http.js';
import { sofiaDate, zonedParts } from './lib/time.js';
import { setMeta } from './db.js';

const LOCK_NAME = 'daily-refresh';
const LOCK_STALE_MS = 2 * 3600 * 1000;

export class AlreadyRunningError extends Error {}

function acquireLock(db, runId, nowIso) {
  const existing = db.prepare('SELECT run_id, locked_at FROM run_lock WHERE name = ?').get(LOCK_NAME);
  if (existing && Date.parse(nowIso) - Date.parse(String(existing.locked_at)) < LOCK_STALE_MS) {
    throw new AlreadyRunningError(`Друго обновяване (run #${existing.run_id}) вече тече`);
  }
  db.prepare(`INSERT INTO run_lock(name, run_id, locked_at) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET run_id = excluded.run_id, locked_at = excluded.locked_at`).run(LOCK_NAME, runId, nowIso);
}

function releaseLock(db, runId) {
  db.prepare('DELETE FROM run_lock WHERE name = ? AND run_id = ?').run(LOCK_NAME, runId);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{config:any, trigger:string, force?:boolean, onlyInSofiaHour?:number|null,
 *          fetchJson?:Function, now?:()=>Date, log?:(m:string)=>void, sources?:string[], politeDelayMs?:number, deadlineMs?:number}} opts
 */
export async function runRefresh(db, opts) {
  const now = opts.now || (() => new Date());
  const log = opts.log || ((m) => console.log(`[refresh] ${m}`));
  const start = now();
  const runDate = sofiaDate(start);
  syncSources(db);

  // Режим „само в 06:00 София“ – за външни планировчици в UTC (напр. GitHub Actions)
  if (opts.onlyInSofiaHour !== undefined && opts.onlyInSofiaHour !== null && zonedParts(start).hour !== opts.onlyInSofiaHour) {
    return { status: 'skipped', reason: `Не е ${opts.onlyInSofiaHour}:00 ч. в София (сега: ${zonedParts(start).hour}:xx)` };
  }
  // Идемпотентност: планираното изпълнение се прави най-много веднъж успешно на ден
  if (!opts.force) {
    const done = db.prepare(`SELECT id FROM refresh_runs WHERE run_date = ? AND status IN ('success','partial') LIMIT 1`).get(runDate);
    if (done) return { status: 'skipped', reason: `Днес (${runDate}) вече има успешно обновяване (run #${done.id})`, runId: Number(done.id) };
  }

  const startedIso = start.toISOString();
  const run = db.prepare(`INSERT INTO refresh_runs(run_date, trigger, status, started_at) VALUES (?, ?, 'running', ?)`)
    .run(runDate, opts.trigger, startedIso);
  const runId = Number(run.lastInsertRowid);
  try {
    acquireLock(db, runId, startedIso);
  } catch (err) {
    db.prepare(`UPDATE refresh_runs SET status = 'skipped', finished_at = ?, message = ? WHERE id = ?`).run(now().toISOString(), err.message, runId);
    throw err;
  }

  const results = [];
  try {
    const fetchJson = opts.fetchJson || realFetchJson;
    const selected = SOURCE_META.filter((s) => s.adapter && (!opts.sources || opts.sources.includes(s.id)));
    const deadline = opts.deadlineMs ? start.getTime() + opts.deadlineMs : null;
    for (const meta of selected) {
      // Времеви бюджет (Vercel): източник, който не може да започне навреме, се пропуска и
      // ще бъде опитан при следващото изпълнение. Данните му от предишни дни остават.
      if (deadline && Date.now() > deadline) {
        const reason = 'Пропуснат: изчерпан времеви бюджет на изпълнението';
        db.prepare(`INSERT INTO source_runs(run_id, source_id, status, started_at, finished_at, error) VALUES (?, ?, 'skipped', ?, ?, ?)`)
          .run(runId, meta.id, now().toISOString(), now().toISOString(), reason);
        results.push({ source: meta.id, status: 'skipped', reason });
        continue;
      }
      const srcStart = now().toISOString();
      const sr = db.prepare(`INSERT INTO source_runs(run_id, source_id, status, started_at) VALUES (?, ?, 'running', ?)`).run(runId, meta.id, srcStart);
      const srId = Number(sr.lastInsertRowid);
      const ctx = { db, config: opts.config, fetchJson, nowIso: srcStart, log, force: !!opts.force, politeDelayMs: opts.politeDelayMs, deadline };
      try {
        const r = /** @type {any} */ (await meta.adapter.run(ctx));
        if (r?.skipped) {
          db.prepare(`UPDATE source_runs SET status = 'skipped', finished_at = ?, error = ? WHERE id = ?`).run(now().toISOString(), r.reason, srId);
          results.push({ source: meta.id, status: 'skipped', reason: r.reason });
          continue;
        }
        db.prepare(`UPDATE source_runs SET status = 'success', finished_at = ?, fetched = ?, inserted = ?, updated = ?, duplicates = ?,
          rejected = ?, data_period = ?, error = ? WHERE id = ?`)
          .run(now().toISOString(), r.fetched || 0, r.inserted || 0, r.updated || 0, r.duplicates || 0, r.rejected || 0,
            r.dataPeriod || null, r.warning || null, srId);
        db.prepare(`INSERT INTO source_state(source_id, last_attempt_at, last_success_at, last_error, last_data_period, consecutive_failures)
          VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT(source_id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at,
          last_success_at = excluded.last_success_at, last_error = excluded.last_error,
          last_data_period = COALESCE(excluded.last_data_period, source_state.last_data_period), consecutive_failures = 0`)
          .run(meta.id, srcStart, now().toISOString(), r.warning || null, r.dataPeriod || null);
        results.push({ source: meta.id, status: 'success', ...r });
        log(`${meta.id}: OK (нови ${r.inserted || 0}, обновени ${r.updated || 0}, дубликати ${r.duplicates || 0}, отхвърлени ${r.rejected || 0})`);
      } catch (err) {
        // Грешката в един източник не спира останалите; предишните данни остават непокътнати
        const msg = String(err?.message || err).slice(0, 1000);
        db.prepare(`UPDATE source_runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?`).run(now().toISOString(), msg, srId);
        db.prepare(`INSERT INTO source_state(source_id, last_attempt_at, last_error, consecutive_failures) VALUES (?, ?, ?, 1)
          ON CONFLICT(source_id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at, last_error = excluded.last_error,
          consecutive_failures = source_state.consecutive_failures + 1`).run(meta.id, srcStart, msg);
        results.push({ source: meta.id, status: 'failed', error: msg });
        log(`${meta.id}: ГРЕШКА – ${msg}`);
      }
    }

    const ok = results.filter((r) => r.status === 'success');
    const failed = results.filter((r) => r.status === 'failed');
    // Реални (живи) източници – не броим публикуваните доклади, които са локални
    const liveOk = ok.filter((r) => !['wef', 'cedefop'].includes(r.source));
    let metrics = null;
    let status;
    if (liveOk.length === 0) {
      status = 'failed'; // показателите НЕ се преизчисляват – остават последните валидни
    } else {
      metrics = computeSkillMetrics(db, now());
      status = failed.length ? 'partial' : 'success';
      setMeta(db, 'last_successful_import_at', now().toISOString());
      setMeta(db, 'last_successful_run_id', String(runId));
    }
    const message = `${ok.length} успешни, ${failed.length} неуспешни, ${results.filter((r) => r.status === 'skipped').length} пропуснати` +
      (metrics ? `; показатели за ${metrics.results.length} умения (${metrics.postingsInWindow} обяви за 30 дни)` : '; показателите не са преизчислени');
    db.prepare('UPDATE refresh_runs SET status = ?, finished_at = ?, message = ? WHERE id = ?').run(status, now().toISOString(), message, runId);
    return { status, runId, runDate, results, metrics, message };
  } catch (err) {
    db.prepare(`UPDATE refresh_runs SET status = 'failed', finished_at = ?, message = ? WHERE id = ?`)
      .run(now().toISOString(), String(err?.message || err), runId);
    throw err;
  } finally {
    releaseLock(db, runId);
  }
}
