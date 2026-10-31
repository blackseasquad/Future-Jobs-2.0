// Личен план от Gemini през Firebase AI Logic (Gemini Developer API, безплатен план).
// SDK-то се зарежда от CDN-а на Firebase само при първа нужда.
// Gemini получава само данни, които вече са на екрана: отговорите от анкетата,
// умението, периода, първата стъпка и факта с източника. Не измисля статистики –
// отговорите с непознати проценти/големи числа се отхвърлят и се показва резервният текст.
import { FIREBASE } from './firebase-config.js';
import { buildPrompt, validatePlan } from './plan-prompt.js';
export { buildPrompt, validatePlan };

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

/** Връща {why, steps:[{when,text}]} или хвърля грешка. */
export async function personalPlan(ctx) {
  const prompt = buildPrompt(ctx);
  const model = await getModel();
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Gemini (Firebase) не отговори навреме')), 12000)),
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
