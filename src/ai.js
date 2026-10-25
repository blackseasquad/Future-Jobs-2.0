// AI обяснения върху РЕАЛНО събраните данни (по избор, с ANTHROPIC_API_KEY).
// AI не генерира статистики: получава само доказателствата от препоръката и
// отговорът се отхвърля, ако съдържа число, което не присъства в тях.

const SYSTEM = `Ти си кариерен съветник за ученици в България в приложението Future Jobs.
Правила:
- Пиши на български, топло и конкретно, по 2–3 изречения за всеки хоризонт.
- Използвай САМО фактите и числата от подадения JSON. Не добавяй нови числа, проценти, години или статистики.
- Ако за умение липсват данни ("insufficient": true), кажи го честно.
- Не представяй оценките на модела като сигурна прогноза.
- Върни само JSON: {"short":"...","mid":"...","long":"..."}`;

/** Всички числа в текст (нормализирани) */
export function numbersIn(text) {
  return (String(text).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')).map((n) => String(Number(n)));
}

/** Проверява, че всяко число в AI текста присъства в доказателствата */
export function validateAiText(text, evidenceJson) {
  const allowed = new Set(numbersIn(evidenceJson));
  // позволени дребни числа за номериране/хоризонти
  ['1', '2', '3', '5', '6', '10', '12'].forEach((n) => allowed.add(n));
  const bad = numbersIn(text).filter((n) => !allowed.has(n));
  return { ok: bad.length === 0, unknownNumbers: bad };
}

/**
 * @param {any} rec резултат от recommend()
 * @param {{apiKey:string, model:string}} cfg
 * @param {typeof fetch} [fetchImpl]
 */
export async function explainWithAi(rec, cfg, fetchImpl = fetch) {
  if (!cfg.apiKey) return { enabled: false, reason: 'AI обясненията не са включени (липсва ANTHROPIC_API_KEY).' };
  const evidence = {
    occupations: rec.occupations.map((o) => ({ title: o.title, match: o.match, outlookIndex: o.outlook.index })),
    horizons: rec.horizons.map((h) => ({
      key: h.key, label: h.label,
      skills: h.items.map((i) => ({ name: i.name, why: i.why, evidence: i.evidence.map((e) => ({ kind: e.kind, text: e.text, insufficient: !!e.insufficient })) })),
    })),
  };
  const evidenceJson = JSON.stringify(evidence);
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 900, system: SYSTEM, messages: [{ role: 'user', content: evidenceJson }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { enabled: true, ok: false, reason: `AI услугата върна грешка ${res.status}` };
    const json = await res.json();
    const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { enabled: true, ok: false, reason: 'AI отговорът не е във валиден формат' };
    const parsed = JSON.parse(match[0]);
    const out = {};
    for (const k of ['short', 'mid', 'long']) {
      const t = String(parsed[k] || '').trim();
      const v = validateAiText(t, evidenceJson);
      if (!t || !v.ok) return { enabled: true, ok: false, reason: `AI текстът съдържа непроверими числа (${v.unknownNumbers.join(', ')}) и беше отхвърлен.` };
      out[k] = t;
    }
    return { enabled: true, ok: true, model: cfg.model, texts: out };
  } catch (err) {
    return { enabled: true, ok: false, reason: `AI недостъпен: ${err.message}` };
  }
}
