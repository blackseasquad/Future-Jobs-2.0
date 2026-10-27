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

// Заглавки за ESCO. Някои защитни стени (WAF) на ec.europa.eu отказват заявки без
// стандартни Accept заглавки. User-Agent остава честен – идентифицира приложението.
export const ESCO_HEADERS = {
  Accept: 'application/json, application/hal+json;q=0.9, */*;q=0.1',
  'Accept-Language': 'bg,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (compatible; FutureJobs/1.0; EduHack.bg student project)',
};

export const ESCO_TARGETS = [
  ...SKILLS.map((s) => ({ type: 'skill', localId: s.id, query: s.escoQuery })),
  ...OCCUPATIONS.map((o) => ({ type: 'occupation', localId: o.id, query: o.escoQuery })),
];

/** Търси и изтегля едно ESCO понятие. Използва се от импорта и от scripts/esco-snapshot.js. */
export async function fetchEscoConcept(fetchJson, t, timeoutMs) {
  const opts = { timeoutMs, headers: ESCO_HEADERS, retries: 1 };
  const search = await fetchJson(`${BASE}/search?${new URLSearchParams({ text: t.query, type: t.type, language: 'en', limit: '1' })}`, opts);
  const hit = search?._embedded?.results?.[0];
  if (!hit?.uri) return null;
  const res = await fetchJson(`${BASE}/resource/${t.type}?${new URLSearchParams({ uri: hit.uri, language: 'bg' })}`, opts);
  const n = normalizeEscoResource(res, t.type, t.localId);
  if (!n.labelEn) n.labelEn = hit.preferredLabel?.en || hit.title || null;
  return n;
}

function saveConcept(db, n, fetchedAt) {
  const existed = db.prepare('SELECT uri FROM esco_concepts WHERE uri = ?').get(n.uri);
  // Едно умение/професия от каталога сочи към точно едно ESCO понятие
  // (старото съответствие се запазва, само се откача от каталога – нищо не се изтрива)
  db.prepare('UPDATE esco_concepts SET local_id = NULL WHERE local_id = ? AND type = ? AND uri != ?').run(n.localId, n.type, n.uri);
  db.prepare(`INSERT INTO esco_concepts(uri, type, local_id, label_bg, label_en, code, essential_for_count, optional_for_count, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uri) DO UPDATE SET local_id = excluded.local_id, label_bg = excluded.label_bg, label_en = excluded.label_en,
      code = excluded.code, essential_for_count = excluded.essential_for_count, optional_for_count = excluded.optional_for_count,
      fetched_at = excluded.fetched_at`)
    .run(n.uri, n.type, n.localId, n.labelBg, n.labelEn, n.code, n.essentialFor, n.optionalFor, fetchedAt);
  const rel = db.prepare('INSERT OR IGNORE INTO esco_relations(from_uri, to_uri, to_label, relation) VALUES (?, ?, ?, ?)');
  for (const r of n.relations || []) if (r.to) rel.run(n.uri, r.to, r.label || null, r.relation);
  return existed ? 'updated' : 'inserted';
}

/** Снимка на ESCO данните (src/catalog/esco-snapshot.js), създадена със scripts/esco-snapshot.js */
export async function loadEscoSnapshot() {
  try {
    const mod = await import('../catalog/esco-snapshot.js');
    const snap = mod.default;
    if (!snap || !Array.isArray(snap.concepts) || !snap.concepts.length) return null;
    return snap;
  } catch {
    return null;
  }
}

const isBlocked = (err) => err && (err.status === 403 || err.status === 401 || err.status === 429);

export const esco = {
  id: 'esco',
  async run(ctx) {
    const stats = { fetched: 0, inserted: 0, updated: 0, duplicates: 0, rejected: 0 };
    const cutoff = new Date(Date.parse(ctx.nowIso) - REFRESH_DAYS * 86400000).toISOString();
    let failures = 0;
    let stoppedEarly = 0;
    let blockedErr = null;
    const pending = [];
    for (const t of ESCO_TARGETS) {
      const fresh = ctx.db.prepare('SELECT uri FROM esco_concepts WHERE local_id = ? AND type = ? AND fetched_at >= ?')
        .get(t.localId, t.type, cutoff);
      if (fresh && !ctx.force) { stats.duplicates++; continue; }
      if (blockedErr) { pending.push(t); continue; }
      if (ctx.deadline && Date.now() > ctx.deadline) { stoppedEarly++; continue; }
      try {
        const n = await fetchEscoConcept(ctx.fetchJson, t, ctx.config.fetchTimeoutMs);
        if (!n) { stats.rejected++; continue; }
        stats.fetched++;
        tx(ctx.db, () => { stats[saveConcept(ctx.db, n, ctx.nowIso)]++; });
        await sleep(ctx.politeDelayMs ?? 250);
      } catch (err) {
        failures++;
        ctx.log(`ESCO ${t.type} ${t.localId}: ${err.message}`);
        // Сървърът отказва достъп (напр. защитна стена за облачни IP адреси) – не продължаваме да опитваме
        if (isBlocked(err) || (failures >= 3 && stats.fetched === 0)) { blockedErr = err; pending.push(t); }
      }
    }

    if (blockedErr) {
      const reason = isBlocked(blockedErr) ? `ESCO API отказа достъп от сървъра (HTTP ${blockedErr.status})` : `ESCO API недостъпен (${String(blockedErr.message).slice(0, 80)})`;
      const snap = ctx.escoSnapshot !== undefined ? ctx.escoSnapshot : await loadEscoSnapshot();
      if (!snap) {
        throw new Error(`${reason}. Няма и локална снимка на ESCO – създай я с „npm run esco:snapshot“ или GitHub Actions workflow „ESCO snapshot“ (виж README).`);
      }
      const byKey = new Map(snap.concepts.map((c) => [`${c.type}:${c.localId}`, c]));
      tx(ctx.db, () => {
        for (const t of pending) {
          const c = byKey.get(`${t.type}:${t.localId}`);
          if (!c) { stats.rejected++; continue; }
          stats.fetched++;
          // fetched_at = датата на снимката – така API се опитва отново след 7 дни
          stats[saveConcept(ctx.db, c, snap.createdAt)]++;
        }
      });
      return { ...stats, dataPeriod: `ESCO снимка от ${String(snap.createdAt).slice(0, 10)}`,
        warning: `${reason}; използвана е запазената снимка от ${String(snap.createdAt).slice(0, 10)}.` };
    }

    const warn = [failures ? `${failures} неуспешни заявки` : '', stoppedEarly ? `${stoppedEarly} понятия отложени за следващото изпълнение (времеви бюджет)` : '']
      .filter(Boolean).join('; ');
    return { ...stats, dataPeriod: 'ESCO (текуща версия, API)', warning: warn || null };
  },
};
