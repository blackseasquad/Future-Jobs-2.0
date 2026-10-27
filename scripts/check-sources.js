// Проверява реалната наличност и формата на отговорите на всеки източник,
// без да записва нищо в базата. Пусни го на сървъра преди първия импорт:
//   npm run check-sources
import { getConfig } from '../src/config.js';
import { fetchJson } from '../src/lib/http.js';
import { eurostatUrl, parseJsonStat } from '../src/lib/jsonstat.js';
import { DATASETS } from '../src/sources/eurostat.js';

const config = getConfig();
const checks = [
  ...DATASETS.map((d) => ({
    name: `Eurostat ${d.dataset}`,
    url: eurostatUrl(d.dataset, d.params),
    verify: (j) => { const { rows, updated } = parseJsonStat(j); return `${rows.length} стойности, обновено ${updated}`; },
  })),
  { name: 'ESCO search', url: 'https://ec.europa.eu/esco/api/search?text=software%20developer&type=occupation&language=en&limit=1',
    verify: (j) => { const r = j._embedded?.results?.[0]; if (!r?.uri) throw new Error('няма резултат'); return `${r.title} (${r.uri})`; } },
  { name: 'Arbeitnow', url: 'https://www.arbeitnow.com/api/job-board-api',
    verify: (j) => { if (!Array.isArray(j.data)) throw new Error('липсва data[]'); return `${j.data.length} обяви на стр. 1`; } },
  { name: 'Remotive', url: 'https://remotive.com/api/remote-jobs?limit=5',
    verify: (j) => { if (!Array.isArray(j.jobs)) throw new Error('липсва jobs[]'); return `${j['job-count'] ?? j.jobs.length} обяви`; } },
];
if (config.adzuna.appId && config.adzuna.appKey) {
  checks.push({ name: `Adzuna ${config.adzuna.countries[0]}`,
    url: `https://api.adzuna.com/v1/api/jobs/${config.adzuna.countries[0]}/search/1?app_id=${config.adzuna.appId}&app_key=${config.adzuna.appKey}&results_per_page=1`,
    verify: (j) => `${j.count} обяви` });
}

let failed = 0;
for (const c of checks) {
  const t = Date.now();
  try {
    const j = await fetchJson(c.url, { timeoutMs: 20000, retries: 0 });
    console.log(`✅ ${c.name}: ${c.verify(j)} (${Date.now() - t} ms)`);
  } catch (err) {
    failed++;
    console.log(`❌ ${c.name}: ${err.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
