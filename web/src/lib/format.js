export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('bg-BG', { timeZone: 'Europe/Sofia', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtPct = (x, d = 1) => (x === null || x === undefined ? null : `${(x * 100).toFixed(d).replace('.', ',')}%`);
export const fmtNum = (x) => (x === null || x === undefined ? '—' : Number(x).toLocaleString('bg-BG'));
export const pp = (v) => `${(v * 100).toFixed(2).replace('.', ',')} п.п.`;

export function relDay(iso) {
  if (!iso) return '';
  const d = (x) => new Date(x).toLocaleDateString('bg-BG', { timeZone: 'Europe/Sofia' });
  const t = new Date(iso).toLocaleTimeString('bg-BG', { timeZone: 'Europe/Sofia', hour: '2-digit', minute: '2-digit' });
  const now = Date.now();
  if (d(iso) === d(now)) return `днес в ${t}`;
  if (d(iso) === d(now - 86400000)) return `вчера в ${t}`;
  if (d(iso) === d(now + 86400000)) return `утре в ${t}`;
  return fmtDate(iso);
}

export const outlookWord = (i) => (i === null || i === undefined ? '—' : i >= 67 ? 'Висока' : i >= 40 ? 'Добра' : 'Умерена');
/** „3 от 4 сигнала са положителни“ – вместо грубия индекс 0–100, който често съвпада при различни професии. */
export function outlookPhrase(o) {
  const sig = o?.signals || [];
  if (!sig.length) return 'няма достатъчно сигнали';
  return `${sig.filter((x) => x.value > 0).length} от ${sig.length} сигнала са положителни`;
}
export function trend(s) {
  const v = s.change90 ?? s.change30;
  if (v === null || v === undefined) return null;
  if (v > 0.002) return ['↑ Расте', 'up'];
  if (v < -0.002) return ['↓ Намалява', 'down'];
  return ['→ Стабилно', 'flat'];
}
export const SKILL_CAT = { tech: 'Технологии', data: 'Данни и анализ', business: 'Бизнес', care: 'Грижа и помощ', creative: 'Творчество', green: 'Зелени умения', hands_on: 'Практически умения', human: 'Човешки умения', language: 'Езици' };
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
