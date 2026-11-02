import { useEffect, useState } from 'react';
import { api, invalidate, useApi } from '../lib/api.js';
import { fmtDate, fmtNum, relDay } from '../lib/format.js';
import { pingGemini } from '../lib/gemini.js';
import { Acc, ErrorBox, KindBadge, Kpi, LineChart, Loading, NA, PageHead } from '../components/ui.jsx';

const ST = { ok: ['работи', 'b-ok'], error: ['грешка', 'b-err'], never: ['още не е импортиран', 'b-off'], not_integrated: ['не е интегриран', 'b-off'], not_configured: ['нужен е ключ', 'b-warn'] };
const RS = { success: 'b-ok', partial: 'b-warn', failed: 'b-err', skipped: 'b-off', running: 'b-fact' };
const RSL = { success: 'успешно', partial: 'частично', failed: 'неуспешно', skipped: 'пропуснато', running: 'тече' };
const TRIG = { scheduled: 'планирано', manual: 'ръчно', cli: 'команда' };
const KIND_LABEL = { skill: 'Умение', occupation: 'Професия', future: 'Бъдеща професия' };
const KIND_HREF = { skill: '#/skill/', occupation: '#/occupation/', future: '#/future/' };

// Администраторският токен се пази само в паметта на страницата – не в кода и не в localStorage.
let adminTokenMemory = '';

export default function Data() {
  const status = useApi('status', '/api/status');
  const market = useApi('market', '/api/market');
  const newItems = useApi('catalog-new', '/api/catalog/new');
  useEffect(() => { status.reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (status.error || market.error) return <ErrorBox error={status.error || market.error} />;
  if (!status.data || !market.data) return <Loading />;
  const s = status.data, m = market.data;
  const ch = Object.fromEntries(m.cedefop.headline.map((x) => [x.key, x]));
  const jvr = m.vacancyRate;
  const working = s.sources.filter((x) => x.status === 'ok').length;
  const active = s.sources.filter((x) => !['not_integrated', 'not_configured'].includes(x.status)).length;
  const items = newItems.data?.items || [];
  return (
    <section className="sec top"><div className="wrap stack">
      <PageHead eyebrow="Прозрачност" title="Данни и източници." lead="Откъде идват числата и колко са пресни. Обновява се автоматично всеки ден." />
      {s.storage?.warning && <p className="notice err">{s.storage.warning}</p>}
      <div className="kpis">
        <Kpi label="Последно обновяване" value={s.lastSuccessfulImport ? relDay(s.lastSuccessfulImport) : 'няма'}
          sub={s.stale ? <span className="badge b-warn">{s.lastSuccessfulImport ? `остарели (> ${s.staleAfterHours} ч.)` : 'още няма импорт'}</span> : `следващо: ${relDay(s.nextScheduledRun)}`} />
        <Kpi label="Източници" value={`${working} от ${active}`} sub="работят при последното обновяване" />
        <Kpi label="Обяви в базата" value={fmtNum(s.counts.postings)} sub={`${fmtNum(s.counts.observations)} статистически наблюдения`} />
      </div>
      <div className="grid g2">
        <div className="panel">
          <h3>Свободни работни места <KindBadge kind="fact" /></h3>
          <LineChart series={[jvr.BG, jvr.EU]} unit="%" names={['България', 'ЕС-27']} />
          <span className="small muted">{jvr.source} · {jvr.BG.length ? `${jvr.BG[0].period} – ${jvr.BG[jvr.BG.length - 1].period}` : 'няма данни'}</span>
        </div>
        <div className="panel">
          <h3>Най-бързо растящите умения до 2030 <KindBadge kind="forecast" /></h3>
          <ol className="rank">{m.wef.growingSkills.slice(0, 6).map((x) => <li key={x.rank}><span className="n">{x.rank}</span><span>{x.label}</span></li>)}</ol>
          <span className="small muted">{m.wef.title}, {m.wef.period}. <a href="#/skills">Как се търсят в обявите →</a></span>
        </div>
      </div>
      <div className="acc-list">
        <Acc title="✦ Нови умения и професии, открити автоматично" hint={items.length ? `${items.length}` : 'още няма'}>
          <p className="small">При ежедневното обновяване Future Jobs търси растящи етикети и длъжности в обявите. Числата се изчисляват от приложението, а Gemini само описва записите на български. Те се показват с етикет <span className="badge b-new">Ново · AI предложение</span>; бъдещите професии от ИИ – с <span className="badge b-ai">AI прогноза</span>.</p>
          {items.length ? (
            <ul className="ev">{items.map((x) => (
              <li key={`${x.kind}:${x.id}`}><span className="badge b-new">{KIND_LABEL[x.kind]}</span>
                <span><a href={`${KIND_HREF[x.kind]}${x.id}`}>{x.title}</a><span className="src">{x.evidence?.text || (x.evidence?.postings30 ? `${x.evidence.postings30} обяви за 30 дни` : '')} · добавено {fmtDate(x.createdAt)}{x.model ? ` · ${x.model}` : ''}</span></span></li>
            ))}</ul>
          ) : <NA>Още няма – нужни са поне 100 обяви за 30 дни и ключ за Gemini (GEMINI_API_KEY).</NA>}
        </Acc>
        <Acc title="България до 2035 г. (Cedefop)">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="big-num">{ch.openings_high_skill_pct.value}%</span><span className="small">{ch.openings_high_skill_pct.label}</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="big-num">{ch.labour_force_high_qual_2035_pct.value}%</span><span className="small">{ch.labour_force_high_qual_2035_pct.label}</span></div>
          </div>
          <b className="small">Най-голям очакван недостиг:</b>
          <div className="chips">{m.cedefop.shortages.map((x) => <span key={x.label} className="chip alt sm">{x.label}</span>)}</div>
          <span className="small muted"><KindBadge kind="forecast" /> {m.cedefop.title} · {m.cedefop.period} · <a href={m.cedefop.url} rel="noopener noreferrer" target="_blank">PDF</a></span>
        </Acc>
        <Acc title="Статус на източниците" hint={`${working} от ${active} работят`}>
          <div className="table-wrap"><table style={{ minWidth: 760 }}>
            <thead><tr><th scope="col">Източник</th><th scope="col">Статус</th><th scope="col">Последен успех</th><th scope="col">Период</th><th scope="col">Условия</th></tr></thead>
            <tbody>{s.sources.map((x) => (
              <tr key={x.id}>
                <td><a href={x.url} rel="noopener noreferrer" target="_blank">{x.name}</a><div className="small muted">{x.kind === 'api' ? 'API' : x.kind === 'published_report' ? 'доклад' : x.kind === 'ai' ? 'ИИ' : ''} · {x.updateFrequency}</div></td>
                <td><span className={`badge ${(ST[x.status] || ST.never)[1]}`}>{(ST[x.status] || ST.never)[0]}</span>{x.stale && <> <span className="badge b-warn">остарели</span></>}
                  {x.lastError && <div className="src-err">{x.lastError.slice(0, 160)}</div>}</td>
                <td className="num">{fmtDate(x.lastSuccessAt)}</td>
                <td className="small">{x.dataPeriod || '—'}</td>
                <td className="small muted" style={{ maxWidth: 260 }}>{x.terms}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Acc>
        <Acc title="История на обновяванията" hint={s.runs[0] ? RSL[s.runs[0].status] || s.runs[0].status : ''}>
          {s.runs.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{s.runs.slice(0, 8).map((r) => (
              <div key={r.id || r.started_at} className="run">
                <div><div>{fmtDate(r.started_at)} · {TRIG[r.trigger] || r.trigger}</div>
                  <details className="mini"><summary>Подробности</summary><p>{r.message || ''}</p>
                    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{r.sources.map((x) => (
                      <li key={x.source_id}><b>{x.source_id}</b>: {x.status} – нови {x.inserted}, обновени {x.updated}, дубликати {x.duplicates}, отхвърлени {x.rejected}{x.error && <> · <span style={{ color: 'var(--err-ink)' }}>{x.error.slice(0, 200)}</span></>}</li>
                    ))}</ul></details></div>
                <span className={`badge ${RS[r.status] || 'b-off'}`}>{RSL[r.status] || r.status}</span>
              </div>
            ))}</div>
          ) : <NA>Още няма изпълнения.</NA>}
        </Acc>
        <Acc title="Методология и ограничения">
          <p><KindBadge kind="fact" /> реални данни (Eurostat, обяви) · <KindBadge kind="forecast" /> публикувани прогнози (Cedefop, WEF) · <KindBadge kind="model" /> изчисления на Future Jobs (Future Skills Score, перспектива, оценка на заплатите) · <KindBadge kind="ai" /> текст от Gemini.</p>
          <p>{s.schedule}</p>
          <p>Обявите са основно от ЕС и дистанционни – не са представителни за България. Оценките са ориентир, не научно доказана прогноза. {fmtNum(s.counts.revisions)} ревизии · {s.counts.metricDays} дни история.</p>
          <a href="/METHODOLOGY.md" style={{ fontWeight: 700, textDecoration: 'none' }}>Прочети методологията и формулите →</a>
        </Acc>
        <Admin running={s.running} onRefreshed={() => { invalidate(); status.reload(); market.reload(); newItems.reload(); }} />
      </div>
    </div></section>
  );
}

function Admin({ running, onRefreshed }) {
  const [token, setToken] = useState(adminTokenMemory);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [gem, setGem] = useState(null);
  const [mail, setMail] = useState({ to: '', out: null });
  const [catalog, setCatalog] = useState(null);
  const remember = (t) => { setToken(t); adminTokenMemory = t; };
  const hdr = { 'x-admin-token': token };

  const refresh = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('Обновяване… това може да отнеме няколко минути.');
    try { const r = await api('/api/admin/refresh?wait=1', { method: 'POST', headers: hdr }); setMsg(`Готово: ${r.status} – ${r.message || r.error || ''}`); setTimeout(onRefreshed, 800); }
    catch (err) { setMsg(`❌ ${err.message}`); }
    setBusy(false);
  };
  const ping = async () => {
    setGem({ busy: true, lines: [] });
    const lines = [];
    try { const g = await pingGemini(); lines.push(['ok', `Firebase AI Logic работи (${g.model}, App Check: ${g.provider}) за ${g.ms} ms.`]); }
    catch (err) { lines.push(['err', `Firebase AI Logic: ${err?.message || err}`]); }
    try {
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', text: 'Кажи само „OK“.' }] }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      lines.push(['ok', `Сървърът (Google AI Studio, GEMINI_API_KEY) работи – модел ${res.headers.get('x-assistant-model') || '?'}.`]);
      await res.text();
    } catch (err) { lines.push(['err', `Сървърът (Google AI Studio): ${err?.message || err}`]); }
    setGem({ busy: false, lines });
  };
  const testMail = async (e) => {
    e.preventDefault();
    if (!token) { setMail({ ...mail, out: { error: 'Въведи ADMIN_TOKEN в полето по-горе.' } }); return; }
    setMail({ ...mail, out: { busy: true } });
    try { setMail({ ...mail, out: await api('/api/admin/test-email', { method: 'POST', headers: hdr, body: JSON.stringify({ to: mail.to }) }) }); }
    catch (err) { setMail({ ...mail, out: { error: err.message } }); }
  };
  const loadCatalog = async () => { try { setCatalog(await api('/api/admin/catalog', { headers: hdr })); } catch (err) { setCatalog({ error: err.message }); } };
  const toggle = async (x) => {
    try { await api('/api/admin/catalog', { method: 'POST', headers: hdr, body: JSON.stringify({ kind: x.kind, id: x.id, hidden: x.status === 'active' }) }); invalidate(); await loadCatalog(); onRefreshed(); }
    catch (err) { setCatalog({ error: err.message }); }
  };
  const st = mail.out?.settings;

  return (
    <Acc title="Администрация" open={Boolean(token)}>
      <form className="form" onSubmit={refresh}>
        <label className="small muted" htmlFor="admin-token">Администраторски токен (не се запазва)</label>
        <input id="admin-token" type="password" placeholder="ADMIN_TOKEN" autoComplete="off" value={token} onChange={(e) => remember(e.target.value)} />
        <div className="row"><button className="btn" type="submit" disabled={running || busy}>{running ? 'Обновяване тече…' : 'Обнови сега'}</button></div>
        <p className="small" role="status">{msg}</p>
      </form>
      <div className="form">
        <b>Нови записи от ИИ</b>
        <p className="small muted">Скриване или връщане на автоматично добавени умения и професии (нищо не се изтрива).</p>
        <div className="row"><button className="btn btn-ghost" type="button" onClick={loadCatalog} disabled={!token}>Покажи списъка</button></div>
        {catalog?.error && <p className="notice err">{catalog.error}</p>}
        {catalog?.items && (catalog.items.length ? (
          <ul className="ev">{catalog.items.map((x) => (
            <li key={`${x.kind}:${x.id}`}><span className={`badge ${x.status === 'active' ? 'b-ok' : 'b-off'}`}>{x.status === 'active' ? 'видим' : 'скрит'}</span>
              <span>{KIND_LABEL[x.kind]}: <b>{x.title}</b> <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(x)}>{x.status === 'active' ? 'Скрий' : 'Покажи'}</button></span></li>
          ))}</ul>
        ) : <NA>Още няма автоматично добавени записи.</NA>)}
      </div>
      <div className="form">
        <b>Тест на Gemini</b>
        <p className="small muted">Една кратка заявка към Gemini през Firebase AI Logic (с App Check) и през сървъра. Не изисква токен.</p>
        <div className="row"><button className="btn btn-ghost" type="button" onClick={ping} disabled={gem?.busy}>{gem?.busy ? 'Проверка…' : 'Провери Gemini'}</button></div>
        {gem?.lines?.length > 0 && <div className="small" role="status">{gem.lines.map(([k, t]) => <div key={t} style={{ color: k === 'err' ? 'var(--err-ink)' : undefined }}>{k === 'ok' ? '✅' : '✕'} {t}</div>)}
          <span className="muted">Личният план работи, ако поне единият път е ✅ (първо се пробва Firebase, после сървърът).</span></div>}
      </div>
      <form className="form" onSubmit={testMail}>
        <b>Тест на имейла</b>
        <p className="small muted">Изпраща пробен имейл и показва точната грешка от пощенския сървър (използва токена по-горе).</p>
        <input type="email" placeholder="Получател (по подразбиране SMTP_USER)" aria-label="Получател на тестовия имейл" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} />
        <div className="row"><button className="btn btn-ghost" type="submit" disabled={mail.out?.busy}>Изпрати тестов имейл</button></div>
        <div className="small" role="status">
          {mail.out?.busy && 'Изпращане…'}
          {mail.out?.error && <p className="notice err">✕ {mail.out.error}</p>}
          {mail.out?.ok === true && <p>✅ Тестовият имейл е изпратен. Провери пощата (и „Спам“).</p>}
          {mail.out?.ok === false && <><p className="notice err">✕ {mail.out.error}</p><p style={{ marginTop: 8 }}><b>Какво да направиш:</b> {mail.out.hint}</p></>}
          {st && <p className="muted">Настройки: {st.host}:{st.port}, TLS {st.secure ? 'да (465)' : 'STARTTLS'}, потребител {st.user}, парола {st.passLength} знака, подател {st.from}</p>}
        </div>
      </form>
    </Acc>
  );
}
