// Динамичен каталог: прилага записите от таблицата dyn_catalog (открити при ежедневното
// обновяване и описани от Gemini) към каталозите в паметта. Статичните записи не се променят;
// динамичните са отбелязани с dynamic: true и могат да бъдат скрити от администратора.
import { SKILLS, SKILL_BY_ID, recompileSkills } from './skills.js';
import { OCCUPATIONS, OCCUPATION_BY_ID } from './occupations.js';
import { FUTURE_OCCUPATIONS, FUTURE_BY_ID } from './future.js';

const applied = new WeakMap(); // db -> подпис на приложената версия

function replaceDynamic(arr, map, items) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].dynamic) { map.delete(arr[i].id); arr.splice(i, 1); }
  for (const it of items) { if (map.has(it.id)) continue; arr.push(it); map.set(it.id, it); }
}

/** Чете активните динамични записи и ги добавя към каталозите (само ако нещо е променено). */
export function applyDynamicCatalog(db, { force = false } = {}) {
  let rows;
  try {
    rows = db.prepare(`SELECT kind, id, data, evidence, model, created_at, updated_at, status FROM dyn_catalog ORDER BY created_at`).all();
  } catch { return { skills: 0, occupations: 0, future: 0 }; }
  const sig = rows.map((r) => `${r.kind}:${r.id}:${r.status}:${r.updated_at}`).join('|');
  if (!force && applied.get(db) === sig) return null;
  applied.set(db, sig);
  const active = rows.filter((r) => r.status === 'active');
  const parse = (r) => ({ ...JSON.parse(String(r.data)), id: String(r.id), dynamic: true, addedAt: r.created_at,
    aiEvidence: JSON.parse(String(r.evidence || '{}')), aiModel: r.model || null });
  const skills = active.filter((r) => r.kind === 'skill').map(parse);
  replaceDynamic(SKILLS, SKILL_BY_ID, skills);
  recompileSkills();
  // Професиите и бъдещите професии могат да сочат само към съществуващи умения
  const okSkills = (ids) => (Array.isArray(ids) ? ids.filter((x) => SKILL_BY_ID.has(x)) : []);
  const occs = active.filter((r) => r.kind === 'occupation').map(parse)
    .map((o) => ({ ...o, coreSkills: okSkills(o.coreSkills), complementarySkills: okSkills(o.complementarySkills) }))
    .filter((o) => o.coreSkills.length);
  replaceDynamic(OCCUPATIONS, OCCUPATION_BY_ID, occs);
  const fut = active.filter((r) => r.kind === 'future').map(parse)
    .map((f) => ({ ...f, coreSkills: okSkills(f.coreSkills), complementarySkills: okSkills(f.complementarySkills) }))
    .filter((f) => f.coreSkills.length && OCCUPATION_BY_ID.has(f.closestToday));
  replaceDynamic(FUTURE_OCCUPATIONS, FUTURE_BY_ID, fut);
  return { skills: skills.length, occupations: occs.length, future: fut.length };
}

/** Списък за администрацията и страница „Данни“. */
export function listDynamic(db, { includeHidden = false } = {}) {
  try {
    return db.prepare(`SELECT kind, id, data, status, origin, evidence, model, created_at FROM dyn_catalog
      ${includeHidden ? '' : "WHERE status = 'active'"} ORDER BY created_at DESC`).all().map((r) => {
      const d = JSON.parse(String(r.data));
      return { kind: r.kind, id: r.id, title: d.title || d.name, status: r.status, origin: r.origin, evidence: JSON.parse(String(r.evidence)), model: r.model, createdAt: r.created_at };
    });
  } catch { return []; }
}
