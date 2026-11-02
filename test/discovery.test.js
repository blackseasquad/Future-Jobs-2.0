import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memDb, testConfig, fakeFetch } from './helpers.js';
import { runRefresh } from '../src/pipeline.js';
import { upsertPosting } from '../src/lib/store.js';
import { runDiscovery } from '../src/model/discovery.js';
import { applyDynamicCatalog } from '../src/catalog/registry.js';
import { SKILL_BY_ID, detectSkills } from '../src/catalog/skills.js';
import { FUTURE_BY_ID } from '../src/catalog/future.js';
import { createApp } from '../src/server.js';

const sse = (obj) => new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] })}\n\n`, { status: 200 });

/** Фалшив Gemini, който отговаря според вида на въпроса */
function fakeGemini(calls = []) {
  return async (_url, init) => {
    const prompt = JSON.parse(init.body).contents[0].parts[0].text;
    calls.push(prompt);
    if (prompt.startsWith('Етикети от обяви')) {
      return sse([
        { term: 'qiskit', isSkill: true, name: 'Квантово програмиране', en: 'Quantum programming', description: 'Писане на програми за квантови компютри.', category: 'tech', synonyms: ['quantum computing'] },
        { term: 'engineering', isSkill: false, reason: 'твърде общо' },
      ]);
    }
    if (prompt.startsWith('Най-честите длъжности')) return sse({ isNew: false, reason: 'покрита' });
    if (prompt.startsWith('Умението')) {
      return sse({ propose: true, title: 'Архитект на безопасен системен софтуер', description: 'Проектира критични системи с езици, които предотвратяват грешки в паметта.',
        expected: '2028–2032', driver: 'Безопасен софтуер', closestToday: 'software_developer', coreSkills: ['dyn_quantum_programming', 'cybersecurity', 'software_engineering'],
        complementarySkills: ['devops'], interests: { tech: 3, science: 1 }, path: ['Сега: основи на квантовото програмиране.', 'След 2–3 години: системно програмиране.', 'След това: архитектура на критични системи.'] });
    }
    return sse({});
  };
}

test('открива ново умение от растящ етикет, отхвърля общи думи и не пита отново', async () => {
  const db = memDb();
  await runRefresh(db, { config: testConfig(), trigger: 'manual', force: true, fetchJson: fakeFetch(), log: () => {}, politeDelayMs: 0, sources: ['arbeitnow', 'remotive'] });
  const nowIso = new Date().toISOString();
  for (let i = 0; i < 30; i++) upsertPosting(db, { sourceId: 'arbeitnow', externalId: `rust-${i}`, title: `Backend Developer ${i}`, company: `R${i}`, terms: ['Qiskit', 'Engineering'] }, [], nowIso);
  const calls = [];
  const cfg = testConfig({ gemini: { apiKey: 'k', models: [] } });
  const r = await runDiscovery({ db, config: cfg, nowIso, log: () => {}, geminiFetch: /** @type {any} */ (fakeGemini(calls)) });
  assert.equal(r.inserted, 1, JSON.stringify(r));
  assert.ok(SKILL_BY_ID.has('dyn_quantum_programming'));
  assert.ok(detectSkills('Experience with Qiskit').includes('dyn_quantum_programming'), 'новото умение се разпознава в нови обяви');
  const n = db.prepare(`SELECT COUNT(*) n FROM posting_skills WHERE skill_id = 'dyn_quantum_programming'`).get().n;
  assert.equal(Number(n), 30, 'обявите с етикета получават умението веднага');
  const ev = JSON.parse(String(db.prepare(`SELECT evidence FROM dyn_catalog WHERE id = 'dyn_quantum_programming'`).get().evidence));
  assert.equal(ev.postings30, 30);
  assert.ok(db.prepare(`SELECT 1 FROM dyn_rejected WHERE kind='skill' AND origin='engineering'`).get());
  // втори път: нищо ново, без повторни въпроси за същите етикети
  calls.length = 0;
  await runDiscovery({ db, config: cfg, nowIso, log: () => {}, geminiFetch: /** @type {any} */ (fakeGemini(calls)) });
  assert.ok(!calls.some((c) => c.startsWith('Етикети от обяви')));
});

test('без GEMINI_API_KEY откриването се пропуска', async () => {
  const r = await runDiscovery({ db: memDb(), config: testConfig(), nowIso: new Date().toISOString(), log: () => {} });
  assert.equal(r.skipped, true);
});

test('бъдеща професия само от силно растящо умение; скрити записи изчезват; админ endpoint', async () => {
  const db = memDb();
  const now = Date.now();
  const iso = (d) => new Date(now - d * 86400000).toISOString();
  // предходни 30 дни: 150 обяви, 5 с Python; последни 30 дни: 150 обяви, 60 с Python
  for (let i = 0; i < 150; i++) upsertPosting(db, { sourceId: 'arbeitnow', externalId: `old-${i}`, title: `Old ${i}`, company: `O${i}` }, i < 5 ? ['python'] : [], iso(40));
  for (let i = 0; i < 150; i++) upsertPosting(db, { sourceId: 'arbeitnow', externalId: `new-${i}`, title: `New ${i}`, company: `N${i}`, terms: i < 30 ? ['Qiskit'] : [] }, i < 60 ? ['python'] : [], iso(2));
  const cfg = testConfig({ gemini: { apiKey: 'k', models: [] }, adminToken: 'a'.repeat(40) });
  const r = await runDiscovery({ db, config: cfg, nowIso: new Date(now).toISOString(), log: () => {}, geminiFetch: /** @type {any} */ (fakeGemini()) });
  const fut = db.prepare(`SELECT * FROM dyn_catalog WHERE kind = 'future'`).all();
  assert.equal(fut.length, 1, JSON.stringify(r));
  const f = FUTURE_BY_ID.get(String(fut[0].id));
  assert.ok(f && f.dynamic && f.evidence === 'ai');
  assert.match(f.why[0].text, /нараснал с \d+%/);

  const srv = createApp({ db, config: cfg });
  await new Promise((res) => srv.listen(0, () => res(null)));
  const base = `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`;
  const pub = await (await fetch(`${base}/api/catalog/new`)).json();
  assert.ok(pub.items.some((x) => x.kind === 'future'));
  assert.equal((await fetch(`${base}/api/admin/catalog`)).status, 401);
  const hide = await fetch(`${base}/api/admin/catalog`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': 'a'.repeat(40) }, body: JSON.stringify({ kind: 'future', id: fut[0].id, hidden: true }) });
  assert.equal(hide.status, 200);
  const list = await (await fetch(`${base}/api/future`)).json();
  assert.ok(!list.future.some((x) => x.id === fut[0].id), 'скритият запис не се показва');
  srv.close();
  applyDynamicCatalog(memDb(), { force: true }); // връщаме каталога в изходно състояние за другите тестове
});
