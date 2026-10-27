// Вписва публикуваните прогнози на Cedefop и WEF (нямат API) като наблюдения с цитат.
// Идемпотентно: повторното изпълнение не създава дубликати.
import { WEF_2025, CEDEFOP_BG_2025, PUBLISHED_VERSION } from '../catalog/published.js';
import { upsertObservation } from '../lib/store.js';
import { tx } from '../db.js';

function makeAdapter(id, report, rowsFn) {
  return {
    id,
    async run(ctx) {
      const stats = { fetched: 0, inserted: 0, updated: 0, duplicates: 0, rejected: 0 };
      tx(ctx.db, () => {
        for (const o of rowsFn(report)) {
          stats.fetched++;
          const r = upsertObservation(ctx.db, { sourceId: id, geo: o.geo, period: report.period.replace('–', '-'), ...o,
            note: `${report.title}; ${report.url}; версия ${PUBLISHED_VERSION}` }, ctx.nowIso);
          stats[r === 'duplicate' ? 'duplicates' : r]++;
        }
      });
      return { ...stats, dataPeriod: `${report.period} (публикувано ${report.published})` };
    },
  };
}

export const wef = makeAdapter('wef', WEF_2025, (r) => [
  ...r.headline.map((h) => ({ dataset: 'headline', seriesKey: h.key, geo: 'WORLD', value: h.value, unit: h.unit })),
  ...r.growingSkills.map((s) => ({ dataset: 'growing_skills_rank', seriesKey: s.key, geo: 'WORLD', value: s.rank, unit: 'ранг' })),
  ...r.fastestGrowingJobs.map((j) => ({ dataset: 'fastest_growing_jobs_pct', seriesKey: j.key, geo: 'WORLD', value: j.pct, unit: '%' })),
  ...r.fastestDecliningJobs.map((j) => ({ dataset: 'fastest_declining_jobs_pct', seriesKey: j.key, geo: 'WORLD', value: j.pct, unit: '%' })),
]);

export const cedefop = makeAdapter('cedefop', CEDEFOP_BG_2025, (r) => [
  ...r.headline.map((h) => ({ dataset: 'headline', seriesKey: h.key, geo: 'BG', value: h.value, unit: h.unit })),
  ...r.openingsShareByIsco.map((o) => ({ dataset: 'openings_share', seriesKey: `isco08=OC${o.isco}`, geo: 'BG', value: o.pct, unit: '%' })),
  ...r.risingIscoMajor.map((i) => ({ dataset: 'employment_rising', seriesKey: `isco08=OC${i}`, geo: 'BG', value: 1, unit: 'флаг' })),
  ...r.shortageIsco2.map((s) => ({ dataset: 'shortage_top', seriesKey: `isco08=OC${s.isco2}`, geo: 'BG', value: 1, unit: 'флаг' })),
]);
