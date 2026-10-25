// Запис на данни с валидиране, нормализиране и премахване на дубликати.
import crypto from 'node:crypto';

const PERIOD_RE = /^\d{4}(-Q[1-4]|-\d{2}|-\d{2}-\d{2})?$|^\d{4}–\d{4}$|^\d{4}-\d{4}$/;

/**
 * Записва статистическо наблюдение. Ако стойността е променена от източника (ревизия),
 * старата се запазва в stat_revisions. Повторен запис без промяна е „дубликат“.
 * @returns {'inserted'|'updated'|'duplicate'|'rejected'}
 */
export function upsertObservation(db, o, nowIso) {
  if (!o.sourceId || !o.dataset || !o.seriesKey || !o.geo || !o.period) return 'rejected';
  if (!PERIOD_RE.test(o.period)) return 'rejected';
  if (o.value !== null && (typeof o.value !== 'number' || !Number.isFinite(o.value))) return 'rejected';
  const existing = db.prepare(`SELECT id, value, flag FROM stat_observations
    WHERE source_id = ? AND dataset = ? AND series_key = ? AND geo = ? AND period = ?`)
    .get(o.sourceId, o.dataset, o.seriesKey, o.geo, o.period);
  if (!existing) {
    db.prepare(`INSERT INTO stat_observations(source_id, dataset, series_key, geo, period, value, unit, flag, note, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(o.sourceId, o.dataset, o.seriesKey, o.geo, o.period, o.value, o.unit || null, o.flag || null, o.note || null, nowIso, nowIso);
    return 'inserted';
  }
  const same = (existing.value === null && o.value === null) || Number(existing.value) === o.value;
  if (same && (existing.flag || null) === (o.flag || null)) {
    db.prepare('UPDATE stat_observations SET last_seen_at = ? WHERE id = ?').run(nowIso, existing.id);
    return 'duplicate';
  }
  db.prepare('INSERT INTO stat_revisions(observation_id, old_value, new_value, old_flag, revised_at) VALUES (?, ?, ?, ?, ?)')
    .run(existing.id, existing.value, o.value, existing.flag, nowIso);
  db.prepare('UPDATE stat_observations SET value = ?, flag = ?, unit = ?, last_seen_at = ? WHERE id = ?')
    .run(o.value, o.flag || null, o.unit || null, nowIso, existing.id);
  return 'updated';
}

/** Ключ за откриване на една и съща обява, публикувана в няколко източника */
export function postingDedupeKey(title, company) {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return crypto.createHash('sha1').update(`${norm(title)}|${norm(company)}`).digest('hex');
}

/**
 * Записва обява и разпознатите в нея умения.
 * @returns {'inserted'|'duplicate'|'rejected'}
 */
export function upsertPosting(db, p, skills, nowIso) {
  if (!p.externalId || !p.title || typeof p.title !== 'string') return 'rejected';
  const postedAt = p.postedAt && !Number.isNaN(Date.parse(p.postedAt)) ? new Date(p.postedAt).toISOString() : null;
  const existing = db.prepare('SELECT id FROM job_postings WHERE source_id = ? AND external_id = ?').get(p.sourceId, String(p.externalId));
  if (existing) {
    db.prepare('UPDATE job_postings SET last_seen_at = ? WHERE id = ?').run(nowIso, existing.id);
    return 'duplicate';
  }
  const dedupeKey = postingDedupeKey(p.title, p.company);
  // Същата обява от друг източник през последните 60 дни => дубликат
  const cross = db.prepare(`SELECT id FROM job_postings WHERE dedupe_key = ? AND source_id != ?
    AND first_seen_at >= ?`).get(dedupeKey, p.sourceId, new Date(Date.parse(nowIso) - 60 * 86400000).toISOString());
  if (cross) {
    db.prepare('UPDATE job_postings SET last_seen_at = ? WHERE id = ?').run(nowIso, cross.id);
    return 'duplicate';
  }
  const r = db.prepare(`INSERT INTO job_postings(source_id, external_id, title, company, location, remote, url, posted_at, first_seen_at, last_seen_at, dedupe_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(p.sourceId, String(p.externalId), p.title.slice(0, 300), p.company ? String(p.company).slice(0, 200) : null,
      p.location ? String(p.location).slice(0, 200) : null, p.remote == null ? null : (p.remote ? 1 : 0),
      p.url || null, postedAt, nowIso, nowIso, dedupeKey);
  const ins = db.prepare('INSERT OR IGNORE INTO posting_skills(posting_id, skill_id) VALUES (?, ?)');
  for (const s of new Set(skills)) ins.run(r.lastInsertRowid, s);
  return 'inserted';
}
