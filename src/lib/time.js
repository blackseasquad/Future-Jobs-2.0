// Помощни функции за време в часова зона Europe/Sofia (с лятно/зимно време).
export const TZ = 'Europe/Sofia';

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** @param {Date} date */
export function zonedParts(date) {
  /** @type {Record<string, number>} */
  const p = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

/** Дата по Europe/Sofia във формат YYYY-MM-DD */
export function sofiaDate(date = new Date()) {
  const p = zonedParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Отместване на Europe/Sofia спрямо UTC в минути за даден момент */
export function tzOffsetMinutes(date) {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** UTC момент, в който в София е посоченият локален час */
export function sofiaLocalToUtc(year, month, day, hour, minute = 0) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const off1 = tzOffsetMinutes(guess);
  const candidate = new Date(guess.getTime() - off1 * 60000);
  const off2 = tzOffsetMinutes(candidate);
  return off1 === off2 ? candidate : new Date(guess.getTime() - off2 * 60000);
}

/** Следващото изпълнение в hour:00 по Europe/Sofia след `now` (само за показване в UI) */
export function nextSofiaRun(now = new Date(), hour = 6) {
  const p = zonedParts(now);
  let run = sofiaLocalToUtc(p.year, p.month, p.day, hour);
  if (run.getTime() <= now.getTime()) {
    const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    run = sofiaLocalToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), hour);
  }
  return run;
}

export function daysAgo(now, days) {
  return new Date(now.getTime() - days * 86400000);
}
