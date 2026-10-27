// Публични API за обяви за работа. Пазим само метаданни и разпознатите умения –
// не публикуваме обявите повторно (изискване в условията на Remotive).
import { detectSkills } from '../catalog/skills.js';
import { stripHtml } from '../lib/http.js';
import { upsertPosting } from '../lib/store.js';
import { tx } from '../db.js';

function importPostings(ctx, sourceId, postings) {
  const stats = { fetched: 0, inserted: 0, updated: 0, duplicates: 0, rejected: 0 };
  tx(ctx.db, () => {
    for (const p of postings) {
      stats.fetched++;
      const skills = detectSkills(p.text);
      const r = upsertPosting(ctx.db, { ...p, sourceId }, skills, ctx.nowIso);
      stats[r === 'duplicate' ? 'duplicates' : r]++;
    }
  });
  return stats;
}

/** Нормализира обява от Arbeitnow */
export function normalizeArbeitnow(j) {
  if (!j || !j.slug || !j.title) return null;
  return {
    externalId: j.slug,
    title: String(j.title),
    company: j.company_name || null,
    location: j.location || null,
    remote: typeof j.remote === 'boolean' ? j.remote : null,
    url: j.url || null,
    postedAt: typeof j.created_at === 'number' ? new Date(j.created_at * 1000).toISOString() : j.created_at || null,
    text: [j.title, (j.tags || []).join(' '), (j.job_types || []).join(' '), stripHtml(j.description)].join(' \n '),
  };
}

/** Нормализира обява от Remotive */
export function normalizeRemotive(j) {
  if (!j || j.id == null || !j.title) return null;
  return {
    externalId: String(j.id),
    title: String(j.title),
    company: j.company_name || null,
    location: j.candidate_required_location || null,
    remote: true,
    url: j.url || null,
    postedAt: j.publication_date || null,
    text: [j.title, j.category || '', Array.isArray(j.tags) ? j.tags.join(' ') : '', stripHtml(j.description)].join(' \n '),
  };
}

export const arbeitnow = {
  id: 'arbeitnow',
  maxPages: 5,
  async run(ctx) {
    const all = [];
    let rejected = 0;
    for (let page = 1; page <= this.maxPages; page++) {
      const json = await ctx.fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, { timeoutMs: ctx.config.fetchTimeoutMs });
      if (!json || !Array.isArray(json.data)) throw new Error('Arbeitnow: неочакван формат (липсва data[])');
      for (const j of json.data) {
        const n = normalizeArbeitnow(j);
        if (n) all.push(n); else rejected++;
      }
      if (!json.links?.next || json.data.length === 0) break;
    }
    const stats = importPostings(ctx, 'arbeitnow', all);
    stats.rejected += rejected;
    return { ...stats, dataPeriod: periodOf(all) };
  },
};

export const remotive = {
  id: 'remotive',
  async run(ctx) {
    // Условия: до 4 заявки на ден, посочване на Remotive като източник, обявите се забавят с 24 ч.
    const json = await ctx.fetchJson('https://remotive.com/api/remote-jobs', { timeoutMs: ctx.config.fetchTimeoutMs });
    if (!json || !Array.isArray(json.jobs)) throw new Error('Remotive: неочакван формат (липсва jobs[])');
    let rejected = 0;
    const all = [];
    for (const j of json.jobs) {
      const n = normalizeRemotive(j);
      if (n) all.push(n); else rejected++;
    }
    const stats = importPostings(ctx, 'remotive', all);
    stats.rejected += rejected;
    return { ...stats, dataPeriod: periodOf(all) };
  },
};

function periodOf(postings) {
  const d = postings.map((p) => p.postedAt).filter(Boolean).map((s) => String(s).slice(0, 10)).sort();
  return d.length ? `${d[0]} – ${d[d.length - 1]}` : null;
}
