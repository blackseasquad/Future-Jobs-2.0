// Adzuna Jobs API (изисква безплатни app_id/app_key: https://developer.adzuna.com/).
// Ползваме само броя обяви (count) и средната обявена заплата (mean) за всяко умение.
// Adzuna не покрива България; препоръчителни държави в ЕС: de, pl, fr, nl, at, it, es, be.
import { SKILLS } from '../catalog/skills.js';
import { tx } from '../db.js';
import { sofiaDate } from '../lib/time.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ключова дума за търсене: английското име без специални символи */
export function adzunaQuery(skill) {
  const words = [skill.en, ...skill.patterns.slice(0, 3)]
    .map((w) => w.replace(/[^\p{L}\p{N} ]+/gu, ' ').trim())
    .filter((w) => w.length > 1);
  return [...new Set(words.map((w) => w.toLowerCase()))].slice(0, 4).join(' ');
}

export const adzuna = {
  id: 'adzuna',
  enabled: (config) => Boolean(config.adzuna.appId && config.adzuna.appKey),
  async run(ctx) {
    const { appId, appKey, countries } = ctx.config.adzuna;
    if (!appId || !appKey) return { skipped: true, reason: 'Липсват ADZUNA_APP_ID / ADZUNA_APP_KEY' };
    const date = sofiaDate(new Date(ctx.nowIso));
    const stats = { fetched: 0, inserted: 0, updated: 0, duplicates: 0, rejected: 0 };
    const base = 'https://api.adzuna.com/v1/api/jobs';
    for (const country of countries) {
      const totalJson = await ctx.fetchJson(`${base}/${country}/search/1?${new URLSearchParams({ app_id: appId, app_key: appKey, results_per_page: '1' })}`,
        { timeoutMs: ctx.config.fetchTimeoutMs });
      const total = Number(totalJson?.count);
      if (!Number.isFinite(total)) throw new Error(`Adzuna ${country}: липсва count`);
      for (const skill of SKILLS) {
        if (ctx.deadline && Date.now() > ctx.deadline) return { ...stats, dataPeriod: `частично към ${date}`, warning: 'Спряно поради времеви бюджет' };
        await sleep(ctx.politeDelayMs ?? 2600); // лимит на Adzuna: ~25 заявки/мин
        const json = await ctx.fetchJson(`${base}/${country}/search/1?${new URLSearchParams({
          app_id: appId, app_key: appKey, results_per_page: '1', what_or: adzunaQuery(skill), max_days_old: '30' })}`,
        { timeoutMs: ctx.config.fetchTimeoutMs });
        const count = Number(json?.count);
        if (!Number.isFinite(count)) { stats.rejected++; continue; }
        stats.fetched++;
        tx(ctx.db, () => {
          const r = ctx.db.prepare(`INSERT INTO posting_counts(source_id, country, skill_id, date, count, total, mean_salary)
            VALUES ('adzuna', ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
            .run(country, skill.id, date, count, total, Number.isFinite(Number(json.mean)) ? Number(json.mean) : null);
          stats[Number(r.changes) ? 'inserted' : 'duplicates']++;
        });
      }
    }
    return { ...stats, dataPeriod: `обяви до 30 дни назад към ${date}` };
  },
};
