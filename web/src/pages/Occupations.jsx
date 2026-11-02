import { useMemo, useState } from 'react';
import { useApi } from '../lib/api.js';
import { fmtNum, outlookWord, outlookPhrase, plural } from '../lib/format.js';
import { Acc, BackLink, ErrorBox, KindBadge, Kpi, LineChart, Loading, NA, NewBadge, PageHead, Signals } from '../components/ui.jsx';

const LEAD = 'Днешните професии с перспектива и такива, които се очаква да се появят до 10 години.';
const INTEREST_FILTERS = ['Технологии', 'Данни и анализ', 'Творчество и дизайн', 'Работа с хора', 'Грижа и помощ', 'Природа и устойчивост', 'Бизнес и организация', 'Практическа/техническа работа'];
const FILTER_SHORT = { 'Творчество и дизайн': 'Творчество', 'Природа и устойчивост': 'Природа', 'Бизнес и организация': 'Бизнес', 'Практическа/техническа работа': 'Практическа работа' };
const EVIDENCE = {
  strong: ['Силни доказателства', 'ev-s', 'закон или регламент с конкретни дати'],
  medium: ['Средни доказателства', 'ev-m', 'доклади и тенденции'],
  ai: ['AI прогноза – непотвърдено', 'b-ai', 'предложение на Gemini по ръст на умение в обявите'],
};

function Tabs({ on, counts }) {
  const t = [['today', 'Търсени днес', counts.today, '#/occupations'], ['future', '✦ Професии на бъдещето', counts.future, '#/occupations/future'], ['changing', 'Професии, които ИИ променя', counts.changing, '#/occupations/changing']];
  return (
    <nav className="tabs" aria-label="Видове професии">
      {t.map(([k, label, n, href]) => <a key={k} className={`tab${k === on ? ' on' : ''}`} href={href} aria-current={k === on ? 'page' : undefined}>{label}<span className="n">{n ?? ''}</span></a>)}
    </nav>
  );
}

export function Occupations({ tab }) {
  const occ = useApi('occ', '/api/occupations');
  const fut = useApi('future', '/api/future');
  if (occ.error || fut.error) return <ErrorBox error={occ.error || fut.error} />;
  const counts = { today: occ.data?.occupations.length, future: fut.data?.future.length, changing: fut.data?.changing.length };
  return (
    <section className="sec top"><div className="wrap stack">
      <PageHead eyebrow="Разгледай възможностите" title="Професии за твоето бъдеще." lead={LEAD} />
      <Tabs on={tab} counts={counts} />
      {tab === 'future' ? (fut.data ? <FutureList future={fut.data.future} /> : <Loading />)
        : tab === 'changing' ? (fut.data ? <ChangingList data={fut.data} /> : <Loading />)
          : (occ.data ? <TodayList occupations={occ.data.occupations} /> : <Loading />)}
    </div></section>
  );
}

function TodayList({ occupations }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);
  const list = useMemo(() => occupations
    .filter((o) => !filter || o.interests.includes(filter))
    .filter((o) => !q.trim() || o.title.toLowerCase().includes(q.trim().toLowerCase())), [occupations, q, filter]);
  return (
    <>
      <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="⌕  Потърси професия" aria-label="Потърси професия" />
      <Acc title="Филтри по интереси" open={Boolean(filter)} hint={filter ? FILTER_SHORT[filter] || filter : ''}>
        <div className="chips" role="group" aria-label="Филтър по интереси">
          <button type="button" className="chip" aria-pressed={!filter} onClick={() => setFilter(null)}>Всички</button>
          {INTEREST_FILTERS.map((f) => <button type="button" key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{FILTER_SHORT[f] || f}</button>)}
        </div>
      </Acc>
      <span className="count" aria-live="polite">{plural(list.length, 'професия', 'професии')}</span>
      <div className="grid g4">
        {list.map((o) => (
          <a key={o.id} className="card" href={`#/occupation/${o.id}`}>
            <span className="kick">Професия · <span>{o.interests[0] || o.iscoLabel}</span></span>
            <span className="card-title">{o.title}</span>
            <NewBadge show={o.dynamic} />
            <span className="card-desc">{o.description}</span>
            <span className="more">Разгледай професията ↗</span>
          </a>
        ))}
      </div>
      {!list.length && <p className="na">Няма професии, които отговарят на търсенето.</p>}
    </>
  );
}

export const FutureCard = ({ f }) => (
  <a className="card fcard" href={`#/future/${f.id}`}>
    <span className="fut">✦ Бъдеща професия · около {f.expected}</span>
    <span className="card-title">{f.title}</span>
    <span className="card-desc">{f.description}</span>
    <span className="chips"><span className="fchip">{f.driver}</span>{f.evidence === 'ai' && <span className="badge b-ai">AI прогноза</span>}</span>
    <span className="more fut-more">Разгледай ↗</span>
  </a>
);

function FutureList({ future }) {
  return (
    <>
      <div className="callout fut-note"><span className="badge b-forecast">Прогноза</span><span className="small">Тези професии още почти не съществуват. Показваме защо се очакват и кои умения им трябват – без заплати и обяви, защото за тях още няма данни.</span></div>
      <div className="grid g4">{future.map((f) => <FutureCard key={f.id} f={f} />)}</div>
    </>
  );
}

function ChangingList({ data }) {
  const { changing, changingSource: src } = data;
  return (
    <>
      <div className="callout chg-note"><span className="badge b-forecast">Прогноза · WEF</span><span className="small">Най-бързо намаляващите професии до 2030 г. според {src.title} (световно, % промяна). За всяка – близка професия днес, бъдеща професия и 2 умения за прехода. {src.note.split('. ')[1] || ''}</span></div>
      <div className="grid g3">
        {changing.map((j) => (
          <div key={j.id} className="card chg">
            <div className="chg-top"><span className="card-title" style={{ fontSize: 17 }}>{j.title}</span><span className="dl">{j.change}%</span></div>
            <div className="chg-path">
              <span className="kick">Днес →</span>{j.today ? <a href={`#/occupation/${j.today.id}`}>{j.today.title}</a> : '—'}
              <span className="fut">✦ Бъдеще →</span>{j.future ? <a className="fut-link" href={`#/future/${j.future.id}`}>{j.future.title}</a> : '—'}
            </div>
            <div className="chips">{j.skills.map((x) => <a key={x.id} className="chip sm" href={`#/skill/${x.id}`}>{x.name}</a>)}</div>
          </div>
        ))}
      </div>
      <p className="small muted">Източник: <a href={src.url} target="_blank" rel="noopener noreferrer">{src.title}</a>, {src.period}.</p>
    </>
  );
}

const SkillChips = ({ list, alt }) => <div className="chips">{list.map((s) => <a key={s.id} className={`chip ${alt ? 'alt' : ''}`} href={`#/skill/${s.id}`}>{s.name}</a>)}</div>;

export function OccupationPage({ id }) {
  const { data: o, error } = useApi(`occ:${id}`, `/api/occupations/${encodeURIComponent(id)}`);
  if (error) return <ErrorBox error={error} />;
  if (!o) return <Loading />;
  const emp = o.employment;
  const ess = o.escoSkills.filter((s) => s.relation === 'essential');
  const sal = o.salary;
  const lastEmp = emp.BG?.series?.length ? emp.BG.series[emp.BG.series.length - 1] : null;
  return (
    <section className="sec top"><div className="wrap stack">
      <PageHead back={<BackLink href="#/occupations">Всички професии</BackLink>} eyebrow="Професия" title={o.title} lead={o.description} />
      {o.dynamic && <div className="callout fut-note"><span className="badge b-new">Ново · AI предложение</span><span className="small">Добавена автоматично при обновяването: {o.aiEvidence?.text} Описанието е от Gemini.</span></div>}
      <div className="kpis">
        <Kpi label="Заплата в България" value={sal?.bg ? `≈ ${fmtNum(sal.bg.monthly)} €` : '—'}
          sub={sal?.bg ? `бруто/месец · ${sal.bg.isEstimate ? `оценка ${sal.bg.period.split(' – ').pop()}` : `Eurostat ${sal.bg.period}`}` : 'няма данни'} />
        <Kpi label="Перспектива до 2035" value={outlookWord(o.outlook.index)} sub={outlookPhrase(o.outlook)} />
        <Kpi label="Заети в групата в България" value={lastEmp ? `${fmtNum(Math.round(lastEmp.value))} хил.` : '—'} sub={lastEmp ? `„${o.iscoLabel}“ · ${lastEmp.period}` : 'няма данни'} />
      </div>
      <div className="acc-list">
        <Acc title="Основни умения" open><SkillChips list={o.coreSkills} /></Acc>
        <Acc title="Допълващи умения"><SkillChips list={o.complementarySkills} alt /></Acc>
        <Acc title="Перспектива">
          <p className="small muted">{outlookPhrase(o.outlook)}. <KindBadge kind="model" /> Обобщение на Future Jobs, не прогноза за брой работни места.</p>
          <Signals signals={o.outlook.signals} />
        </Acc>
        <Acc title="Заплащане">
          {sal?.bg ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}><span className="big-num">≈ {fmtNum(sal.bg.monthly)} €</span><span className="muted">бруто на месец</span><KindBadge kind={sal.bg.isEstimate ? 'model' : 'fact'} /></div>
              <dl className="kv">
                <dt>Официално</dt><dd>{fmtNum(sal.bg.official.monthly)} €/мес. (Eurostat SES {sal.bg.official.period}) <KindBadge kind="fact" /></dd>
                {sal.bg.isEstimate && <><dt>Актуализация</dt><dd>ръст на заплатите в сектора до {sal.bg.period.split(' – ').pop()} (+{String(sal.bg.estimate.growthPct).replace('.', ',')}%)</dd></>}
                {sal.sector && <><dt>Сектор</dt><dd>{sal.sector}</dd></>}
                <dt>Група</dt><dd>{sal.group}</dd>
                {sal.eu && <><dt>ЕС-27</dt><dd>≈ {fmtNum(sal.eu.monthly)} €/мес.</dd></>}
              </dl>
              <p className="small muted">{sal.note}</p>
            </>
          ) : <NA>Данните за заплатите още не са импортирани.</NA>}
        </Acc>
        <Acc title="Заетост в професионалната група">
          {emp.BG ? <LineChart series={[emp.BG.series]} names={['България']} /> : <NA />}
          <span className="small muted"><KindBadge kind="fact" /> {emp.BG ? `${emp.BG.from}–${emp.BG.to} · ` : ''}хил. заети в групата „{o.iscoLabel}“ · {emp.source}{emp.BG?.breaks ? ' · има прекъсване на редицата (методологична промяна)' : ''}</span>
        </Acc>
        {o.futureFrom?.length > 0 && (
          <Acc title="✦ Бъдещи професии оттук">
            <div className="chips">{o.futureFrom.map((f) => <a key={f.id} className="chip fchip-l" href={`#/future/${f.id}`}>{f.title} · ~{f.expected}</a>)}</div>
            <p className="small muted">Професии, които се очаква да се появят и за които тази е най-близката днес.</p>
          </Acc>
        )}
        <Acc title="Данни от ESCO">
          {o.esco ? (
            <>
              <p className="small"><KindBadge kind="fact" /> Съществени умения по ESCO за <a href={o.esco.uri} rel="noopener noreferrer" target="_blank">„{o.esco.label_bg}“</a>{o.esco.code ? `, код ${o.esco.code}` : ''}:</p>
              <div className="chips">{ess.length ? ess.slice(0, 20).map((s) => <span key={s.to_label} className="chip alt sm">{s.to_label}</span>) : <NA />}</div>
            </>
          ) : <NA>ESCO данните още не са импортирани.</NA>}
        </Acc>
      </div>
    </div></section>
  );
}

export function FuturePage({ id }) {
  const { data: f, error } = useApi(`future:${id}`, `/api/future/${encodeURIComponent(id)}`);
  if (error) return <ErrorBox error={error} />;
  if (!f) return <Loading />;
  const ev = EVIDENCE[f.evidence] || EVIDENCE.medium;
  return (
    <section className="sec top"><div className="wrap stack">
      <PageHead back={<BackLink href="#/occupations/future">Професии на бъдещето</BackLink>} eyebrow="✦ Бъдеща професия" title={f.title} lead={f.description} />
      <div className="kpis">
        <Kpi label="Кога се очаква" value={f.expected} sub="ориентировъчно" />
        <Kpi label="Какво я създава" value={f.driver} />
        <Kpi label="Най-близка професия днес" value={f.closestToday ? <a href={`#/occupation/${f.closestToday.id}`} className="kpi-link">{f.closestToday.title}</a> : '—'} sub="оттук минава пътят" />
      </div>
      <div className="callout fut-note"><span className={`badge ${ev[1]}`}>{ev[0]}</span><span className="small">Прогноза – {ev[2]}. Заплата и брой обяви още няма.</span></div>
      <div className="acc-list">
        <Acc title="Умения, които ще ѝ трябват" open>
          <b className="small">Основни</b><SkillChips list={f.coreSkills} />
          <b className="small">Допълващи</b><SkillChips list={f.complementarySkills} alt />
        </Acc>
        <Acc title="Път дотам от днес"><ol className="path">{f.path.map((x) => <li key={x}>{x}</li>)}</ol></Acc>
        <Acc title="Защо ще се появи">
          {f.why.map((w) => <p key={w.text}><KindBadge kind={w.kind} /> {w.text}</p>)}
          {f.fromChanging.length > 0 && <p className="small">Подходяща посока и за хора от: {f.fromChanging.map((c) => `${c.title} (${c.change}%)`).join(', ')}.</p>}
        </Acc>
        <Acc title="Източници">
          <ul className="ev">{f.why.map((w) => <li key={w.source}><span>{w.url ? <a href={w.url} target="_blank" rel="noopener noreferrer">{w.source}</a> : w.source}</span></li>)}</ul>
        </Acc>
        <Acc title="Колко сме сигурни">
          <p><span className="badge ev-s">Силни</span> – закон или регламент с конкретни дати. <span className="badge ev-m">Средни</span> – доклади и тенденции. <span className="badge b-ai">AI прогноза</span> – предложение на Gemini по ръст на умение. Тази професия: <b>{ev[0].toLowerCase()}</b>.</p>
          <p>{f.note || 'Названието в обявите може да е различно.'}</p>
        </Acc>
      </div>
    </div></section>
  );
}
