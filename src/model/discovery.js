// Откриване на нови умения и професии при ежедневното обновяване.
// 1) Кодът намира растящи етикети и длъжности в обявите (числата са изчислени тук, не от ИИ).
// 2) Gemini само ги описва на български и ги свързва със съществуващия каталог (структуриран JSON).
// 3) Записите се публикуват автоматично с етикет „Ново · AI предложение“; нищо не се изтрива,
//    администраторът може само да ги скрие. Бъдещи професии се предлагат само от силно растящи умения.
import { SKILLS, SKILL_BY_ID, detectSkills } from '../catalog/skills.js';
import { OCCUPATIONS, NACE_LABELS, ISCO_MAJOR_LABELS } from '../catalog/occupations.js';
import { FUTURE_OCCUPATIONS } from '../catalog/future.js';
import { INTERESTS } from '../catalog/quiz.js';
import { applyDynamicCatalog } from '../catalog/registry.js';
import { streamWithFallback } from '../assistant/gemini.js';

const DAY = 86400000;
const CATEGORIES = ['tech', 'data', 'business', 'care', 'creative', 'green', 'hands_on', 'human', 'language'];
export const DISCOVERY_LIMITS = { minPostings: 15, minShare: 0.01, maxSkillsPerRun: 3, minTitlePostings: 12, maxOccPerRun: 1,
  futureMinPostings: 20, futureMinGrowth: 0.5, futureEveryDays: 7 };

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
const clean = (v, max) => String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const noLinks = (s) => !/https?:|www\./i.test(s);

async function askGemini(ctx, prompt, schema) {
  const r = await streamWithFallback({
    apiKey: ctx.apiKey, models: ctx.models, fetchImpl: ctx.fetchImpl, log: ctx.log,
    systemInstruction: 'Ти си редактор на каталог с умения и професии за български ученици и възрастни. Отговаряш САМО с валиден JSON по схемата. Не измисляй числа, статистики, курсове или линкове.',
    contents: [{ role: 'user', text: prompt }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2000, responseMimeType: 'application/json', responseSchema: schema },
  });
  let text = '';
  for await (const c of r.stream) text += c;
  return { json: JSON.parse(text), model: r.model };
}

function windowCount(db, from, to) {
  return Number(db.prepare('SELECT COUNT(*) n FROM job_postings WHERE first_seen_at >= ? AND first_seen_at < ?').get(from, to).n);
}

/** Растящи етикети, които не съответстват на нито едно умение от каталога. */
export function skillCandidates(db, now, L = DISCOVERY_LIMITS) {
  const t = now.getTime();
  const cur0 = new Date(t - 30 * DAY).toISOString(), end = new Date(t + 1000).toISOString(), prev0 = new Date(t - 60 * DAY).toISOString();
  const total = windowCount(db, cur0, end);
  const prevTotal = windowCount(db, prev0, cur0);
  if (total < 100) return [];
  const known = new Set(db.prepare(`SELECT origin FROM dyn_catalog UNION SELECT origin FROM dyn_rejected WHERE kind = 'skill'`).all().map((r) => String(r.origin)));
  const rows = db.prepare(`SELECT t.term, SUM(CASE WHEN p.first_seen_at >= ? THEN 1 ELSE 0 END) cur,
      SUM(CASE WHEN p.first_seen_at < ? THEN 1 ELSE 0 END) prev
    FROM posting_terms t JOIN job_postings p ON p.id = t.posting_id
    WHERE p.first_seen_at >= ? GROUP BY t.term HAVING cur >= ? ORDER BY cur DESC LIMIT 60`).all(cur0, cur0, prev0, L.minPostings);
  return rows.map((r) => ({ term: String(r.term), cur: Number(r.cur), prev: Number(r.prev), share: Number(r.cur) / total, total, prevTotal }))
    .filter((r) => r.share >= L.minShare && !known.has(r.term) && detectSkills(r.term).length === 0)
    // ако има достатъчно история – само растящи; иначе само честотата
    .filter((r) => prevTotal < 100 || r.cur / total > (r.prev / prevTotal) * 1.2)
    .slice(0, 8);
}

const normTitle = (t) => String(t).toLowerCase()
  .replace(/\((?:m|w|d|f|x|all genders?|m\/w\/d|w\/m\/d)[^)]*\)/g, ' ')
  .replace(/\b(senior|junior|lead|principal|staff|sr\.?|jr\.?|intern|werkstudent\w*|praktikant\w*|m\/w\/d|w\/m\/d|f\/m\/d|remote|hybrid|\d+)\b/g, ' ')
  .replace(/[^\p{L}\s+#./-]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Най-честите длъжности за 30 дни (нормализирани). */
export function titleCandidates(db, now, L = DISCOVERY_LIMITS) {
  const from = new Date(now.getTime() - 30 * DAY).toISOString();
  const counts = new Map();
  for (const r of db.prepare('SELECT title FROM job_postings WHERE first_seen_at >= ?').all(from)) {
    const n = normTitle(r.title);
    if (n.length >= 4 && n.length <= 60) counts.set(n, (counts.get(n) || 0) + 1);
  }
  const known = new Set(db.prepare(`SELECT origin FROM dyn_rejected WHERE kind = 'occupation'`).all().map((r) => String(r.origin)));
  return [...counts].filter(([t, n]) => n >= L.minTitlePostings && !known.has(t)).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([title, n]) => ({ title, n }));
}

/** Умения със силен ръст на дела в обявите (за предложения за бъдещи професии). */
export function growingSkills(db, now, L = DISCOVERY_LIMITS) {
  const t = now.getTime();
  const cur0 = new Date(t - 30 * DAY).toISOString(), prev0 = new Date(t - 60 * DAY).toISOString(), end = new Date(t + 1000).toISOString();
  const total = windowCount(db, cur0, end), prevTotal = windowCount(db, prev0, cur0);
  if (total < 100 || prevTotal < 100) return [];
  const q = db.prepare(`SELECT ps.skill_id, COUNT(*) n FROM posting_skills ps JOIN job_postings p ON p.id = ps.posting_id
    WHERE p.first_seen_at >= ? AND p.first_seen_at < ? GROUP BY ps.skill_id`);
  const cur = new Map(q.all(cur0, end).map((r) => [String(r.skill_id), Number(r.n)]));
  const prev = new Map(q.all(prev0, cur0).map((r) => [String(r.skill_id), Number(r.n)]));
  return [...cur].map(([id, n]) => {
    const ps = (prev.get(id) || 0) / prevTotal, cs = n / total;
    return { id, n, prevN: prev.get(id) || 0, growth: ps ? cs / ps - 1 : null, share: cs };
  }).filter((x) => SKILL_BY_ID.has(x.id) && x.n >= L.futureMinPostings && x.growth !== null && x.growth >= L.futureMinGrowth)
    .sort((a, b) => b.growth - a.growth);
}

function save(db, kind, id, data, origin, evidence, model, nowIso) {
  db.prepare(`INSERT INTO dyn_catalog(kind, id, data, status, origin, evidence, model, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?) ON CONFLICT(kind, id) DO NOTHING`)
    .run(kind, id, JSON.stringify(data), origin, JSON.stringify(evidence), model, nowIso, nowIso);
}
const reject = (db, kind, origin, reason, nowIso) => db.prepare(`INSERT OR IGNORE INTO dyn_rejected(kind, origin, reason, at) VALUES (?, ?, ?, ?)`)
  .run(kind, origin, String(reason).slice(0, 300), nowIso);

const skillListText = () => SKILLS.map((s) => `${s.id}: ${s.name}`).join('\n');
const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',')}%`;

async function discoverSkills(db, ctx, now, L) {
  const cands = skillCandidates(db, now, L);
  if (!cands.length) return { added: [], rejected: 0 };
  const schema = { type: 'ARRAY', items: { type: 'OBJECT', required: ['term', 'isSkill'], properties: {
    term: { type: 'STRING' }, isSkill: { type: 'BOOLEAN' }, reason: { type: 'STRING' }, name: { type: 'STRING' }, en: { type: 'STRING' },
    description: { type: 'STRING' }, category: { type: 'STRING', enum: CATEGORIES }, synonyms: { type: 'ARRAY', items: { type: 'STRING' } },
    sameAs: { type: 'STRING' } } } };
  const prompt = [
    'Етикети от обяви за работа (последните 30 дни, брой обяви). За всеки реши дали е конкретно, учимо УМЕНИЕ (технология, метод, инструмент, знание).',
    'НЕ са умения: длъжности, фирми, градове, видове заетост (full-time, remote), езици на обявата, твърде общи думи (it, software, other).',
    'Ако етикетът е синоним на умение от каталога – isSkill=false и sameAs=<id>.',
    'За умение: name – кратко име на български; en – на английски; description – едно изречение на български (до 25 думи) за ученици;',
    `category – една от: ${CATEGORIES.join(', ')}; synonyms – до 5 варианта на изписване на латиница (без измислени).`,
    '', 'Каталог (id: име):', skillListText(), '', 'Етикети:', ...cands.map((c) => `- ${c.term} (${c.cur})`),
  ].join('\n');
  const { json, model } = await askGemini(ctx, prompt, schema);
  const nowIso = now.toISOString();
  const added = [];
  let rejected = 0;
  for (const c of cands) {
    const d = (Array.isArray(json) ? json : []).find((x) => String(x?.term || '').toLowerCase() === c.term);
    if (!d) continue;
    const name = clean(d.name, 60), en = clean(d.en, 60), description = clean(d.description, 220);
    if (!d.isSkill || !name || !en || !description || !CATEGORIES.includes(d.category) || !noLinks(name + description)) {
      reject(db, 'skill', c.term, d.reason || (d.sameAs ? `синоним на ${d.sameAs}` : 'не е умение'), nowIso); rejected++; continue;
    }
    if (added.length >= L.maxSkillsPerRun) break;
    const id = `dyn_${slug(en) || slug(c.term)}`;
    if (SKILL_BY_ID.has(id)) { reject(db, 'skill', c.term, 'вече съществува', nowIso); continue; }
    const patterns = [...new Set([c.term, en.toLowerCase(), ...(Array.isArray(d.synonyms) ? d.synonyms : [])]
      .map((x) => clean(x, 40).toLowerCase()).filter((x) => x.length >= 2 && !/[<>]/.test(x)))];
    const q = encodeURIComponent(en);
    const skill = { name, en, category: d.category, description, patterns, escoQuery: en, iscoGroups: ['2', '3'],
      resources: [
        { title: `Търсене на безплатни курсове: „${en}“`, url: `https://www.coursera.org/search?query=${q}&price=1`, provider: 'Coursera', free: true, lang: 'en' },
        { title: `Видео уроци: „${en}“`, url: `https://www.youtube.com/results?search_query=${q}+tutorial`, provider: 'YouTube', free: true, lang: 'en' },
      ] };
    const evidence = { postings30: c.cur, prev30: c.prev, total30: c.total, share: c.share, term: c.term,
      text: `Етикетът „${c.term}“ се среща в ${c.cur} от ${c.total} обяви за последните 30 дни (${pct(c.share)}).` };
    save(db, 'skill', id, skill, c.term, evidence, model, nowIso);
    // Обявите с този етикет вече имат умението (за да има данни веднага)
    const ins = db.prepare('INSERT OR IGNORE INTO posting_skills(posting_id, skill_id) SELECT posting_id, ? FROM posting_terms WHERE term = ?');
    for (const pt of patterns) ins.run(id, pt);
    added.push(id);
  }
  return { added, rejected };
}

async function discoverOccupation(db, ctx, now, L) {
  const titles = titleCandidates(db, now, L);
  if (!titles.length) return { added: [] };
  const schema = { type: 'OBJECT', required: ['isNew'], properties: {
    isNew: { type: 'BOOLEAN' }, reason: { type: 'STRING' }, title: { type: 'STRING' }, en: { type: 'STRING' }, description: { type: 'STRING' },
    isco: { type: 'STRING', enum: Object.keys(ISCO_MAJOR_LABELS) }, nace: { type: 'STRING', enum: Object.keys(NACE_LABELS) },
    interests: { type: 'OBJECT', properties: Object.fromEntries(Object.keys(INTERESTS).map((k) => [k, { type: 'INTEGER' }])) },
    coreSkills: { type: 'ARRAY', items: { type: 'STRING' } }, complementarySkills: { type: 'ARRAY', items: { type: 'STRING' } },
    matchedTitles: { type: 'ARRAY', items: { type: 'STRING' } } } };
  const prompt = [
    'Най-честите длъжности в обявите за последните 30 дни (брой). Има ли сред тях ЕДНА професия, която ясно НЕ е покрита от каталога по-долу и има бъдеще?',
    'Ако не – isNew=false. Ако да: title – име на български; en – на английски; description – едно изречение (до 25 думи);',
    'isco – основна група по ISCO (1–9); nace – икономически сектор; interests – тегла 0–3 по ключовете; coreSkills (2–4) и complementarySkills (до 3) – САМО id от каталога с умения;',
    'matchedTitles – кои от длъжностите по-долу отговарят на професията (точно копирани).',
    '', 'Професии в каталога:', ...OCCUPATIONS.map((o) => `- ${o.title}`), '', 'Умения (id: име):', skillListText(),
    '', `ISCO: ${Object.entries(ISCO_MAJOR_LABELS).map(([k, v]) => `${k}=${v}`).join('; ')}`,
    `Сектори: ${Object.entries(NACE_LABELS).map(([k, v]) => `${k}=${v}`).join('; ')}`, '', 'Длъжности:', ...titles.map((t) => `- ${t.title} (${t.n})`),
  ].join('\n');
  const { json: d, model } = await askGemini(ctx, prompt, schema);
  const nowIso = now.toISOString();
  if (!d?.isNew) { for (const t of titles.slice(0, 5)) reject(db, 'occupation', t.title, d?.reason || 'покрита от каталога', nowIso); return { added: [] }; }
  const matched = titles.filter((t) => (d.matchedTitles || []).map((x) => String(x).toLowerCase()).includes(t.title));
  const n = matched.reduce((a, t) => a + t.n, 0);
  const title = clean(d.title, 80), description = clean(d.description, 220), en = clean(d.en, 80);
  const core = (d.coreSkills || []).filter((x) => SKILL_BY_ID.has(x)).slice(0, 4);
  if (!title || !en || !description || n < L.minTitlePostings || core.length < 2 || !ISCO_MAJOR_LABELS[d.isco] || !NACE_LABELS[d.nace]) {
    reject(db, 'occupation', matched[0]?.title || titles[0].title, 'недостатъчни доказателства', nowIso); return { added: [] };
  }
  const id = `dyn_${slug(en)}`;
  if (OCCUPATIONS.some((o) => o.id === id || o.title.toLowerCase() === title.toLowerCase())) return { added: [] };
  const interests = Object.fromEntries(Object.keys(INTERESTS).map((k) => [k, Math.max(0, Math.min(3, Number(d.interests?.[k]) || 0))]).filter(([, v]) => Number(v) > 0));
  const occ = { title, description, escoQuery: en, isco: String(d.isco), isco2: null, nace: d.nace, interests,
    coreSkills: core, complementarySkills: (d.complementarySkills || []).filter((x) => SKILL_BY_ID.has(x) && !core.includes(x)).slice(0, 3) };
  const evidence = { postings30: n, titles: matched.map((t) => `${t.title} (${t.n})`),
    text: `${n} обяви за последните 30 дни с длъжности: ${matched.map((t) => t.title).join(', ')}.` };
  save(db, 'occupation', id, occ, matched[0].title, evidence, model, nowIso);
  return { added: [id] };
}

async function discoverFuture(db, ctx, now, L) {
  const last = db.prepare(`SELECT MAX(created_at) t FROM dyn_catalog WHERE kind = 'future'`).get()?.t;
  if (last && now.getTime() - Date.parse(String(last)) < L.futureEveryDays * DAY) return { added: [] };
  const used = new Set(db.prepare(`SELECT origin FROM dyn_catalog WHERE kind = 'future' UNION SELECT origin FROM dyn_rejected WHERE kind = 'future'`).all().map((r) => String(r.origin)));
  const g = growingSkills(db, now, L).find((x) => !used.has(x.id));
  if (!g) return { added: [] };
  const s = SKILL_BY_ID.get(g.id);
  const schema = { type: 'OBJECT', required: ['propose'], properties: {
    propose: { type: 'BOOLEAN' }, reason: { type: 'STRING' }, title: { type: 'STRING' }, description: { type: 'STRING' },
    expected: { type: 'STRING' }, driver: { type: 'STRING' }, closestToday: { type: 'STRING', enum: OCCUPATIONS.map((o) => o.id) },
    coreSkills: { type: 'ARRAY', items: { type: 'STRING' } }, complementarySkills: { type: 'ARRAY', items: { type: 'STRING' } },
    interests: { type: 'OBJECT', properties: Object.fromEntries(Object.keys(INTERESTS).map((k) => [k, { type: 'INTEGER' }])) },
    path: { type: 'ARRAY', items: { type: 'STRING' } } } };
  const prompt = [
    `Умението „${s.name}“ расте бързо в обявите за работа. Предложи ЕДНА професия, която още почти не съществува, но може да се появи в следващите 3–10 години заради това умение.`,
    'Ако няма смислена такава или вече е в списъка – propose=false.',
    'title – на български; description – едно изречение (до 25 думи); expected – период като „2028–2032“ (между 2027 и 2036); driver – кратка причина (до 6 думи);',
    `closestToday – най-близка професия днес (id); coreSkills – 2–4 id от каталога (включи „${s.id}“); complementarySkills – до 3 id; interests – тегла 0–3;`,
    'path – точно 3 стъпки на български („Сега: …“, „След 2–3 години: …“, „След това: …“). Без числа, статистики и линкове.',
    '', 'Вече познати бъдещи професии:', ...FUTURE_OCCUPATIONS.map((f) => `- ${f.title}`), '', 'Професии днес (id: име):', ...OCCUPATIONS.map((o) => `${o.id}: ${o.title}`),
    '', 'Умения (id: име):', skillListText(),
  ].join('\n');
  const { json: d, model } = await askGemini(ctx, prompt, schema);
  const nowIso = now.toISOString();
  const title = clean(d?.title, 80), description = clean(d?.description, 220), driver = clean(d?.driver, 60);
  const expected = /^20(2[7-9]|3[0-6])\s*[–-]\s*20(2[8-9]|3\d|4[0-6])$/.test(String(d?.expected || '').trim()) ? String(d.expected).trim().replace('-', '–') : null;
  const core = (d?.coreSkills || []).filter((x) => SKILL_BY_ID.has(x)).slice(0, 4);
  const path = (d?.path || []).map((x) => clean(x, 200)).filter(Boolean).slice(0, 3);
  const all = [title, description, driver, ...path].join(' ');
  if (!d?.propose || !title || !description || !expected || !driver || core.length < 2 || path.length < 3 || !noLinks(all) || /\d+\s*%/.test(all)
    || FUTURE_OCCUPATIONS.some((f) => f.title.toLowerCase() === title.toLowerCase())) {
    reject(db, 'future', g.id, d?.reason || 'непълно или повторено предложение', nowIso); return { added: [] };
  }
  const id = `dyn_${slug(title.normalize('NFKD')) || slug(s.en)}_${g.id}`.slice(0, 60);
  const growthPct = Math.round(g.growth * 100);
  const fut = { title, description, expected, driver, evidence: 'ai', closestToday: d.closestToday, coreSkills: core,
    complementarySkills: (d.complementarySkills || []).filter((x) => SKILL_BY_ID.has(x) && !core.includes(x)).slice(0, 3),
    interests: Object.fromEntries(Object.keys(INTERESTS).map((k) => [k, Math.max(0, Math.min(3, Number(d.interests?.[k]) || 0))]).filter(([, v]) => Number(v) > 0)),
    path,
    why: [{ kind: 'fact', text: `Умението „${s.name}“ се споменава в ${g.n} обяви за последните 30 дни – делът му е нараснал с ${growthPct}% спрямо предходните 30 дни.`, source: 'Обяви Arbeitnow и Remotive (изчислено от Future Jobs)', url: null },
      { kind: 'ai', text: 'Самата професия е предложение на Gemini въз основа на този ръст – непотвърдена прогноза.', source: `Gemini (${model})`, url: null }],
    note: 'AI прогноза – непотвърдено. Проверявай в други източници.' };
  save(db, 'future', id, fut, g.id, { skill: g.id, postings30: g.n, prev30: g.prevN, growth: g.growth }, model, nowIso);
  return { added: [id] };
}

/**
 * Изпълнява се от ежедневното обновяване като „източник“ (ai_catalog).
 * @param {{db:any, config:any, nowIso:string, log:Function, geminiFetch?:typeof fetch}} ctx
 */
export async function runDiscovery(ctx, limits = DISCOVERY_LIMITS) {
  const apiKey = ctx.config?.gemini?.apiKey;
  if (!apiKey) return { skipped: true, reason: 'Няма GEMINI_API_KEY – новите умения и професии не се търсят' };
  const g = { apiKey, models: ctx.config.gemini.models, fetchImpl: ctx.geminiFetch, log: ctx.log };
  const now = new Date(ctx.nowIso);
  const out = { skills: [], occupations: [], future: [], errors: [] };
  /** @type {[string, Function][]} */
  const steps = [['skills', discoverSkills], ['occupations', discoverOccupation], ['future', discoverFuture]];
  for (const [key, fn] of steps) {
    try {
      const r = await fn(ctx.db, g, now, limits);
      out[key] = r.added;
      applyDynamicCatalog(ctx.db, { force: true });
    } catch (err) { out.errors.push(`${key}: ${String(err.message).slice(0, 200)}`); }
  }
  const inserted = out.skills.length + out.occupations.length + out.future.length;
  return { fetched: 0, inserted, updated: 0, duplicates: 0, rejected: 0,
    warning: out.errors.length ? out.errors.join('; ') : null,
    dataPeriod: inserted ? `нови: ${[...out.skills, ...out.occupations, ...out.future].join(', ')}` : 'няма нови' };
}

export const aiCatalog = { run: runDiscovery };
