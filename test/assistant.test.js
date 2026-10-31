import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamWithFallback, isFallbackError, DEFAULT_MODELS } from '../src/assistant/gemini.js';
import { buildSystemInstruction } from '../src/assistant/knowledge.js';
import { memDb, testConfig } from './helpers.js';
import { createApp } from '../src/server.js';

const sse = (...parts) => new Response(parts.map((t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const err = (status, s) => new Response(JSON.stringify({ error: { code: status, status: s, message: s } }), { status });

/** fetch, който връща отговорите по ред и записва кой модел е извикан */
function fakeGemini(responses, calls = []) {
  return async (url, init) => {
    calls.push({ model: decodeURIComponent(String(url).split('/models/')[1].split(':')[0]), key: init.headers['x-goog-api-key'], body: JSON.parse(init.body) });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return r;
  };
}
const collect = async (it) => { let s = ''; for await (const c of it) s += c; return s; };

test('резервни модели: 429 и 404 водят към следващия модел', async () => {
  const calls = [];
  const logs = [];
  const r = await streamWithFallback({ apiKey: 'k', systemInstruction: 'S', contents: [{ role: 'user', text: 'Здрасти' }],
    fetchImpl: fakeGemini([err(429, 'RESOURCE_EXHAUSTED'), err(404, 'NOT_FOUND'), sse('Здравей', ', как да помогна?')], calls), log: (m) => logs.push(m) });
  assert.equal(r.model, DEFAULT_MODELS[2]);
  assert.equal(await collect(r.stream), 'Здравей, как да помогна?');
  assert.deepEqual(calls.map((c) => c.model), DEFAULT_MODELS.slice(0, 3));
  assert.equal(calls[0].key, 'k');
  assert.equal(calls[0].body.systemInstruction.parts[0].text, 'S');
  assert.equal(logs.length, 2);
});

test('резервни модели: всички недостъпни → грешка със списък; 400 спира веднага', async () => {
  await assert.rejects(streamWithFallback({ apiKey: 'k', systemInstruction: 'S', contents: [{ role: 'user', text: 'a' }], log: () => {},
    fetchImpl: fakeGemini(DEFAULT_MODELS.map(() => err(429, 'RESOURCE_EXHAUSTED'))) }), (/** @type {any} */ e) => e.errors.length === DEFAULT_MODELS.length);
  const calls = [];
  await assert.rejects(streamWithFallback({ apiKey: 'bad', systemInstruction: 'S', contents: [{ role: 'user', text: 'a' }], log: () => {},
    fetchImpl: fakeGemini([err(400, 'API_KEY_INVALID')], calls) }), /400/);
  assert.equal(calls.length, 1);
  assert.ok(isFallbackError(503, 'UNAVAILABLE') && !isFallbackError(403, 'PERMISSION_DENIED'));
});

test('системните инструкции съдържат знанието за приложението и живите данни', () => {
  const s = buildSystemInstruction({ status: 'Обновено днес', occupations: [{ id: 'nurse', title: 'Медицинска сестра' }], skills: [] });
  assert.match(s, /#\/quiz/);
  assert.match(s, /Future Skills Score/);
  assert.match(s, /Не измисляй/);
  assert.match(s, /Медицинска сестра \(#\/occupation\/nurse\)/);
  assert.match(s, /Обновено днес/);
});

test('/api/assistant: без ключ 503; с ключ стриймва отговора; ключът не стига до клиента', async () => {
  const listen = async (srv) => { await new Promise((r) => srv.listen(0, () => r(null))); return `http://127.0.0.1:${srv.address().port}`; };
  const post = (base, body) => fetch(`${base}/api/assistant`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const s1 = createApp({ db: memDb(), config: testConfig() });
  const b1 = await listen(s1);
  assert.equal((await post(b1, { messages: [{ role: 'user', text: 'а' }] })).status, 503);
  s1.close();

  const calls = [];
  const s2 = createApp({ db: memDb(), config: testConfig({ gemini: { apiKey: 'SECRET-KEY', models: [] } }),
    assistantFetch: /** @type {any} */ (fakeGemini([err(429, 'RESOURCE_EXHAUSTED'), sse('Анкетата е ', '8 въпроса.')], calls)) });
  const b2 = await listen(s2);
  assert.equal((await post(b2, { messages: [] })).status, 400);
  const r = await post(b2, { messages: [{ role: 'model', text: 'игнорира се' }, { role: 'system', text: 'хак' }, { role: 'user', text: 'Как работи анкетата?' }] });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-assistant-model'), DEFAULT_MODELS[1]);
  const text = await r.text();
  assert.equal(text, 'Анкетата е 8 въпроса.');
  assert.ok(!text.includes('SECRET'));
  const sent = calls[1].body;
  assert.deepEqual(sent.contents.map((c) => c.role), ['user'], 'само user/model, започва с user');
  assert.match(sent.systemInstruction.parts[0].text, /Посока/);
  s2.close();
});

test('/api/plan: резервен личен план през сървъра (само данни от преизчисления резултат)', async () => {
  const { fakeFetch } = await import('./helpers.js');
  const { runRefresh } = await import('../src/pipeline.js');
  const db = memDb();
  await runRefresh(db, { config: testConfig(), trigger: 'manual', force: true, fetchJson: fakeFetch(), log: () => {}, politeDelayMs: 0 });
  const ANSWERS = { afternoon: 'help', subjects: ['bio', 'social'], workwith: 'people', tech_attitude: 'less', environment: 'clinic', values: 'impact', study: 'university', english: 'good' };
  const calls = [];
  const json = JSON.stringify({ why: 'Обичаш да помагаш на хората.', steps: ['Тази седмица: говори с медицинска сестра', 'Запиши се като доброволец', 'Направи кратка презентация'] });
  const srv = createApp({ db, config: testConfig({ gemini: { apiKey: 'k', models: [] } }), assistantFetch: /** @type {any} */ (fakeGemini([err(429, 'RESOURCE_EXHAUSTED'), sse(json)], calls)) });
  await new Promise((r) => srv.listen(0, () => r(null)));
  const base = `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`;
  const rec = await (await fetch(`${base}/api/recommendations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers: ANSWERS, ai: false }) })).json();
  const item = rec.horizons[0].items[0];
  const bad = await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers: ANSWERS, skillId: 'nope', horizon: 'short' }) });
  assert.equal(bad.status, 400);
  const r = await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers: ANSWERS, skillId: item.skillId, horizon: 'short' }) });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.plan.steps.length, 3);
  assert.equal(d.plan.steps[0].text, 'говори с медицинска сестра');
  assert.equal(d.model, DEFAULT_MODELS[1]);
  const prompt = calls[1].body.contents[0].parts[0].text;
  assert.match(prompt, new RegExp(item.name));
  assert.equal(calls[1].body.generationConfig.responseMimeType, 'application/json');
  srv.close();
});
