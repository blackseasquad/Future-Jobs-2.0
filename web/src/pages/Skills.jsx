import { useMemo, useRef, useState } from 'react';
import { useApi } from '../lib/api.js';
import { fmtPct, outlookWord, plural, pp, SKILL_CAT, trend } from '../lib/format.js';
import { Acc, BackLink, ConfBadge, ErrorBox, KindBadge, Kpi, LineChart, Loading, NA, NewBadge, PageHead } from '../components/ui.jsx';

const SORTS = { score: 'Най-перспективни', demand: 'Най-търсени сега', change: 'Най-бързо растящи', name: 'По азбучен ред' };
const KEY = { score: (s) => s.score ?? -1, demand: (s) => s.demandShare ?? -1, change: (s) => s.change90 ?? s.change30 ?? -9, long: (s) => s.longTerm ?? -1 };

function Change({ s }) {
  const v = s.change90 ?? s.change30;
  if (v === null || v === undefined) return <NA>нужна е история</NA>;
  return <><span className={v >= 0 ? 'up' : 'down'}>{v >= 0 ? '+' : ''}{pp(v)}</span> <span className="muted small">{s.change90 !== null ? '90 д.' : '30 д.'}</span></>;
}

export function Skills() {
  const { data: d, error } = useApi('skills', '/api/skills');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('score');
  const tableRef = useRef(null);
  const list = useMemo(() => {
    if (!d) return [];
    const sorted = [...d.skills].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'bg') : KEY[sort](b) - KEY[sort](a)));
    const t = q.trim().toLowerCase();
    return t ? sorted.filter((s) => s.name.toLowerCase().includes(t)) : sorted;
  }, [d, q, sort]);
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const sortBy = (k) => { setSort(k); if (tableRef.current) tableRef.current.open = true; };
  const Th = ({ k, children }) => <th scope="col">{k ? <button type="button" className="th-btn" onClick={() => sortBy(k)}>{children}{sort === k ? ' ↓' : ''}</button> : children}</th>;
  return (
    <section className="sec top"><div className="wrap stack">
      <PageHead eyebrow="Инвестирай в себе си" title="Умения, които отварят врати." lead="Разгледай уменията и открий с какво да започнеш." />
      <div className="toolbar">
        <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="⌕  Потърси умение" aria-label="Потърси умение" />
        <select className="search" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Подреждане">
          {Object.entries(SORTS).map(([k, t]) => <option key={k} value={k}>Подреди: {t.toLowerCase()}</option>)}
        </select>
      </div>
      <span className="count" aria-live="polite">{plural(list.length, 'умение', 'умения')}</span>
      <div className="grid g4">
        {list.map((s) => {
          const t = trend(s);
          return (
            <a key={s.id} className="card" href={`#/skill/${s.id}`}>
              <span className="kick">Умение · <span>{SKILL_CAT[s.category] || ''}</span></span>
              <span className="card-title" style={{ fontSize: 18 }}>{s.name}</span>
              <NewBadge show={s.dynamic} />
              <span className="card-desc">{s.description}</span>
              <span className="more">{t && <span className={t[1]} style={{ marginRight: 8 }}>{t[0]}</span>}Разгледай умението ↗</span>
            </a>
          );
        })}
      </div>
      {!list.length && <p className="na">Няма умения, които отговарят на търсенето.</p>}
      <details className="acc" ref={tableRef}>
        <summary>Сравни всички умения в таблица</summary>
        <div className="acc-body">
          <p className="small"><KindBadge kind="model" /> <b>Future Skills Score</b> е относителна оценка 0–100: търсене {d.weights.demand * 100}%, динамика {d.weights.momentum * 100}%, дългосрочна перспектива {d.weights.longTerm * 100}%, приложимост {d.weights.breadth * 100}%, обучение {d.weights.learning * 100}%. Не е научно доказана прогноза. <a href="/METHODOLOGY.md">Методология</a></p>
          <div className="table-wrap"><table style={{ minWidth: 820 }}>
            <thead><tr><Th k="name">Умение</Th><Th k="score">Score</Th><Th k="demand">Търсене (30 дни)</Th><Th k="change">Промяна</Th><Th k="long">Дълг. перспектива</Th><Th>ESCO професии</Th><Th>Увереност</Th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td><a href={`#/skill/${s.id}`}>{s.name}</a>{s.wef && <> <span className="badge b-forecast" title="WEF Future of Jobs 2025">WEF №{s.wef.rank}</span></>}{s.dynamic && <> <span className="badge b-new">Ново</span></>}</td>
                  <td className="num">{s.score !== null ? <b>{s.score}</b> : <NA>—</NA>}</td>
                  <td className="num">{s.demandShare !== null ? <>{fmtPct(s.demandShare)} <span className="muted small">({s.postings}/{s.postingsTotal})</span></> : <NA />}</td>
                  <td className="num"><Change s={s} /></td>
                  <td className="num">{s.longTerm !== null ? `${s.longTerm}/100` : <NA />}</td>
                  <td className="num">{s.escoOccupations ?? <NA>—</NA>}</td>
                  <td><ConfBadge c={s.confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="small muted">Търсене = дял от обявите (Arbeitnow, Remotive) за последните 30 дни, в които се споменава умението. Изчислява се само при поне {d.minPostings} обяви. Обявите са основно от ЕС и дистанционни – не са представителни за България.</p>
        </div>
      </details>
    </div></section>
  );
}

const LBL = { demand: 'Текущо търсене', momentum: 'Динамика 30/90 д.', longTerm: 'Дълг. перспектива', breadth: 'Приложимост (ESCO)', learning: 'Обучение' };

export function SkillPage({ id }) {
  const { data: s, error } = useApi(`skill:${id}`, `/api/skills/${encodeURIComponent(id)}`);
  if (error) return <ErrorBox error={error} />;
  if (!s) return <Loading />;
  const d = s.details;
  const comp = d?.components || {};
  const hist = s.history.filter((h) => h.demand_share !== null).map((h) => ({ period: h.date, value: Math.round(h.demand_share * 1000) / 10 }));
  const histScore = s.history.filter((h) => h.score !== null).map((h) => ({ period: h.date, value: h.score }));
  const t = trend(s);
  const share = s.demandShare;
  const st = s.firstStep;
  const val = (x) => (x?.value !== null && x?.value !== undefined ? pp(x.value) : null);
  return (
    <section className="sec top"><div className="wrap stack">
      <PageHead back={<BackLink href="#/skills">Всички умения</BackLink>} eyebrow={`Умение${SKILL_CAT[s.category] ? ` · ${SKILL_CAT[s.category]}` : ''}`} title={s.name} lead={s.description} />
      {s.dynamic && <div className="callout fut-note"><span className="badge b-new">Ново · AI предложение</span><span className="small">Добавено автоматично при обновяването: {s.aiEvidence?.text} Описанието е от Gemini.</span></div>}
      <div className="kpis">
        <Kpi label="Търси се в" value={share ? `1 от ${Math.max(1, Math.round(1 / share))} обяви` : '—'} sub={share ? `${fmtPct(share)} · последните 30 дни` : `под ${d?.demand?.minRequired ?? 100} обяви – няма оценка`} />
        <Kpi label="Посока" value={t ? <span className={t[1]}>{t[0]}</span> : '—'} sub={t ? `за последните ${s.change90 !== null ? 90 : 30} дни` : 'нужна е по-дълга история'} />
        <Kpi label="Перспектива" value={outlookWord(s.score)} sub={s.score !== null ? `${s.score}/100 · Future Skills Score` : 'няма достатъчно данни'} />
      </div>
      {st && (
        <div className="callout"><span className="ico" aria-hidden="true">→</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="kick">Първа стъпка · {st.label || ''}</span>
            <span className="t">{st.url ? <a href={st.url} target="_blank" rel="noopener noreferrer">{st.text}</a> : st.text}</span></div>
        </div>
      )}
      <div className="acc-list">
        <Acc title="Свързани професии" hint={s.futureOccupations?.length ? `✦ ${s.futureOccupations.length} бъдещи` : ''}>
          <div className="chips">{s.occupations.length ? s.occupations.map((o) => <a key={o.id} className={`chip ${o.core ? '' : 'alt'}`} href={`#/occupation/${o.id}`}>{o.title}</a>) : <NA />}</div>
          {s.futureOccupations?.length > 0 && <><b className="small">✦ Нужно и за бъдещи професии</b><div className="chips">{s.futureOccupations.map((f) => <a key={f.id} className="chip fchip-l" href={`#/future/${f.id}`}>{f.title} · ~{f.expected}</a>)}</div></>}
        </Acc>
        <Acc title="Къде да науча това умение?">
          <ul className="ev">{s.resources.map((r) => (
            <li key={r.url}><span className={`badge ${r.free ? 'b-fact' : 'b-off'}`}>{r.free ? 'безплатно' : 'платено'}</span><span><a href={r.url} rel="noopener noreferrer" target="_blank">{r.title}</a><span className="src">{r.provider} · {r.lang}</span></span></li>
          ))}</ul>
        </Acc>
        <Acc title="Търсене и перспектива">
          <div className="bars">{Object.keys(LBL).map((k) => <div key={k} className="bar"><span>{LBL[k]}</span><div className="meter"><i style={{ width: `${comp[k] ?? 0}%` }} /></div><b>{comp[k] ?? '—'}</b></div>)}</div>
          <p className="small muted"><KindBadge kind="model" /> Персентил спрямо останалите умения. „—“ = няма достатъчно данни и компонентът не участва. <ConfBadge c={s.confidence} /></p>
          <dl className="kv">
            <dt>Търсене</dt><dd>{d?.demand?.share !== null && d?.demand?.share !== undefined ? <><b>{fmtPct(d.demand.share)}</b> от обявите ({d.demand.postings} от {d.demand.total}) <KindBadge kind="fact" /></> : <NA>под {d?.demand?.minRequired ?? 100} обяви</NA>}</dd>
            <dt>Период</dt><dd>{d?.window?.current || '—'}</dd>
            <dt>Промяна 30 д.</dt><dd>{val(d?.change30) || <NA>{d?.change30?.reason || 'нужна е по-дълга история'}</NA>}</dd>
            <dt>Промяна 90 д.</dt><dd>{val(d?.change90) || <NA>{d?.change90?.reason || 'нужна е по-дълга история'}</NA>}</dd>
            <dt>WEF</dt><dd>{s.wef ? <>„{s.wef.label}“ – №{s.wef.rank} растящо умение до 2030 <KindBadge kind="forecast" /></> : '—'}</dd>
            <dt>ESCO</dt><dd>{s.esco ? <><a href={s.esco.uri} rel="noopener noreferrer" target="_blank">{s.esco.label_bg}</a> · {s.esco.essential_for_count ?? 0} съществено / {s.esco.optional_for_count ?? 0} по избор за професии</> : <NA />}</dd>
          </dl>
        </Acc>
        <Acc title="История и още данни">
          <div className="grid g2">
            <div className="panel"><h3>Дял в обявите, % <KindBadge kind="fact" /></h3><LineChart series={[hist]} unit="%" names={['Търсене']} /></div>
            <div className="panel"><h3>Future Skills Score <KindBadge kind="model" /></h3><LineChart series={[histScore]} names={['Score']} /></div>
          </div>
          <span className="small muted">Графиките се попълват с всяко ежедневно обновяване.</span>
          <b className="small">Често се търси заедно с</b>
          {d?.cooccurrence?.length ? <div className="chips">{d.cooccurrence.map((c) => <a key={c.skill} className="chip sm" href={`#/skill/${c.skill}`} title={`${c.n} общи обяви, lift ${String(c.lift).replace('.', ',')}`}>{c.name}</a>)}</div> : <NA />}
          <details className="mini"><summary>Синоними, по които се разпознава в обявите</summary><p>{s.synonyms.join(', ')}</p></details>
        </Acc>
      </div>
    </div></section>
  );
}
