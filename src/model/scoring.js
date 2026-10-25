// Модел за бъдещата стойност на уменията (собствен модел на Future Jobs).
// Пълно описание на методологията: public/METHODOLOGY.md
import { SKILLS } from '../catalog/skills.js';
import { OCCUPATIONS } from '../catalog/occupations.js';
import { WEF_2025, CEDEFOP_BG_2025 } from '../catalog/published.js';
import { sofiaDate } from '../lib/time.js';
import { tx } from '../db.js';

export const MODEL_VERSION = '1.0';
export const MIN_POSTINGS = 100;           // мин. брой обяви в прозорец, за да се изчисли търсене
export const MIN_SKILL_MENTIONS_FOR_CHANGE = 5;
export const WEIGHTS = { demand: 0.30, momentum: 0.15, longTerm: 0.30, breadth: 0.15, learning: 0.10 };
export const MIN_COMPONENTS_FOR_SCORE = 3;

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString();

// ---------------------------------------------------------------- обяви
function windowCounts(db, fromMs, toMs) {
  const total = Number(db.prepare(`SELECT COUNT(*) n FROM job_postings
    WHERE COALESCE(posted_at, first_seen_at) >= ? AND COALESCE(posted_at, first_seen_at) < ?`).get(iso(fromMs), iso(toMs)).n);
  const rows = db.prepare(`SELECT ps.skill_id, COUNT(*) n FROM posting_skills ps JOIN job_postings p ON p.id = ps.posting_id
    WHERE COALESCE(p.posted_at, p.first_seen_at) >= ? AND COALESCE(p.posted_at, p.first_seen_at) < ? GROUP BY ps.skill_id`)
    .all(iso(fromMs), iso(toMs));
  const bySkill = new Map(rows.map((r) => [String(r.skill_id), Number(r.n)]));
  return { total, bySkill, from: iso(fromMs).slice(0, 10), to: iso(toMs - 1).slice(0, 10) };
}

function collectionStart(db) {
  const r = db.prepare('SELECT MIN(first_seen_at) m FROM job_postings').get();
  return r?.m ? Date.parse(String(r.m)) : null;
}

/** Промяна на дела между два прозореца, само ако данните са достатъчни и събирани в целия период */
function shareChange(cur, prev, skillId, startMs, collStart) {
  if (collStart === null || collStart > startMs) return { value: null, reason: 'Събирането на обяви не обхваща целия период' };
  if (cur.total < MIN_POSTINGS || prev.total < MIN_POSTINGS) return { value: null, reason: `Под ${MIN_POSTINGS} обяви в прозорец` };
  const a = (cur.bySkill.get(skillId) || 0);
  const b = (prev.bySkill.get(skillId) || 0);
  if (a + b < MIN_SKILL_MENTIONS_FOR_CHANGE) return { value: null, reason: 'Твърде малко споменавания на умението' };
  const sa = a / cur.total;
  const sb = b / prev.total;
  return { value: sa - sb, relative: sb > 0 ? (sa - sb) / sb : null, prevShare: sb, prevPeriod: `${prev.from} – ${prev.to}` };
}

function cooccurrence(db, fromMs, toMs) {
  const rows = db.prepare(`SELECT a.skill_id s, b.skill_id t, COUNT(*) n FROM posting_skills a
    JOIN posting_skills b ON a.posting_id = b.posting_id AND a.skill_id != b.skill_id
    JOIN job_postings p ON p.id = a.posting_id
    WHERE COALESCE(p.posted_at, p.first_seen_at) >= ? AND COALESCE(p.posted_at, p.first_seen_at) < ?
    GROUP BY a.skill_id, b.skill_id`).all(iso(fromMs), iso(toMs));
  const map = new Map();
  for (const r of rows) {
    const s = String(r.s);
    if (!map.has(s)) map.set(s, []);
    map.get(s).push({ skill: String(r.t), n: Number(r.n) });
  }
  return map;
}

// ---------------------------------------------------------------- дългосрочна перспектива
/** Тенденция на заетостта в България за ISCO основна група (Eurostat lfsa_egais) */
export function employmentTrend(db, isco, geo = 'BG') {
  const rows = db.prepare(`SELECT period, value, flag FROM stat_observations
    WHERE source_id = 'eurostat' AND dataset = 'lfsa_egais' AND series_key = ? AND geo = ? AND value IS NOT NULL ORDER BY period`)
    .all(`isco08=OC${isco}`, geo);
  if (rows.length < 4) return null;
  const last = rows[rows.length - 1];
  const base = rows[Math.max(0, rows.length - 6)]; // до 5 години назад
  const change = (Number(last.value) - Number(base.value)) / Number(base.value);
  const breaks = rows.slice(rows.indexOf(base)).some((r) => String(r.flag || '').includes('b'));
  return { from: String(base.period), to: String(last.period), fromValue: Number(base.value), toValue: Number(last.value), change, breaks,
    series: rows.map((r) => ({ period: String(r.period), value: Number(r.value), flag: r.flag ? String(r.flag) : null })) };
}

/**
 * Индекс на дългосрочната перспектива на професия (0–100) = дял на положителните сигнали.
 * Всеки наличен сигнал е +1 (положителен), 0 (неутрален) или −1 (отрицателен).
 * Индекс = (Σ сигнали + n) / (2n) × 100. Без сигнали => null.
 */
export function occupationOutlook(db, occ, isco2Override) {
  const isco = occ.isco;
  const isco2 = isco2Override || occ.isco2;
  const signals = [];
  signals.push({
    key: 'cedefop_employment', type: 'forecast', source: 'Cedefop Skills Forecast 2025 (България)', period: CEDEFOP_BG_2025.period,
    value: CEDEFOP_BG_2025.risingIscoMajor.includes(isco) ? 1 : -1,
    text: CEDEFOP_BG_2025.risingIscoMajor.includes(isco)
      ? 'Cedefop прогнозира ръст на заетостта в тази професионална група в България до 2035 г.'
      : 'Според Cedefop заетостта в тази професионална група в България не расте до 2035 г.',
  });
  const shortage = CEDEFOP_BG_2025.shortageIsco2.find((s) => s.isco2 === isco2);
  signals.push({
    key: 'cedefop_shortage', type: 'forecast', source: 'Cedefop Skills Forecast 2025 (България)', period: CEDEFOP_BG_2025.period,
    value: shortage ? 1 : 0,
    text: shortage ? `Групата „${shortage.label}“ е сред тези с най-висок очакван недостиг на кадри до 2035 г.` : 'Групата не е сред петте с най-висок очакван недостиг.',
  });
  const fast = occ.wefFastest && WEF_2025.fastestGrowingJobs.find((j) => j.key === occ.wefFastest);
  const large = occ.wefLargest && WEF_2025.largestGrowthJobs.find((j) => j.key === occ.wefLargest);
  signals.push({
    key: 'wef_growth', type: 'forecast', source: 'WEF Future of Jobs 2025 (глобално)', period: WEF_2025.period,
    value: fast || large ? 1 : 0,
    text: fast ? `WEF: „${fast.label}“ е сред 10-те най-бързо растящи професии (+${fast.pct}% до 2030 г.).`
      : large ? `WEF: „${large.label}“ е сред професиите с най-голям абсолютен ръст до 2030 г.`
        : 'Професията не е в топ списъците на WEF.',
  });
  const trend = employmentTrend(db, isco);
  if (trend) {
    const v = trend.change > 0.02 ? 1 : trend.change < -0.02 ? -1 : 0;
    signals.push({
      key: 'eurostat_trend', type: 'fact', source: 'Eurostat lfsa_egais (България)', period: `${trend.from}–${trend.to}`, value: v,
      text: `Заетите в групата в България са се променили с ${(trend.change * 100).toFixed(1)}% (${trend.from}–${trend.to}).` +
        (trend.breaks ? ' Внимание: има прекъсване на редицата (методологична промяна).' : ''),
    });
  }
  const n = signals.length;
  const sum = signals.reduce((a, s) => a + s.value, 0);
  return { index: n ? Math.round(((sum + n) / (2 * n)) * 100) : null, signals, trend };
}

// ---------------------------------------------------------------- агрегиране
function percentileRanks(values) {
  // values: Map<id, number|null> => Map<id, 0..100> само за наличните
  const entries = [...values.entries()].filter(([, v]) => v !== null && v !== undefined && Number.isFinite(v));
  const out = new Map();
  if (entries.length === 0) return out;
  if (entries.length === 1) { out.set(entries[0][0], 50); return out; }
  const sorted = entries.map(([, v]) => v).sort((a, b) => a - b);
  for (const [id, v] of entries) {
    const below = sorted.filter((x) => x < v).length;
    const equal = sorted.filter((x) => x === v).length;
    out.set(id, Math.round(((below + (equal - 1) / 2) / (sorted.length - 1)) * 100));
  }
  return out;
}

/** Изчислява и записва показателите за всички умения за текущата дата (по Europe/Sofia). */
export function computeSkillMetrics(db, now = new Date()) {
  const t = now.getTime();
  const date = sofiaDate(now);
  const collStart = collectionStart(db);
  const cur = windowCounts(db, t - 30 * DAY, t + 1000);
  const prev30 = windowCounts(db, t - 60 * DAY, t - 30 * DAY);
  const prev90 = windowCounts(db, t - 120 * DAY, t - 90 * DAY);
  const co = cooccurrence(db, t - 90 * DAY, t + 1000);
  const win90 = windowCounts(db, t - 90 * DAY, t + 1000);

  const escoByLocal = new Map(db.prepare(`SELECT * FROM esco_concepts WHERE local_id IS NOT NULL`).all()
    .map((r) => [`${r.type}:${r.local_id}`, r]));

  const occOutlook = new Map(OCCUPATIONS.map((o) => {
    const esco = escoByLocal.get(`occupation:${o.id}`);
    const escoIsco2 = esco?.code ? String(esco.code).slice(0, 2) : null;
    return [o.id, occupationOutlook(db, o, escoIsco2 && /^\d\d$/.test(escoIsco2) ? escoIsco2 : null)];
  }));

  const raw = new Map();
  for (const s of SKILLS) {
    const withSkill = cur.bySkill.get(s.id) || 0;
    const demandShare = cur.total >= MIN_POSTINGS ? withSkill / cur.total : null;
    const ch30 = shareChange(cur, prev30, s.id, t - 60 * DAY, collStart);
    const ch90 = shareChange(cur, prev90, s.id, t - 120 * DAY, collStart);

    // Дългосрочна перспектива: среднопретеглено от свързаните професии + сигнал от WEF за самото умение
    const related = OCCUPATIONS.flatMap((o) => (o.coreSkills.includes(s.id) ? [{ o, w: 1 }] : o.complementarySkills.includes(s.id) ? [{ o, w: 0.5 }] : []));
    let occAvg = null;
    if (related.length) {
      const valid = related.filter((r) => occOutlook.get(r.o.id).index !== null);
      const wsum = valid.reduce((a, r) => a + r.w, 0);
      occAvg = wsum ? valid.reduce((a, r) => a + r.w * occOutlook.get(r.o.id).index, 0) / wsum : null;
    }
    const wefSkill = s.wef ? WEF_2025.growingSkills.find((g) => g.key === s.wef) : null;
    const longTerm = occAvg === null ? null : Math.round(0.75 * occAvg + 0.25 * (wefSkill ? 100 : 50));

    // Приложимост: брой ESCO професии + брой професии в каталога
    const esco = escoByLocal.get(`skill:${s.id}`);
    const escoCount = esco && esco.essential_for_count !== null ? Number(esco.essential_for_count) + Number(esco.optional_for_count || 0) : null;
    const breadth = escoCount !== null ? Math.log1p(escoCount) : null;

    // Обучение: брой подбрани ресурси (безплатните тежат повече)
    const learning = s.resources.reduce((a, r) => a + (r.free ? 1 : 0.5), 0);

    // Връзка с други умения: lift = P(t|s) / P(t) в последните 90 дни
    const totalCo = win90;
    const sCount = totalCo.bySkill.get(s.id) || 0;
    const related2 = (co.get(s.id) || [])
      .filter((x) => x.n >= 5 && sCount > 0)
      .map((x) => ({ skill: x.skill, n: x.n, lift: (x.n / sCount) / ((totalCo.bySkill.get(x.skill) || 1) / Math.max(totalCo.total, 1)) }))
      .sort((a, b) => b.lift - a.lift).slice(0, 5)
      .map((x) => ({ ...x, lift: Math.round(x.lift * 100) / 100 }));

    raw.set(s.id, {
      s, withSkill, demandShare, ch30, ch90, longTerm, occAvg, wefSkill, related, esco, escoCount, breadth, learning, cooc: related2,
      momentum: ch90.value ?? ch30.value ?? null,
    });
  }

  const pr = {
    demand: percentileRanks(new Map([...raw].map(([k, v]) => [k, v.demandShare]))),
    momentum: percentileRanks(new Map([...raw].map(([k, v]) => [k, v.momentum]))),
    longTerm: percentileRanks(new Map([...raw].map(([k, v]) => [k, v.longTerm]))),
    breadth: percentileRanks(new Map([...raw].map(([k, v]) => [k, v.breadth]))),
    learning: percentileRanks(new Map([...raw].map(([k, v]) => [k, v.learning]))),
  };

  const results = [];
  tx(db, () => {
    for (const [id, v] of raw) {
      const comps = {};
      for (const k of Object.keys(WEIGHTS)) if (pr[k].has(id)) comps[k] = pr[k].get(id);
      const n = Object.keys(comps).length;
      const hasCore = comps.demand !== undefined || comps.longTerm !== undefined;
      let score = null;
      if (n >= MIN_COMPONENTS_FOR_SCORE && hasCore) {
        const wsum = Object.keys(comps).reduce((a, k) => a + WEIGHTS[k], 0);
        score = Math.round(Object.entries(comps).reduce((a, [k, p]) => a + WEIGHTS[k] * p, 0) / wsum);
      }
      const confidence = score === null ? 'insufficient'
        : n === 5 && cur.total >= 500 ? 'high'
          : n >= 4 && (comps.demand !== undefined) ? 'medium' : 'low';
      const details = {
        modelVersion: MODEL_VERSION,
        window: { current: `${cur.from} – ${cur.to}`, postingsTotal: cur.total },
        demand: { share: v.demandShare, postings: v.withSkill, total: cur.total, sources: ['arbeitnow', 'remotive'], minRequired: MIN_POSTINGS },
        change30: v.ch30, change90: v.ch90,
        longTerm: {
          index: v.longTerm, occupationsAvg: v.occAvg === null ? null : Math.round(v.occAvg),
          occupations: v.related.map((r) => ({ id: r.o.id, title: r.o.title, weight: r.w, outlook: occOutlook.get(r.o.id) })),
          wefSkill: v.wefSkill,
        },
        breadth: { escoOccupations: v.escoCount, escoUri: v.esco?.uri || null, escoLabel: v.esco?.label_bg || null,
          catalogOccupations: v.related.length },
        learning: { resources: v.s.resources.length, free: v.s.resources.filter((r) => r.free).length },
        cooccurrence: v.cooc,
        components: comps,
        weightsUsed: Object.fromEntries(Object.keys(comps).map((k) => [k, WEIGHTS[k]])),
      };
      db.prepare(`INSERT INTO skill_metrics(skill_id, date, postings_total, postings_with_skill, demand_share, change_30d, change_90d,
          long_term, breadth, learning, score, confidence, details_json, computed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(skill_id, date) DO UPDATE SET postings_total = excluded.postings_total, postings_with_skill = excluded.postings_with_skill,
          demand_share = excluded.demand_share, change_30d = excluded.change_30d, change_90d = excluded.change_90d,
          long_term = excluded.long_term, breadth = excluded.breadth, learning = excluded.learning, score = excluded.score,
          confidence = excluded.confidence, details_json = excluded.details_json, computed_at = excluded.computed_at`)
        .run(id, date, cur.total, v.withSkill, v.demandShare, v.ch30.value ?? null, v.ch90.value ?? null,
          v.longTerm, v.escoCount, v.learning, score, confidence, JSON.stringify(details), now.toISOString());
      results.push({ id, score, confidence });
    }
  });
  return { date, results, postingsInWindow: cur.total };
}

/** Последните изчислени показатели за всяко умение */
export function latestSkillMetrics(db) {
  const rows = db.prepare(`SELECT m.* FROM skill_metrics m JOIN (SELECT skill_id, MAX(date) d FROM skill_metrics GROUP BY skill_id) x
    ON x.skill_id = m.skill_id AND x.d = m.date`).all();
  return new Map(rows.map((r) => [String(r.skill_id), { ...r, details: JSON.parse(String(r.details_json)) }]));
}

export function skillHistory(db, skillId, limit = 180) {
  return db.prepare(`SELECT date, demand_share, score, postings_total, postings_with_skill FROM skill_metrics
    WHERE skill_id = ? ORDER BY date DESC LIMIT ?`).all(skillId, limit).reverse();
}
