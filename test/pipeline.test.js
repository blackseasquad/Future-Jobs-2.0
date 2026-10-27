import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memDb, testConfig, fakeFetch, eurostatFixture } from './helpers.js';
import { runRefresh, AlreadyRunningError } from '../src/pipeline.js';
import { getMeta, openDb, migrate } from '../src/db.js';
import { parseJsonStat } from '../src/lib/jsonstat.js';

const count = (db, sql, ...a) => Number(db.prepare(sql).get(...a).n);
const opts = (o = {}) => ({ config: testConfig(), trigger: 'cli', fetchJson: fakeFetch(o.f), log: () => {}, politeDelayMs: 0, ...o });

test('JSON-stat парсерът декодира позициите правилно', () => {
  const ds = eurostatFixture('earn_ses22_28');
  const { rows } = parseJsonStat(ds);
  const r = rows.find((x) => x.dims.geo === 'BG' && x.dims.isco08 === 'OC2');
  assert.equal(r.value, 17969);
  assert.equal(rows.filter((x) => x.dims.geo === 'BG').length, 10);
});

test('пълен импорт: записва данни, показатели и време на последния успешен импорт', async () => {
  const db = memDb();
  const r = await runRefresh(db, opts());
  assert.equal(r.status, 'success', JSON.stringify(r.results));
  assert.ok(count(db, "SELECT COUNT(*) n FROM stat_observations WHERE source_id='eurostat'") > 100);
  assert.ok(count(db, "SELECT COUNT(*) n FROM stat_observations WHERE source_id='wef'") >= 30);
  assert.ok(count(db, "SELECT COUNT(*) n FROM stat_observations WHERE source_id='cedefop'") >= 10);
  assert.equal(count(db, "SELECT COUNT(*) n FROM job_postings WHERE source_id='arbeitnow'"), 200);
  // 5 кръстосани дубликата от Remotive не се записват
  assert.equal(count(db, "SELECT COUNT(*) n FROM job_postings WHERE source_id='remotive'"), 55);
  assert.ok(count(db, 'SELECT COUNT(*) n FROM posting_skills') > 200);
  assert.ok(count(db, 'SELECT COUNT(*) n FROM esco_concepts') > 30);
  assert.ok(count(db, 'SELECT COUNT(*) n FROM skill_metrics WHERE score IS NOT NULL') > 10);
  assert.ok(getMeta(db, 'last_successful_import_at'));
  // wstatus != EMP редовете са филтрирани
  assert.equal(count(db, "SELECT COUNT(*) n FROM stat_observations WHERE dataset='lfsa_egais' AND value = 1"), 0);
});

test('повторно планирано изпълнение в същия ден се пропуска; принудителното не дублира', async () => {
  const db = memDb();
  await runRefresh(db, opts({ trigger: 'scheduled' }));
  const before = {
    obs: count(db, 'SELECT COUNT(*) n FROM stat_observations'), post: count(db, 'SELECT COUNT(*) n FROM job_postings'),
    ps: count(db, 'SELECT COUNT(*) n FROM posting_skills'), esco: count(db, 'SELECT COUNT(*) n FROM esco_concepts'),
    metrics: count(db, 'SELECT COUNT(*) n FROM skill_metrics'),
  };
  const again = await runRefresh(db, opts({ trigger: 'scheduled' }));
  assert.equal(again.status, 'skipped');
  const forced = await runRefresh(db, opts({ trigger: 'manual', force: true }));
  assert.equal(forced.status, 'success');
  assert.equal(count(db, 'SELECT COUNT(*) n FROM stat_observations'), before.obs);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM job_postings'), before.post);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM posting_skills'), before.ps);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM esco_concepts'), before.esco);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM skill_metrics'), before.metrics, 'една редица показатели на умение на ден');
  const euro = forced.results.find((x) => x.source === 'eurostat');
  assert.equal(euro.inserted, 0);
  assert.ok(euro.duplicates > 0);
});

test('ревизия на стойност от Eurostat пази историческата стойност', async () => {
  const db = memDb();
  await runRefresh(db, opts());
  await runRefresh(db, opts({ force: true, f: { bump: 5 } }));
  assert.equal(count(db, 'SELECT COUNT(*) n FROM stat_revisions'), 1);
  const rev = db.prepare('SELECT * FROM stat_revisions').get();
  assert.equal(Math.round((Number(rev.new_value) - Number(rev.old_value)) * 10) / 10, 5);
});

test('недостъпен източник: частичен успех, грешката се записва, старите данни остават', async () => {
  const db = memDb();
  await runRefresh(db, opts());
  const posts = count(db, 'SELECT COUNT(*) n FROM job_postings');
  const r = await runRefresh(db, opts({ force: true, f: { down: ['arbeitnow'] } }));
  assert.equal(r.status, 'partial');
  const st = db.prepare("SELECT * FROM source_state WHERE source_id='arbeitnow'").get();
  assert.match(String(st.last_error), /ENOTFOUND/);
  assert.equal(Number(st.consecutive_failures), 1);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM job_postings'), posts);
  const sr = db.prepare("SELECT status FROM source_runs WHERE source_id='arbeitnow' ORDER BY id DESC").get();
  assert.equal(sr.status, 'failed');
});

test('всички живи източници недостъпни: импортът е неуспешен, последните валидни показатели се запазват', async () => {
  const db = memDb();
  await runRefresh(db, opts());
  const lastOk = getMeta(db, 'last_successful_import_at');
  const metricsBefore = db.prepare('SELECT skill_id, score, computed_at FROM skill_metrics ORDER BY skill_id').all();
  const r = await runRefresh(db, opts({ force: true, f: { down: ['eurostat', 'esco', 'arbeitnow', 'remotive'] }, config: testConfig() }));
  assert.equal(r.status, 'failed');
  assert.equal(getMeta(db, 'last_successful_import_at'), lastOk);
  assert.deepEqual(db.prepare('SELECT skill_id, score, computed_at FROM skill_metrics ORDER BY skill_id').all(), metricsBefore);
});

test('паралелно изпълнение е блокирано от заключване', async () => {
  const db = memDb();
  /** @type {any} */ let release;
  const gate = new Promise((r) => { release = r; });
  const slow = fakeFetch();
  const p1 = runRefresh(db, opts({ fetchJson: async (u) => { await gate; return slow(u); } }));
  await new Promise((r) => setTimeout(r, 20));
  await assert.rejects(runRefresh(db, opts({ force: true })), AlreadyRunningError);
  release();
  assert.equal((await p1).status, 'success');
  // след приключване заключването е освободено
  assert.equal(count(db, 'SELECT COUNT(*) n FROM run_lock'), 0);
});

test('режим window=sofia изпълнява само в 06:xx ч. по София', async () => {
  const db = memDb();
  const at = (iso) => () => new Date(iso);
  // 25.10.2026 – денят на смяна към зимно време (UTC+2): 06:00 София = 04:00 UTC
  assert.equal((await runRefresh(db, opts({ onlyInSofiaHour: 6, now: at('2026-10-25T03:30:00Z') }))).status, 'skipped');
  assert.equal((await runRefresh(db, opts({ onlyInSofiaHour: 6, now: at('2026-10-25T04:05:00Z') }))).status, 'success');
});

test('миграциите са идемпотентни', () => {
  const db = openDb(':memory:');
  assert.doesNotThrow(() => { migrate(db); migrate(db); });
  assert.equal(count(db, 'SELECT COUNT(*) n FROM schema_migrations'), 1);
});
