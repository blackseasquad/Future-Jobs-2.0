// Future Jobs – React приложение. Данните идват само от /api/*; ежедневното обновяване е на сървъра.
import { useEffect, useMemo, useState } from 'react';
import { QuizCtx, EMPTY_QUIZ } from './lib/quiz.js';
import { useRoute } from './lib/router.js';
import { useApi } from './lib/api.js';
import { fmtDate, relDay } from './lib/format.js';
import Home from './pages/Home.jsx';
import { Occupations, OccupationPage, FuturePage } from './pages/Occupations.jsx';
import { Skills, SkillPage } from './pages/Skills.jsx';
import Quiz from './pages/Quiz.jsx';
import Data from './pages/Data.jsx';
import Assistant from './components/Assistant.jsx';


function Header({ route, quiz, restart }) {
  const nav = [['home', '#/', 'Начало'], ['occupations', '#/occupations', 'Професии'], ['skills', '#/skills', 'Умения'], ['data', '#/data', 'Данни']];
  let cta = <a className="btn" href="#/quiz">Започни анкетата <span aria-hidden="true">↗</span></a>;
  if (route.name === 'quiz' && quiz.result) cta = <button className="btn btn-ghost" type="button" onClick={restart}>↺ Започни отначало</button>;
  else if (route.name === 'quiz') cta = <span className="btn btn-navy" aria-live="polite">Анкета · въпрос {quiz.step + 1}/{quiz.total}</span>;
  return (
    <header className="header">
      <a className="brand" href="#/" aria-label="Future Jobs – начало">
        <span className="brand-mark"><img src="/wave-sm.png" alt="" width="34" height="30" /></span>
        <span className="brand-text"><span className="brand-name">future<b>jobs</b></span><span className="brand-tag">ОТКРИЙ ПОСОКАТА СИ</span></span>
      </a>
      <nav className="nav" aria-label="Основна навигация">
        {nav.map(([k, href, label]) => <a key={k} href={href} className={route.nav === k ? 'active' : undefined} aria-current={route.nav === k ? 'page' : undefined}>{label}</a>)}
      </nav>
      <div id="header-cta">{cta}</div>
    </header>
  );
}

function Freshness() {
  const { data: s, error } = useApi('status', '/api/status');
  let cls = 'unknown', text = 'Проверка на данните…', title = '';
  if (error) text = 'Няма връзка със сървъра';
  else if (s) {
    title = `Следващо обновяване: ${relDay(s.nextScheduledRun)}`;
    if (!s.lastSuccessfulImport) text = 'Още няма импорт на данни';
    else if (s.stale) { cls = 'stale'; text = `Данните са остарели · ${fmtDate(s.lastSuccessfulImport)}`; }
    else { cls = ''; text = `Обновено ${fmtDate(s.lastSuccessfulImport)}`; }
  }
  return <a id="freshness" className={`fresh ${cls}`} href="#/data" title={title} role="status"><span className="dot" /><span>{text}</span></a>;
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-col">
          <span className="brand-name">future<b>jobs</b></span>
          <span>Открий уменията и професиите,<br />които те водят напред.</span>
        </div>
        <div className="footer-col">
          <h4>РАЗГЛЕДАЙ</h4>
          <a href="#/occupations">Професии</a><a href="#/skills">Умения</a><a href="#/quiz">Анкета</a>
        </div>
        <div className="footer-col">
          <h4>ЗА ПРОЕКТА</h4>
          <a href="#/data">Източници и методология</a>
          <Freshness />
          <span>Ученически проект за <a href="https://www.eduhack.bg" rel="noopener">EduHack.bg</a><br />BlackSea Squad · Варна</span>
        </div>
      </div>
    </footer>
  );
}

function Page({ route }) {
  switch (route.name) {
    case 'occupations': return <Occupations tab={route.param || 'today'} />;
    case 'occupation': return <OccupationPage id={route.param} />;
    case 'future': return <FuturePage id={route.param} />;
    case 'skills': return <Skills />;
    case 'skill': return <SkillPage id={route.param} />;
    case 'quiz': return <Quiz />;
    case 'data': return <Data />;
    default: return <Home />;
  }
}

export default function App() {
  const route = useRoute();
  const [quiz, setQuiz] = useState(EMPTY_QUIZ);
  const restart = () => setQuiz(EMPTY_QUIZ);
  const value = useMemo(() => ({ quiz, setQuiz, restart }), [quiz]);
  useEffect(() => { document.getElementById('main')?.focus({ preventScroll: true }); }, [route.name, route.param]);
  return (
    <QuizCtx.Provider value={value}>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Към съдържанието</a>
      <Header route={route} quiz={quiz} restart={restart} />
      <main id="main" tabIndex={-1}>
        <Page key={`${route.name}:${route.param}`} route={route} />
      </main>
      <Footer />
      <Assistant />
    </QuizCtx.Provider>
  );
}
