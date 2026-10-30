// Личен план от Gemini през Firebase AI Logic (Gemini Developer API, безплатен план).
// SDK-то се зарежда от CDN-а на Firebase само при първа нужда.
// Gemini получава само данни, които вече са на екрана: отговорите от анкетата,
// умението, периода, първата стъпка и факта с източника. Не измисля статистики –
// отговорите с непознати проценти/големи числа се отхвърлят и се показва резервният текст.
import { FIREBASE } from './firebase-config.js';

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE.sdkVersion}`;
let modelPromise = null;

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [{ initializeApp }, ai, appCheck] = await Promise.all([
        import(`${CDN}/firebase-app.js`),
        import(`${CDN}/firebase-ai.js`),
        import(`${CDN}/firebase-app-check.js`),
      ]);
      const app = initializeApp(FIREBASE.config);
      if (FIREBASE.appCheck?.siteKey) {
        const Provider = FIREBASE.appCheck.provider === 'enterprise' ? appCheck.ReCaptchaEnterpriseProvider : appCheck.ReCaptchaV3Provider;
        appCheck.initializeAppCheck(app, { provider: new Provider(FIREBASE.appCheck.siteKey), isTokenAutoRefreshEnabled: true });
      }
      const { getAI, getGenerativeModel, GoogleAIBackend, Schema } = ai;
      const service = getAI(app, { backend: new GoogleAIBackend() });
      return getGenerativeModel(service, {
        model: FIREBASE.model,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 600,
          responseMimeType: 'application/json',
          responseSchema: Schema.object({
            properties: {
              why: Schema.string(),
              steps: Schema.array({ items: Schema.string() }),
            },
          }),
        },
      });
    })().catch((e) => { modelPromise = null; throw e; });
  }
  return modelPromise;
}

const STEP_WHEN = ['Тази седмица', 'До месец', 'След 3 месеца'];

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

/** Връща {why, steps:[{when,text}]} или хвърля грешка. */
export async function personalPlan(ctx) {
  const prompt = buildPrompt(ctx);
  const model = await getModel();
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Gemini не отговори навреме')), 20000)),
  ]);
  return validatePlan(result.response.text(), prompt);
}

/** Кратка проверка за администратора (един малък заявка към Gemini). */
export async function pingGemini() {
  const model = await getModel();
  const t0 = performance.now();
  const r = await model.generateContent('Върни JSON {"why":"ok","steps":["a","b","c"]}');
  return { ms: Math.round(performance.now() - t0), text: r.response.text().slice(0, 120), model: FIREBASE.model, provider: FIREBASE.appCheck.provider };
}
