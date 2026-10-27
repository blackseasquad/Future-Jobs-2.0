import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memDb, testConfig, fakeFetch } from './helpers.js';
import { detectSkills } from '../src/catalog/skills.js';
import { computeSkillMetrics, latestSkillMetrics, MIN_POSTINGS } from '../src/model/scoring.js';
import { upsertPosting } from '../src/lib/store.js';
import { runRefresh } from '../src/pipeline.js';
import { recommend } from '../src/model/recommend.js';
import { validateAiText, explainWithAi } from '../src/ai.js';
import { nextSofiaRun, sofiaDate } from '../src/lib/time.js';

const ANSWERS = { afternoon: 'code', subjects: ['math', 'it'], workwith: 'data', tech_attitude: 'build', environment: 'office', values: 'income', study: 'university', english: 'mid' };

test('синоними на умения се нормализират (EN/DE/BG), без фалшиви съвпадения', () => {
  assert.deepEqual(detectSkills('Senior Java developer').includes('software_engineering'), true);
  assert.equal(detectSkills('JavaScript only').includes('software_engineering'), false);
  assert.ok(detectSkills('Erfahrung in Datenanalyse und Statistik').includes('data_analysis'));
  assert.ok(detectSkills('Опит с изкуствен интелект').includes('ai_ml'));
  assert.ok(detectSkills('Build AI agents').includes('ai_ml'));
  assert.equal(detectSkills('We said hi to Aida').includes('ai_ml'), false);
  assert.equal(detectSkills('Office in Germany').includes('german'), false);
  assert.ok(detectSkills('fließend Deutsch').includes('german'));
  assert.ok(detectSkills('Kommunikationsstärke und Teamfähigkeit').includes('teamwork'));
});

test('при малко обяви търсенето е „недостатъчно“, не се измисля число', () => {
  const db = memDb();
  const now = new Date();
  for (let i = 0; i < 10; i++) upsertPosting(db, { sourceId: 'arbeitnow', externalId: `x${i}`, title: `t${i}`, company: 'c', postedAt: now.toISOString() }, ['python'], now.toISOString());
  computeSkillMetrics(db, now);
  const m = latestSkillMetrics(db).get('python');
  assert.equal(m.demand_share, null);
  assert.equal(m.change_30d, null);
  assert.equal(m.details.demand.minRequired, MIN_POSTINGS);
});

test('промяна за 30 дни се изчислява само при достатъчна история', () => {
  const db = memDb();
  const now = new Date('2026-10-23T05:00:00Z');
  const DAY = 86400000;
  // 200 обяви преди 31–59 дни (събрани тогава), 20% с Python; 200 нови, 40% с Python
  for (let i = 0; i < 200; i++) {
    const t = new Date(now.getTime() - (31 + (i % 28)) * DAY).toISOString();
    upsertPosting(db, { sourceId: 'arbeitnow', externalId: `old${i}`, title: `old ${i}`, company: 'c', postedAt: t }, i % 5 === 0 ? ['python'] : ['sql'], t);
  }
  const before = new Date(now.getTime() - 61 * DAY).toISOString();
  upsertPosting(db, { sourceId: 'arbeitnow', externalId: 'first', title: 'first', company: 'c', postedAt: before }, [], before);
  for (let i = 0; i < 200; i++) {
    const t = new Date(now.getTime() - (i % 25) * DAY).toISOString();
    upsertPosting(db, { sourceId: 'arbeitnow', externalId: `new${i}`, title: `new ${i}`, company: 'c', postedAt: t }, i % 5 < 2 ? ['python'] : ['sql'], t);
  }
  computeSkillMetrics(db, now);
  const m = latestSkillMetrics(db).get('python');
  assert.equal(m.demand_share, 0.4);
  assert.equal(Math.round(m.change_30d * 100) / 100, 0.2);
  assert.equal(m.change_90d, null, 'няма данни отпреди 90–120 дни');
  assert.match(m.details.change90.reason, /не обхваща/);
});

test('Future Skills Score: 0–100, документирани тегла, нужни ≥3 компонента', async () => {
  const db = memDb();
  await runRefresh(db, { config: testConfig(), trigger: 'cli', fetchJson: fakeFetch(), log: () => {}, politeDelayMs: 0 });
  const all = [...latestSkillMetrics(db).values()];
  for (const m of all) {
    if (m.score !== null) {
      assert.ok(m.score >= 0 && m.score <= 100);
      assert.ok(Object.keys(m.details.components).length >= 3);
    }
  }
  const ai = latestSkillMetrics(db).get('ai_ml');
  assert.ok(ai.details.longTerm.index > 50, 'ИИ има положителни дългосрочни сигнали');
  assert.ok(ai.details.longTerm.occupations[0].outlook.signals.some((s) => s.type === 'fact'), 'включва факт от Eurostat');
});

test('препоръки: 3 професии, 3 хоризонта, всяко умение с източници и период', async () => {
  const db = memDb();
  await runRefresh(db, { config: testConfig(), trigger: 'cli', fetchJson: fakeFetch(), log: () => {}, politeDelayMs: 0 });
  const rec = recommend(db, ANSWERS);
  assert.equal(rec.occupations.length, 3);
  assert.ok(['ai_ml_specialist', 'data_scientist', 'software_developer', 'cloud_engineer', 'cybersecurity_specialist'].includes(rec.occupations[0].id));
  assert.deepEqual(rec.horizons.map((h) => h.label), ['Сега', 'След 2–5 години', 'След 5–10 години']);
  for (const h of rec.horizons) {
    assert.equal(h.items.length, 2, 'по 2 умения на хоризонт');
    for (const i of h.items) {
      assert.ok(['course', 'project', 'group'].includes(i.firstStep.type));
      assert.ok(i.firstStep.text.length > 10);
      assert.ok(i.fact.text && i.fact.kind);
      if (i.firstStep.type === 'course') assert.match(i.firstStep.url, /^https:\/\//);
    }
  }
  assert.equal(rec.horizons[2].items[0].firstStep.type, 'group');
  const ids = rec.horizons.flatMap((h) => h.items.map((i) => i.skillId));
  assert.equal(new Set(ids).size, ids.length, 'без повторения между хоризонтите');
  for (const h of rec.horizons) {
    assert.ok(h.items.length > 0);
    for (const i of h.items) {
      assert.ok(i.evidence.length >= 2);
      for (const e of i.evidence) { assert.ok(['fact', 'forecast', 'model'].includes(e.kind)); assert.ok(e.source); assert.ok(e.period); }
      assert.ok(i.steps.length >= 2);
      assert.ok(i.resources.length >= 1);
      assert.ok(i.limitations.length >= 1);
    }
  }
  assert.ok(rec.occupations[0].salary.bg.monthly > 0);
  // Заплатите се различават по сектор, не само по професионална група
  const { salaryFor } = await import('../src/model/recommend.js');
  const { OCCUPATION_BY_ID } = await import('../src/catalog/occupations.js');
  const sal = (id) => salaryFor(db, OCCUPATION_BY_ID.get(id));
  assert.equal(sal('software_developer').sector, 'Информация и комуникации');
  assert.notEqual(sal('software_developer').bg.monthly, sal('nurse').bg.monthly);
  assert.notEqual(sal('nurse').bg.monthly, sal('fintech_specialist').bg.monthly);
  // Липсваща стойност за сектора => цялата група, без измисляне
  assert.equal(sal('teacher').sector, null);
  assert.equal(sal('teacher').bg.level, 'group');
  assert.equal(sal('agritech_specialist').bg.level, 'group', 'сектор A не е в SES');
  // Актуализация с индекса на заплатите до последните 4 тримесечия
  const sd = sal('software_developer').bg;
  assert.equal(sd.isEstimate, true);
  assert.equal(sd.estimate.period, '2025-Q3 – 2026-Q2');
  assert.ok(sd.monthly > sd.official.monthly);
  assert.equal(sd.official.period, '2022');
});

test('препоръки: невалидни отговори се отхвърлят', () => {
  const db = memDb();
  assert.throws(() => recommend(db, { ...ANSWERS, afternoon: 'nope' }), /невалиден/);
  assert.throws(() => recommend(db, { afternoon: 'code' }), /Липсва отговор/);
});

test('AI: отхвърля текст с измислени числа, приема проверими', async () => {
  const ev = JSON.stringify({ a: 'Споменава се в 12,5% от обявите (25 от 200).' });
  assert.equal(validateAiText('Търсенето е 12,5% (25 от 200 обяви).', ev).ok, true);
  assert.equal(validateAiText('Заплатите ще растат с 40% до 2031 г.', ev).ok, false);
  const db = memDb();
  await runRefresh(db, { config: testConfig(), trigger: 'cli', fetchJson: fakeFetch(), log: () => {}, politeDelayMs: 0 });
  const rec = recommend(db, ANSWERS);
  const fakeAi = (texts) => async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(texts) }] }) });
  const good = await explainWithAi(rec, { apiKey: 'k', model: 'm' }, /** @type {any} */ (fakeAi({ short: 'Започни с основите.', mid: 'Развивай се.', long: 'Учи цял живот.' })));
  assert.equal(good.ok, true);
  const bad = await explainWithAi(rec, { apiKey: 'k', model: 'm' }, /** @type {any} */ (fakeAi({ short: 'Търсенето ще порасне с 73%.', mid: 'x', long: 'y' })));
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /73/);
  assert.equal((await explainWithAi(rec, { apiKey: '', model: 'm' })).enabled, false);
});

test('следващото изпълнение е в 06:00 по София при лятно и зимно време', () => {
  assert.equal(nextSofiaRun(new Date('2026-07-01T10:00:00Z')).toISOString(), '2026-07-02T03:00:00.000Z');
  assert.equal(nextSofiaRun(new Date('2026-07-01T02:00:00Z')).toISOString(), '2026-07-01T03:00:00.000Z');
  assert.equal(nextSofiaRun(new Date('2026-10-24T12:00:00Z')).toISOString(), '2026-10-25T04:00:00.000Z');
  assert.equal(nextSofiaRun(new Date('2026-12-01T05:00:00Z')).toISOString(), '2026-12-02T04:00:00.000Z');
  assert.equal(sofiaDate(new Date('2026-10-22T22:30:00Z')), '2026-10-23');
});
