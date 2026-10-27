// Eurostat Statistics API (JSON-stat 2.0), без ключ.
// Документация: https://wikis.ec.europa.eu/display/EUROSTATHELP/API+Statistics+-+data+query
import { parseJsonStat, eurostatUrl } from '../lib/jsonstat.js';
import { upsertObservation, } from '../lib/store.js';
import { tx } from '../db.js';

export const GEOS = ['BG', 'EU27_2020'];

/** Наборите данни, които се импортират. `keep` филтрира редовете от отговора. */
export const DATASETS = [
  {
    dataset: 'lfsa_egais',
    label: 'Заети лица по професия (ISCO-08), хил. души, 15–74 г.',
    params: { geo: GEOS, sex: 'T', age: 'Y15-74', unit: 'THS_PER', sinceTimePeriod: '2014' },
    keep: (d) => (!d.wstatus || d.wstatus === 'EMP') && (!d.citizen || d.citizen === 'TOTAL'),
    seriesDims: ['isco08'],
    unit: 'хил. души',
  },
  {
    dataset: 'jvs_q_nace2',
    label: 'Свободни работни места (брой и коефициент), промишленост, строителство и услуги',
    params: { geo: GEOS, nace_r2: 'B-S', s_adj: 'NSA', indic_em: ['JOBVAC', 'JVR'], sinceTimePeriod: '2019-Q1' },
    keep: () => true,
    seriesDims: ['indic_em', 'sizeclas'],
    unit: (d) => (d.indic_em === 'JVR' ? '%' : 'брой'),
  },
  {
    dataset: 'earn_ses22_28',
    label: 'Средни годишни брутни заплати по професия (SES 2022), EUR',
    params: { geo: GEOS, sex: 'T', age: 'TOTAL', sizeclas: 'TOTAL', indic_se: 'ERN', unit: 'EUR' },
    keep: () => true,
    seriesDims: ['isco08'],
    unit: 'EUR/год.',
  },
];

export const eurostat = {
  id: 'eurostat',
  async run(ctx) {
    const stats = { fetched: 0, inserted: 0, updated: 0, duplicates: 0, rejected: 0, periods: [] };
    const errors = [];
    for (const def of DATASETS) {
      try {
        const json = await ctx.fetchJson(eurostatUrl(def.dataset, def.params), { timeoutMs: ctx.config.fetchTimeoutMs });
        const { rows } = parseJsonStat(json);
        const kept = rows.filter((r) => def.keep(r.dims));
        if (kept.length === 0) throw new Error(`${def.dataset}: празен отговор`);
        // Целият набор се записва в една транзакция – при грешка старите данни остават
        tx(ctx.db, () => {
          for (const r of kept) {
            stats.fetched++;
            const seriesKey = def.seriesDims.map((d) => `${d}=${r.dims[d] ?? 'NA'}`).join('|');
            const unit = typeof def.unit === 'function' ? def.unit(r.dims) : def.unit;
            const res = upsertObservation(ctx.db, {
              sourceId: 'eurostat', dataset: def.dataset, seriesKey, geo: r.dims.geo, period: r.dims.time,
              value: r.value, unit, flag: r.flag,
            }, ctx.nowIso);
            stats[res === 'duplicate' ? 'duplicates' : res]++;
          }
        });
        const periods = kept.map((r) => r.dims.time).sort();
        stats.periods.push(`${def.dataset}: ${periods[0]}–${periods[periods.length - 1]}`);
      } catch (err) {
        errors.push(`${def.dataset}: ${err.message}`);
        ctx.log(`Eurostat ${def.dataset} неуспешно: ${err.message}`);
      }
    }
    if (errors.length === DATASETS.length) throw new Error(errors.join('; '));
    return { ...stats, dataPeriod: stats.periods.join('; '), warning: errors.length ? errors.join('; ') : null };
  },
};
