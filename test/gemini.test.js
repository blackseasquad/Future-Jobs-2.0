import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, validatePlan } from '../public/gemini.js';

const ctx = { answers: [{ question: 'Какво обичаш?', answer: 'Да помагам' }], interests: ['Грижа и помощ'], skill: 'Комуникация', description: 'Ясно изразяване',
  horizon: 'Сега (6–12 месеца)', firstStep: 'Запиши видео', fact: 'Споменава се в 24,7% от обявите (Arbeitnow, 30 дни)', occupation: 'Медицинска сестра' };

test('промптът съдържа само подадените данни и забранява измислени статистики', () => {
  const p = buildPrompt(ctx);
  assert.match(p, /Да помагам/);
  assert.match(p, /24,7%/);
  assert.match(p, /НЕ измисляй статистики/);
});

test('validatePlan приема коректен план и маха повтореното време от стъпките', () => {
  const p = buildPrompt(ctx);
  const plan = validatePlan(JSON.stringify({ why: 'Обичаш да помагаш – 24,7% от обявите търсят това.', steps: ['Тази седмица: запиши видео', 'Включи се в клуб', 'Говори пред класа 3 минути'] }), p);
  assert.equal(plan.steps.length, 3);
  assert.equal(plan.steps[0].text, 'запиши видео');
  assert.equal(plan.steps[2].when, 'След 3 месеца');
});

test('validatePlan отхвърля измислени проценти, линкове и непълни отговори', () => {
  const p = buildPrompt(ctx);
  assert.throws(() => validatePlan({ why: '80% от работодателите искат това', steps: ['a', 'b', 'c'] }, p), /непознато число/);
  assert.throws(() => validatePlan({ why: 'виж https://x.bg', steps: ['a', 'b', 'c'] }, p), /линк/);
  assert.throws(() => validatePlan({ why: 'ok', steps: ['a'] }, p), /непълен/);
  assert.throws(() => validatePlan({ why: 'Заплатата е 3500 лв.', steps: ['a', 'b', 'c'] }, p), /непознато число/);
});
