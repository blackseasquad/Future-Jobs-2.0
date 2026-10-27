// Персонализирани кариерни препоръки в три хоризонта.
// Всеки елемент разграничава: fact (реални данни), forecast (публикувана прогноза),
// model (изчисление на Future Jobs) и ai (AI генериран текст, ако е включен).
import { SKILLS, SKILL_BY_ID } from '../catalog/skills.js';
import { OCCUPATIONS, ISCO_MAJOR_LABELS, NACE_LABELS } from '../catalog/occupations.js';
import { INTERESTS, buildProfile } from '../catalog/quiz.js';
import { latestSkillMetrics, occupationOutlook } from './scoring.js';
import { WEF_2025, CEDEFOP_BG_2025 } from '../catalog/published.js';
import { getMeta } from '../db.js';
import { PROJECTS, GROUPS, STEP_LABELS } from '../catalog/first-steps.js';

const TECH_WEF = ['ai_big_data', 'networks_cyber', 'tech_literacy'];

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const k of Object.keys(INTERESTS)) {
    const x = a[k] || 0, y = b[k] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const pct = (x, d = 1) => `${(x * 100).toFixed(d).replace('.', ',')}%`;

/**
 * Заплата от Eurostat Structure of Earnings Survey 2022 (последното издание; следващото е за 2026 г.).
 * Най-точно: професионална група × сектор (earn_ses22_48, месечна). Ако за България няма стойност
 * (напр. поверителни данни), се ползва цялата професионална група, а накрая годишната/12 (earn_ses22_28).
 */
/**
 * Коефициент на ръст на заплатите в сектора: средно за последните 4 налични тримесечия
 * спрямо средното за 2022 г. (Eurostat lc_lci_r2_q, компонент D11 „Заплати“).
 */
export function wageGrowth(db, geo, nace) {
  for (const sadj of ['NSA', 'CA', 'SCA']) {
    const rows = db.prepare(`SELECT period, value FROM stat_observations WHERE source_id = 'eurostat' AND dataset = 'lc_lci_r2_q'
      AND series_key = ? AND geo = ? AND value IS NOT NULL ORDER BY period`).all(`nace_r2=${nace}|s_adj=${sadj}`, geo);
    const base = rows.filter((r) => String(r.period).startsWith('2022-Q'));
    const last4 = rows.slice(-4);
    if (base.length !== 4 || last4.length !== 4 || String(last4[0].period) <= '2022-Q4') continue;
    const avg = (a) => a.reduce((x, r) => x + Number(r.value), 0) / a.length;
    return { factor: avg(last4) / avg(base), from: String(last4[0].period), to: String(last4[3].period) };
  }
  return null;
}

/**
 * Заплата: официална стойност от Eurostat SES 2022 (последното издание – проучването е на 4 години;
 * следващото, за 2026 г., се публикува ок. 2028 г.), актуализирана с индекса на заплатите в сектора
 * до последните 4 тримесечия. SES: професионална група × сектор (earn_ses22_48); ако за България
 * няма стойност – цялата група, накрая годишната/12 (earn_ses22_28).
 */
export function salaryFor(db, occ) {
  const isco = occ.isco;
  const monthly = (geo, nace) => {
    for (const size of ['TOTAL', 'GE10']) {
      const r = db.prepare(`SELECT value, period FROM stat_observations WHERE source_id = 'eurostat' AND dataset = 'earn_ses22_48'
        AND series_key = ? AND geo = ? AND value IS NOT NULL ORDER BY period DESC LIMIT 1`).get(`isco08=OC${isco}|nace_r2=${nace}|sizeclas=${size}`, geo);
      if (r) return { monthly: Math.round(Number(r.value)), period: String(r.period), approx: false };
    }
    return null;
  };
  const annualGroup = (geo) => {
    const r = db.prepare(`SELECT value, period FROM stat_observations WHERE source_id = 'eurostat' AND dataset = 'earn_ses22_28'
      AND series_key = ? AND geo = ? AND value IS NOT NULL ORDER BY period DESC LIMIT 1`).get(`isco08=OC${isco}`, geo);
    return r ? { monthly: Math.round(Number(r.value) / 12), period: String(r.period), approx: true } : null;
  };
  const pick = (geo) => {
    let official = null;
    let level = 'group';
    if (occ.nace) { official = monthly(geo, occ.nace); if (official) level = 'sector'; }
    if (!official) official = monthly(geo, 'B-S') || annualGroup(geo);
    if (!official) return null;
    const g = wageGrowth(db, geo, level === 'sector' ? occ.nace : 'B-S');
    return {
      level, approx: official.approx,
      official: { monthly: official.monthly, period: official.period },
      estimate: g ? { monthly: Math.round(official.monthly * g.factor), period: `${g.from} – ${g.to}`, growthPct: Math.round((g.factor - 1) * 1000) / 10 } : null,
      // стойността за показване: актуализираната оценка, ако има индекс; иначе официалната
      monthly: g ? Math.round(official.monthly * g.factor) : official.monthly,
      period: g ? `${g.from} – ${g.to}` : official.period,
      isEstimate: Boolean(g),
    };
  };
  const bg = pick('BG');
  const eu = pick('EU27_2020');
  if (!bg && !eu) return null;
  const sector = bg?.level === 'sector' ? NACE_LABELS[occ.nace] || occ.nace : null;
  const who = sector ? `„${ISCO_MAJOR_LABELS[isco]}“ в сектор „${sector}“` : `цялата група „${ISCO_MAJOR_LABELS[isco]}“`;
  return {
    group: ISCO_MAJOR_LABELS[isco], sector, bg, eu,
    source: `Eurostat SES 2022 (${bg?.approx ? 'earn_ses22_28' : 'earn_ses22_48'})${bg?.isEstimate ? ' × индекс на заплатите (lc_lci_r2_q, D11)' : ''}`,
    note: bg?.isEstimate
      ? `Оценка: официалната средна брутна заплата на ${who} от 2022 г. (${bg.official.monthly} €), увеличена с ръста на заплатите в сектора (+${String(bg.estimate.growthPct).replace('.', ',')}%) до ${bg.estimate.period}. Не е заплата за точната професия и не е прогноза.`
      : `Официална средна брутна месечна заплата на ${who} от проучването за 2022 г. (по-нов индекс на заплатите още не е импортиран). Не е прогноза.`,
  };
}

function demandEvidence(m) {
  const d = m?.details?.demand;
  if (!d || d.share === null || d.share === undefined) {
    return { kind: 'fact', insufficient: true, text: `Недостатъчно обяви за изчисляване на търсенето (нужни са поне ${d?.minRequired ?? 100} за 30 дни).`, source: 'Arbeitnow, Remotive', period: m?.details?.window?.current || '—' };
  }
  return { kind: 'fact', text: `Споменава се в ${pct(d.share)} от обявите за работа (${d.postings} от ${d.total}).`, source: 'Arbeitnow, Remotive (обяви основно от ЕС/дистанционни)', period: m.details.window.current, value: d.share };
}

function changeEvidence(m) {
  const out = [];
  for (const [key, label] of [['change90', '90'], ['change30', '30']]) {
    const c = m?.details?.[key];
    if (c && c.value !== null && c.value !== undefined) {
      out.push({ kind: 'fact', text: `Промяна на дела в обявите за ${label} дни: ${c.value >= 0 ? '+' : ''}${(c.value * 100).toFixed(2).replace('.', ',')} п.п.`, source: 'Arbeitnow, Remotive', period: `${c.prevPeriod} → ${m.details.window.current}` });
      break;
    }
  }
  if (!out.length) out.push({ kind: 'fact', insufficient: true, text: 'Промяната за 30/90 дни още не може да се изчисли – нужна е по-дълга история на наблюденията.', source: 'Arbeitnow, Remotive', period: '—' });
  return out;
}

/** Конкретна първа стъпка + следваща стъпка: безплатен курс, малък проект или учебна група. */
export function planFor(skill, horizon) {
  const free = skill.resources.find((r) => r.free);
  const course = free ? { type: 'course', label: STEP_LABELS.course, text: `„${free.title}“ (${free.provider})`, url: free.url } : null;
  const project = { type: 'project', label: STEP_LABELS.project, text: PROJECTS[skill.id] || 'Направи малък проект, в който използваш умението, и го покажи на някого.' };
  const group = { type: 'group', label: STEP_LABELS.group, text: GROUPS[skill.category] || GROUPS.human };
  if (horizon === 'short') return { firstStep: course || project, nextStep: course ? project : group };
  if (horizon === 'mid') return { firstStep: project, nextStep: course || group };
  return { firstStep: group, nextStep: project };
}

/** Един кратък факт за картата: търсене в обявите, иначе прогноза на WEF, иначе ESCO. */
function briefFact(evidence, horizon) {
  const usable = evidence.filter((e) => !e.insufficient && e.kind !== 'model');
  const demand = usable.find((e) => e.kind === 'fact' && /обявите/.test(e.text) && !/Промяна/.test(e.text));
  const forecast = usable.find((e) => e.kind === 'forecast');
  const order = horizon === 'short' ? [demand, forecast] : [forecast, demand];
  return order.find(Boolean) || usable[0] || { kind: 'fact', insufficient: true, text: 'Още няма достатъчно данни за това умение.', source: '—', period: '—' };
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Record<string, any>} answers
 */
export function recommend(db, answers) {
  const profile = buildProfile(answers);
  const metrics = latestSkillMetrics(db);
  const lastImport = getMeta(db, 'last_successful_import_at');
  const outlookWeight = profile.settings.value === 'stability' ? 0.4 : 0.2;

  // 1) Професии
  const occs = OCCUPATIONS.map((o) => {
    const sim = cosine(profile.vector, o.interests);
    const outlook = occupationOutlook(db, o);
    const score = (1 - outlookWeight) * sim + outlookWeight * ((outlook.index ?? 50) / 100);
    return { o, sim, outlook, score };
  }).sort((a, b) => b.score - a.score).slice(0, 3);

  const topInterests = Object.entries(profile.vector).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0).slice(0, 3)
    .map(([k]) => INTERESTS[k]);

  // 2) Кандидат-умения
  const rel = new Map();
  for (const { o, score } of occs) {
    for (const s of o.coreSkills) rel.set(s, { w: (rel.get(s)?.w || 0) + score, core: true, occ: [...(rel.get(s)?.occ || []), o.title] });
    for (const s of o.complementarySkills) {
      const cur = rel.get(s);
      rel.set(s, { w: (cur?.w || 0) + 0.5 * score, core: cur?.core || false, occ: [...(cur?.occ || []), o.title] });
    }
  }
  const known = new Set();
  if (profile.settings.english === 'good') known.add('english');

  const cand = [...rel.entries()].filter(([id]) => !known.has(id) && SKILL_BY_ID.has(id)).map(([id, r]) => {
    const m = metrics.get(id);
    const c = m?.details?.components || {};
    const skill = SKILL_BY_ID.get(id);
    return {
      id, skill, m, rel: r,
      short: (0.5 * (c.demand ?? 50) + 0.3 * (c.learning ?? 50) + 0.2 * (r.core ? 100 : 50)) * r.w,
      mid: (0.5 * (c.momentum ?? 50) + 0.5 * (TECH_WEF.includes(skill.wef) ? 100 : 50)) * r.w,
      long: ((m?.long_term ?? 50) + (['human', 'green'].includes(skill.category) ? 15 : 0)) * r.w,
    };
  });

  const used = new Set();
  const pick = (key, n) => {
    const out = cand.filter((c) => !used.has(c.id)).sort((a, b) => b[key] - a[key]).slice(0, n);
    out.forEach((c) => used.add(c.id));
    return out;
  };
  const horizons = [
    { key: 'short', label: 'Сега', subtitle: 'следващите 6–12 месеца', items: pick('short', 2) },
    { key: 'mid', label: 'След 2–5 години', subtitle: 'растящи умения', items: pick('mid', 2) },
    { key: 'long', label: 'След 5–10 години', subtitle: 'устойчиви умения', items: pick('long', 2) },
  ];

  const toItem = (c, horizon) => {
    const plan = planFor(c.skill, horizon);
    const m = c.m;
    const lt = m?.details?.longTerm;
    const wef = c.skill.wef ? WEF_2025.growingSkills.find((g) => g.key === c.skill.wef) : null;
    const evidence = [demandEvidence(m), ...changeEvidence(m)];
    if (wef) evidence.push({ kind: 'forecast', text: `WEF: „${wef.label}“ е №${wef.rank} сред най-бързо растящите умения до 2030 г.`, source: WEF_2025.title, period: WEF_2025.period });
    if (lt?.index !== null && lt?.index !== undefined) evidence.push({ kind: 'model', text: `Индекс на дългосрочната перспектива: ${lt.index}/100 (по прогнози на Cedefop, WEF и тенденции от Eurostat за свързаните професии).`, source: 'Модел на Future Jobs', period: `${CEDEFOP_BG_2025.period}` });
    if (m?.score !== null && m?.score !== undefined) evidence.push({ kind: 'model', text: `Future Skills Score: ${m.score}/100 (относителна оценка спрямо останалите ${SKILLS.length} проследявани умения).`, source: 'Модел на Future Jobs', period: m.date });
    const esco = m?.details?.breadth;
    if (esco?.escoOccupations) evidence.push({ kind: 'fact', text: `В ESCO умението „${esco.escoLabel}“ е свързано с ${esco.escoOccupations} професии.`, source: 'ESCO', period: 'текуща версия' });

    const why = [];
    why.push(`Ключово за: ${[...new Set(c.rel.occ)].join(', ')}.`);
    if (horizon === 'short') why.push(c.rel.core ? 'Основно умение за препоръчаните професии – добре е да се започне първо.' : 'Допълва основните умения и може да се започне веднага.');
    if (horizon === 'mid' && TECH_WEF.includes(c.skill.wef)) why.push('Принадлежи към технологичните умения с най-бърз ръст според WEF.');
    if (horizon === 'long') why.push(['human', 'green'].includes(c.skill.category)
      ? 'Човешките и „зелените“ умения трудно се автоматизират и са сред растящите в дългосрочните прогнози.'
      : 'Свързаните професии имат добра дългосрочна перспектива.');

    const next = (m?.details?.cooccurrence || []).map((x) => SKILL_BY_ID.get(x.skill)?.name).filter(Boolean).slice(0, 3);
    const limitations = [];
    if (m?.details?.demand?.share === null || m?.details?.demand?.share === undefined) limitations.push('Липсват достатъчно данни от обяви.');
    limitations.push('Обявите са основно от Германия/ЕС и дистанционни позиции – не са представителни за българския пазар.');
    limitations.push('Прогнозите на Cedefop/WEF са на ниво професионални групи, не за отделни умения.');
    return {
      skillId: c.id, name: c.skill.name, category: c.skill.category, description: c.skill.description,
      why, occupations: [...new Set(c.rel.occ)], evidence,
      score: m?.score ?? null, confidence: m?.confidence ?? 'insufficient',
      nextSkills: next, resources: c.skill.resources, limitations,
      fact: briefFact(evidence, horizon),
      firstStep: plan.firstStep, nextStep: plan.nextStep,
      steps: [plan.firstStep, plan.nextStep].map((st) => `${st.label}: ${st.text}`),
    };
  };

  return {
    generatedAt: new Date().toISOString(),
    dataAsOf: lastImport,
    profile: { topInterests, settings: profile.settings },
    occupations: occs.map(({ o, sim, outlook }) => ({
      id: o.id, title: o.title, description: o.description, match: Math.round(sim * 100),
      outlook: { index: outlook.index, signals: outlook.signals },
      salary: salaryFor(db, o),
      skills: { core: o.coreSkills.map((s) => SKILL_BY_ID.get(s)?.name), complementary: o.complementarySkills.map((s) => SKILL_BY_ID.get(s)?.name) },
    })),
    horizons: horizons.map((h) => {
      const items = h.items.map((c) => toItem(c, h.key));
      // Две умения в един хоризонт не трябва да имат еднаква първа стъпка (напр. същата учебна група)
      if (items.length === 2 && items[0].firstStep.text === items[1].firstStep.text) {
        const b = items[1];
        [b.firstStep, b.nextStep] = [b.nextStep, b.firstStep];
        b.steps = [b.firstStep, b.nextStep].map((st) => `${st.label}: ${st.text}`);
      }
      return { key: h.key, label: h.label, subtitle: h.subtitle, items };
    }),
    knownSkills: [...known].map((id) => SKILL_BY_ID.get(id)?.name),
    disclaimers: [
      'Future Skills Score и индексът на перспективата са собствен модел на Future Jobs – не са научно доказана прогноза.',
      'Фактическите данни (Eurostat, ESCO, обяви) и публикуваните прогнози (Cedefop, WEF) са означени отделно от изчисленията на модела.',
      'Съответствието с професиите се базира на отговорите в анкетата и е ориентир, а не професионално кариерно консултиране.',
    ],
  };
}
