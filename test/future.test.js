import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memDb, testConfig, fakeFetch } from './helpers.js';
import { runRefresh } from '../src/pipeline.js';
import { recommend } from '../src/model/recommend.js';
import { quizFor, buildProfile } from '../src/catalog/quiz.js';
import { FUTURE_OCCUPATIONS, CHANGING_JOBS } from '../src/catalog/future.js';
import { SKILL_BY_ID } from '../src/catalog/skills.js';
import { OCCUPATION_BY_ID } from '../src/catalog/occupations.js';
import { createApp } from '../src/server.js';

const YOUNG = { afternoon: 'code', subjects: ['math', 'it'], workwith: 'data', tech_attitude: 'build', environment: 'office', values: 'income', study: 'university', english: 'mid' };

test('анкета: 9 въпроса за ученик/студент, 10 за работещ; текстовете се сменят', () => {
  assert.equal(quizFor('pupil').length, 9);
  assert.equal(quizFor('student').length, 9);
  assert.equal(quizFor('working').length, 10);
  assert.equal(quizFor('changing').length, 10);
  assert.match(quizFor('student').find((q) => q.id === 'study').text, /университета/);
  assert.match(quizFor('working').find((q) => q.id === 'study').text, /време/);
  assert.match(quizFor('working').find((q) => q.id === 'subjects').text, /области/);
  assert.ok(!quizFor('pupil').some((q) => q.id === 'current_field'));
  // стари отговори без „situation“ продължават да работят (ученик)
  assert.equal(buildProfile(YOUNG).settings.situation, 'pupil');
  assert.throws(() => buildProfile({ ...YOUNG, situation: 'working' }), /сфера/);
  assert.throws(() => buildProfile({ ...YOUNG, situation: 'alien' }), /невалиден/);
});

test('каталог на бъдещето: всички умения и професии съществуват, всяка бъдеща професия има източник', () => {
  for (const f of FUTURE_OCCUPATIONS) {
    for (const s of [...f.coreSkills, ...f.complementarySkills]) assert.ok(SKILL_BY_ID.has(s), `${f.id}: ${s}`);
    assert.ok(OCCUPATION_BY_ID.has(f.closestToday), f.id);
    assert.ok(f.why.length && f.why.every((w) => /^https:\/\//.test(w.url)), f.id);
    assert.equal(f.path.length, 3);
  }
  for (const j of CHANGING_JOBS) {
    assert.ok(OCCUPATION_BY_ID.has(j.todayId) && FUTURE_OCCUPATIONS.some((f) => f.id === j.futureId), j.id);
    assert.ok(j.change < 0);
  }
});

test('препоръка: бъдеща професия за всеки и преход за работещите', async () => {
  const db = memDb();
  await runRefresh(db, { config: testConfig(), trigger: 'manual', force: true, fetchJson: fakeFetch(), log: () => {}, politeDelayMs: 0 });
  const young = recommend(db, YOUNG);
  assert.equal(young.futureOccupations.length, 2);
  assert.equal(young.transitions.length, 0);
  const adult = recommend(db, { ...YOUNG, situation: 'changing', current_field: 'finance' });
  assert.deepEqual(adult.transitions.map((t) => t.id).sort(), ['accounting', 'bank']);
  assert.ok(adult.transitions.every((t) => t.today && t.future));

  const srv = createApp({ db, config: testConfig() });
  await new Promise((r) => srv.listen(0, () => r(null)));
  const base = `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`;
  const list = await (await fetch(`${base}/api/future`)).json();
  assert.equal(list.future.length, FUTURE_OCCUPATIONS.length);
  assert.equal(list.changing.length, 8);
  const one = await (await fetch(`${base}/api/future/ai_auditor`)).json();
  assert.match(one.why[0].text, /2 декември 2027/);
  assert.equal(one.closestToday.id, 'cybersecurity_specialist');
  assert.equal((await fetch(`${base}/api/future/nope`)).status, 404);
  const skill = await (await fetch(`${base}/api/skills/ai_ethics`)).json();
  assert.ok(skill.futureOccupations.some((f) => f.id === 'ai_auditor'));
  const occ = await (await fetch(`${base}/api/occupations/cybersecurity_specialist`)).json();
  assert.ok(occ.futureFrom.some((f) => f.id === 'ai_auditor'));
  srv.close();
});
