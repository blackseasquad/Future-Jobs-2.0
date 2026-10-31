// Общ код за личния план от Gemini – ползва се и в браузъра (Firebase AI Logic),
// и на сървъра (/api/plan, резервен път през Google AI Studio).

export const STEP_WHEN = ['Тази седмица', 'До месец', 'След 3 месеца'];

/**
 * @param {{answers: {question:string, answer:string}[], interests:string[], skill:string, description:string,
 *          horizon:string, firstStep:string, fact:string, occupation:string}} ctx
 */
export function buildPrompt(ctx) {
  return [
    'Ти си кариерен консултант за ученици (16–19 г.) в България. Пиши на български, на „ти“, топло и конкретно.',
    'Задача: кратък личен план за едно умение. Върни JSON с полета:',
    '- "why": ЕДНО изречение (до 30 думи) защо това умение пасва точно на този ученик – свържи го с негов конкретен отговор от анкетата.',
    `- "steps": точно 3 кратки, изпълними стъпки (до 20 думи всяка) в този ред: ${STEP_WHEN.join(', ')}. Първата може да надгради дадената първа стъпка.`,
    'Правила: НЕ измисляй статистики, проценти, заплати или имена на курсове и сайтове, които не са дадени. Без линкове. Без обещания за работа.',
    '',
    'Данни (използвай само тях):',
    `Интереси: ${ctx.interests.join(', ')}`,
    'Отговори от анкетата:',
    ...ctx.answers.map((a) => `- ${a.question} → ${a.answer}`),
    `Умение: ${ctx.skill} – ${ctx.description}`,
    `Период: ${ctx.horizon}`,
    `Подходяща професия: ${ctx.occupation}`,
    `Дадена първа стъпка: ${ctx.firstStep}`,
    `Факт от данните: ${ctx.fact}`,
  ].join('\n');
}

/** Проверява отговора: точно 3 стъпки, разумна дължина, без линкове и без непознати проценти/числа. */
export function validatePlan(raw, prompt) {
  const plan = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const why = String(plan?.why || '').trim();
  const steps = Array.isArray(plan?.steps) ? plan.steps.map((s) => String(s).trim()).filter(Boolean).slice(0, 3) : [];
  if (!why || steps.length < 3) throw new Error('непълен отговор');
  const all = [why, ...steps].join(' ');
  if (all.length > 900) throw new Error('прекалено дълъг отговор');
  if (/https?:\/\/|www\.|<[a-z]/i.test(all)) throw new Error('отговорът съдържа линк или HTML');
  const known = new Set((prompt.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')));
  for (const m of all.matchAll(/(\d+(?:[.,]\d+)?)\s*(%|процент)?/g)) {
    const n = m[1].replace(',', '.');
    if ((m[2] || Number(n) > 60) && !known.has(n)) throw new Error(`непознато число: ${m[0]}`);
  }
  return { why, steps: steps.map((s, i) => ({ when: STEP_WHEN[i], text: s.replace(/^(тази седмица|до месец|след 3 месеца)\s*[:–-]\s*/i, '') })) };
}

/** Подготвя контекста от отговорите на анкетата (въпрос → текст на избрания отговор). */
export function answersToText(questions, answers) {
  return questions.flatMap((q) => {
    const a = answers?.[q.id];
    const ids = Array.isArray(a) ? a : a ? [a] : [];
    const txt = ids.map((id) => q.options.find((o) => o.id === id)?.text).filter(Boolean);
    return txt.length ? [{ question: q.text, answer: txt.join(', ') }] : [];
  });
}
