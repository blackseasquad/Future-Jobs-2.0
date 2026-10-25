// ESCO API (Европейска класификация на умения, компетентности и професии), без ключ.
// Документация: https://esco.ec.europa.eu/en/use-esco/use-esco-services-api
import { SKILLS } from '../catalog/skills.js';
import { OCCUPATIONS } from '../catalog/occupations.js';
import { tx } from '../db.js';

const BASE = 'https://ec.europa.eu/esco/api';
const REFRESH_DAYS = 7; // ESCO се обновява рядко (версии) – проверяваме седмично

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Нормализира ресурс от ESCO API до запис за базата */
export function normalizeEscoResource(json, type, localId) {
  if (!json || typeof json.uri !== 'string' || !json.uri.startsWith('http://data.europa.eu/esco/')) {
    throw new Error('ESCO: невалиден ресурс (липсва uri)');
  }
  const links = json._links || {};
  const list = (k) => (Array.isArray(links[k]) ? links[k] : links[k] ? [links[k]] : []);
  const relations = [];
  if (type === 'occupation') {
    for (const l of list('hasEssentialSkill')) relations.push({ to: l.uri, label: l.title, relation: 'essential' });
    for (const l of list('hasOptionalSkill')) relations.push({ to: l.uri, label: l.title, relation: 'optional' });
  }
  return {
    uri: json.uri,
    type,
    localId,
    labelBg: json.title || json.preferredLabel?.bg || null,
    labelEn: json.preferredLabel?.en || null,
    code: json.code || null,
    essentialFor: type === 'skill' ? list('isEssentialForOccupation').length : null,
    optionalFor: type === 'skill' ? list('isOptionalForOccupation').length : null,
    relations,
  };
}

export const esco = {
  id: 'esco',
  async run(ctx) {
    const stats = { fetched: 0, inserted: 0, updated: 0, duplicates: 0, rejected: 0 };
    const cutoff = new Date(Date.parse(ctx.nowIso) - REFRESH_DAYS * 86400000).toISOString();
    const targets = [
      ...SKILLS.map((s) => ({ type: 'skill', localId: s.id, query: s.escoQuery })),
      ...OCCUPATIONS.map((o) => ({ type: 'occupation', localId: o.id, query: o.escoQuery })),
    ];
    let failures = 0;
    let stoppedEarly = 0;
    for (const t of targets) {
      if (ctx.deadline && Date.now() > ctx.deadline) { stoppedEarly++; continue; }
      const fresh = ctx.db.prepare('SELECT uri FROM esco_concepts WHERE local_id = ? AND type = ? AND fetched_at >= ?')
        .get(t.localId, t.type, cutoff);
      if (fresh && !ctx.force) { stats.duplicates++; continue; }
      try {
        const search = await ctx.fetchJson(`${BASE}/search?${new URLSearchParams({ text: t.query, type: t.type, language: 'en', limit: '1' })}`,
          { timeoutMs: ctx.config.fetchTimeoutMs });
        const hit = search?._embedded?.results?.[0];
        if (!hit?.uri) { stats.rejected++; continue; }
        const res = await ctx.fetchJson(`${BASE}/resource/${t.type}?${new URLSearchParams({ uri: hit.uri, language: 'bg' })}`,
          { timeoutMs: ctx.config.fetchTimeoutMs });
        const n = normalizeEscoResource(res, t.type, t.localId);
        if (!n.labelEn) n.labelEn = hit.preferredLabel?.en || hit.title || null;
        stats.fetched++;
        tx(ctx.db, () => {
          const existed = ctx.db.prepare('SELECT uri FROM esco_concepts WHERE uri = ?').get(n.uri);
          // Едно умение/професия от каталога сочи към точно едно ESCO понятие
          // (старото съответствие се запазва, само се откача от каталога – нищо не се изтрива)
          ctx.db.prepare('UPDATE esco_concepts SET local_id = NULL WHERE local_id = ? AND type = ? AND uri != ?').run(t.localId, t.type, n.uri);
          ctx.db.prepare(`INSERT INTO esco_concepts(uri, type, local_id, label_bg, label_en, code, essential_for_count, optional_for_count, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(uri) DO UPDATE SET local_id = excluded.local_id, label_bg = excluded.label_bg, label_en = excluded.label_en,
              code = excluded.code, essential_for_count = excluded.essential_for_count, optional_for_count = excluded.optional_for_count,
              fetched_at = excluded.fetched_at`)
            .run(n.uri, n.type, n.localId, n.labelBg, n.labelEn, n.code, n.essentialFor, n.optionalFor, ctx.nowIso);
          const rel = ctx.db.prepare('INSERT OR IGNORE INTO esco_relations(from_uri, to_uri, to_label, relation) VALUES (?, ?, ?, ?)');
          for (const r of n.relations) if (r.to) rel.run(n.uri, r.to, r.label || null, r.relation);
          stats[existed ? 'updated' : 'inserted']++;
        });
        await sleep(ctx.politeDelayMs ?? 250);
      } catch (err) {
        failures++;
        ctx.log(`ESCO ${t.type} ${t.localId}: ${err.message}`);
        if (failures >= 5 && stats.fetched === 0) throw new Error(`ESCO недостъпен: ${err.message}`);
      }
    }
    const warn = [failures ? `${failures} неуспешни заявки` : '', stoppedEarly ? `${stoppedEarly} понятия отложени за следващото изпълнение (времеви бюджет)` : '']
      .filter(Boolean).join('; ');
    return { ...stats, dataPeriod: 'ESCO (текуща версия)', warning: warn || null };
  },
};
