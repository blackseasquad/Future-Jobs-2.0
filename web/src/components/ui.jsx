// Общи елементи на интерфейса.
import { useId } from 'react';

const KIND = { fact: ['Факт', 'b-fact'], forecast: ['Прогноза', 'b-forecast'], model: ['Модел', 'b-model'], ai: ['AI текст', 'b-ai'] };
export const KindBadge = ({ kind }) => <span className={`badge ${(KIND[kind] || KIND.fact)[1]}`}>{(KIND[kind] || KIND.fact)[0]}</span>;

const CONF = { high: ['висока увереност', 'b-ok'], medium: ['средна увереност', 'b-warn'], low: ['ниска увереност', 'b-err'], insufficient: ['недостатъчно данни', 'b-off'] };
export const ConfBadge = ({ c }) => { const x = CONF[c] || CONF.insufficient; return <span className={`badge ${x[1]}`}>{x[0]}</span>; };

export const NA = ({ children = 'няма достатъчно данни' }) => <span className="na">{children}</span>;
export const NewBadge = ({ show }) => (show ? <span className="badge b-new" title="Добавено автоматично при ежедневното обновяване – описано от Gemini">Ново · AI предложение</span> : null);

export function PageHead({ eyebrow, title, lead, back, side }) {
  return (
    <>
      {back}
      <div className="head-row">
        <div className="page-head">
          {eyebrow && <span className="eb">{eyebrow}</span>}
          <h1>{title}</h1>
          {lead && <p className="lead">{lead}</p>}
        </div>
        {side}
      </div>
    </>
  );
}

export const BackLink = ({ href, children }) => <a className="back" href={href}>← {children}</a>;

export function Acc({ title, hint, open = false, id, children }) {
  return (
    <details className="acc" open={open || undefined} id={id}>
      <summary>{title}{hint && <span className="hint">{hint}</span>}</summary>
      <div className="acc-body">{children}</div>
    </details>
  );
}

export const Kpi = ({ label, value, sub }) => (
  <div className="kpi"><span className="l">{label}</span><span className="v">{value}</span>{sub && <span className="s">{sub}</span>}</div>
);

export function Loading() { return <p className="loading">Зареждане…</p>; }
export function ErrorBox({ error }) {
  return <div className="wrap page-error"><p className="notice err">Грешка: {error?.message || String(error)}</p></div>;
}

/** Линейна графика (SVG) за една или две редици. */
export function LineChart({ series, height = 220, unit = '', names = [] }) {
  const titleId = useId();
  const all = series.flat();
  if (all.length < 2) return <NA>няма достатъчно наблюдения за графика</NA>;
  const labels = [...new Set(series.flatMap((s) => s.map((p) => p.period)))].sort();
  const W = 640, H = height, L = 48, R = 12, T = 12, B = 30;
  const vals = all.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1; min -= pad; max += pad;
  const x = (lbl) => L + (labels.indexOf(lbl) / Math.max(labels.length - 1, 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const ticks = [0, 0.5, 1].map((t) => min + t * (max - min));
  const every = Math.ceil(labels.length / 6);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{names.join(', ')}</title>
        {ticks.map((t, i) => (
          <g key={i}>
            <line className="grid-line" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end">{t.toLocaleString('bg-BG', { maximumFractionDigits: 1 })}{unit}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % every === 0 || i === labels.length - 1) && <text key={l} x={x(l)} y={H - 8} textAnchor="middle">{l}</text>)}
        {series.map((s, i) => {
          if (!s.length) return null;
          const d = s.map((p, j) => `${j ? 'L' : 'M'}${x(p.period).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
          const last = s[s.length - 1];
          return (
            <g key={i}>
              <path d={d} fill="none" className={`s${i}`} strokeWidth="2.5" strokeLinejoin="round" />
              <circle cx={x(last.period)} cy={y(last.value)} r="4" className={`dot${i}`}><title>{`${names[i] || ''} ${last.period}: ${last.value}${unit}`}</title></circle>
            </g>
          );
        })}
      </svg>
      {names.length > 1 && (
        <div className="legend">
          {names.map((n, i) => <span key={n}><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" className={`s${i}`} strokeWidth="3" /></svg> {n}</span>)}
        </div>
      )}
    </>
  );
}

/** Списък със сигнали (перспектива на професия). */
export function Signals({ signals }) {
  return (
    <ul className="ev">
      {signals.map((s, i) => (
        <li key={i}><KindBadge kind={s.type} /><span>{s.value > 0 ? '▲' : s.value < 0 ? '▼' : '•'} {s.text}<span className="src">{s.source} · {s.period}</span></span></li>
      ))}
    </ul>
  );
}
