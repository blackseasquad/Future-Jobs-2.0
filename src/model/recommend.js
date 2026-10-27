// Персонализирани кариерни препоръки в три хоризонта.
// Всеки елемент разграничава: fact (реални данни), forecast (публикувана прогноза),
// model (изчисление на Future Jobs) и ai (AI генериран текст, ако е включен).
import { SKILLS, SKILL_BY_ID } from '../catalog/skills.js';
import { OCCUPATIONS, ISCO_MAJOR_LABELS } from '../catalog/occupations.js';
import { INTERESTS, buildProfile } from '../catalog/quiz.js';
import { latestSkillMetrics, occupationOutlook } from './scoring.js';
import { WEF_2025, CEDEFOP_BG_2025 } from '../catalog/published.js';
import { getMeta } from '../db.js';

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

export function salaryFor(db, isco) {
  const get = (geo) => db.prepare(`SELECT value, period FROM stat_observations WHERE source_id = 'eurostat' AND dataset = 'earn_ses22_28'
    AND series_key = ? AND geo = ? AND value IS NOT NULL ORDER BY period DESC LIMIT 1`).get(`isco08=OC${isco}`, geo);
  const bg = get('BG');
  const eu = get('EU27_2020');
  if (!bg && !eu) return null;
  return {
    group: ISCO_MAJOR_LABELS[isco],
    bg: bg ? { annual: Number(bg.value), monthlyApprox: Math.round(Number(bg.value) / 12), period: String(bg.period) } : null,
    eu: eu ? { annual: Number(eu.value), monthlyApprox: Math.round(Number(eu.value) / 12), period: String(eu.period) } : null,
    source: 'Eurostat, Structure of Earnings Survey (earn_ses22_28)',
    note: 'Средна брутна годишна заплата за цялата професионална група (не за конкретната професия). Официална прогноза за заплатите няма – това е последната публикувана стойност.',
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

function stepsFor(skill, horizon, settings) {
  const res = skill.resources.slice(0, 2);
  const steps = [];
  if (horizon === 'short') {
    if (res[0]) steps.push(`Започни „${res[0].title}“ (${res[0].provider}${res[0].free ? ', безплатно' : ''}) – 3–4 часа седмично.`);
    if (['tech', 'data'].includes(skill.category)) steps.push('Направи малък собствен проект и го публикувай в GitHub като начало на портфолио.');
    else if (skill.category === 'language') steps.push('Цели сертификат (напр. ниво B2) до края на следващата учебна година.');
    else if (skill.category === 'human') steps.push('Практикувай в училищен проект, ученически съвет, клуб или доброволчество – и си води бележки какво научаваш.');
    else steps.push('Намери кратък практически курс или доброволческа инициатива в тази област.');
  } else if (horizon === 'mid') {
    steps.push(settings.study === 'university'
      ? 'Избери специалност/избираеми дисциплини, които включват това умение, и търси летни стажове от 2. курс.'
      : 'Запиши се в професионален курс или академия и търси стаж/първа работа, където умението се използва ежедневно.');
    if (res[1] || res[0]) steps.push(`Задълбочи с „${(res[1] || res[0]).title}“ и вземи сертификат, ако е наличен.`);
    steps.push('Участвай в състезания, хакатони или проекти с реални потребители.');
  } else {
    steps.push('Изгради навик за учене: преглеждай по веднъж на тримесечие кои умения растат (раздел „Умения“ в Future Jobs).');
    steps.push('Комбинирай умението с поне една техническа и една човешка компетентност – това прави профила устойчив на автоматизация.');
    if (res[0]) steps.push(`Ресурс за начало: „${res[0].title}“.`);
  }
  return steps;
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
    { key: 'short', label: '6–12 месеца', subtitle: 'Започни сега: умения с текущо търсене и лесен старт', items: pick('short', 3) },
    { key: 'mid', label: '2–5 години', subtitle: 'Растящи умения, които ще те отличат при първата работа', items: pick('mid', 3) },
    { key: 'long', label: '5–10 години', subtitle: 'Устойчиви умения според дългосрочните прогнози', items: pick('long', 3) },
  ];

  const toItem = (c, horizon) => {
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
      nextSkills: next, steps: stepsFor(c.skill, horizon, profile.settings), resources: c.skill.resources, limitations,
    };
  };

  return {
    generatedAt: new Date().toISOString(),
    dataAsOf: lastImport,
    profile: { topInterests, settings: profile.settings },
    occupations: occs.map(({ o, sim, outlook }) => ({
      id: o.id, title: o.title, description: o.description, match: Math.round(sim * 100),
      outlook: { index: outlook.index, signals: outlook.signals },
      salary: salaryFor(db, o.isco),
      skills: { core: o.coreSkills.map((s) => SKILL_BY_ID.get(s)?.name), complementary: o.complementarySkills.map((s) => SKILL_BY_ID.get(s)?.name) },
    })),
    horizons: horizons.map((h) => ({ key: h.key, label: h.label, subtitle: h.subtitle, items: h.items.map((c) => toItem(c, h.key)) })),
    knownSkills: [...known].map((id) => SKILL_BY_ID.get(id)?.name),
    disclaimers: [
      'Future Skills Score и индексът на перспективата са собствен модел на Future Jobs – не са научно доказана прогноза.',
      'Фактическите данни (Eurostat, ESCO, обяви) и публикуваните прогнози (Cedefop, WEF) са означени отделно от изчисленията на модела.',
      'Съответствието с професиите се базира на отговорите в анкетата и е ориентир, а не професионално кариерно консултиране.',
    ],
  };
}
