// HTTP клиент с timeout, ограничен брой повторни опити и ясен User-Agent.
export const USER_AGENT = 'FutureJobs/1.0 (EduHack.bg student project; daily aggregate statistics)';

export class FetchError extends Error {
  constructor(message, status, url) {
    super(message);
    this.status = status;
    this.url = url;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} url
 * @param {{timeoutMs?:number, retries?:number, headers?:Record<string,string>, method?:string, body?:string}} [opts]
 */
export async function fetchJson(url, opts = {}) {
  const { timeoutMs = 20000, retries = 2, headers = {}, method = 'GET', body } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method, body,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new FetchError(`HTTP ${res.status} ${res.statusText} – ${text.slice(0, 200)}`, res.status, url);
        // 4xx (без 429) не се повтарят – грешката е в заявката
        if (res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
        throw err;
      }
      const ct = res.headers.get('content-type') || '';
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw Object.assign(new FetchError(`Отговорът не е JSON (content-type: ${ct})`, res.status, url), { fatal: true });
      }
    } catch (err) {
      lastErr = err;
      if (err && err.fatal) break;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}

/** Премахва HTML тагове и декодира основните entities */
export function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
