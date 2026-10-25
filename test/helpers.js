// Помощни функции за тестовете: in-memory база и фалшив fetch, който връща
// отговори в РЕАЛНИЯ формат на всеки източник (проверен срещу живите API).
import { openDb } from '../src/db.js';

process.env.NODE_ENV = 'test';

export function testConfig(over = {}) {
  return {
    port: 0, publicUrl: 'http://localhost', databasePath: ':memory:', cronSecret: 'c'.repeat(40), adminToken: 'a'.repeat(40),
    timezone: 'Europe/Sofia', scheduledHour: 6, staleAfterHours: 36, fetchTimeoutMs: 1000,
    adzuna: { appId: '', appKey: '', countries: ['de'] }, anthropic: { apiKey: '', model: 'test' },
    smtp: { host: '', port: 0, secure: false, user: '', pass: '', from: 'Future Jobs <no-reply@example.com>' },
    ...over,
  };
}

export const memDb = () => openDb(':memory:');

/** Строи JSON-stat 2.0 dataset от измерения и функция за стойност */
export function jsonStat(dims, valueFn, extra = {}) {
  const id = Object.keys(dims);
  const size = id.map((d) => dims[d].length);
  const dimension = Object.fromEntries(id.map((d) => [d, {
    label: d, category: { index: Object.fromEntries(dims[d].map((c, i) => [c, i])), label: Object.fromEntries(dims[d].map((c) => [c, c])) },
  }]));
  const value = {};
  const status = {};
  const total = size.reduce((a, b) => a * b, 1);
  for (let flat = 0; flat < total; flat++) {
    let rem = flat;
    const codes = {};
    for (let d = id.length - 1; d >= 0; d--) { codes[id[d]] = dims[id[d]][rem % size[d]]; rem = Math.floor(rem / size[d]); }
    const v = valueFn(codes);
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') { value[flat] = v.value; if (v.flag) status[flat] = v.flag; } else value[flat] = v;
  }
  return { version: '2.0', class: 'dataset', label: 'fixture', source: 'ESTAT', updated: '2026-09-10T23:00:00+0200', id, size, dimension, value, status, ...extra };
}

// Реални стойности за България (общо заети, хил.) от Eurostat lfsa_egais, извлечени 23.10.2026
const BG_TOTAL = { 2019: 3039.9, 2020: 2927.7, 2021: 2873.5, 2022: 2934.9, 2023: 2924.0, 2024: 2925.4, 2025: 2921.1 };
const BG_2025 = { OC1: 224.4, OC2: 632.4, OC3: 321.6, OC4: 180.9, OC5: 553.8, OC6: 63.5, OC7: 327.5, OC8: 339.1, OC9: 258.2, OC0: 19.9 };

export function eurostatFixture(dataset, { bump = 0 } = {}) {
  const years = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  if (dataset === 'lfsa_egais') {
    return jsonStat({
      freq: ['A'], unit: ['THS_PER'], sex: ['T'], age: ['Y15-74'], wstatus: ['EMP', 'SAL'],
      isco08: ['TOTAL', 'OC1', 'OC2', 'OC3', 'OC4', 'OC5', 'OC6', 'OC7', 'OC8', 'OC9', 'OC0'], geo: ['BG', 'EU27_2020'], time: years,
    }, (c) => {
      if (c.wstatus !== 'EMP') return 1;
      const y = Number(c.time);
      if (c.geo === 'BG' && c.isco08 === 'TOTAL') return BG_TOTAL[y];
      const base = c.geo === 'BG' ? BG_2025[c.isco08] || 100 : (BG_2025[c.isco08] || 100) * 70;
      // Синтетичен тренд за предишните години: специалисти растат, останалите намаляват
      const growth = ['OC2', 'OC3'].includes(c.isco08) ? 0.03 : -0.01;
      const v = Math.round(base / (1 + growth) ** (2025 - y) * 10) / 10;
      return y === 2025 && c.isco08 === 'OC2' && c.geo === 'BG' ? { value: v + bump } : v;
    });
  }
  if (dataset === 'jvs_q_nace2') {
    const q = ['2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4'];
    return jsonStat({ freq: ['Q'], s_adj: ['NSA'], nace_r2: ['B-S'], sizeclas: ['TOTAL'], indic_em: ['JOBVAC', 'JVR'], geo: ['BG', 'EU27_2020'], time: q },
      (c) => (c.indic_em === 'JOBVAC' ? (c.geo === 'BG' ? 17460 : 3_000_000) : c.geo === 'BG' ? { value: 0.8, flag: 'p' } : 2.1));
  }
  if (dataset === 'earn_ses22_28') {
    // Реални стойности за BG (EUR/год., SES 2022)
    const bg = { TOTAL: 11602, OC1: 26007, OC2: 17969, OC3: 12913, OC4: 8597, OC5: 6465, OC6: 5601, OC7: 8968, OC8: 8259, OC9: 6261 };
    return jsonStat({ freq: ['A'], sex: ['T'], indic_se: ['ERN'], isco08: Object.keys(bg), age: ['TOTAL'], sizeclas: ['TOTAL'], unit: ['EUR'], geo: ['BG', 'EU27_2020'], time: ['2022'] },
      (c) => (c.geo === 'BG' ? bg[c.isco08] : bg[c.isco08] * 3));
  }
  throw new Error(`no fixture for ${dataset}`);
}

const SKILL_TEXTS = [
  'We use Python and SQL for data analysis with Power BI.',
  'Erfahrung mit Docker, Kubernetes und AWS. Gute Deutschkenntnisse und Englisch.',
  'React and TypeScript frontend developer, teamwork and communication skills.',
  'Machine learning engineer: PyTorch, LLM, AI products. Python required.',
  'IT-Sicherheit / cybersecurity analyst, SIEM, ISO 27001.',
  'Pflegefachkraft (m/w/d) – Pflege im Krankenhaus, teamfähig, belastbar.',
  'Projektmanagement mit Scrum, Kommunikationsstärke, analytisches Denken.',
  'Photovoltaik und erneuerbare Energien, Elektriker gesucht.',
];

export function arbeitnowJobs(page, n = 100, prefix = 'an') {
  return Array.from({ length: n }, (_, i) => {
    const k = (page - 1) * n + i;
    return {
      slug: `${prefix}-${k}`, company_name: `Company ${k % 40}`, title: `Job ${k}`,
      description: `<p>${SKILL_TEXTS[k % SKILL_TEXTS.length]}</p>`, remote: k % 3 === 0,
      url: `https://www.arbeitnow.com/jobs/${prefix}-${k}`, tags: ['Engineering'], job_types: [], location: 'Berlin',
      created_at: Math.floor(Date.now() / 1000) - (k % 20) * 86400,
    };
  });
}

export function remotiveJobs(n = 60) {
  return Array.from({ length: n }, (_, i) => ({
    id: 900000 + i, url: `https://remotive.com/remote-jobs/x/${i}`,
    // първите 5 съвпадат по заглавие+компания с обяви от Arbeitnow (кръстосан дубликат)
    title: i < 5 ? `Job ${i}` : `Remote role ${i}`, company_name: i < 5 ? `Company ${i % 40}` : `Remote Co ${i}`,
    company_logo: null, category: 'Software Development', job_type: 'full_time',
    publication_date: new Date(Date.now() - (i % 25) * 86400000).toISOString().slice(0, 19), candidate_required_location: 'Europe',
    salary: '', description: `<div>${SKILL_TEXTS[(i + 3) % SKILL_TEXTS.length]}</div>`,
  }));
}

/**
 * Фалшив fetchJson. `down` – списък с източници, които „не отговарят“.
 * @param {{down?:string[], bump?:number, calls?:string[]}} [o]
 */
export function fakeFetch(o = {}) {
  const down = new Set(o.down || []);
  return async (url) => {
    o.calls?.push(url);
    const u = new URL(url);
    const host = u.hostname;
    const fail = (name) => { if (down.has(name)) throw new Error(`fetch failed: getaddrinfo ENOTFOUND ${host}`); };
    if (host === 'ec.europa.eu' && u.pathname.includes('/eurostat/')) {
      fail('eurostat');
      return eurostatFixture(u.pathname.split('/').pop(), { bump: o.bump || 0 });
    }
    if (host === 'ec.europa.eu' && u.pathname.includes('/esco/api/search')) {
      fail('esco');
      const type = u.searchParams.get('type');
      const text = u.searchParams.get('text');
      const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return { total: 1, _embedded: { results: [{ className: type === 'skill' ? 'Skill' : 'Occupation', uri: `http://data.europa.eu/esco/${type}/${slug}`, title: text, preferredLabel: { en: text, bg: `бг ${text}` } }] } };
    }
    if (host === 'ec.europa.eu' && u.pathname.includes('/esco/api/resource')) {
      fail('esco');
      const uri = u.searchParams.get('uri');
      const type = u.pathname.endsWith('skill') ? 'skill' : 'occupation';
      const n = uri.length % 7;
      return type === 'skill'
        ? { uri, title: `бг умение ${n}`, preferredLabel: { en: 'x' }, _links: { isEssentialForOccupation: Array.from({ length: n + 1 }, (_, i) => ({ uri: `${uri}/o${i}`, title: `o${i}` })), isOptionalForOccupation: Array.from({ length: n * 3 }, (_, i) => ({ uri: `${uri}/p${i}`, title: `p${i}` })) } }
        : { uri, title: 'бг професия', code: '2512.3', preferredLabel: { en: 'occ' }, _links: { hasEssentialSkill: [{ uri: 'http://data.europa.eu/esco/skill/a', title: 'технически чертежи' }], hasOptionalSkill: [{ uri: 'http://data.europa.eu/esco/skill/b', title: 'Python' }] } };
    }
    if (host === 'www.arbeitnow.com') {
      fail('arbeitnow');
      const page = Number(u.searchParams.get('page') || 1);
      return { data: arbeitnowJobs(page, 100), links: { next: page < 2 ? `https://www.arbeitnow.com/api/job-board-api?page=${page + 1}` : null }, meta: { current_page: page } };
    }
    if (host === 'remotive.com') {
      fail('remotive');
      const jobs = remotiveJobs();
      return { '0-legal-notice': 'Remotive API Legal Notice', 'job-count': jobs.length, jobs };
    }
    throw new Error(`unexpected url ${url}`);
  };
}
