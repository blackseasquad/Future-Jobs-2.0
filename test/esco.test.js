import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memDb, testConfig, fakeFetch } from './helpers.js';
import { esco, ESCO_TARGETS, fetchEscoConcept } from '../src/sources/esco.js';
import { FetchError } from '../src/lib/http.js';

const forbidden = async (url) => { throw Object.assign(new FetchError('HTTP 403 Forbidden – Access Denied', 403, url), { fatal: true }); };
const ctxFor = (o) => ({ db: memDb(), config: testConfig(), nowIso: new Date().toISOString(), log: () => {}, politeDelayMs: 0, force: false, ...o });

test('ESCO 403: спира веднага и ползва запазената снимка', async () => {
  const live = fakeFetch();
  const concepts = [];
  for (const t of ESCO_TARGETS) concepts.push(await fetchEscoConcept(live, t, 1000));
  const calls = [];
  const ctx = ctxFor({ fetchJson: async (u) => { calls.push(u); return forbidden(u); }, escoSnapshot: { createdAt: '2026-10-20T10:00:00.000Z', concepts } });
  const r = await esco.run(ctx);
  assert.equal(calls.length, 1, 'след 403 не се правят повече заявки');
  assert.equal(r.fetched, ESCO_TARGETS.length);
  assert.match(r.warning, /403/);
  assert.match(r.dataPeriod, /снимка от 2026-10-20/);
  assert.equal(Number(ctx.db.prepare('SELECT COUNT(*) n FROM esco_concepts WHERE local_id IS NOT NULL').get().n), ESCO_TARGETS.length);
  assert.ok(Number(ctx.db.prepare('SELECT COUNT(*) n FROM esco_relations').get().n) > 0);
});

test('ESCO 403 без снимка: ясна грешка с инструкция', async () => {
  await assert.rejects(esco.run(ctxFor({ fetchJson: forbidden, escoSnapshot: null })), /esco:snapshot/);
});

test('грешките от HTML страници се показват като кратък текст', () => {
  const html = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"><HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY>You don\'t have permission</BODY></HTML>';
  return import('../src/lib/http.js').then(({ stripHtml }) => assert.equal(stripHtml(html).startsWith('Access Denied'), true));
});
