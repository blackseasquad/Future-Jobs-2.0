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
  const [market, status, examples] = await Promise.all([cached('market', () => api('/api/market')), loadFreshness(), exampleResults()]);
  const h = Object.fromEntries(market.wef.headline.map((x) => [x.key, x]));
  const shown = examples.filter(Boolean);
  return `
  <section class="hero">
    <div>
      <p class="badge b-ok">EduHack.bg · за ученици и млади хора</p>
      <h1>Какво да уча <span>днес</span>, за да имам работа <span>утре</span>?</h1>
      <p class="lead">Future Jobs събира всеки ден реални данни за пазара на труда и дългосрочни прогнози и ти показва кои умения да развиваш – сега, след 2–5 и след 5–10 години.</p>
      <div class="row"><a class="btn btn-amber" href="#/quiz">Направи анкетата (2 мин.)</a></div>
      <p class="small muted" style="margin-top:14px">${status?.lastSuccessfulImport ? `Последно обновяване: <b>${fmtDate(status.lastSuccessfulImport)}</b> · следващо: ${fmtDate(status.nextScheduledRun)}` : 'Данните още не са импортирани.'}</p>
    </div>
    <aside class="hero-panel" aria-label="Ключови прогнози">
      <h3>До 2030 г. според WEF</h3>
      <ul>
        <li><div class="big">${h.jobs_created_m.value} млн.</div>нови работни места глобално, ${h.jobs_displaced_m.value} млн. изместени</li>
        <li><div class="big">${h.skills_change_pct.value}%</div>от ключовите умения ще се променят</li>
      </ul>
      <p class="src">Прогноза · ${esc(market.wef.title)} · ${esc(market.wef.method)}</p>
    </aside>
  </section>
${shown.length ? `
  <section class="section">
    <div class="section-head"><h2>Примерни резултати</h2>${kindBadge('model')}</div>
    <div class="grid g3">${shown.map((e) => `<a class="card occ-card" href="#/quiz" style="text-decoration:none">
      <span class="badge b-off" style="align-self:flex-start">Пример</span>
      <p class="small muted" style="margin:0">Профил: <b>${esc(e.label)}</b></p>
      <h3>${esc(e.occupation.title)}</h3>
      <div class="spread small"><span>съвпадение ${e.occupation.match}%</span><span>перспектива ${e.occupation.outlook.index ?? '—'}/100</span></div>
      <p class="small" style="margin:0"><b>Първи умения (6–12 месеца):</b></p>
      <div class="chips">${e.skills.map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</div>
    </a>`).join('')}</div>
    <p class="small muted" style="margin-top:10px">Изчислени от модела на Future Jobs за примерни отговори в анкетата, със същите данни. <a href="#/quiz">Виж своя резултат →</a></p>
  </section>` : ''}`;
}

const INTEREST_FILTERS = ['Технологии', 'Данни и анализ', 'Творчество и дизайн', 'Работа с хора', 'Грижа и помощ', 'Природа и устойчивост', 'Бизнес и организация', 'Практическа/техническа работа'];
let occFilter = null;

async function pageOccupations() {
  const { occupations } = await cached('occ', () => api('/api/occupations'));
  const list = occFilter ? occupations.filter((o) => o.interests.includes(occFilter)) : occupations;
  return `
  <div class="section-head"><div><h1>Каталог на бъдещите професии</h1>
    <p class="muted">${occupations.length} професии с перспектива, свързани умения и официални данни за заплащането.</p></div>
    <div class="legend">${kindBadge('fact')} ${kindBadge('forecast')} ${kindBadge('model')}</div></div>
  <div class="filters" role="group" aria-label="Филтър по интереси">
    <button data-filter="" aria-pressed="${!occFilter}">Всички</button>
    ${INTEREST_FILTERS.map((f) => `<button data-filter="${esc(f)}" aria-pressed="${occFilter === f}">${esc(f)}</button>`).join('')}
  </div>
  <div class="grid g3">${list.map(occCard).join('')}</div>`;
}

function salaryLine(s) {
  if (!s?.bg) return NA('няма данни за заплатите');
  return `<b>≈ ${fmtNum(s.bg.monthlyApprox)} €/мес.</b> бруто <span class="muted small">(средно за „${esc(s.group)}“, България, ${esc(s.bg.period)})</span>`;
}

function occCard(o) {
  return `<a class="card occ-card" href="#/occupation/${o.id}" style="text-decoration:none">
    <div class="spread"><span class="muted small">${esc(o.iscoLabel)}</span>${o.wefFastest ? `<span class="badge b-forecast">WEF +${o.wefFastest.pct}%</span>` : o.wefLargest ? '<span class="badge b-forecast">WEF ръст</span>' : ''}</div>
    <h3>${esc(o.title)}</h3>
    <p class="small muted" style="margin:0">${esc(o.description)}</p>
    <div><div class="spread small"><span>Перспектива ${kindBadge('model')}</span><b>${o.outlook.index ?? '—'}/100</b></div><div class="meter"><i style="width:${o.outlook.index ?? 0}%"></i></div></div>
    <div class="small">${salaryLine(o.salary)}</div>
    <div class="chips">${o.coreSkills.map((s) => `<span class="chip">${esc(s.name)}</span>`).join('')}</div>
  </a>`;
}

function signalsList(signals) {
  return `<ul class="ev">${signals.map((s) => `<li>${kindBadge(s.type)}<span>${s.value > 0 ? '▲' : s.value < 0 ? '▼' : '•'} ${esc(s.text)}<span class="src">${esc(s.source)} · ${esc(s.period)}</span></span></li>`).join('')}</ul>`;
}

async function pageOccupation(id) {
  const o = await api(`/api/occupations/${encodeURIComponent(id)}`);
  const emp = o.employment;
  const ess = o.escoSkills.filter((s) => s.relation === 'essential');
  return `
  <a class="detail-back" href="#/occupations">← Към каталога</a>
  <div class="spread"><h1>${esc(o.title)}</h1>${o.wefFastest ? `<span class="badge b-forecast">WEF: +${o.wefFastest.pct}% до 2030</span>` : ''}</div>
  <p class="lead muted">${esc(o.description)}</p>
  <div class="grid g2">
    <div class="card">
      <div class="spread"><h3>Дългосрочна перспектива</h3><span class="score">${o.outlook.index ?? '—'}</span></div>
      <p class="small muted">Индекс 0–100 = дял на положителните сигнали от наличните (модел на Future Jobs, не прогноза за конкретен брой работни места).</p>
      ${signalsList(o.outlook.signals)}
    </div>
    <div class="card">
      <h3>Заплащане ${kindBadge('fact')}</h3>
      ${o.salary?.bg ? `<dl class="kv"><dt>България</dt><dd><b>${fmtNum(o.salary.bg.annual)} €/год.</b> (≈ ${fmtNum(o.salary.bg.monthlyApprox)} €/мес.)</dd>
        ${o.salary.eu ? `<dt>ЕС-27</dt><dd>${fmtNum(o.salary.eu.annual)} €/год. (≈ ${fmtNum(o.salary.eu.monthlyApprox)} €/мес.)</dd>` : ''}
        <dt>Група</dt><dd>${esc(o.salary.group)}</dd><dt>Период</dt><dd>${esc(o.salary.bg.period)}</dd></dl>
        <p class="small muted" style="margin-top:8px">${esc(o.salary.note)} Източник: ${esc(o.salary.source)}.</p>` : NA('Данните за заплатите още не са импортирани.')}
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="spread"><h3>Заети в професионалната група „${esc(o.iscoLabel)}“ (хил. души)</h3>${kindBadge('fact')}</div>
    ${emp.BG ? lineChart([emp.BG.series], { names: ['България'] }) : NA()}
    <p class="small muted">${esc(emp.source)}${emp.BG?.breaks ? ' · Внимание: прекъсване на редицата (методологична промяна).' : ''}</p>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>Умения в Future Jobs</h3>
      <p class="small"><b>Основни:</b></p><div class="chips">${o.coreSkills.map((s) => `<a class="chip" href="#/skill/${s.id}">${esc(s.name)}</a>`).join('')}</div>
      <p class="small" style="margin-top:10px"><b>Допълващи:</b></p><div class="chips">${o.complementarySkills.map((s) => `<a class="chip alt" href="#/skill/${s.id}">${esc(s.name)}</a>`).join('')}</div>
    </div>
    <div class="card"><div class="spread"><h3>Съществени умения по ESCO</h3>${kindBadge('fact')}</div>
      ${o.esco ? `<p class="small muted">ESCO: <a href="${esc(o.esco.uri)}" rel="noopener">${esc(o.esco.label_bg)}</a> (код ${esc(o.esco.code)})</p>
      <div class="chips">${ess.slice(0, 24).map((s) => `<span class="chip alt">${esc(s.to_label)}</span>`).join('') || NA()}</div>` : NA('ESCO данните още не са импортирани.')}
    </div>
  </div>`;
}

let skillSort = 'score';
async function pageSkills() {
  const d = await cached('skills', () => api('/api/skills'));
  const key = { score: (s) => s.score ?? -1, demand: (s) => s.demandShare ?? -1, change: (s) => s.change90 ?? s.change30 ?? -9, long: (s) => s.longTerm ?? -1, name: (s) => s.name };
  const list = [...d.skills].sort((a, b) => (skillSort === 'name' ? a.name.localeCompare(b.name, 'bg') : key[skillSort](b) - key[skillSort](a)));
  const th = (k, t) => `<th><button data-sort="${k}" aria-label="Сортирай по ${t}">${t}${skillSort === k ? ' ↓' : ''}</button></th>`;
  const change = (s) => {
    const v = s.change90 ?? s.change30;
    if (v === null || v === undefined) return NA('нужна е история');
    return `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${(v * 100).toFixed(2).replace('.', ',')} п.п.</span> <span class="muted small">${s.change90 !== null ? '90 д.' : '30 д.'}</span>`;
  };
  return `
  <div class="section-head"><div><h1>Умения на бъдещето</h1>
    <p class="muted">Показатели за ${d.skills.length} умения, изчислени от реалните данни при всяко ежедневно обновяване.</p></div>
    <a class="btn btn-ghost" href="/METHODOLOGY.md">Методология</a></div>
  <div class="notice" style="margin-bottom:16px"><b>Future Skills Score</b> ${kindBadge('model')} е собствена относителна оценка (0–100) спрямо останалите проследявани умения: търсене ${d.weights.demand * 100}%, динамика ${d.weights.momentum * 100}%, дългосрочна перспектива ${d.weights.longTerm * 100}%, приложимост ${d.weights.breadth * 100}%, обучение ${d.weights.learning * 100}%. Не е научно доказана прогноза.</div>
  <div class="table-wrap"><table>
    <thead><tr>${th('name', 'Умение')}${th('score', 'Score')}${th('demand', 'Търсене (30 д.)')}${th('change', 'Промяна')}${th('long', 'Дълг. перспектива')}<th>ESCO професии</th><th>Увереност</th></tr></thead>
    <tbody>${list.map((s) => `<tr>
      <td><a href="#/skill/${s.id}"><b>${esc(s.name)}</b></a>${s.wef ? ` <span class="badge b-forecast" title="WEF Future of Jobs 2025">WEF №${s.wef.rank}</span>` : ''}</td>
      <td>${s.score !== null ? `<span class="score">${s.score}</span>` : NA('—')}</td>
      <td class="num">${s.demandShare !== null ? `${fmtPct(s.demandShare)} <span class="muted small">(${s.postings}/${s.postingsTotal})</span>` : NA()}</td>
      <td class="num">${change(s)}</td>
      <td class="num">${s.longTerm !== null ? `${s.longTerm}/100` : NA()}</td>
      <td class="num">${s.escoOccupations ?? NA('—')}</td>
      <td>${confBadge(s.confidence)}</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="small muted" style="margin-top:8px">Търсене = дял от обявите (Arbeitnow, Remotive) за последните 30 дни, в които се споменава умението. Изчислява се само при поне ${d.minPostings} обяви. Обявите са основно от Германия/ЕС и дистанционни – не са представителни за България.</p>`;
}

async function pageSkill(id) {
  const s = await api(`/api/skills/${encodeURIComponent(id)}`);
  const d = s.details;
  const comp = d?.components || {};
  const LBL = { demand: 'Текущо търсене', momentum: 'Динамика 30/90 д.', longTerm: 'Дълг. перспектива', breadth: 'Приложимост', learning: 'Обучение' };
  const hist = s.history.filter((h) => h.demand_share !== null).map((h) => ({ period: h.date, value: Math.round(h.demand_share * 1000) / 10 }));
  const histScore = s.history.filter((h) => h.score !== null).map((h) => ({ period: h.date, value: h.score }));
  return `
  <a class="detail-back" href="#/skills">← Към уменията</a>
  <div class="spread"><h1>${esc(s.name)}</h1>${s.score !== null ? `<span class="score" style="font-size:1.3rem;height:44px;min-width:64px">${s.score}</span>` : ''}</div>
  <p class="lead muted">${esc(s.description)}</p>
  <div class="grid g2">
    <div class="card"><div class="spread"><h3>Компоненти на оценката</h3>${kindBadge('model')}</div>
      ${Object.keys(LBL).map((k) => `<div class="bar"><span>${LBL[k]}</span><div class="meter"><i style="width:${comp[k] ?? 0}%"></i></div><b>${comp[k] ?? '—'}</b></div>`).join('')}
      <p class="small muted" style="margin-top:10px">Персентил (0–100) спрямо останалите умения. „—“ = няма достатъчно данни; такъв компонент не участва в оценката. ${confBadge(s.confidence)}</p>
    </div>
    <div class="card"><div class="spread"><h3>Данни</h3>${kindBadge('fact')}</div>
      <dl class="kv">
        <dt>Търсене</dt><dd>${d?.demand?.share !== null && d?.demand?.share !== undefined ? `${fmtPct(d.demand.share)} от ${d.demand.total} обяви` : NA(`под ${d?.demand?.minRequired ?? 100} обяви`)}</dd>
        <dt>Период</dt><dd>${esc(d?.window?.current || '—')}</dd>
        <dt>Промяна 30 д.</dt><dd>${d?.change30?.value !== null && d?.change30?.value !== undefined ? `${(d.change30.value * 100).toFixed(2)} п.п.` : NA(d?.change30?.reason || '—')}</dd>
        <dt>Промяна 90 д.</dt><dd>${d?.change90?.value !== null && d?.change90?.value !== undefined ? `${(d.change90.value * 100).toFixed(2)} п.п.` : NA(d?.change90?.reason || '—')}</dd>
        <dt>ESCO</dt><dd>${s.esco ? `<a href="${esc(s.esco.uri)}" rel="noopener">${esc(s.esco.label_bg)}</a> · ${(s.esco.essential_for_count ?? 0)} съществено / ${(s.esco.optional_for_count ?? 0)} по избор за професии` : NA()}</dd>
        <dt>WEF</dt><dd>${s.wef ? `„${esc(s.wef.label)}“ – №${s.wef.rank} растящо умение до 2030 ${kindBadge('forecast')}` : '—'}</dd>
      </dl>
    </div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>История: дял в обявите (%)</h3>${lineChart([hist], { unit: '%', names: ['Търсене'] })}</div>
    <div class="card"><h3>История: Future Skills Score</h3>${lineChart([histScore], { names: ['Score'] })}</div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>Често се търси заедно с</h3>
      ${d?.cooccurrence?.length ? `<ul class="ev">${d.cooccurrence.map((c) => `<li>${kindBadge('fact')}<span><a href="#/skill/${c.skill}">${esc(c.name)}</a> – ${c.n} общи обяви, lift ${String(c.lift).replace('.', ',')}</span></li>`).join('')}</ul>` : NA()}
      <h3 style="margin-top:16px">Професии</h3><div class="chips">${s.occupations.map((o) => `<a class="chip ${o.core ? '' : 'alt'}" href="#/occupation/${o.id}">${esc(o.title)}</a>`).join('')}</div>
    </div>
    <div class="card"><h3>Къде да го науча</h3>
      <ul class="ev">${s.resources.map((r) => `<li><span class="badge ${r.free ? 'b-ok' : 'b-off'}">${r.free ? 'безплатно' : 'платено'}</span><span><a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.title)}</a><span class="src">${esc(r.provider)} · ${esc(r.lang)}</span></span></li>`).join('')}</ul>
      <details><summary>Синоними, по които се разпознава в обявите</summary><p class="small muted">${s.synonyms.map(esc).join(', ')}</p></details>
    </div>
  </div>`;
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

function renderResult(r) {
  const ai = r.ai;
  return `
  <div class="section-head"><div><p class="badge b-ok">Твоят резултат</p><h1>Твоят план за бъдещите умения</h1>
    <p class="muted">Интереси: <b>${esc(r.profile.topInterests.join(', '))}</b> · данни към ${fmtDate(r.dataAsOf)}</p></div>
    <button class="btn btn-ghost" data-act="restart">Започни отначало</button></div>
  ${!r.dataAsOf ? '<p class="notice">Все още няма импортирани данни от пазара на труда – препоръките се основават само на публикуваните прогнози и каталога.</p>' : ''}
  <div class="legend" style="margin-bottom:12px">${kindBadge('fact')} реални данни ${kindBadge('forecast')} публикувана прогноза ${kindBadge('model')} изчисление на Future Jobs ${kindBadge('ai')} генериран от AI текст</div>
  <h2>Професии, подходящи за теб</h2>
  <div class="grid g3">${r.occupations.map((o) => `<a class="card occ-card" href="#/occupation/${o.id}" style="text-decoration:none">
    <div class="spread"><span class="badge b-model">съвпадение ${o.match}%</span><b class="small">перспектива ${o.outlook.index ?? '—'}/100</b></div>
    <h3>${esc(o.title)}</h3><p class="small muted" style="margin:0">${esc(o.description)}</p><div class="small">${salaryLine(o.salary)}</div></a>`).join('')}</div>

  <h2 style="margin-top:32px">Кои умения да развиваш и кога</h2>
  ${ai?.enabled && !ai.ok ? `<p class="small muted">AI обяснение не е показано: ${esc(ai.reason)}</p>` : ''}
  ${r.knownSkills?.length ? `<p class="small muted">Вече владееш: ${esc(r.knownSkills.join(', '))} – не е включено в плана.</p>` : ''}
  <div class="horizons">${r.horizons.map((h) => `<section class="card hz ${h.key}">
    <div class="hz-label">${esc(h.label)}</div><p class="small muted">${esc(h.subtitle)}</p>
    ${ai?.ok && ai.texts?.[h.key] ? `<div class="ai-box">${kindBadge('ai')} ${esc(ai.texts[h.key])}<div class="small muted">Модел ${esc(ai.model)} · само върху данните по-долу</div></div>` : ''}
    ${h.items.map((i) => `<div class="skill-rec">
      <div class="spread"><h4><a href="#/skill/${i.skillId}">${esc(i.name)}</a></h4>${i.score !== null ? `<span class="score" title="Future Skills Score (модел)">${i.score}</span>` : ''}</div>
      <p class="small" style="margin:0 0 6px">${i.why.map(esc).join(' ')}</p>
      ${confBadge(i.confidence)}
      <p class="small" style="margin:8px 0 0">${kindBadge(i.evidence[0].kind)} ${esc(i.evidence[0].text)}</p>
      <details><summary>Доказателства и източници (${i.evidence.length})</summary>${evidenceList(i.evidence)}</details>
      <details><summary>Конкретни стъпки и ресурси</summary><ol class="steps">${i.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <div class="chips">${i.resources.map((res) => `<a class="chip" href="${esc(res.url)}" target="_blank" rel="noopener">${esc(res.title)}${res.free ? ' · безплатно' : ''}</a>`).join('')}</div></details>
      ${i.nextSkills.length ? `<p class="small" style="margin-top:8px"><b>След това:</b> ${esc(i.nextSkills.join(', '))}</p>` : ''}
      <details><summary>Ограничения</summary><ul class="small">${i.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>
    </div>`).join('')}
  </section>`).join('')}</div>

  <section class="card" style="margin-top:28px">
    <h2>Изпрати резултатите на имейла си</h2>
    <p class="muted small">Ще получиш препоръките, източниците и насоките за развитие. Имейлът се използва само за това изпращане и не се съхранява.</p>
    <form class="form" id="email-form">
      <input type="email" name="email" required placeholder="ime@example.com" autocomplete="email" aria-label="Имейл">
      <label class="check"><input type="checkbox" name="consent" required> Съгласен/съгласна съм резултатите да бъдат изпратени на този имейл.</label>
      <button class="btn btn-amber" type="submit">Изпрати</button>
      <p id="email-msg" class="small" role="status"></p>
    </form>
  </section>
  <section style="margin-top:20px"><ul class="small muted">${r.disclaimers.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></section>`;
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
  <h1>Данни и източници</h1>
  <div class="grid g4">
    <div class="card stat"><span class="small muted">Последна успешна актуализация</span><span class="v" style="font-size:1.1rem">${fmtDate(s.lastSuccessfulImport)}</span>
      ${s.stale ? `<span class="badge b-warn">${s.lastSuccessfulImport ? `остарели (> ${s.staleAfterHours} ч.)` : 'няма импорт'}</span>` : '<span class="badge b-ok">актуални</span>'}</div>
    <div class="card stat"><span class="small muted">Следващо планирано</span><span class="v" style="font-size:1.1rem">${fmtDate(s.nextScheduledRun)}</span><span class="small muted">06:00 ч. Europe/Sofia</span></div>
    <div class="card stat"><span class="small muted">Обяви в базата</span><span class="v">${fmtNum(s.counts.postings)}</span></div>
    <div class="card stat"><span class="small muted">Статистически наблюдения</span><span class="v">${fmtNum(s.counts.observations)}</span><span class="small muted">${fmtNum(s.counts.revisions)} ревизии · ${s.counts.metricDays} дни история</span></div>
  </div>
  <p class="small muted" style="margin-top:10px">${esc(s.schedule)}</p>
  ${s.storage?.warning ? `<p class="notice err" style="margin-top:10px">${esc(s.storage.warning)}</p>` : ''}

  <section class="section">
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

  <section class="section">
    <div class="section-head"><h2>Най-бързо растящите умения</h2>${kindBadge('forecast')}</div>
    <div class="grid g4">${market.wef.growingSkills.slice(0, 8).map((s) => `<div class="card"><span class="muted small">№${s.rank}</span><h3 style="margin:4px 0 0">${esc(s.label)}</h3></div>`).join('')}</div>
    <p class="small muted" style="margin-top:10px">${esc(market.wef.title)}, период ${esc(market.wef.period)}. <a href="#/skills">Виж как тези умения се търсят в реалните обяви →</a></p>
  </section>


  <h2 style="margin-top:28px">Статус на източниците</h2>
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

  <h2 style="margin-top:28px">История на обновяванията</h2>
  ${s.runs.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Дата</th><th>Задействане</th><th>Статус</th><th>Резултат</th></tr></thead><tbody>
  ${s.runs.map((r) => `<tr><td>${r.id}</td><td class="num">${fmtDate(r.started_at)}</td><td>${esc({ scheduled: 'планирано', manual: 'ръчно', cli: 'команда' }[r.trigger] || r.trigger)}</td>
    <td><span class="badge ${RS[r.status] || 'b-off'}">${RSL[r.status] || esc(r.status)}</span></td>
    <td class="small">${esc(r.message || '')}${r.sources.length ? `<details><summary>По източници</summary><ul>${r.sources.map((x) => `<li><b>${esc(x.source_id)}</b>: ${esc(x.status)} – нови ${x.inserted}, обновени ${x.updated}, дубликати ${x.duplicates}, отхвърлени ${x.rejected}${x.error ? ` · <span style="color:var(--coral)">${esc(x.error.slice(0, 200))}</span>` : ''}</li>`).join('')}</ul></details>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : NA('Още няма изпълнения.')}

  <h2 style="margin-top:28px">Методология</h2>
  <div class="card"><p>Фактическите данни (Eurostat, ESCO, обяви) се показват отделно от публикуваните прогнози (Cedefop, WEF) и от изчисленията на модела на Future Jobs. Пълното описание на формулите, теглата и ограниченията е в <a href="/METHODOLOGY.md">METHODOLOGY.md</a>.</p></div>

  <h2 style="margin-top:28px">Администрация</h2>
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
  </form>`;
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
  if (scroll) $main.innerHTML = '<p class="loading">Зареждане…</p>';
  try {
    $main.innerHTML = await r[2](m && m[1]);
  } catch (err) {
    $main.innerHTML = `<p class="notice err">Грешка: ${esc(err.message)}</p>`;
  }
  if (scroll) { window.scrollTo(0, 0); $main.focus({ preventScroll: true }); }
}

$main.addEventListener('click', async (e) => {
  const t = /** @type {HTMLElement} */ (e.target).closest('button');
  if (!t) return;
  if (t.dataset.filter !== undefined) { occFilter = t.dataset.filter || null; return render({ scroll: false }); }
  if (t.dataset.sort) { skillSort = t.dataset.sort; return render({ scroll: false }); }
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
    btn.disabled = true; msg.textContent = 'Изпращане…';
    try {
      await api('/api/email', { method: 'POST', body: JSON.stringify({ answers: quizState.answers, email: fd.get('email'), consent: fd.get('consent') === 'on', ai: Boolean(quizState.result?.ai?.ok) }) });
      msg.textContent = '✅ Изпратено! Провери пощата си (и папка „Спам“).';
    } catch (err) { msg.textContent = `❌ ${err.message}`; btn.disabled = false; }
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
