// Future Jobs – frontend (без библиотеки). Данните идват само от /api/*.
// Важно: frontend-ът НЕ обновява данните периодично – ежедневният импорт е задача на сървъра.

import { personalPlan, pingGemini } from './gemini.js';
import { mountAssistant } from './assistant.js';

const $main = document.getElementById('main');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('bg-BG', { timeZone: 'Europe/Sofia', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtPct = (x, d = 1) => (x === null || x === undefined ? null : `${(x * 100).toFixed(d).replace('.', ',')}%`);
const fmtNum = (x) => (x === null || x === undefined ? '—' : Number(x).toLocaleString('bg-BG'));
const KIND = { fact: ['Факт', 'b-fact'], forecast: ['Прогноза', 'b-forecast'], model: ['Модел', 'b-model'], ai: ['AI текст', 'b-ai'] };
const kindBadge = (k) => `<span class="badge ${KIND[k][1]}">${KIND[k][0]}</span>`;
const NA = (t = 'няма достатъчно данни') => `<span class="na">${esc(t)}</span>`;
const CONF = { high: ['висока увереност', 'b-ok'], medium: ['средна увереност', 'b-warn'], low: ['ниска увереност', 'b-err'], insufficient: ['недостатъчно данни', 'b-off'] };
const confBadge = (c) => `<span class="badge ${(CONF[c] || CONF.insufficient)[1]}">${(CONF[c] || CONF.insufficient)[0]}</span>`;

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Грешка ${res.status}`);
  return body;
}

const cache = {};
async function cached(key, fn) { if (!cache[key]) cache[key] = fn().catch((e) => { delete cache[key]; throw e; }); return cache[key]; }

// ------------------------------------------------------------------ графики (SVG)
function lineChart(seriesList, { height = 220, unit = '', names = [] } = {}) {
  const all = seriesList.flat();
  if (all.length < 2) return NA('няма достатъчно наблюдения за графика');
  const labels = [...new Set(seriesList.flatMap((s) => s.map((p) => p.period)))].sort();
  const W = 640, H = height, L = 48, R = 12, T = 12, B = 30;
  const vals = all.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1; min -= pad; max += pad;
  const x = (lbl) => L + (labels.indexOf(lbl) / Math.max(labels.length - 1, 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const ticks = [0, 0.5, 1].map((t) => min + t * (max - min));
  const every = Math.ceil(labels.length / 6);
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(names.join(', '))}">`;
  for (const t of ticks) svg += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t.toLocaleString('bg-BG', { maximumFractionDigits: 1 })}${unit}</text>`;
  labels.forEach((l, i) => { if (i % every === 0 || i === labels.length - 1) svg += `<text x="${x(l)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
  seriesList.forEach((s, i) => {
    if (!s.length) return;
    const d = s.map((p, j) => `${j ? 'L' : 'M'}${x(p.period).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    svg += `<path d="${d}" fill="none" class="s${i}" stroke-width="2.5" stroke-linejoin="round"/>`;
    const last = s[s.length - 1];
    svg += `<circle cx="${x(last.period)}" cy="${y(last.value)}" r="4" class="dot${i}"><title>${esc(names[i] || '')} ${esc(last.period)}: ${last.value}${unit}</title></circle>`;
  });
  svg += '</svg>';
  const legend = names.length > 1 ? `<div class="legend">${names.map((n, i) => `<span><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" class="s${i}" stroke-width="3"/></svg> ${esc(n)}</span>`).join('')}</div>` : '';
  return svg + legend;
}


// ------------------------------------------------------------------ статус на данните (футър)
function relDay(iso) {
  if (!iso) return '';
  const d = (x) => new Date(x).toLocaleDateString('bg-BG', { timeZone: 'Europe/Sofia' });
  const t = new Date(iso).toLocaleTimeString('bg-BG', { timeZone: 'Europe/Sofia', hour: '2-digit', minute: '2-digit' });
  const now = Date.now();
  if (d(iso) === d(now)) return `днес в ${t}`;
  if (d(iso) === d(now - 86400000)) return `вчера в ${t}`;
  if (d(iso) === d(now + 86400000)) return `утре в ${t}`;
  return fmtDate(iso);
}

async function loadFreshness(force = false) {
  if (force) delete cache.status;
  const el = document.getElementById('freshness');
  const set = (cls, text, title = '') => { el.className = `fresh ${cls}`; el.title = title; el.innerHTML = `<span class="dot"></span><span>${esc(text)}</span>`; };
  try {
    const s = await cached('status', () => api('/api/status'));
    const next = `Следващо обновяване: ${relDay(s.nextScheduledRun)}`;
    if (!s.lastSuccessfulImport) set('unknown', 'Още няма импорт на данни', next);
    else if (s.stale) set('stale', `Данните са остарели · ${fmtDate(s.lastSuccessfulImport)}`, next);
    else set('', `Обновено ${fmtDate(s.lastSuccessfulImport)}`, next);
    return s;
  } catch { set('unknown', 'Няма връзка със сървъра'); return null; }
}

// ------------------------------------------------------------------ общи елементи
const pageHead = ({ eyebrow = '', title, lead = '', back = '', side = '' }) => `
  ${back}
  <div class="head-row"><div class="page-head">
    ${eyebrow ? `<span class="eb">${eyebrow}</span>` : ''}
    <h1>${title}</h1>
    ${lead ? `<p class="lead">${lead}</p>` : ''}
  </div>${side}</div>`;
const backLink = (href, text) => `<a class="back" href="${href}">← ${text}</a>`;
const acc = (title, body, { open = false, hint = '', id = '' } = {}) =>
  `<details class="acc"${open ? ' open' : ''}${id ? ` id="${id}"` : ''}><summary>${title}${hint ? `<span class="hint">${hint}</span>` : ''}</summary><div class="acc-body">${body}</div></details>`;
const kpi = (label, value, sub = '') => `<div class="kpi"><span class="l">${label}</span><span class="v">${value}</span>${sub ? `<span class="s">${sub}</span>` : ''}</div>`;
const outlookWord = (i) => (i === null || i === undefined ? '—' : i >= 67 ? 'Висока' : i >= 40 ? 'Добра' : 'Умерена');
/** „3 от 4 сигнала са положителни“ – вместо грубия индекс 0–100, който често съвпада при различни професии. */
const outlookPhrase = (o) => {
  const sig = o?.signals || [];
  if (!sig.length) return 'няма достатъчно сигнали';
  return `${sig.filter((x) => x.value > 0).length} от ${sig.length} сигнала са положителни`;
};
const SKILL_CAT = { tech: 'Технологии', data: 'Данни и анализ', business: 'Бизнес', care: 'Грижа и помощ', creative: 'Творчество', green: 'Зелени умения', hands_on: 'Практически умения', human: 'Човешки умения', language: 'Езици' };

// Клиентско търсене в каталозите (без презареждане на данни)
const queries = { occ: '', skills: '' };
function applySearch(kind) {
  const list = document.getElementById(`list-${kind}`);
  if (!list) return;
  const q = queries[kind].trim().toLowerCase();
  let n = 0;
  list.querySelectorAll('[data-name]').forEach((el) => {
    const show = !q || /** @type {HTMLElement} */ (el).dataset.name.includes(q);
    /** @type {HTMLElement} */ (el).hidden = !show;
    if (show) n++;
  });
  const c = document.getElementById(`count-${kind}`);
  if (c) c.textContent = `${n} ${kind === 'occ' ? (n === 1 ? 'професия' : 'професии') : (n === 1 ? 'умение' : 'умения')}`;
  const empty = document.getElementById(`empty-${kind}`);
  if (empty) empty.hidden = n > 0;
}

// ------------------------------------------------------------------ начало
// Примерни профили за началната страница. Резултатите се изчисляват от същия модел
// и със същите данни като анкетата (не са измислени).
const EXAMPLE_PROFILES = [
  { label: 'обичаш компютри и математика', answers: { afternoon: 'code', subjects: ['math', 'it'], workwith: 'data', tech_attitude: 'build', environment: 'office', values: 'income', study: 'university', english: 'mid' } },
  { label: 'искаш да помагаш на хората', answers: { afternoon: 'help', subjects: ['bio', 'social'], workwith: 'people', tech_attitude: 'less', environment: 'clinic', values: 'impact', study: 'university', english: 'good' } },
  { label: 'обичаш природата и техниката', answers: { afternoon: 'outdoor', subjects: ['geo', 'physics'], workwith: 'things', tech_attitude: 'use', environment: 'field', values: 'stability', study: 'course', english: 'basic' } },
];

async function exampleResults() {
  const key = 'fj-examples-v3';
  try {
    const c = JSON.parse(localStorage.getItem(key) || 'null');
    if (c && Date.now() - c.at < 6 * 3600 * 1000) return c.items;
  } catch { /* localStorage недостъпен */ }
  const items = await Promise.all(EXAMPLE_PROFILES.map((p) => api('/api/recommendations', { method: 'POST', body: JSON.stringify({ answers: p.answers, ai: false }) })
    .then((r) => ({ label: p.label, occupation: { title: r.occupations[0].title }, skills: r.horizons[0].items.map((i) => i.name) }))
    .catch(() => null)));
  try { if (items.every(Boolean)) localStorage.setItem(key, JSON.stringify({ at: Date.now(), items })); } catch { /* */ }
  return items;
}

async function pageHome() {
  const examples = (await exampleResults()).filter(Boolean);
  const starts = [
    ['✳', 'Опознай себе си', 'Отговори на няколко въпроса за интересите и целите си.', '#/quiz'],
    ['↗', 'Открий професии', 'Разгледай различни възможности и какво стои зад тях.', '#/occupations'],
    ['✧', 'Развий умения', 'Виж кои умения можеш да започнеш да развиваш още днес.', '#/skills'],
  ];
  return `
  <section class="hero"><div class="wrap">
    <div class="hero-copy">
      <span class="eb">Твоето бъдеще започва тук</span>
      <h1>Открий своята <span>посока!</span></h1>
      <p class="lead">Какво да учиш днес, за да имаш работа утре? Future Jobs проверява всеки ден пазара на труда и ти казва кои умения да развиваш още сега.</p>
      <div class="hero-cta"><a class="btn btn-lg" href="#/quiz">Открий своя път <span aria-hidden="true">↗</span></a><a class="link" href="#/occupations">Разгледай професиите →</a></div>
      <div class="hero-points"><span>✦ За ученици и млади хора</span><span>✦ Данни и прогнози</span><span>✦ Обновява се всеки ден</span></div>
    </div>
    <div class="hero-art">
      <div class="ring r1"></div><div class="ring r2"></div>
      <img src="/wave.png" alt="Логото на Future Jobs – вълна" width="340" height="297">
      <a class="float f1" href="#/occupations"><span class="k">РАЗГЛЕДАЙ</span><span class="t">Професии с перспектива</span></a>
      <a class="float f2" href="#/quiz"><span class="k">ЗАПОЧНИ ОТ СЕБЕ СИ</span><span class="t">Твоите интереси → твоят път</span></a>
    </div>
  </div></section>
  <section class="sec top"><div class="wrap stack">
    <div class="page-head"><span class="eb">Откъде да започна?</span><h2 style="font-size:clamp(30px,4vw,44px);letter-spacing:-0.03em">Бъдещето има много посоки.</h2><p class="lead">Избери тази, която е интересна за теб.</p></div>
    <div class="grid g3">${starts.map(([i, t, d, u]) => `<a class="card start-card" href="${u}"><span class="ico" aria-hidden="true">${i}</span><span class="row"><span class="card-title">${t}</span><span class="arr" aria-hidden="true">↗</span></span><span class="card-desc">${d}</span></a>`).join('')}</div>
  </div></section>
  ${examples.length ? `
  <section class="sec" style="padding-top:8px"><div class="wrap stack" style="gap:12px">
    <div class="head-row"><span class="eb">Примерни резултати</span><a class="small" href="#/quiz" style="font-weight:700;text-decoration:none">Виж своя план →</a></div>
    <div class="grid g3">${examples.map((e) => `<a class="card" href="#/quiz">
      <span class="kick">Ако ${esc(e.label)}</span>
      <span class="card-title" style="font-size:17px">${esc(e.occupation.title)}</span>
      <span class="chips">${e.skills.map((n) => `<span class="chip sm">${esc(n)}</span>`).join('')}</span>
    </a>`).join('')}</div>
  </div></section>` : ''}
  <section class="sec" style="padding-top:8px"><div class="wrap">
    <div class="cta-band">
      <div><span class="eb light">Малка стъпка. Голяма посока.</span><h2>Готов ли си да откриеш своя път?</h2><p>Започни с интересите си и разгледай възможностите пред теб.</p></div>
      <a class="btn btn-lg" href="#/quiz">Започни анкетата <span aria-hidden="true">↗</span></a>
    </div>
  </div></section>`;
}

// ------------------------------------------------------------------ професии
const INTEREST_FILTERS = ['Технологии', 'Данни и анализ', 'Творчество и дизайн', 'Работа с хора', 'Грижа и помощ', 'Природа и устойчивост', 'Бизнес и организация', 'Практическа/техническа работа'];
const FILTER_SHORT = { 'Творчество и дизайн': 'Творчество', 'Природа и устойчивост': 'Природа', 'Бизнес и организация': 'Бизнес', 'Практическа/техническа работа': 'Практическа работа' };
let occFilter = null;

async function pageOccupations() {
  const { occupations } = await cached('occ', () => api('/api/occupations'));
  const list = occFilter ? occupations.filter((o) => o.interests.includes(occFilter)) : occupations;
  return `
  <section class="sec top"><div class="wrap stack">
    ${pageHead({ eyebrow: 'Разгледай възможностите', title: 'Професии за твоето бъдеще.', lead: 'Разгледай каталога и открий какво ти е интересно.' })}
    <input class="search" type="search" data-search="occ" value="${esc(queries.occ)}" placeholder="⌕  Потърси професия" aria-label="Потърси професия">
    ${acc('Филтри по интереси', `<div class="chips" role="group" aria-label="Филтър по интереси">
      <button class="chip" data-filter="" aria-pressed="${!occFilter}">Всички</button>
      ${INTEREST_FILTERS.map((f) => `<button class="chip" data-filter="${esc(f)}" aria-pressed="${occFilter === f}">${esc(FILTER_SHORT[f] || f)}</button>`).join('')}
    </div>`, { open: !!occFilter, hint: occFilter ? esc(FILTER_SHORT[occFilter] || occFilter) : '' })}
    <span class="count" id="count-occ">${list.length} професии</span>
    <div class="grid g4" id="list-occ">${list.map(occCard).join('')}</div>
    <p class="na" id="empty-occ" ${list.length ? 'hidden' : ''}>Няма професии, които отговарят на търсенето.</p>
  </div></section>`;
}

function occCard(o) {
  return `<a class="card" href="#/occupation/${o.id}" data-name="${esc(o.title.toLowerCase())}">
    <span class="kick">Професия · <span>${esc(o.interests[0] || o.iscoLabel)}</span></span>
    <span class="card-title">${esc(o.title)}</span>
    <span class="card-desc">${esc(o.description)}</span>
    <span class="more">Разгледай професията ↗</span>
  </a>`;
}

function signalsList(signals) {
  return `<ul class="ev">${signals.map((s) => `<li>${kindBadge(s.type)}<span>${s.value > 0 ? '▲' : s.value < 0 ? '▼' : '•'} ${esc(s.text)}<span class="src">${esc(s.source)} · ${esc(s.period)}</span></span></li>`).join('')}</ul>`;
}

async function pageOccupation(id) {
  const o = await api(`/api/occupations/${encodeURIComponent(id)}`);
  const emp = o.employment;
  const ess = o.escoSkills.filter((s) => s.relation === 'essential');
  const sal = o.salary;
  const lastEmp = emp.BG?.series?.length ? emp.BG.series[emp.BG.series.length - 1] : null;
  const kpis = `<div class="kpis">
    ${kpi('Заплата в България', sal?.bg ? `≈ ${fmtNum(sal.bg.monthly)} €` : '—', sal?.bg ? `бруто/месец · ${sal.bg.isEstimate ? `оценка ${esc(sal.bg.period.split(' – ').pop())}` : `Eurostat ${esc(sal.bg.period)}`}` : 'няма данни')}
    ${kpi('Перспектива до 2035', outlookWord(o.outlook.index), outlookPhrase(o.outlook))}
    ${kpi(`Заети в групата в България`, lastEmp ? `${fmtNum(Math.round(lastEmp.value))} хил.` : '—', lastEmp ? `„${esc(o.iscoLabel)}“ · ${esc(lastEmp.period)}` : 'няма данни')}
  </div>`;
  return `
  <section class="sec top"><div class="wrap stack">
    ${pageHead({ back: backLink('#/occupations', 'Всички професии'), eyebrow: 'Професия', title: esc(o.title), lead: esc(o.description) })}
    ${kpis}
    <div class="acc-list">
      ${acc('Основни умения', `<div class="chips">${o.coreSkills.map((s) => `<a class="chip" href="#/skill/${s.id}">${esc(s.name)}</a>`).join('')}</div>`, { open: true })}
      ${acc('Допълващи умения', `<div class="chips">${o.complementarySkills.map((s) => `<a class="chip alt" href="#/skill/${s.id}">${esc(s.name)}</a>`).join('')}</div>`)}
      ${acc('Перспектива', `<p class="small muted">${esc(outlookPhrase(o.outlook))}. ${kindBadge('model')} Обобщение на Future Jobs, не прогноза за брой работни места.</p>${signalsList(o.outlook.signals)}`)}
      ${acc('Заплащане', sal?.bg ? `
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="big-num">≈ ${fmtNum(sal.bg.monthly)} €</span><span class="muted">бруто на месец</span>${sal.bg.isEstimate ? kindBadge('model') : kindBadge('fact')}</div>
        <dl class="kv">
          <dt>Официално</dt><dd>${fmtNum(sal.bg.official.monthly)} €/мес. (Eurostat SES ${esc(sal.bg.official.period)}) ${kindBadge('fact')}</dd>
          ${sal.bg.isEstimate ? `<dt>Актуализация</dt><dd>ръст на заплатите в сектора до ${esc(sal.bg.period.split(' – ').pop())} (+${String(sal.bg.estimate.growthPct).replace('.', ',')}%)</dd>` : ''}
          ${sal.sector ? `<dt>Сектор</dt><dd>${esc(sal.sector)}</dd>` : ''}<dt>Група</dt><dd>${esc(sal.group)}</dd>
          ${sal.eu ? `<dt>ЕС-27</dt><dd>≈ ${fmtNum(sal.eu.monthly)} €/мес.</dd>` : ''}
        </dl>
        <p class="small muted">${esc(sal.note)}</p>` : NA('Данните за заплатите още не са импортирани.'))}
      ${acc('Заетост в професионалната група', `${emp.BG ? lineChart([emp.BG.series], { names: ['България'] }) : NA()}
        <span class="small muted">${kindBadge('fact')} ${emp.BG ? `${esc(emp.BG.from)}–${esc(emp.BG.to)} · ` : ''}хил. заети в групата „${esc(o.iscoLabel)}“ · ${esc(emp.source)}${emp.BG?.breaks ? ' · има прекъсване на редицата (методологична промяна)' : ''}</span>`)}
      ${acc('Данни от ESCO', o.esco ? `<p class="small">${kindBadge('fact')} Съществени умения по ESCO за <a href="${esc(o.esco.uri)}" rel="noopener" target="_blank">„${esc(o.esco.label_bg)}“</a>${o.esco.code ? `, код ${esc(o.esco.code)}` : ''}:</p>
        <div class="chips">${ess.slice(0, 20).map((s) => `<span class="chip alt sm">${esc(s.to_label)}</span>`).join('') || NA()}</div>` : NA('ESCO данните още не са импортирани.'))}
    </div>
  </div></section>`;
}

// ------------------------------------------------------------------ умения
let skillSort = 'score';
const SORTS = { score: 'Най-перспективни', demand: 'Най-търсени сега', change: 'Най-бързо растящи', name: 'По азбучен ред' };

function trend(s) {
  const v = s.change90 ?? s.change30;
  if (v === null || v === undefined) return null;
  if (v > 0.002) return ['↑ Расте', 'up'];
  if (v < -0.002) return ['↓ Намалява', 'down'];
  return ['→ Стабилно', 'flat'];
}

async function pageSkills() {
  const d = await cached('skills', () => api('/api/skills'));
  const key = { score: (s) => s.score ?? -1, demand: (s) => s.demandShare ?? -1, change: (s) => s.change90 ?? s.change30 ?? -9, long: (s) => s.longTerm ?? -1 };
  const list = [...d.skills].sort((a, b) => (skillSort === 'name' ? a.name.localeCompare(b.name, 'bg') : key[skillSort](b) - key[skillSort](a)));
  const change = (s) => {
    const v = s.change90 ?? s.change30;
    if (v === null || v === undefined) return NA('нужна е история');
    return `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${(v * 100).toFixed(2).replace('.', ',')} п.п.</span> <span class="muted small">${s.change90 !== null ? '90 д.' : '30 д.'}</span>`;
  };
  const th = (k, t) => `<th scope="col">${k ? `<button class="link" style="all:unset;cursor:pointer" data-sort="${k}">${t}${skillSort === k ? ' ↓' : ''}</button>` : t}</th>`;
  return `
  <section class="sec top"><div class="wrap stack">
    ${pageHead({ eyebrow: 'Инвестирай в себе си', title: 'Умения, които отварят врати.', lead: 'Разгледай уменията и открий с какво да започнеш.' })}
    <div class="toolbar">
      <input class="search" type="search" data-search="skills" value="${esc(queries.skills)}" placeholder="⌕  Потърси умение" aria-label="Потърси умение">
      <select class="search" data-sort-select aria-label="Подреждане">${Object.entries(SORTS).map(([k, t]) => `<option value="${k}"${skillSort === k ? ' selected' : ''}>Подреди: ${t.toLowerCase()}</option>`).join('')}</select>
    </div>
    <span class="count" id="count-skills">${list.length} умения</span>
    <div class="grid g4" id="list-skills">${list.map((s) => {
      const t = trend(s);
      return `<a class="card" href="#/skill/${s.id}" data-name="${esc(s.name.toLowerCase())}">
      <span class="kick">Умение · <span>${esc(SKILL_CAT[s.category] || '')}</span></span>
      <span class="card-title" style="font-size:18px">${esc(s.name)}</span>
      <span class="card-desc">${esc(s.description)}</span>
      <span class="more">${t ? `<span class="${t[1]}" style="margin-right:8px">${t[0]}</span>` : ''}Разгледай умението ↗</span>
    </a>`;
    }).join('')}</div>
    <p class="na" id="empty-skills" hidden>Няма умения, които отговарят на търсенето.</p>
    ${acc('Сравни всички умения в таблица', `
      <p class="small">${kindBadge('model')} <b>Future Skills Score</b> е относителна оценка 0–100: търсене ${d.weights.demand * 100}%, динамика ${d.weights.momentum * 100}%, дългосрочна перспектива ${d.weights.longTerm * 100}%, приложимост ${d.weights.breadth * 100}%, обучение ${d.weights.learning * 100}%. Не е научно доказана прогноза. <a href="/METHODOLOGY.md">Методология</a></p>
      <div class="table-wrap"><table style="min-width:820px">
        <thead><tr>${th('name', 'Умение')}${th('score', 'Score')}${th('demand', 'Търсене (30 дни)')}${th('change', 'Промяна')}${th('long', 'Дълг. перспектива')}${th('', 'ESCO професии')}${th('', 'Увереност')}</tr></thead>
        <tbody>${list.map((s) => `<tr>
          <td><a href="#/skill/${s.id}">${esc(s.name)}</a>${s.wef ? ` <span class="badge b-forecast" title="WEF Future of Jobs 2025">WEF №${s.wef.rank}</span>` : ''}</td>
          <td class="num">${s.score !== null ? `<b>${s.score}</b>` : NA('—')}</td>
          <td class="num">${s.demandShare !== null ? `${fmtPct(s.demandShare)} <span class="muted small">(${s.postings}/${s.postingsTotal})</span>` : NA()}</td>
          <td class="num">${change(s)}</td>
          <td class="num">${s.longTerm !== null ? `${s.longTerm}/100` : NA()}</td>
          <td class="num">${s.escoOccupations ?? NA('—')}</td>
          <td>${confBadge(s.confidence)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="small muted">Търсене = дял от обявите (Arbeitnow, Remotive) за последните 30 дни, в които се споменава умението. Изчислява се само при поне ${d.minPostings} обяви. Обявите са основно от ЕС и дистанционни – не са представителни за България.</p>`, { id: 'skills-table' })}
  </div></section>`;
}

async function pageSkill(id) {
  const s = await api(`/api/skills/${encodeURIComponent(id)}`);
  const d = s.details;
  const comp = d?.components || {};
  const LBL = { demand: 'Текущо търсене', momentum: 'Динамика 30/90 д.', longTerm: 'Дълг. перспектива', breadth: 'Приложимост (ESCO)', learning: 'Обучение' };
  const hist = s.history.filter((h) => h.demand_share !== null).map((h) => ({ period: h.date, value: Math.round(h.demand_share * 1000) / 10 }));
  const histScore = s.history.filter((h) => h.score !== null).map((h) => ({ period: h.date, value: h.score }));
  const t = trend(s);
  const share = s.demandShare;
  const kpis = `<div class="kpis">
    ${kpi('Търси се в', share ? `1 от ${Math.max(1, Math.round(1 / share))} обяви` : '—', share ? `${fmtPct(share)} · последните 30 дни` : `под ${d?.demand?.minRequired ?? 100} обяви – няма оценка`)}
    ${kpi('Посока', t ? `<span class="${t[1]}">${t[0]}</span>` : '—', t ? `за последните ${s.change90 !== null ? 90 : 30} дни` : 'нужна е по-дълга история')}
    ${kpi('Перспектива', outlookWord(s.score), s.score !== null ? `${s.score}/100 · Future Skills Score` : 'няма достатъчно данни')}
  </div>`;
  const st = s.firstStep;
  return `
  <section class="sec top"><div class="wrap stack">
    ${pageHead({ back: backLink('#/skills', 'Всички умения'), eyebrow: `Умение${SKILL_CAT[s.category] ? ` · ${SKILL_CAT[s.category]}` : ''}`, title: esc(s.name), lead: esc(s.description) })}
    ${kpis}
    ${st ? `<div class="callout"><span class="ico" aria-hidden="true">→</span><div style="display:flex;flex-direction:column;gap:4px"><span class="kick">Първа стъпка · ${esc(st.label || '')}</span><span class="t">${st.url ? `<a href="${esc(st.url)}" target="_blank" rel="noopener">${esc(st.text)}</a>` : esc(st.text)}</span></div></div>` : ''}
    <div class="acc-list">
      ${acc('Свързани професии', `<div class="chips">${s.occupations.map((o) => `<a class="chip ${o.core ? '' : 'alt'}" href="#/occupation/${o.id}">${esc(o.title)}</a>`).join('') || NA()}</div>`)}
      ${acc('Къде да науча това умение?', `<ul class="ev">${s.resources.map((r) => `<li><span class="badge ${r.free ? 'b-fact' : 'b-off'}">${r.free ? 'безплатно' : 'платено'}</span><span><a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.title)}</a><span class="src">${esc(r.provider)} · ${esc(r.lang)}</span></span></li>`).join('')}</ul>`)}
      ${acc('Търсене и перспектива', `
        <div class="bars">${Object.keys(LBL).map((k) => `<div class="bar"><span>${LBL[k]}</span><div class="meter"><i style="width:${comp[k] ?? 0}%"></i></div><b>${comp[k] ?? '—'}</b></div>`).join('')}</div>
        <p class="small muted">${kindBadge('model')} Персентил спрямо останалите умения. „—“ = няма достатъчно данни и компонентът не участва. ${confBadge(s.confidence)}</p>
        <dl class="kv">
          <dt>Търсене</dt><dd>${d?.demand?.share !== null && d?.demand?.share !== undefined ? `<b>${fmtPct(d.demand.share)}</b> от обявите (${d.demand.postings} от ${d.demand.total}) ${kindBadge('fact')}` : NA(`под ${d?.demand?.minRequired ?? 100} обяви`)}</dd>
          <dt>Период</dt><dd>${esc(d?.window?.current || '—')}</dd>
          <dt>Промяна 30 д.</dt><dd>${d?.change30?.value !== null && d?.change30?.value !== undefined ? `${(d.change30.value * 100).toFixed(2).replace('.', ',')} п.п.` : NA(d?.change30?.reason || 'нужна е по-дълга история')}</dd>
          <dt>Промяна 90 д.</dt><dd>${d?.change90?.value !== null && d?.change90?.value !== undefined ? `${(d.change90.value * 100).toFixed(2).replace('.', ',')} п.п.` : NA(d?.change90?.reason || 'нужна е по-дълга история')}</dd>
          <dt>WEF</dt><dd>${s.wef ? `„${esc(s.wef.label)}“ – №${s.wef.rank} растящо умение до 2030 ${kindBadge('forecast')}` : '—'}</dd>
          <dt>ESCO</dt><dd>${s.esco ? `<a href="${esc(s.esco.uri)}" rel="noopener" target="_blank">${esc(s.esco.label_bg)}</a> · ${(s.esco.essential_for_count ?? 0)} съществено / ${(s.esco.optional_for_count ?? 0)} по избор за професии` : NA()}</dd>
        </dl>`)}
      ${acc('История и още данни', `
        <div class="grid g2">
          <div class="panel"><h3>Дял в обявите, % ${kindBadge('fact')}</h3>${lineChart([hist], { unit: '%', names: ['Търсене'] })}</div>
          <div class="panel"><h3>Future Skills Score ${kindBadge('model')}</h3>${lineChart([histScore], { names: ['Score'] })}</div>
        </div>
        <span class="small muted">Графиките се попълват с всяко ежедневно обновяване.</span>
        <b class="small">Често се търси заедно с</b>
        ${d?.cooccurrence?.length ? `<div class="chips">${d.cooccurrence.map((c) => `<a class="chip sm" href="#/skill/${c.skill}" title="${c.n} общи обяви, lift ${String(c.lift).replace('.', ',')}">${esc(c.name)}</a>`).join('')}</div>` : NA()}
        <details class="mini"><summary>Синоними, по които се разпознава в обявите</summary><p>${s.synonyms.map(esc).join(', ')}</p></details>`)}
    </div>
  </div></section>`;
}

// ------------------------------------------------------------------ анкета
const quizState = { step: 0, answers: {}, result: null, error: null, total: 8 };

async function pageQuiz() {
  const { questions } = await cached('quiz', () => api('/api/quiz'));
  quizState.total = questions.length;
  if (quizState.result) return renderResult(quizState.result);
  const q = questions[quizState.step];
  const sel = quizState.answers[q.id];
  const isSel = (id) => (Array.isArray(sel) ? sel.includes(id) : sel === id);
  const ready = q.type === 'multi' ? Array.isArray(sel) && sel.length > 0 : !!sel;
  const last = quizState.step === questions.length - 1;
  const left = Math.max(1, Math.ceil(((questions.length - quizState.step) * 15) / 60));
  return `<section><div class="wrap"><div class="quiz-wrap">
    <div><div class="quiz-meta"><span>Въпрос ${quizState.step + 1} от ${questions.length}</span><span>~${left} мин. остава</span></div>
    <div class="progress"><i style="width:${((quizState.step + 1) / questions.length) * 100}%"></i></div></div>
    <h1>${esc(q.text)}</h1>
    ${q.type === 'multi' ? `<p class="small muted" style="margin-top:-10px">Избери до ${q.max || 1}.</p>` : ''}
    <div class="options" role="group" aria-label="Отговори">${q.options.map((o) => `<button class="opt${q.type === 'multi' ? ' multi' : ''}" data-opt="${o.id}" data-q="${q.id}" data-type="${q.type}" data-max="${q.max || 1}" aria-pressed="${isSel(o.id)}"><span class="tick"></span>${esc(o.text)}</button>`).join('')}</div>
    ${quizState.error ? `<p class="notice err">${esc(quizState.error)}</p>` : ''}
    <div class="quiz-nav">
      <button class="btn btn-ghost" data-act="back" ${quizState.step === 0 ? 'disabled' : ''}>← Назад</button>
      <button class="btn" data-act="${last ? 'submit' : 'next'}" ${ready ? '' : 'disabled'}>${last ? 'Виж своя план →' : 'Напред →'}</button>
    </div>
    <p class="small muted">Отговорите не се запазват – използват се само за изчисляване на препоръките.</p>
  </div></div></section>`;
}

// ------------------------------------------------------------------ резултат (акцентът е върху уменията)
const STEP_LABEL = { course: 'Безплатен курс', project: 'Малък проект', group: 'Учебна група' };

function firstStepHtml(st) {
  const body = st.url ? `<a href="${esc(st.url)}" target="_blank" rel="noopener">${esc(st.text)}</a>` : esc(st.text);
  return `<div class="step"><span class="k">Първа стъпка · ${esc(st.label || STEP_LABEL[st.type] || '')}</span><span>${body}</span></div>`;
}

// ------------------------------------------------------------------ Gemini (Firebase AI Logic)
const gemState = {}; // skillId -> {status:'loading'|'ok'|'error', plan?, error?}

function geminiBody(skillId) {
  const st = gemState[skillId];
  const head = (t) => `<div class="gem-h"><span>${t}</span><span class="badge b-ai">Gemini · AI текст</span></div>`;
  if (!st || st.status === 'loading') return `${head('✦ Gemini пише твоя план…')}<div class="sk" style="width:92%"></div><div class="sk" style="width:78%"></div><div class="sk" style="width:85%"></div>`;
  if (st.status === 'error') return `<p class="small muted">Личният план от Gemini не е наличен в момента (${esc(st.error)}). Опитай отново по-късно – първата стъпка по-горе е готова за теб.</p>`;
  return `${head('✦ Твоят личен план')}<p><b>Защо за теб:</b> ${esc(st.plan.why)}</p>
    <ol>${st.plan.steps.map((x) => `<li><b>${esc(x.when)}:</b> ${esc(x.text)}</li>`).join('')}</ol>
    <span class="small muted">Генерирано от ${esc(st.model || 'Gemini')} по отговорите ти. Може да греши – провери преди да действаш.</span>`;
}

async function loadGemini(skillId, horizonKey) {
  const r = quizState.result;
  if (!r || gemState[skillId]?.status === 'loading' || gemState[skillId]?.status === 'ok') return;
  const h = r.horizons.find((x) => x.key === horizonKey);
  const item = h?.items.find((x) => x.skillId === skillId);
  if (!item) return;
  gemState[skillId] = { status: 'loading' };
  const paint = () => { const el = document.getElementById(`gem-${skillId}`); if (el) el.innerHTML = geminiBody(skillId); };
  paint();
  try {
    const { questions } = await cached('quiz', () => api('/api/quiz'));
    const answers = questions.flatMap((q) => {
      const a = quizState.answers[q.id];
      const ids = Array.isArray(a) ? a : a ? [a] : [];
      const txt = ids.map((id) => q.options.find((o) => o.id === id)?.text).filter(Boolean);
      return txt.length ? [{ question: q.text, answer: txt.join(', ') }] : [];
    });
    const plan = await personalPlan({
      answers, interests: r.profile.topInterests, skill: item.name, description: item.description || '',
      horizon: `${h.label} (${h.subtitle})`, firstStep: item.firstStep.text, fact: `${item.fact.text} (${item.fact.source}, ${item.fact.period})`,
      occupation: r.occupations[0]?.title || '',
    });
    gemState[skillId] = { status: 'ok', plan, model: 'Gemini' };
  } catch (err) {
    console.warn('Gemini:', err);
    gemState[skillId] = { status: 'error', error: /app-check|appCheck|recaptcha/i.test(String(err?.message)) ? 'неуспешна защитна проверка' : /quota|429|RESOURCE_EXHAUSTED/i.test(String(err?.message)) ? 'достигнат е дневният лимит' : 'няма връзка' };
  }
  paint();
}

function renderResult(r) {
  const ai = r.ai;
  const [top, ...others] = r.occupations;
  return `
  <section class="sec top"><div class="wrap stack" style="gap:20px">
    ${pageHead({ eyebrow: 'Твоят резултат', title: 'Твоят план за бъдещите умения', lead: `Какво да учиш днес – и кога. По интересите ти: <b style="color:var(--ink)">${esc(r.profile.topInterests.join(', '))}</b>` })}
    <span class="gem-chip">✦ Личните планове пише Gemini по твоите отговори</span>
    ${!r.dataAsOf ? '<p class="notice">Все още няма импортирани данни от пазара на труда – препоръките се основават само на публикуваните прогнози и каталога.</p>' : ''}
    ${r.knownSkills?.length ? `<p class="small muted">Вече владееш: ${esc(r.knownSkills.join(', '))} – не е включено в плана.</p>` : ''}
    <div class="hz-grid">${r.horizons.map((h) => `<div class="hz ${h.key}">
      <div class="hz-head"><span class="t">${esc(h.label)}</span><span class="s">${esc(h.subtitle)}</span></div>
      <div class="hz-body">
        ${ai?.ok && ai.texts?.[h.key] ? `<div class="ai-box">${kindBadge('ai')}<span>${esc(ai.texts[h.key])}</span></div>` : ''}
        ${h.items.map((i) => `<div class="hz-item">
          <h3><a href="#/skill/${i.skillId}">${esc(i.name)}</a></h3>
          ${firstStepHtml(i.firstStep)}
          <details class="mini gem-det" data-gemini="${i.skillId}" data-horizon="${h.key}"><summary>✦ Защо и как да започна?</summary>
            <div class="gem" id="gem-${i.skillId}">${geminiBody(i.skillId)}</div>
            <p class="gem-src">Данни зад препоръката: ${kindBadge(i.fact.kind)} ${esc(i.fact.text)} <span class="muted">(${esc(i.fact.source)} · ${esc(i.fact.period)})</span></p>
          </details>
        </div>`).join('')}
      </div>
    </div>`).join('')}</div>
    ${acc('Как да разбирам резултатите?', `
      <p>По 2 умения за всеки период, подбрани по интересите ти, с конкретна първа стъпка. Данни към ${esc(fmtDate(r.dataAsOf))}.</p>
      <div class="legend">${kindBadge('fact')} реални данни от обяви и Eurostat ${kindBadge('forecast')} Cedefop / WEF ${kindBadge('model')} изчисление на Future Jobs</div>
      <ul class="disclaimers">${r.disclaimers.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`)}
    <div class="stack" style="gap:10px;margin-top:6px">
      <h2 class="h2" style="font-size:22px">Къде могат да те отведат тези умения</h2>
      ${top ? `<a class="card occ-row" href="#/occupation/${top.id}">
        <div style="display:flex;flex-direction:column;gap:4px;max-width:760px"><span class="kick">Най-добро съвпадение</span><span class="card-title">${esc(top.title)}</span><span class="card-desc" style="font-size:14px">${esc(top.description || '')}</span></div>
        <span class="more">Разгледай професията ↗</span></a>` : ''}
      ${others.length ? acc(`Още ${others.length} подходящи професии`, `<div class="chips">${others.map((o) => `<a class="chip" href="#/occupation/${o.id}">${esc(o.title)}</a>`).join('')}</div>
        <p class="small">Съвпадение с интересите: ${r.occupations.map((o) => `${esc(o.title)} ${o.match}%`).join(' · ')} ${kindBadge('model')}</p>`) : ''}
    </div>
    <div class="card mail-card">
      <div style="display:flex;flex-direction:column;gap:4px"><h2>Изпрати плана на имейла си</h2><span class="card-desc" style="font-size:14px">С източниците и личните планове от Gemini, които си отворил. Имейлът не се съхранява.</span></div>
      <form class="mail-form" id="email-form">
        <div class="mail-row"><input id="email-input" type="email" name="email" required placeholder="ime@example.com" autocomplete="email" aria-label="Имейл"><button class="btn" type="submit">Изпрати</button></div>
        <span class="small muted">Изпращаме плана само веднъж, на този адрес.</span>
        <span id="email-msg" role="status"></span>
      </form>
    </div>
  </div></section>`;
}

// ------------------------------------------------------------------ данни и източници
let adminToken = ''; // пази се само в паметта на страницата, не в кода и не в localStorage

async function pageData() {
  const [s, market] = await Promise.all([loadFreshness(true), cached('market', () => api('/api/market'))]);
  if (!s) throw new Error('Няма връзка със сървъра');
  const ch = Object.fromEntries(market.cedefop.headline.map((x) => [x.key, x]));
  const jvr = market.vacancyRate;
  const ST = { ok: ['работи', 'b-ok'], error: ['грешка', 'b-err'], never: ['още не е импортиран', 'b-off'], not_integrated: ['не е интегриран', 'b-off'], not_configured: ['нужен е ключ', 'b-warn'] };
  const RS = { success: 'b-ok', partial: 'b-warn', failed: 'b-err', skipped: 'b-off', running: 'b-fact' };
  const RSL = { success: 'успешно', partial: 'частично', failed: 'неуспешно', skipped: 'пропуснато', running: 'тече' };
  const TRIG = { scheduled: 'планирано', manual: 'ръчно', cli: 'команда' };
  const working = s.sources.filter((x) => x.status === 'ok').length;
  const active = s.sources.filter((x) => !['not_integrated', 'not_configured'].includes(x.status)).length;
  return `
  <section class="sec top"><div class="wrap stack">
    ${pageHead({ eyebrow: 'Прозрачност', title: 'Данни и източници.', lead: 'Откъде идват числата и колко са пресни. Обновява се автоматично всеки ден.' })}
    ${s.storage?.warning ? `<p class="notice err">${esc(s.storage.warning)}</p>` : ''}
    <div class="kpis">
      ${kpi('Последно обновяване', s.lastSuccessfulImport ? esc(relDay(s.lastSuccessfulImport)) : 'няма', s.stale ? `<span class="badge b-warn">${s.lastSuccessfulImport ? `остарели (> ${s.staleAfterHours} ч.)` : 'още няма импорт'}</span>` : `следващо: ${esc(relDay(s.nextScheduledRun))}`)}
      ${kpi('Източници', `${working} от ${active}`, 'работят при последното обновяване')}
      ${kpi('Обяви в базата', fmtNum(s.counts.postings), `${fmtNum(s.counts.observations)} статистически наблюдения`)}
    </div>
    <div class="grid g2">
      <div class="panel">
        <h3>Свободни работни места ${kindBadge('fact')}</h3>
        ${lineChart([jvr.BG, jvr.EU], { unit: '%', names: ['България', 'ЕС-27'] })}
        <span class="small muted">${esc(jvr.source)} · ${jvr.BG.length ? `${esc(jvr.BG[0].period)} – ${esc(jvr.BG[jvr.BG.length - 1].period)}` : 'няма данни'}</span>
      </div>
      <div class="panel">
        <h3>Най-бързо растящите умения до 2030 ${kindBadge('forecast')}</h3>
        <ol class="rank">${market.wef.growingSkills.slice(0, 6).map((x) => `<li><span class="n">${x.rank}</span><span>${esc(x.label)}</span></li>`).join('')}</ol>
        <span class="small muted">${esc(market.wef.title)}, ${esc(market.wef.period)}. <a href="#/skills">Как се търсят в обявите →</a></span>
      </div>
    </div>
    <div class="acc-list">
      ${acc('България до 2035 г. (Cedefop)', `
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
          <div style="display:flex;flex-direction:column;gap:4px"><span class="big-num">${ch.openings_high_skill_pct.value}%</span><span class="small">${esc(ch.openings_high_skill_pct.label)}</span></div>
          <div style="display:flex;flex-direction:column;gap:4px"><span class="big-num">${ch.labour_force_high_qual_2035_pct.value}%</span><span class="small">${esc(ch.labour_force_high_qual_2035_pct.label)}</span></div>
        </div>
        <b class="small">Най-голям очакван недостиг:</b>
        <div class="chips">${market.cedefop.shortages.map((x) => `<span class="chip alt sm">${esc(x.label)}</span>`).join('')}</div>
        <span class="small muted">${kindBadge('forecast')} ${esc(market.cedefop.title)} · ${esc(market.cedefop.period)} · <a href="${esc(market.cedefop.url)}" rel="noopener" target="_blank">PDF</a></span>`)}
      ${acc('Статус на източниците', `<div class="table-wrap"><table style="min-width:760px"><thead><tr><th scope="col">Източник</th><th scope="col">Статус</th><th scope="col">Последен успех</th><th scope="col">Период</th><th scope="col">Условия</th></tr></thead><tbody>
        ${s.sources.map((x) => `<tr>
          <td><a href="${esc(x.url)}" rel="noopener" target="_blank">${esc(x.name)}</a><div class="small muted">${x.kind === 'api' ? 'API' : x.kind === 'published_report' ? 'доклад' : ''} · ${esc(x.updateFrequency)}</div></td>
          <td><span class="badge ${(ST[x.status] || ST.never)[1]}">${(ST[x.status] || ST.never)[0]}</span>${x.stale ? ' <span class="badge b-warn">остарели</span>' : ''}
            ${x.lastError ? `<div class="src-err">${esc(x.lastError.slice(0, 160))}</div>` : ''}</td>
          <td class="num">${fmtDate(x.lastSuccessAt)}</td>
          <td class="small">${esc(x.dataPeriod || '—')}</td>
          <td class="small muted" style="max-width:260px">${esc(x.terms)}</td></tr>`).join('')}
        </tbody></table></div>`, { hint: `${working} от ${active} работят` })}
      ${acc('История на обновяванията', s.runs.length ? `<div style="display:flex;flex-direction:column;gap:10px">${s.runs.slice(0, 8).map((r) => `<div class="run"><div><div>${fmtDate(r.started_at)} · ${esc(TRIG[r.trigger] || r.trigger)}</div>
        <details class="mini"><summary>Подробности</summary><p>${esc(r.message || '')}</p>
        <ul class="small" style="margin:0;padding-left:18px">${r.sources.map((x) => `<li><b>${esc(x.source_id)}</b>: ${esc(x.status)} – нови ${x.inserted}, обновени ${x.updated}, дубликати ${x.duplicates}, отхвърлени ${x.rejected}${x.error ? ` · <span style="color:var(--err-ink)">${esc(x.error.slice(0, 200))}</span>` : ''}</li>`).join('')}</ul></details></div>
        <span class="badge ${RS[r.status] || 'b-off'}">${RSL[r.status] || esc(r.status)}</span></div>`).join('')}</div>` : NA('Още няма изпълнения.'),
        { hint: s.runs[0] ? esc(RSL[s.runs[0].status] || s.runs[0].status) : '' })}
      ${acc('Методология и ограничения', `
        <p>${kindBadge('fact')} реални данни (Eurostat, обяви) · ${kindBadge('forecast')} публикувани прогнози (Cedefop, WEF) · ${kindBadge('model')} изчисления на Future Jobs (Future Skills Score, индекс на перспективата, оценка на заплатите).</p>
        <p>${esc(s.schedule)}</p>
        <p>Обявите са основно от ЕС и дистанционни – не са представителни за България. Оценките са ориентир, не научно доказана прогноза. ${fmtNum(s.counts.revisions)} ревизии · ${s.counts.metricDays} дни история.</p>
        <a href="/METHODOLOGY.md" style="font-weight:700;text-decoration:none">Прочети методологията и формулите →</a>`)}
      ${acc('Администрация', `
        <form class="form" id="admin-form">
          <label class="small muted" for="admin-token">Администраторски токен (не се запазва)</label>
          <input id="admin-token" type="password" name="token" placeholder="ADMIN_TOKEN" autocomplete="off" value="${esc(adminToken)}">
          <div class="row"><button class="btn" type="submit" ${s.running ? 'disabled' : ''}>${s.running ? 'Обновяване тече…' : 'Обнови сега'}</button></div>
          <p id="admin-msg" class="small" role="status"></p>
        </form>
        <div class="form">
          <b>Тест на Gemini</b>
          <p class="small muted">Една кратка заявка към Gemini през Firebase AI Logic (с App Check). Не изисква токен.</p>
          <div class="row"><button class="btn btn-ghost" type="button" data-act="ping-gemini">Провери Gemini</button></div>
          <div id="gemini-msg" class="small" role="status"></div>
        </div>
        <form class="form" id="test-email-form">
          <b>Тест на имейла</b>
          <p class="small muted">Изпраща пробен имейл и показва точната грешка от пощенския сървър (използва токена по-горе).</p>
          <input type="email" name="to" placeholder="Получател (по подразбиране SMTP_USER)" aria-label="Получател на тестовия имейл">
          <div class="row"><button class="btn btn-ghost" type="submit">Изпрати тестов имейл</button></div>
          <div id="test-email-msg" class="small" role="status"></div>
        </form>`, { open: !!adminToken })}
    </div>
  </div></section>`;
}

// ------------------------------------------------------------------ рутер
const routes = [
  [/^#?\/?$/, 'home', pageHome],
  [/^#\/occupations$/, 'occupations', pageOccupations],
  [/^#\/occupation\/([a-z_]+)$/, 'occupations', pageOccupation],
  [/^#\/skills$/, 'skills', pageSkills],
  [/^#\/skill\/([a-z_]+)$/, 'skills', pageSkill],
  [/^#\/quiz$/, 'quiz', pageQuiz],
  [/^#\/data$/, 'data', pageData],
];

function updateHeaderCta(route) {
  const el = document.getElementById('header-cta');
  if (route === 'quiz' && quizState.result) el.innerHTML = '<button class="btn btn-ghost" type="button" data-act="restart">↺ Започни отначало</button>';
  else if (route === 'quiz') el.innerHTML = `<span class="btn btn-navy" aria-live="polite">Анкета · въпрос ${quizState.step + 1}/${quizState.total}</span>`;
  else el.innerHTML = '<a class="btn" href="#/quiz">Започни анкетата <span aria-hidden="true">↗</span></a>';
}

async function render({ scroll = true } = {}) {
  const hash = location.hash || '#/';
  const r = routes.find(([re]) => re.test(hash)) || routes[0];
  const m = hash.match(r[0]);
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === r[1]));
  if (scroll) $main.innerHTML = '<p class="loading">Зареждане…</p>';
  try {
    $main.innerHTML = await r[2](m && m[1]);
  } catch (err) {
    $main.innerHTML = `<div class="wrap page-error"><p class="notice err">Грешка: ${esc(err.message)}</p></div>`;
  }
  updateHeaderCta(r[1]);
  if (r[1] === 'occupations' && !m?.[1]) applySearch('occ');
  if (r[1] === 'skills' && !m?.[1]) applySearch('skills');
  if (scroll) { window.scrollTo(0, 0); $main.focus({ preventScroll: true }); }
}

document.getElementById('header-cta').addEventListener('click', (e) => {
  const t = /** @type {HTMLElement} */ (e.target).closest('[data-act="restart"]');
  if (!t) return;
  Object.assign(quizState, { step: 0, answers: {}, result: null, error: null });
  render();
});

$main.addEventListener('click', async (e) => {
  const t = /** @type {HTMLElement} */ (e.target).closest('button');
  if (!t) return;
  if (t.dataset.filter !== undefined) { occFilter = t.dataset.filter || null; return render({ scroll: false }); }
  if (t.dataset.sort) {
    skillSort = t.dataset.sort;
    await render({ scroll: false });
    const tbl = /** @type {HTMLDetailsElement|null} */ (document.getElementById('skills-table'));
    if (tbl) { tbl.open = true; tbl.scrollIntoView({ block: 'start' }); }
    return;
  }
  if (t.dataset.opt) {
    const { q, opt, type } = t.dataset;
    const max = Number(t.dataset.max);
    if (type === 'multi') {
      const cur = new Set(quizState.answers[q] || []);
      if (cur.has(opt)) cur.delete(opt); else if (cur.size < max) cur.add(opt);
      quizState.answers[q] = [...cur];
    } else quizState.answers[q] = opt;
    return render({ scroll: false });
  }
  const act = t.dataset.act;
  if (act === 'back') { quizState.step--; return render({ scroll: false }); }
  if (act === 'next') { quizState.step++; return render({ scroll: false }); }
  if (act === 'restart') { Object.assign(quizState, { step: 0, answers: {}, result: null, error: null }); return render(); }
  if (act === 'ping-gemini') {
    const out = document.getElementById('gemini-msg');
    t.setAttribute('disabled', ''); out.textContent = 'Проверка…';
    try { const g = await pingGemini(); out.innerHTML = `✅ Gemini работи (${esc(g.model)}, App Check: ${esc(g.provider)}) за ${g.ms} ms.`; }
    catch (err) { out.innerHTML = `<span style="color:var(--err-ink)">✕ ${esc(String(err?.message || err))}</span><br>Провери App Check: доставчикът (v3 или enterprise) във firebase-config.js трябва да съвпада с регистрирания във Firebase → Security → App Check, а домейнът – с този в reCAPTCHA.`; }
    t.removeAttribute('disabled');
    return;
  }
  if (act === 'submit') {
    t.setAttribute('disabled', ''); t.textContent = 'Изчисляване…';
    Object.keys(gemState).forEach((k) => delete gemState[k]);
    try { quizState.result = await api('/api/recommendations', { method: 'POST', body: JSON.stringify({ answers: quizState.answers }) }); quizState.error = null; }
    catch (err) { quizState.error = err.message; }
    return render();
  }
});

$main.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = /** @type {HTMLFormElement} */ (e.target);
  const fd = new FormData(form);
  const btn = form.querySelector('button');
  if (form.id === 'email-form') {
    const msg = document.getElementById('email-msg');
    const input = /** @type {HTMLInputElement} */ (form.querySelector('input[name="email"]'));
    const email = String(fd.get('email') || '').trim();
    btn.disabled = true; msg.textContent = 'Изпращане…';
    try {
      await api('/api/email', { method: 'POST', body: JSON.stringify({ answers: quizState.answers, email, consent: true, ai: Boolean(quizState.result?.ai?.ok),
        plans: Object.fromEntries(Object.entries(gemState).filter(([, v]) => v.status === 'ok').map(([k, v]) => [k, { why: v.plan.why, steps: v.plan.steps.map((x) => x.text) }])) }) });
      msg.className = '';
      msg.innerHTML = `✓ Изпратено на <b>${esc(email)}</b>. Провери пощата си (и папка „Спам“). Сгрешен адрес? Поправи го и натисни „Изпрати отново“.`;
      btn.textContent = 'Изпрати отново';
    } catch (err) { msg.className = 'err'; msg.textContent = `✕ ${err.message}`; }
    // Полето и бутонът остават активни, за да може адресът да се поправи и изпрати отново
    btn.disabled = false;
    input.readOnly = false;
    input.focus();
    input.select();
  }
  if (form.id === 'test-email-form') {
    const tokenInput = /** @type {HTMLInputElement} */ (document.querySelector('#admin-form input[name="token"]'));
    adminToken = tokenInput?.value || adminToken;
    const out = document.getElementById('test-email-msg');
    if (!adminToken) { out.textContent = '❌ Въведи ADMIN_TOKEN в полето по-горе.'; return; }
    btn.disabled = true; out.textContent = 'Изпращане…';
    try {
      const r = await api('/api/admin/test-email', { method: 'POST', headers: { 'x-admin-token': adminToken }, body: JSON.stringify({ to: fd.get('to') || '' }) });
      const st = r.settings;
      const cfg = `Настройки: ${esc(st.host)}:${st.port}, TLS ${st.secure ? 'да (465)' : 'STARTTLS'}, потребител ${esc(st.user)}, парола ${st.passLength} знака, подател ${esc(st.from)}`;
      out.innerHTML = r.ok
        ? `<p>✅ Тестовият имейл е изпратен. Провери пощата (и „Спам“).</p><p class="muted">${cfg}</p>`
        : `<p class="notice err">✕ ${esc(r.error)}</p><p style="margin-top:8px"><b>Какво да направиш:</b> ${esc(r.hint)}</p><p class="muted" style="margin-top:6px">${cfg}</p>`;
    } catch (err) { out.textContent = `❌ ${err.message}`; }
    btn.disabled = false;
  }
  if (form.id === 'admin-form') {
    adminToken = String(fd.get('token') || '');
    const msg = document.getElementById('admin-msg');
    btn.disabled = true; msg.textContent = 'Обновяване… това може да отнеме няколко минути.';
    try {
      const r = await api('/api/admin/refresh?wait=1', { method: 'POST', headers: { 'x-admin-token': adminToken } });
      msg.textContent = `Готово: ${r.status} – ${r.message || r.error || ''}`;
      Object.keys(cache).forEach((k) => delete cache[k]);
      setTimeout(() => render({ scroll: false }), 1200);
    } catch (err) { msg.textContent = `❌ ${err.message}`; btn.disabled = false; }
  }
});

$main.addEventListener('input', (e) => {
  const el = /** @type {HTMLInputElement} */ (e.target);
  if (el.dataset?.search) { queries[el.dataset.search] = el.value; applySearch(el.dataset.search); }
});

$main.addEventListener('change', (e) => {
  const el = /** @type {HTMLSelectElement} */ (e.target);
  if (el.matches?.('[data-sort-select]')) { skillSort = el.value; render({ scroll: false }); }
});

$main.addEventListener('toggle', (e) => {
  const d = /** @type {HTMLDetailsElement} */ (e.target);
  if (d.open && d.dataset?.gemini) loadGemini(d.dataset.gemini, d.dataset.horizon);
}, true);

window.addEventListener('hashchange', () => render());
loadFreshness();
render();
mountAssistant();
