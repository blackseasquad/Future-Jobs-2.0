// Прокси към Google AI Studio (Gemini API) с резервни модели.
// Ключът (GEMINI_API_KEY) е само на сървъра – браузърът говори единствено с /api/assistant.

export const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export const BLOCKED_TEXT = 'Не мога да помогна с това. Мога да отговарям на въпроси за Future Jobs – професии, умения, анкетата и данните.';

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

const BLOCK_REASONS = /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION|OTHER/;

/** Чете SSE поток от streamGenerateContent. Подава {text} на парчета и накрая {end, finish, blocked}. */
async function* readSse(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '', finish = null, blocked = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      let json;
      try { json = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (json.error) throw new Error(json.error.message || 'Gemini stream error');
      if (json.promptFeedback?.blockReason) blocked = json.promptFeedback.blockReason;
      const c = json.candidates?.[0];
      if (c?.finishReason) finish = c.finishReason;
      // „мисли“-частите (thought) не се показват
      const text = (c?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
      if (text) yield { text };
    }
  }
  if (!blocked && finish && BLOCK_REASONS.test(finish) && finish !== 'STOP') blocked = finish;
  yield { end: true, finish, blocked };
}

/**
 * Изпраща разговора към първия работещ модел и връща {model, stream}.
 * Резервният модел се избира САМО преди първия изпратен символ – иначе потребителят би видял смесен отговор.
 * @param {{apiKey:string, models?:string[], systemInstruction:string, contents:{role:'user'|'model', text:string}[],
 *          fetchImpl?:typeof fetch, log?:(m:string)=>void, timeoutMs?:number, generationConfig?:object, blockedText?:string}} o
 */
export async function streamWithFallback(o) {
  const models = o.models?.length ? o.models : DEFAULT_MODELS;
  const fetchImpl = o.fetchImpl || fetch;
  const log = o.log || ((m) => console.warn(m));
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: o.systemInstruction }] },
    contents: o.contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
    // по-голям лимит: при моделите, които „мислят“, мисленето също се брои към изходните токени
    generationConfig: o.generationConfig || { temperature: 0.4, maxOutputTokens: 2048 },
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
    // Изчакваме първия текст, за да можем още да минем към резервен модел при празен/счупен отговор
    /** @type {any} */
    let first;
    try { first = (await it.next()).value; } catch (err) {
      log(`[assistant] ${model}: грешка в потока (${err.message}) – пробвам следващия модел`);
      errors.push(new ModelUnavailableError(model, 0, err.message));
      continue;
    }
    if (first?.end) {
      if (first.blocked) {
        // Блокирано от защитите на Gemini (опасна тема) – друг модел няма да помогне
        log(`[assistant] ${model}: отговорът е блокиран (${first.blocked})`);
        return { model, blocked: first.blocked, stream: (async function* () { yield o.blockedText || BLOCKED_TEXT; })() };
      }
      log(`[assistant] ${model}: празен отговор (${first.finish || '?'}) – пробвам следващия модел`);
      errors.push(new ModelUnavailableError(model, 0, `празен отговор (${first.finish || '?'})`));
      continue;
    }
    async function* all() {
      yield first.text;
      for await (const x of it) {
        if (x.text) yield x.text;
        else if (x.end && x.blocked) yield `\n\n${o.blockedText || BLOCKED_TEXT}`;
      }
    }
    return { model, stream: all() };
  }
  const e = new Error('Всички модели са недостъпни');
  /** @type {any} */ (e).errors = errors;
  throw e;
}
