// Future Jobs – frontend (без библиотеки). Данните идват само от /api/*.
// Важно: frontend-ът НЕ обновява данните периодично – ежедневният импорт е задача на сървъра.

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

// ------------------------------------------------------------------ статус на данните (хедър)
async function loadFreshness(force = false) {
  if (force) delete cache.status;
  const el = document.getElementById('freshness');
  try {
    const s = await cached('status', () => api('/api/status'));
    if (!s.lastSuccessfulImport) { el.className = 'fresh fresh-unknown'; el.textContent = 'Още няма импорт на данни'; }
    else if (s.stale) { el.className = 'fresh fresh-stale'; el.textContent = `Остарели данни · ${fmtDate(s.lastSuccessfulImport)}`; }
    else { el.className = 'fresh fresh-ok'; el.textContent = `Обновено ${fmtDate(s.lastSuccessfulImport)}`; }
    return s;
  } catch { el.className = 'fresh fresh-unknown'; el.textContent = 'Няма връзка със сървъра'; return null; }
}

// ------------------------------------------------------------------ страници
// Примерни профили за началната страница. Резултатите се изчисляват от същия модел
// и със същите данни като анкетата (не са измислени).
const EXAMPLE_PROFILES = [
  { label: 'Обича компютри и математика', answers: { afternoon: 'code', subjects: ['math', 'it'], workwith: 'data', tech_attitude: 'build', environment: 'office', values: 'income', study: 'university', english: 'mid' } },
  { label: 'Иска да помага на хората', answers: { afternoon: 'help', subjects: ['bio', 'social'], workwith: 'people', tech_attitude: 'less', environment: 'clinic', values: 'impact', study: 'university', english: 'good' } },
  { label: 'Обича природата и практическата работа', answers: { afternoon: 'outdoor', subjects: ['geo', 'physics'], workwith: 'things', tech_attitude: 'use', environment: 'field', values: 'stability', study: 'course', english: 'basic' } },
];

async function exampleResults() {
  const key = 'fj-examples-v1';
  try {
    const c = JSON.parse(localStorage.getItem(key) || 'null');
    if (c && Date.now() - c.at < 6 * 3600 * 1000) return c.items;
  } catch { /* localStorage недостъпен */ }
  const items = await Promise.all(EXAMPLE_PROFILES.map((p) => api('/api/recommendations', { method: 'POST', body: JSON.stringify({ answers: p.answers, ai: false }) })
    .then((r) => ({ label: p.label, occupation: r.occupations[0], skills: r.horizons[0].items.map((i) => i.name) }))
    .catch(() => null)));
  try { if (items.every(Boolean)) localStorage.setItem(key, JSON.stringify({ at: Date.now(), items })); } catch { /* */ }
  return items;
}

async function pageHome() {
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow">ТВОЕТО БЪДЕЩЕ ЗАПОЧВА ТУК</p><h1>Открий своята<br><span>посока.</span></h1><p class="lead">Какво да учиш днес, за да имаш работа утре? Разгледай възможности, открий силните си страни и направи първата стъпка.</p><div class="row hero-actions"><a class="btn btn-primary" href="#/quiz">Открий своя път ↗</a><a class="text-link" href="#/occupations">Разгледай професиите →</a></div><p class="hero-meta">✦ За ученици и млади хора &nbsp;&nbsp; ✦ Данни и прогнози</p></div><div class="hero-art"><div class="orbit"></div><img src="/wave.png" alt="Синя вълна — елемент от визията на BlackSea Squad"><div class="floating one">РАЗГЛЕДАЙ<strong>Професии с перспектива</strong></div><div class="floating two">ЗАПОЧНИ ОТ СЕБЕ СИ<strong>Твоите интереси → твоят път</strong></div></div></section><section class="home-section"><p class="eyebrow">ОТКЪДЕ ДА ЗАПОЧНА?</p><h2>Бъдещето има много посоки.</h2><p class="muted">Избери тази, която е интересна за теб.</p><div class="grid g3 home-cards"><a class="card home-card" href="#/quiz"><span class="home-icon">✳</span><h3>Опознай себе си <span>↗</span></h3><p>Отговори на няколко въпроса за интересите и целите си.</p></a><a class="card home-card" href="#/occupations"><span class="home-icon">↗</span><h3>Открий професии <span>↗</span></h3><p>Разгледай различни възможности и какво стои зад тях.</p></a><a class="card home-card" href="#/skills"><span class="home-icon">✧</span><h3>Развий умения <span>↗</span></h3><p>Виж кои умения можеш да започнеш да развиваш още днес.</p></a></div></section><section class="home-band"><div><p class="eyebrow">МАЛКА СТЪПКА. ГОЛЯМА ПОСОКА.</p><h2>Готов ли си да откриеш своя път?</h2><p>Започни с интересите си и разгледай възможностите пред теб.</p></div><a class="btn btn-primary" href="#/quiz">Започни анкетата ↗</a></section>`;
}

const INTEREST_FILTERS = ['Технологии', 'Данни и анализ', 'Творчество и дизайн', 'Работа с хора', 'Грижа и помощ', 'Природа и устойчивост', 'Бизнес и организация', 'Практическа/техническа работа'];
let occFilter = null;
let occQuery = '';
async function pageOccupations() {
  const { occupations } = await cached('occ', () => api('/api/occupations'));
  const list = occupations.filter(o => (!occFilter || o.interests.includes(occFilter)) && `${o.title} ${o.description}`.toLocaleLowerCase('bg').includes(occQuery.toLocaleLowerCase('bg')));
  return `<div class="page-title"><p class="eyebrow">РАЗГЛЕДАЙ ВЪЗМОЖНОСТИТЕ</p><h1>Професии за твоето бъдеще.</h1><p class="muted">Разгледай каталога и открий какво ти е интересно.</p></div><input class="search" type="search" data-search="occupation" aria-label="Търсене на професия" placeholder="⌕  Потърси професия" value="${esc(occQuery)}"><details class="disclosure filter-box" ${occFilter ? 'open' : ''}><summary>Филтри по интереси ${occFilter ? `<span class="small">${esc(occFilter)}</span>` : ''}</summary><div class="disclosure-body"><div class="filters" role="group" aria-label="Филтър по интереси"><button data-filter="" aria-pressed="${!occFilter}">Всички</button>${INTEREST_FILTERS.map(f=>`<button data-filter="${esc(f)}" aria-pressed="${occFilter===f}">${esc(f)}</button>`).join('')}</div></div></details><p class="small muted">${list.length} професии</p><div class="grid g3">${list.map(occCard).join('')}</div>${list.length?'':'<p class="muted">Няма намерени професии. Опитай друга дума или филтър.</p>'}`;
}

function salaryLine(s) {
  if (!s?.bg) return NA('няма данни за заплатите');
  return `<b>≈ ${fmtNum(s.bg.monthly)} €/мес.</b> бруто <span class="muted small">(${s.bg.isEstimate ? `оценка за ${esc(s.bg.period)}` : esc(s.bg.period)} · „${esc(s.group)}“${s.sector ? ` в „${esc(s.sector)}“` : ''}, България)</span>`;
}

function occCard(o) {
  return `<a class="card occ-card" href="#/occupation/${esc(o.id)}"><span class="job-label">ПРОФЕСИЯ · ${esc(o.interests?.[0] || o.iscoLabel)}</span><h3>${esc(o.title)}</h3><p class="small muted">${esc(o.description)}</p><span class="more">Разгледай професията ↗</span></a>`;
}

function signalsList(signals) {
  return `<ul class="ev">${signals.map((s) => `<li>${kindBadge(s.type)}<span>${s.value > 0 ? '▲' : s.value < 0 ? '▼' : '•'} ${esc(s.text)}<span class="src">${esc(s.source)} · ${esc(s.period)}</span></span></li>`).join('')}</ul>`;
}

async function pageOccupation(id) {
  const o = await api(`/api/occupations/${encodeURIComponent(id)}`);
  const emp = o.employment; const ess = o.escoSkills.filter(s=>s.relation==='essential');
  return `<div class="detail-page"><a class="detail-back" href="#/occupations">← Всички професии</a><p class="eyebrow">ПРОФЕСИЯ</p><h1>${esc(o.title)}</h1><p class="lead muted">${esc(o.description)}</p><div class="disclosure-stack">
    <details class="disclosure"><summary>Основни умения</summary><div class="disclosure-body"><div class="chips">${o.coreSkills.map(s=>`<a class="chip" href="#/skill/${s.id}">${esc(s.name)} ↗</a>`).join('')}</div></div></details>
    <details class="disclosure"><summary>Допълващи умения</summary><div class="disclosure-body"><div class="chips">${o.complementarySkills.map(s=>`<a class="chip" href="#/skill/${s.id}">${esc(s.name)} ↗</a>`).join('')}</div></div></details>
    <details class="disclosure"><summary>Перспектива</summary><div class="disclosure-body"><p><b>Индекс на перспектива: ${o.outlook.index ?? '—'}/100</b> ${kindBadge('model')}</p><p class="small muted">Индексът показва дела на положителните сигнали от наличните. Не е прогноза за конкретен брой работни места.</p>${signalsList(o.outlook.signals)}</div></details>
    <details class="disclosure"><summary>Заплащане</summary><div class="disclosure-body">${o.salary?.bg?`<dl class="kv"><dt>България</dt><dd><b>≈ ${fmtNum(o.salary.bg.monthly)} €/мес.</b> бруто ${o.salary.bg.isEstimate ? `${kindBadge('model')} оценка за ${esc(o.salary.bg.period)}` : ''}</dd><dt>Официално</dt><dd>${fmtNum(o.salary.bg.official.monthly)} €/мес. (SES ${esc(o.salary.bg.official.period)}) ${kindBadge('fact')}</dd>${o.salary.eu?`<dt>ЕС-27</dt><dd>≈ ${fmtNum(o.salary.eu.monthly)} €/мес. ${o.salary.eu.isEstimate?`(оценка за ${esc(o.salary.eu.period)})`:''}</dd>`:''}<dt>Група</dt><dd>${esc(o.salary.group)}</dd>${o.salary.sector?`<dt>Сектор</dt><dd>${esc(o.salary.sector)}</dd>`:''}</dl><p class="small muted">${esc(o.salary.note)} Източник: ${esc(o.salary.source)}.</p>`:NA('Данните за заплатите още не са импортирани.')}</div></details>
    <details class="disclosure"><summary>Заетост в професионалната група</summary><div class="disclosure-body"><p>Заети в група „${esc(o.iscoLabel)}“ в България (хил. души) ${kindBadge('fact')}</p>${emp.BG?lineChart([emp.BG.series],{names:['България']}):NA()}<p class="small muted">${esc(emp.source)}${emp.BG?.breaks?' · Има прекъсване на редицата (методологична промяна).':''}</p></div></details>
    <details class="disclosure"><summary>Данни от ESCO</summary><div class="disclosure-body">${o.esco?`<p class="small muted">Автоматично съпоставяне — проверете дали съответства на професията: <a href="${esc(o.esco.uri)}" target="_blank" rel="noopener">${esc(o.esco.label_bg)}</a> (код ${esc(o.esco.code)}).</p><div class="chips">${ess.slice(0,24).map(s=>`<span class="chip alt">${esc(s.to_label)}</span>`).join('')||NA()}</div>`:NA('ESCO данните още не са импортирани.')}</div></details>
  </div></div>`;
}

let skillSort = 'score';
let skillCompareOpen = false;
let skillQuery = '';
async function pageSkills() {
  const d = await cached('skills', () => api('/api/skills'));
  const list=d.skills.filter(s=>`${s.name} ${s.description}`.toLocaleLowerCase('bg').includes(skillQuery.toLocaleLowerCase('bg')));
  const key={score:s=>s.score??-1,demand:s=>s.demandShare??-1,change:s=>s.change90??s.change30??-9,long:s=>s.longTerm??-1};
  const sorted=[...list].sort((a,b)=>skillSort==='name'?a.name.localeCompare(b.name,'bg'):key[skillSort](b)-key[skillSort](a));
  return `<div class="page-title"><p class="eyebrow">ИНВЕСТИРАЙ В СЕБЕ СИ</p><h1>Умения, които отварят врати.</h1><p class="muted">Разгледай уменията и открий с какво да започнеш.</p></div><input class="search" type="search" data-search="skill" aria-label="Търсене на умение" placeholder="⌕  Потърси умение" value="${esc(skillQuery)}"><p class="small muted">${list.length} умения</p><div class="grid g3">${list.map(s=>`<a class="card occ-card" href="#/skill/${s.id}"><span class="job-label">УМЕНИЕ</span><h3>${esc(s.name)}</h3><p class="small muted">${esc(s.description)}</p><span class="more">Разгледай умението ↗</span></a>`).join('')}</div>${list.length?'':'<p class="muted">Няма намерени умения.</p>'}<details class="disclosure" ${skillCompareOpen ? 'open' : ''} style="margin-top:24px"><summary>Сравнение на показателите</summary><div class="disclosure-body"><p class="small muted">Future Skills Score е относителна оценка от модела, а не научно доказана прогноза. Обявите са основно от Германия/ЕС и дистанционни и не са представителни за България.</p><div class="table-wrap"><table><thead><tr>${[['name','Умение'],['score','Оценка'],['demand','Търсене'],['change','Промяна'],['long','Перспектива']].map(([k,t])=>`<th><button data-sort="${k}" aria-label="Сортирай по ${t}">${t}${skillSort===k?' ↓':''}</button></th>`).join('')}<th>ESCO професии</th><th>Увереност</th></tr></thead><tbody>${sorted.map(s=>`<tr><td><a href="#/skill/${s.id}">${esc(s.name)}</a></td><td>${s.score??'—'}</td><td>${s.demandShare==null?NA():fmtPct(s.demandShare)}</td><td>${(s.change90??s.change30)==null?NA():(fmtNum((s.change90??s.change30)*100)+' п.п.')}</td><td>${s.longTerm??'—'}</td><td>${s.escoOccupations??'—'}</td><td>${confBadge(s.confidence)}</td></tr>`).join('')}</tbody></table></div></div></details>`;
}

async function pageSkill(id) {
  const s=await api(`/api/skills/${encodeURIComponent(id)}`); const d=s.details, comp=d?.components||{};
  const LBL={demand:'Текущо търсене',momentum:'Динамика 30/90 д.',longTerm:'Дългосрочна перспектива',breadth:'Приложимост',learning:'Обучение'};
  const hist=s.history.filter(h=>h.demand_share!==null).map(h=>({period:h.date,value:Math.round(h.demand_share*1000)/10}));
  const histScore=s.history.filter(h=>h.score!==null).map(h=>({period:h.date,value:h.score}));
  return `<div class="detail-page"><a class="detail-back" href="#/skills">← Всички умения</a><p class="eyebrow">УМЕНИЕ</p><h1>${esc(s.name)}</h1><p class="lead muted">${esc(s.description)}</p><div class="disclosure-stack">
  <details class="disclosure"><summary>Свързани професии</summary><div class="disclosure-body"><div class="chips">${s.occupations.map(o=>`<a class="chip ${o.core?'':'alt'}" href="#/occupation/${o.id}">${esc(o.title)} ↗</a>`).join('')||NA()}</div></div></details>
  <details class="disclosure"><summary>Къде да науча това умение?</summary><div class="disclosure-body"><ul class="ev">${s.resources.map(r=>`<li><span class="badge ${r.free?'b-ok':'b-off'}">${r.free?'безплатно':'платено'}</span><span><a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.title)} ↗</a><span class="src">${esc(r.provider)} · ${esc(r.lang)}</span></span></li>`).join('')||NA()}</ul></div></details>
  <details class="disclosure"><summary>Търсене и перспектива</summary><div class="disclosure-body"><p><b>Оценка: ${s.score??'—'}/100</b> ${kindBadge('model')} ${confBadge(s.confidence)}</p><dl class="kv"><dt>Търсене</dt><dd>${d?.demand?.share!=null?`${fmtPct(d.demand.share)} от ${d.demand.total} обяви`:NA(`под ${d?.demand?.minRequired??100} обяви`)}</dd><dt>Период</dt><dd>${esc(d?.window?.current||'—')}</dd><dt>Промяна 30 дни</dt><dd>${d?.change30?.value!=null?`${(d.change30.value*100).toFixed(2)} п.п.`:NA(d?.change30?.reason||'—')}</dd><dt>Промяна 90 дни</dt><dd>${d?.change90?.value!=null?`${(d.change90.value*100).toFixed(2)} п.п.`:NA(d?.change90?.reason||'—')}</dd><dt>Перспектива</dt><dd>${s.longTerm!=null?`${s.longTerm}/100`:NA()}</dd><dt>WEF</dt><dd>${s.wef?`„${esc(s.wef.label)}“ – №${s.wef.rank} растящо умение до 2030 ${kindBadge('forecast')}`:'—'}</dd></dl><p class="small muted">Обявите са основно от Германия/ЕС и дистанционни — не са представителни за България. Оценката не е научно доказана прогноза.</p><h3>Компоненти на оценката</h3>${Object.keys(LBL).map(k=>`<div class="bar"><span>${LBL[k]}</span><div class="meter"><i style="width:${comp[k]??0}%"></i></div><b>${comp[k]??'—'}</b></div>`).join('')}<p class="small muted">Персентил спрямо останалите умения. Липсващите компоненти не участват в оценката.</p></div></details>
  <details class="disclosure"><summary>История и още данни</summary><div class="disclosure-body"><h3>История: дял в обявите (%)</h3>${lineChart([hist],{unit:'%',names:['Търсене']})}<h3>История: оценка на умението</h3>${lineChart([histScore],{names:['Оценка']})}<h3>Често се търси заедно с</h3>${d?.cooccurrence?.length?`<ul class="ev">${d.cooccurrence.map(c=>`<li><span>${kindBadge('fact')}</span><span><a href="#/skill/${c.skill}">${esc(c.name)}</a> – ${c.n} общи обяви, lift ${String(c.lift).replace('.',',')}</span></li>`).join('')}</ul>`:NA()}<h3>ESCO</h3>${s.esco?`<p class="small muted">Автоматично съпоставяне — проверете дали съответства на умението: <a href="${esc(s.esco.uri)}" target="_blank" rel="noopener">${esc(s.esco.label_bg)}</a> · ${s.esco.essential_for_count??0} съществено / ${s.esco.optional_for_count??0} по избор за професии.</p>`:NA()}<details><summary>Синоними в обявите</summary><p class="small muted">${s.synonyms.map(esc).join(', ')}</p></details></div></details>
  </div></div>`;
}

// ------------------------------------------------------------------ анкета
const quizState = { step: 0, answers: {}, result: null, error: null };

async function pageQuiz() {
  const { questions } = await cached('quiz', () => api('/api/quiz'));
  if (quizState.result) return renderResult(quizState.result);
  const q = questions[quizState.step];
  const sel = quizState.answers[q.id];
  const isSel = (id) => (Array.isArray(sel) ? sel.includes(id) : sel === id);
  const ready = q.type === 'multi' ? Array.isArray(sel) && sel.length > 0 : !!sel;
  return `<div class="quiz">
    <p class="muted small">Въпрос ${quizState.step + 1} от ${questions.length}</p>
    <div class="progress"><i style="width:${(quizState.step / questions.length) * 100}%"></i></div>
    <h2>${esc(q.text)}</h2>
    <div class="options" role="group">${q.options.map((o) => `<button class="opt" data-opt="${o.id}" data-q="${q.id}" data-type="${q.type}" data-max="${q.max || 1}" aria-pressed="${isSel(o.id)}"><span class="tick"></span>${esc(o.text)}</button>`).join('')}</div>
    ${quizState.error ? `<p class="notice err">${esc(quizState.error)}</p>` : ''}
    <div class="spread">
      <button class="btn btn-ghost" data-act="back" ${quizState.step === 0 ? 'disabled' : ''}>Назад</button>
      <button class="btn btn-primary" data-act="${quizState.step === questions.length - 1 ? 'submit' : 'next'}" ${ready ? '' : 'disabled'}>${quizState.step === questions.length - 1 ? 'Виж резултатите' : 'Напред'}</button>
    </div>
    <p class="small muted" style="margin-top:20px">Отговорите не се запазват на сървъра. Използват се само за изчисляване на препоръките.</p>
  </div>`;
}

function evidenceList(ev) {
  return `<ul class="ev">${ev.map((e) => `<li>${kindBadge(e.kind)}<span class="${e.insufficient ? 'insufficient' : ''}">${esc(e.text)}<span class="src">${esc(e.source)} · ${esc(e.period)}</span></span></li>`).join('')}</ul>`;
}

const STEP_ICON = { course: '🎓', project: '🛠️', group: '👥' };

function firstStepHtml(st) {
  const body = st.url ? `<a href="${esc(st.url)}" target="_blank" rel="noopener">${esc(st.text)}</a>` : esc(st.text);
  return `<div class="first-step"><span class="step-type">Първа стъпка · ${STEP_ICON[st.type] || ''} ${esc(st.label)}</span><span>${body}</span></div>`;
}

function renderResult(r) {
  const ai = r.ai;
  return `
  <div class="section-head"><div><p class="badge b-ok">Твоят резултат</p><h1>Твоят план за бъдещите умения</h1>
    <p class="muted">Интереси: <b>${esc(r.profile.topInterests.join(', '))}</b> · данни към ${fmtDate(r.dataAsOf)}</p></div>
    <button class="btn btn-ghost" data-act="restart">Започни отначало</button></div>
  ${!r.dataAsOf ? '<p class="notice">Все още няма импортирани данни от пазара на труда – препоръките се основават само на публикуваните прогнози и каталога.</p>' : ''}
  <details class="disclosure"><summary>Как да разбирам резултатите?</summary><div class="disclosure-body"><div class="legend">${kindBadge('fact')} реални данни ${kindBadge('forecast')} публикувана прогноза ${kindBadge('model')} изчисление на модела ${kindBadge('ai')} генериран от AI текст</div></div></details>
  <h2>Професии, подходящи за теб</h2>
  <div class="grid g3">${r.occupations.map((o) => `<a class="card occ-card" href="#/occupation/${o.id}" style="text-decoration:none">
    <div class="spread"><span class="badge b-model">съвпадение ${o.match}%</span><b class="small">перспектива ${o.outlook.index ?? '—'}/100</b></div>
    <h3>${esc(o.title)}</h3><p class="small muted" style="margin:0">${esc(o.description)}</p><span class="more">Разгледай професията ↗</span></a>`).join('')}</div>

  <h2 style="margin-top:32px">Кои умения да развиваш и кога</h2>
  ${ai?.enabled && !ai.ok ? `<p class="small muted">AI обяснение не е показано: ${esc(ai.reason)}</p>` : ''}
  ${r.knownSkills?.length ? `<p class="small muted">Вече владееш: ${esc(r.knownSkills.join(', '))} – не е включено в плана.</p>` : ''}
  <div class="horizons">${r.horizons.map((h) => `<section class="card hz ${h.key}">
    <div class="hz-label">${esc(h.label)}</div><p class="small muted">${esc(h.subtitle)}</p>
    ${ai?.ok && ai.texts?.[h.key] ? `<div class="ai-box">${kindBadge('ai')} ${esc(ai.texts[h.key])}<div class="small muted">Модел ${esc(ai.model)} · само върху данните по-долу</div></div>` : ''}
    ${h.items.map((i) => `<div class="skill-rec">
      <h4><a href="#/skill/${i.skillId}">${esc(i.name)}</a></h4>
      <details class="recommendation-detail"><summary>Защо и как да започна?</summary><div><p class="small${i.fact.insufficient ? ' muted' : ''}" title="${esc(`${i.fact.source} · ${i.fact.period}`)}">${kindBadge(i.fact.kind)} ${esc(i.fact.text)}</p>${firstStepHtml(i.firstStep)}</div></details>
    </div>`).join('')}
  </section>`).join('')}</div>

  <details class="disclosure" style="margin-top:28px"><summary>Изпрати резултатите на имейла си</summary><div class="disclosure-body">
    <h2>Изпрати резултатите на имейла си</h2>
    <p class="muted small">Ще получиш препоръките, източниците и насоките за развитие. Имейлът се използва само за това изпращане и не се съхранява.</p>
    <form class="form" id="email-form">
      <input type="email" name="email" required placeholder="ime@example.com" autocomplete="email" aria-label="Имейл">
      <label class="check"><input type="checkbox" name="consent" required> Съгласен/съгласна съм резултатите да бъдат изпратени на този имейл.</label>
      <button class="btn btn-amber" type="submit">Изпрати</button>
      <p id="email-msg" class="small" role="status"></p>
    </form>
  </div></details>
  <details class="disclosure"><summary>Важно за резултатите</summary><div class="disclosure-body"><ul class="small muted">${r.disclaimers.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div></details>`;
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
  return `
  <div class="detail-page"><p class="eyebrow">ПРОЗРАЧНОСТ</p><h1>Откъде идват данните?</h1><p class="muted">Разгледай източниците, информация за пазара на труда и методологията на проекта.</p><div class="disclosure-stack"><details class="disclosure"><summary>Състояние на данните</summary><div class="disclosure-body">
  <div class="grid g4">
    <div class="card stat"><span class="small muted">Последна успешна актуализация</span><span class="v" style="font-size:1.1rem">${fmtDate(s.lastSuccessfulImport)}</span>
      ${s.stale ? `<span class="badge b-warn">${s.lastSuccessfulImport ? `остарели (> ${s.staleAfterHours} ч.)` : 'няма импорт'}</span>` : '<span class="badge b-ok">актуални</span>'}</div>
    <div class="card stat"><span class="small muted">Следващо планирано</span><span class="v" style="font-size:1.1rem">${fmtDate(s.nextScheduledRun)}</span><span class="small muted">06:00 ч. Europe/Sofia</span></div>
    <div class="card stat"><span class="small muted">Обяви в базата</span><span class="v">${fmtNum(s.counts.postings)}</span></div>
    <div class="card stat"><span class="small muted">Статистически наблюдения</span><span class="v">${fmtNum(s.counts.observations)}</span><span class="small muted">${fmtNum(s.counts.revisions)} ревизии · ${s.counts.metricDays} дни история</span></div>
  </div>
  <p class="small muted" style="margin-top:10px">${esc(s.schedule)}</p>
  ${s.storage?.warning ? `<p class="notice err" style="margin-top:10px">${esc(s.storage.warning)}</p>` : ''}

  </div></details><details class="disclosure"><summary>Пазарът на труда в цифри</summary><div class="disclosure-body"><section class="section">
    <div class="section-head"><h2>Пазарът на труда в цифри</h2><div class="legend">${kindBadge('fact')} официална статистика ${kindBadge('forecast')} публикувана прогноза</div></div>
    <div class="grid g2">
      <div class="card">
        <div class="spread"><h3>Коефициент на свободните работни места</h3>${kindBadge('fact')}</div>
        ${lineChart([jvr.BG, jvr.EU], { unit: '%', names: ['България', 'ЕС-27'] })}
        <p class="small muted">${esc(jvr.source)} · ${jvr.BG.length ? `${esc(jvr.BG[0].period)} – ${esc(jvr.BG[jvr.BG.length - 1].period)}` : 'няма данни'}</p>
      </div>
      <div class="card">
        <div class="spread"><h3>България до 2035 г.</h3>${kindBadge('forecast')}</div>
        <div class="grid g2" style="gap:12px">
          <div class="stat"><span class="v">${ch.openings_high_skill_pct.value}%</span><span class="small">${esc(ch.openings_high_skill_pct.label)}</span></div>
          <div class="stat"><span class="v">${ch.labour_force_high_qual_2035_pct.value}%</span><span class="small">${esc(ch.labour_force_high_qual_2035_pct.label)}</span></div>
        </div>
        <p style="margin-top:12px"><b>Най-голям очакван недостиг:</b></p>
        <div class="chips">${market.cedefop.shortages.map((s) => `<span class="chip alt">${esc(s.label)}</span>`).join('')}</div>
        <p class="small muted" style="margin-top:12px">${esc(market.cedefop.title)} · ${esc(market.cedefop.period)} · <a href="${esc(market.cedefop.url)}" rel="noopener">PDF</a></p>
      </div>
    </div>
  </section>

  </div></details><details class="disclosure"><summary>Най-бързо растящите умения</summary><div class="disclosure-body"><section class="section">
    <div class="section-head"><h2>Най-бързо растящите умения</h2>${kindBadge('forecast')}</div>
    <div class="grid g4">${market.wef.growingSkills.slice(0, 8).map((s) => `<div class="card"><span class="muted small">№${s.rank}</span><h3 style="margin:4px 0 0">${esc(s.label)}</h3></div>`).join('')}</div>
    <p class="small muted" style="margin-top:10px">${esc(market.wef.title)}, период ${esc(market.wef.period)}. <a href="#/skills">Виж как тези умения се търсят в реалните обяви →</a></p>
  </section>


  </div></details><details class="disclosure"><summary>Статус на източниците</summary><div class="disclosure-body"><h2>Статус на източниците</h2>
  <div class="table-wrap"><table><thead><tr><th>Източник</th><th>Тип</th><th>Статус</th><th>Последен успех</th><th>Период на данните</th><th>Условия</th></tr></thead><tbody>
  ${s.sources.map((x) => `<tr>
    <td><a href="${esc(x.url)}" rel="noopener" target="_blank"><b>${esc(x.name)}</b></a><div class="small muted">${esc(x.updateFrequency)}</div></td>
    <td>${x.kind === 'api' ? kindBadge('fact') + ' API' : x.kind === 'published_report' ? kindBadge('forecast') + ' доклад' : '—'}</td>
    <td><span class="badge ${(ST[x.status] || ST.never)[1]}">${(ST[x.status] || ST.never)[0]}</span>${x.stale ? ' <span class="badge b-warn">остарели</span>' : ''}
      ${x.lastError ? `<div class="small" style="color:var(--coral);max-width:260px">${esc(x.lastError.slice(0, 160))}</div>` : ''}</td>
    <td class="num">${fmtDate(x.lastSuccessAt)}</td>
    <td class="small">${esc(x.dataPeriod || '—')}</td>
    <td class="small muted" style="max-width:280px">${esc(x.terms)}</td></tr>`).join('')}
  </tbody></table></div>

  </div></details><details class="disclosure"><summary>История на обновяванията</summary><div class="disclosure-body"><h2>История на обновяванията</h2>
  ${s.runs.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Дата</th><th>Задействане</th><th>Статус</th><th>Резултат</th></tr></thead><tbody>
  ${s.runs.map((r) => `<tr><td>${r.id}</td><td class="num">${fmtDate(r.started_at)}</td><td>${esc({ scheduled: 'планирано', manual: 'ръчно', cli: 'команда' }[r.trigger] || r.trigger)}</td>
    <td><span class="badge ${RS[r.status] || 'b-off'}">${RSL[r.status] || esc(r.status)}</span></td>
    <td class="small">${esc(r.message || '')}${r.sources.length ? `<details><summary>По източници</summary><ul>${r.sources.map((x) => `<li><b>${esc(x.source_id)}</b>: ${esc(x.status)} – нови ${x.inserted}, обновени ${x.updated}, дубликати ${x.duplicates}, отхвърлени ${x.rejected}${x.error ? ` · <span style="color:var(--coral)">${esc(x.error.slice(0, 200))}</span>` : ''}</li>`).join('')}</ul></details>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : NA('Още няма изпълнения.')}

  </div></details><details class="disclosure"><summary>Методология</summary><div class="disclosure-body"><h2>Методология</h2>
  <p>Фактическите данни (Eurostat, ESCO, обяви) се показват отделно от публикуваните прогнози (Cedefop, WEF) и от изчисленията на модела на Future Jobs.</p><pre id="methodology-text" class="methodology">Зареждане…</pre>

  </div></details><details class="disclosure"><summary>Администрация</summary><div class="disclosure-body"><h2>Администрация</h2>
  <form class="card form" id="admin-form">
    <p class="small muted" style="margin:0">Ръчно обновяване на данните (изисква администраторски токен; токенът не се запазва).</p>
    <input type="password" name="token" placeholder="ADMIN_TOKEN" autocomplete="off" aria-label="Администраторски токен" value="${esc(adminToken)}">
    <button class="btn btn-primary" type="submit" ${s.running ? 'disabled' : ''}>${s.running ? 'Обновяване тече…' : 'Обнови сега'}</button>
    <p id="admin-msg" class="small" role="status"></p>
  </form>
  <form class="card form" id="test-email-form" style="margin-top:16px">
    <p class="small muted" style="margin:0"><b>Тест на имейла.</b> Изпраща пробен имейл и показва точната грешка от пощенския сървър (използва въведения по-горе ADMIN_TOKEN).</p>
    <input type="email" name="to" placeholder="Получател (по подразбиране SMTP_USER)" aria-label="Получател на тестовия имейл">
    <button class="btn btn-ghost" type="submit">Изпрати тестов имейл</button>
    <div id="test-email-msg" class="small" role="status"></div>
  </form></div></details></div></div>`;
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

async function render({ scroll = true } = {}) {
  const hash = location.hash || '#/';
  const r = routes.find(([re]) => re.test(hash)) || routes[0];
  const m = hash.match(r[0]);
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === r[1]));
  document.querySelector('.nav').classList.remove('open'); document.querySelector('.menu-toggle').setAttribute('aria-expanded', 'false');
  if (scroll) $main.innerHTML = '<p class="loading">Зареждане…</p>';
  try {
    $main.innerHTML = await r[2](m && m[1]);
  } catch (err) {
    $main.innerHTML = `<p class="notice err">Грешка: ${esc(err.message)}</p>`;
  }
  if (scroll) { window.scrollTo(0, 0); $main.focus({ preventScroll: true }); }
}

$main.addEventListener('toggle', async (e) => {
  const details = e.target;
  if (!(details instanceof HTMLDetailsElement) || !details.open) return;
  const text = details.querySelector('#methodology-text');
  if (!text || text.dataset.loaded) return;
  try { const response = await fetch('/METHODOLOGY.md'); if (!response.ok) throw new Error(); text.textContent = await response.text(); text.dataset.loaded = 'true'; }
  catch { text.textContent = 'Методологията не можа да се зареди. Опитай отново.'; }
}, true);

$main.addEventListener('input', async (e) => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.search) return;
  const position = input.selectionStart;
  if (input.dataset.search === 'occupation') occQuery = input.value;
  if (input.dataset.search === 'skill') skillQuery = input.value;
  await render({ scroll: false });
  const replacement = $main.querySelector(`input[data-search="${input.dataset.search}"]`);
  if (replacement) { replacement.focus(); if (position !== null) { try { replacement.setSelectionRange(position, position); } catch { /* browser may not support selection for search */ } } }
});

document.querySelector('.menu-toggle').addEventListener('click', (e) => {
  const nav = document.querySelector('.nav'); const open = nav.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});
$main.addEventListener('click', async (e) => {
  const t = /** @type {HTMLElement} */ (e.target).closest('button');
  if (!t) return;
  if (t.dataset.filter !== undefined) { occFilter = t.dataset.filter || null; return render({ scroll: false }); }
  if (t.dataset.sort) { skillSort = t.dataset.sort; skillCompareOpen = true; return render({ scroll: false }); }
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
  if (act === 'submit') {
    t.setAttribute('disabled', ''); t.textContent = 'Изчисляване…';
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
      await api('/api/email', { method: 'POST', body: JSON.stringify({ answers: quizState.answers, email, consent: fd.get('consent') === 'on', ai: Boolean(quizState.result?.ai?.ok) }) });
      msg.innerHTML = `✅ Изпратено на <b>${esc(email)}</b>. Провери пощата си (и папка „Спам“). Сгрешен адрес? Поправи го в полето и натисни „Изпрати отново“.`;
      btn.textContent = 'Изпрати отново';
    } catch (err) { msg.textContent = `❌ ${err.message}`; }
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
        : `<p class="notice err">❌ ${esc(r.error)}</p><p><b>Какво да направиш:</b> ${esc(r.hint)}</p><p class="muted">${cfg}</p>`;
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

window.addEventListener('hashchange', () => render());
loadFreshness();
render();
