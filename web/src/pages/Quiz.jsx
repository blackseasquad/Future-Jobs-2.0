import { useCallback, useEffect, useRef, useState } from 'react';
import { api, useApi } from '../lib/api.js';
import { useQuiz } from '../lib/quiz.js';
import { fmtDate } from '../lib/format.js';
import { personalPlan } from '../lib/gemini.js';
import { answersToText, questionsFor } from '../../../src/shared/plan-prompt.js';
import { Acc, ErrorBox, KindBadge, Loading, PageHead } from '../components/ui.jsx';

const STEP_LABEL = { course: 'Безплатен курс', project: 'Малък проект', group: 'Учебна група' };

export default function Quiz() {
  const { quiz, setQuiz } = useQuiz();
  const { data, error } = useApi('quiz', '/api/quiz');
  const questions = data ? questionsFor(data.questions, quiz.answers.situation || 'pupil', data.adultSituations) : [];
  useEffect(() => {
    if (questions.length && questions.length !== quiz.total) setQuiz((q) => ({ ...q, total: questions.length }));
  }, [questions.length, quiz.total, setQuiz]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  if (quiz.result) return <Result r={quiz.result} questions={questions} />;
  return <Question questions={questions} />;
}

function Question({ questions }) {
  const { quiz, setQuiz } = useQuiz();
  const [busy, setBusy] = useState(false);
  const step = Math.min(quiz.step, questions.length - 1);
  const q = questions[step];
  const sel = quiz.answers[q.id];
  const isSel = (id) => (Array.isArray(sel) ? sel.includes(id) : sel === id);
  const ready = q.type === 'multi' ? Array.isArray(sel) && sel.length > 0 : Boolean(sel);
  const last = step === questions.length - 1;
  const left = Math.max(1, Math.ceil(((questions.length - step) * 15) / 60));

  const choose = (opt) => setQuiz((s) => {
    const a = { ...s.answers };
    if (q.type === 'multi') {
      const cur = new Set(a[q.id] || []);
      if (cur.has(opt)) cur.delete(opt); else if (cur.size < (q.max || 1)) cur.add(opt);
      a[q.id] = [...cur];
    } else a[q.id] = opt;
    return { ...s, answers: a };
  });
  const submit = async () => {
    setBusy(true);
    // само отговорите на видимите въпроси (ако човек е сменил въпрос 1)
    const answers = Object.fromEntries(questions.filter((x) => quiz.answers[x.id] !== undefined).map((x) => [x.id, quiz.answers[x.id]]));
    try {
      const result = await api('/api/recommendations', { method: 'POST', body: JSON.stringify({ answers }) });
      setQuiz((s) => ({ ...s, answers, result, error: null }));
      window.scrollTo(0, 0);
    } catch (err) { setQuiz((s) => ({ ...s, error: err.message })); }
    setBusy(false);
  };

  return (
    <section><div className="wrap"><div className="quiz-wrap">
      <div>
        <div className="quiz-meta"><span>Въпрос {step + 1} от {questions.length}</span><span>~{left} мин. остава</span></div>
        <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={step + 1}><i style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div>
      </div>
      <h1>{q.text}</h1>
      {q.hint && <p className="small muted" style={{ marginTop: -10 }}>{q.hint}</p>}
      {q.type === 'multi' && <p className="small muted" style={{ marginTop: -10 }}>Избери до {q.max || 1}.</p>}
      <div className="options" role="group" aria-label="Отговори">
        {q.options.map((o) => (
          <button key={o.id} type="button" className={`opt${q.type === 'multi' ? ' multi' : ''}`} aria-pressed={isSel(o.id)} onClick={() => choose(o.id)}>
            <span className="tick" /><span>{o.text}{o.note && <small>{o.note}</small>}</span>
          </button>
        ))}
      </div>
      {quiz.error && <p className="notice err">{quiz.error}</p>}
      <div className="quiz-nav">
        <button className="btn btn-ghost" type="button" disabled={step === 0} onClick={() => setQuiz((s) => ({ ...s, step: step - 1 }))}>← Назад</button>
        {last
          ? <button className="btn" type="button" disabled={!ready || busy} onClick={submit}>{busy ? 'Изчисляване…' : 'Виж своя план →'}</button>
          : <button className="btn" type="button" disabled={!ready} onClick={() => setQuiz((s) => ({ ...s, step: step + 1 }))}>Напред →</button>}
      </div>
      <p className="small muted">Отговорите не се запазват – използват се само за изчисляване на препоръките.</p>
    </div></div></section>
  );
}

function FirstStep({ st }) {
  return (
    <div className="step"><span className="k">Първа стъпка · {st.label || STEP_LABEL[st.type] || ''}</span>
      <span>{st.url ? <a href={st.url} target="_blank" rel="noopener noreferrer">{st.text}</a> : st.text}</span></div>
  );
}

/** Личен план от Gemini: първо Firebase AI Logic в браузъра, после резервно през сървъра (/api/plan). */
function useGeminiPlans(r, questions, answers) {
  const [plans, setPlansState] = useState({});
  const status = useRef({});
  const setPlans = (fn) => setPlansState((p) => { const n = fn(p); status.current = n; return n; });
  const load = useCallback(async (item, h) => {
    const id = item.skillId;
    if (['loading', 'ok'].includes(status.current[id]?.status)) return;
    status.current = { ...status.current, [id]: { status: 'loading' } };
    setPlans((p) => ({ ...p, [id]: { status: 'loading' } }));
    const errors = [];
    try {
      const plan = await personalPlan({
        answers: answersToText(questions, answers), interests: r.profile.topInterests, skill: item.name, description: item.description || '',
        horizon: `${h.label} (${h.subtitle})`, firstStep: item.firstStep.text, fact: `${item.fact.text} (${item.fact.source}, ${item.fact.period})`,
        occupation: r.occupations[0]?.title || '',
      });
      setPlans((p) => ({ ...p, [id]: { status: 'ok', plan, model: 'Gemini (Firebase AI Logic)' } }));
      return;
    } catch (err) { errors.push(`Firebase: ${err?.message || err}`); }
    try {
      const d = await api('/api/plan', { method: 'POST', body: JSON.stringify({ answers, skillId: id, horizon: h.key }) });
      setPlans((p) => ({ ...p, [id]: { status: 'ok', plan: d.plan, model: `${d.model} (Google AI Studio)` } }));
    } catch (err) {
      errors.push(`Сървър: ${err?.message || err}`);
      console.warn('Gemini не отговори:', errors.join(' | '));
      const all = errors.filter((x) => !/не е настроен/.test(x)).join(' '); // пропуснат Firebase път не е причина
      setPlans((p) => ({ ...p, [id]: { status: 'error', error: /quota|429|RESOURCE_EXHAUSTED|лимит/i.test(all) ? 'достигнат е дневният лимит' : /app.?check|recaptcha/i.test(all) ? 'неуспешна защитна проверка' : 'няма връзка' } }));
    }
  }, [r, questions, answers]);
  return [plans, load];
}

function GeminiBox({ st }) {
  const head = (t) => <div className="gem-h"><span>{t}</span><span className="badge b-ai">Gemini · AI текст</span></div>;
  if (!st || st.status === 'loading') return <div className="gem">{head('✦ Gemini пише твоя план…')}<div className="sk" style={{ width: '92%' }} /><div className="sk" style={{ width: '78%' }} /><div className="sk" style={{ width: '85%' }} /></div>;
  if (st.status === 'error') return <div className="gem"><p className="small muted">Личният план от Gemini не е наличен в момента ({st.error}). Опитай отново по-късно – първата стъпка по-горе е готова за теб.</p></div>;
  return (
    <div className="gem">{head('✦ Твоят личен план')}
      <p><b>Защо за теб:</b> {st.plan.why}</p>
      <ol>{st.plan.steps.map((x) => <li key={x.when}><b>{x.when}:</b> {x.text}</li>)}</ol>
      <span className="small muted">Генерирано от {st.model} по отговорите ти. Може да греши – провери преди да действаш.</span>
    </div>
  );
}

function Result({ r, questions }) {
  const { quiz } = useQuiz();
  const [plans, loadPlan] = useGeminiPlans(r, questions, quiz.answers);
  const [top, ...others] = r.occupations;
  const fut = r.futureOccupations?.[0];
  return (
    <section className="sec top"><div className="wrap stack" style={{ gap: 20 }}>
      <PageHead eyebrow="Твоят резултат" title="Твоят план за бъдещите умения" lead={<>Какво да учиш днес – и кога. По интересите ти: <b style={{ color: 'var(--ink)' }}>{r.profile.topInterests.join(', ')}</b></>} />
      <span className="gem-chip">✦ GEMINI пише твоя личен план по твоите отговори</span>
      {!r.dataAsOf && <p className="notice">Все още няма импортирани данни от пазара на труда – препоръките се основават само на публикуваните прогнози и каталога.</p>}
      {r.knownSkills?.length > 0 && <p className="small muted">Вече владееш: {r.knownSkills.join(', ')} – не е включено в плана.</p>}
      <div className="hz-grid">
        {r.horizons.map((h) => (
          <div key={h.key} className={`hz ${h.key}`}>
            <div className="hz-head"><span className="t">{h.label}</span><span className="s">{h.subtitle}</span></div>
            <div className="hz-body">
              {r.ai?.ok && r.ai.texts?.[h.key] && <div className="ai-box"><KindBadge kind="ai" /><span>{r.ai.texts[h.key]}</span></div>}
              {h.items.map((i) => (
                <div key={i.skillId} className="hz-item">
                  <h3><a href={`#/skill/${i.skillId}`}>{i.name}</a></h3>
                  <FirstStep st={i.firstStep} />
                  <details className="mini gem-det" onToggle={(e) => e.currentTarget.open && loadPlan(i, h)}>
                    <summary>✦ Защо и как да започна?</summary>
                    <GeminiBox st={plans[i.skillId]} />
                    <p className="gem-src">Данни зад препоръката: <KindBadge kind={i.fact.kind} /> {i.fact.text} <span className="muted">({i.fact.source} · {i.fact.period})</span></p>
                  </details>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Acc title="Как да разбирам резултатите?">
        <p>По 2 умения за всеки период, подбрани по интересите ти, с конкретна първа стъпка. Данни към {fmtDate(r.dataAsOf)}.</p>
        <div className="legend"><KindBadge kind="fact" /> реални данни от обяви и Eurostat <KindBadge kind="forecast" /> Cedefop / WEF <KindBadge kind="model" /> изчисление на Future Jobs</div>
        <ul className="disclaimers">{r.disclaimers.map((d) => <li key={d}>{d}</li>)}</ul>
      </Acc>
      <div className="stack" style={{ gap: 10, marginTop: 6 }}>
        <h2 className="h2" style={{ fontSize: 22 }}>Къде могат да те отведат тези умения</h2>
        <div className="grid g2">
          {top && (
            <a className="card" href={`#/occupation/${top.id}`}>
              <span className="kick">Днес · най-добро съвпадение</span><span className="card-title">{top.title}</span>
              <span className="card-desc" style={{ fontSize: 14 }}>{top.description}</span>
              <span className="more">Разгледай професията ↗</span>
            </a>
          )}
          {fut && (
            <a className="card fcard" href={`#/future/${fut.id}`}>
              <span className="fut">✦ В бъдеще · около {fut.expected}</span><span className="card-title">{fut.title}</span>
              <span className="card-desc" style={{ fontSize: 14 }}>{fut.description}{fut.sharedSkills?.length ? ` Общо с плана ти: ${fut.sharedSkills.join(', ')}.` : ''}</span>
              <span className="more fut-more">Разгледай бъдещата професия ↗</span>
            </a>
          )}
        </div>
        {r.transitions?.length > 0 && (
          <div className="card trans">
            <span className="kick">Твоят преход · според сферата, в която работиш</span>
            {r.transitions.map((j) => (
              <div key={j.id} className="trans-row">
                <span><b>{j.title}</b> <span className="dl">{j.change}% до 2030 (WEF)</span></span>
                <span className="small">→ днес: {j.today ? <a href={`#/occupation/${j.today.id}`}>{j.today.title}</a> : '—'} · ✦ бъдеще: {j.future ? <a className="fut-link" href={`#/future/${j.future.id}`}>{j.future.title}</a> : '—'}</span>
              </div>
            ))}
            <a className="small" href="#/occupations/changing" style={{ fontWeight: 700 }}>Всички професии, които ИИ променя →</a>
          </div>
        )}
        {others.length > 0 && (
          <Acc title={`Още ${others.length} подходящи професии днес`}>
            <div className="chips">{others.map((o) => <a key={o.id} className="chip" href={`#/occupation/${o.id}`}>{o.title}</a>)}</div>
            <p className="small">Съвпадение с интересите: {r.occupations.map((o) => `${o.title} ${o.match}%`).join(' · ')} <KindBadge kind="model" /></p>
          </Acc>
        )}
      </div>
      <EmailForm plans={plans} />
    </div></section>
  );
}

function EmailForm({ plans }) {
  const { quiz } = useQuiz();
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, sent: '', error: '' });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, sent: '', error: '' });
    try {
      await api('/api/email', { method: 'POST', body: JSON.stringify({
        answers: quiz.answers, email: email.trim(), consent: true, ai: Boolean(quiz.result?.ai?.ok),
        plans: Object.fromEntries(Object.entries(plans).filter(([, v]) => v.status === 'ok').map(([k, v]) => [k, { why: v.plan.why, steps: v.plan.steps.map((x) => x.text) }])),
      }) });
      setState({ busy: false, sent: email.trim(), error: '' });
    } catch (err) { setState({ busy: false, sent: '', error: err.message }); }
  };
  return (
    <div className="card mail-card">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><h2>Изпрати плана на имейла си</h2><span className="card-desc" style={{ fontSize: 14 }}>С източниците и личните планове от Gemini, които си отворил. Имейлът не се съхранява.</span></div>
      <form className="mail-form" onSubmit={submit}>
        <div className="mail-row">
          <input type="email" required placeholder="ime@example.com" autoComplete="email" aria-label="Имейл" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn" type="submit" disabled={state.busy}>{state.busy ? 'Изпращане…' : state.sent ? 'Изпрати отново' : 'Изпрати'}</button>
        </div>
        <span className="small muted">Изпращаме плана само веднъж, на този адрес.</span>
        <span id="email-msg" role="status" className={state.error ? 'err' : undefined}>
          {state.error ? `✕ ${state.error}` : state.sent ? <>✓ Изпратено на <b>{state.sent}</b>. Провери пощата си (и папка „Спам“). Сгрешен адрес? Поправи го и натисни „Изпрати отново“.</> : ''}
        </span>
      </form>
    </div>
  );
}
