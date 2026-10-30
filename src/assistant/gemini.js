// Прокси към Google AI Studio (Gemini API) с резервни модели.
// Ключът (GEMINI_API_KEY) е само на сървъра – браузърът говори единствено с /api/assistant.

export const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export class ModelUnavailableError extends Error {
  /** @param {string} model @param {number} status @param {string} reason */
  constructor(model, status, reason) { super(`${model}: ${status} ${reason}`); this.model = model; this.status = status; this.reason = reason; }
}

/**
 * Кога минаваме към следващия модел: лимит/квота (429, RESOURCE_EXHAUSTED),
 * както и модел, който е спрян или временно претоварен (404, 503, 500) –
 * иначе един изведен от употреба модел би спрял целия асистент.
 */
export function isFallbackError(status, body = '') {
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(body)) return true;
  return status === 404 || status === 500 || status === 503 || /UNAVAILABLE|overloaded|NOT_FOUND/i.test(body);
}

/** Чете SSE поток от streamGenerateContent и подава текста на парчета. */
async function* readSse(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const json = JSON.parse(line.slice(5).trim());
      if (json.error) throw new Error(json.error.message || 'Gemini stream error');
      const text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (text) yield text;
    }
  }
}

/**
 * Изпраща разговора към първия работещ модел и връща {model, stream}.
 * Резервният модел се избира САМО преди първия изпратен символ – иначе потребителят би видял смесен отговор.
 * @param {{apiKey:string, models?:string[], systemInstruction:string, contents:{role:'user'|'model', text:string}[],
 *          fetchImpl?:typeof fetch, log?:(m:string)=>void, timeoutMs?:number}} o
 */
export async function streamWithFallback(o) {
  const models = o.models?.length ? o.models : DEFAULT_MODELS;
  const fetchImpl = o.fetchImpl || fetch;
  const log = o.log || ((m) => console.warn(m));
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: o.systemInstruction }] },
    contents: o.contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
    generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
    safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
      .map((category) => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' })),
  });
  const errors = [];
  for (const model of models) {
    let res;
    try {
      res = await fetchImpl(`${API}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': o.apiKey },
        body: payload,
        signal: AbortSignal.timeout(o.timeoutMs || 25000),
      });
    } catch (err) {
      log(`[assistant] ${model}: мрежова грешка (${err.message}) – пробвам следващия модел`);
      errors.push(new ModelUnavailableError(model, 0, err.message));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (isFallbackError(res.status, body)) {
        log(`[assistant] ${model}: ${res.status} – пробвам следващия модел`);
        errors.push(new ModelUnavailableError(model, res.status, body.slice(0, 200)));
        continue;
      }
      // 400/401/403 – грешка в заявката или ключа: друг модел няма да помогне
      throw new ModelUnavailableError(model, res.status, body.slice(0, 300));
    }
    const it = readSse(res.body);
    // Изчакваме първото парче, за да можем още да минем към резервен модел при празен/счупен отговор
    let first;
    try { first = await it.next(); } catch (err) {
      log(`[assistant] ${model}: грешка в потока (${err.message}) – пробвам следващия модел`);
      errors.push(new ModelUnavailableError(model, 0, err.message));
      continue;
    }
    if (first.done) { errors.push(new ModelUnavailableError(model, 0, 'празен отговор')); continue; }
    async function* all() { yield first.value; yield* it; }
    return { model, stream: all() };
  }
  const e = new Error('Всички модели са недостъпни');
  /** @type {any} */ (e).errors = errors;
  throw e;
}
