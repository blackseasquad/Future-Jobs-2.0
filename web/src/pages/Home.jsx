import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Примерни профили. Резултатите се изчисляват от същия модел и със същите данни като анкетата.
const EXAMPLE_PROFILES = [
  { label: 'обичаш компютри и математика', answers: { afternoon: 'code', subjects: ['math', 'it'], workwith: 'data', tech_attitude: 'build', environment: 'office', values: 'income', study: 'university', english: 'mid' } },
  { label: 'искаш да помагаш на хората', answers: { afternoon: 'help', subjects: ['bio', 'social'], workwith: 'people', tech_attitude: 'less', environment: 'clinic', values: 'impact', study: 'university', english: 'good' } },
  { label: 'обичаш природата и техниката', answers: { afternoon: 'outdoor', subjects: ['geo', 'physics'], workwith: 'things', tech_attitude: 'use', environment: 'field', values: 'stability', study: 'course', english: 'basic' } },
];
const KEY = 'fj-examples-v4';

function useExamples() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let alive = true;
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (c && Date.now() - c.at < 6 * 3600 * 1000) { setItems(c.items); return undefined; }
    } catch { /* localStorage недостъпен */ }
    Promise.all(EXAMPLE_PROFILES.map((p) => api('/api/recommendations', { method: 'POST', body: JSON.stringify({ answers: p.answers, ai: false }) })
      .then((r) => ({ label: p.label, title: r.occupations[0].title, skills: r.horizons[0].items.map((i) => i.name) })).catch(() => null)))
      .then((list) => {
        if (!alive) return;
        const ok = list.filter(Boolean);
        setItems(ok);
        try { if (ok.length === list.length) localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), items: ok })); } catch { /* */ }
      });
    return () => { alive = false; };
  }, []);
  return items;
}

const STARTS = [
  ['✳', 'Опознай себе си', 'Отговори на няколко въпроса за интересите и целите си.', '#/quiz'],
  ['↗', 'Открий професии', 'Разгледай различни възможности и какво стои зад тях.', '#/occupations'],
  ['✧', 'Развий умения', 'Виж кои умения можеш да започнеш да развиваш още днес.', '#/skills'],
];

export default function Home() {
  const examples = useExamples();
  return (
    <>
      <section className="hero"><div className="wrap">
        <div className="hero-copy">
          <span className="eb">Твоето бъдеще започва тук</span>
          <h1><span className="nw">Открий своята</span><br /><span>посока!</span></h1>
          <p className="lead">Какво да учиш днес, за да имаш работа утре? Future Jobs проверява всеки ден пазара на труда и ти казва кои умения да развиваш още сега.</p>
          <div className="hero-cta"><a className="btn btn-lg" href="#/quiz">Открий своя път <span aria-hidden="true">↗</span></a><a className="link" href="#/occupations">Разгледай професиите →</a></div>
          <div className="hero-points"><span>✦ За ученици, студенти и работещи</span><span>✦ Данни и прогнози</span><span>✦ Обновява се всеки ден</span></div>
        </div>
        <div className="hero-art">
          <div className="ring r1" /><div className="ring r2" />
          <img src="/wave.png" alt="Логото на Future Jobs – вълна" width="340" height="297" />
          <a className="float f1" href="#/occupations"><span className="k">РАЗГЛЕДАЙ</span><span className="t">Професии с перспектива</span></a>
          <a className="float f2" href="#/quiz"><span className="k">ЗАПОЧНИ ОТ СЕБЕ СИ</span><span className="t">Твоите интереси → твоят път</span></a>
        </div>
      </div></section>
      <section className="sec top"><div className="wrap stack">
        <div className="page-head"><span className="eb">Откъде да започна?</span><h2 style={{ fontSize: 'clamp(30px,4vw,44px)', letterSpacing: '-0.03em' }}>Бъдещето има много посоки.</h2><p className="lead">Избери тази, която е интересна за теб.</p></div>
        <div className="grid g3">
          {STARTS.map(([i, t, d, u]) => (
            <a key={t} className="card start-card" href={u}><span className="ico" aria-hidden="true">{i}</span><span className="row"><span className="card-title">{t}</span><span className="arr" aria-hidden="true">↗</span></span><span className="card-desc">{d}</span></a>
          ))}
        </div>
      </div></section>
      {examples.length > 0 && (
        <section className="sec" style={{ paddingTop: 8 }}><div className="wrap stack" style={{ gap: 12 }}>
          <div className="head-row"><span className="eb">Примерни резултати</span><a className="small" href="#/quiz" style={{ fontWeight: 700, textDecoration: 'none' }}>Виж своя план →</a></div>
          <div className="grid g3">
            {examples.map((e) => (
              <a key={e.label} className="card" href="#/quiz">
                <span className="kick">Ако {e.label}</span>
                <span className="card-title" style={{ fontSize: 17 }}>{e.title}</span>
                <span className="chips">{e.skills.map((n) => <span key={n} className="chip sm">{n}</span>)}</span>
              </a>
            ))}
          </div>
        </div></section>
      )}
      <section className="sec" style={{ paddingTop: 8 }}><div className="wrap">
        <div className="cta-band">
          <div><span className="eb light">Малка стъпка. Голяма посока.</span><h2>Готов ли си да откриеш своя път?</h2><p>Започни с интересите си и разгледай възможностите пред теб.</p></div>
          <a className="btn btn-lg" href="#/quiz">Започни анкетата <span aria-hidden="true">↗</span></a>
        </div>
      </div></section>
    </>
  );
}
