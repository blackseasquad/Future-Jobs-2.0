// Плаващ чат асистент Espy. Говори само с /api/assistant; ключът за Gemini е на сървъра.
import { Fragment, useEffect, useRef, useState } from 'react';

const STORE = 'fj-assistant-v1';
const SUGGESTIONS = ['Как работи анкетата?', 'Откъде са данните?', 'Кои са професиите на бъдещето?', 'Какво значи „ниска увереност“?'];
const GREETING = 'Здравей! Аз съм **Espy** – помощникът на Future Jobs. Питай ме как работи приложението, откъде са данните или къде да намериш нещо.';

/** Безопасен мини markdown: **удебелен**, _наклонен_, [текст](#/път), списъци. Само вътрешни линкове. */
function Inline({ text }) {
  const parts = [];
  const re = /\*\*(.+?)\*\*|(^|\s)_(.+?)_(?=\s|$|[.,!?])|\[([^\]]+)\]\((#\/[a-z0-9_/-]*)\)/gi;
  let last = 0, m, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<b key={k++}>{m[1]}</b>);
    else if (m[3]) parts.push(<Fragment key={k++}>{m[2]}<i>{m[3]}</i></Fragment>);
    else parts.push(<a key={k++} href={m[5]}>{m[4]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
function Markdown({ text }) {
  const blocks = [];
  let list = null;
  String(text).split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const m = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
    if (m) {
      const type = m[1] ? 'ol' : 'ul';
      if (!list || list.type !== type) { list = { type, items: [] }; blocks.push(list); }
      list.items.push(<li key={i}><Inline text={m[2]} /></li>);
      return;
    }
    list = null;
    if (line.trim()) blocks.push(<p key={i}><Inline text={line} /></p>);
  });
  return <>{blocks.map((b, i) => (b.type === 'ol' ? <ol key={`l${i}`}>{b.items}</ol> : b.type === 'ul' ? <ul key={`l${i}`}>{b.items}</ul> : b))}</>;
}

function load() { try { return JSON.parse(sessionStorage.getItem(STORE) || '[]'); } catch { return []; } }

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // за плавното затваряне
  const [messages, setMessages] = useState(load);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(null); // текстът, който се пише в момента
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null), inputRef = useRef(null), fabRef = useRef(null), ctrl = useRef(null);

  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-30))); } catch { /* */ } }, [messages]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages, pending, open]);
  useEffect(() => {
    if (open) { setShown(true); const t = setTimeout(() => inputRef.current?.focus(), 120); return () => clearTimeout(t); }
    const t = setTimeout(() => setShown(false), 220); return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && open) { setOpen(false); fabRef.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function ask(q) {
    const text = q.trim();
    if (!text || busy) return;
    const history = [...messages, { role: 'user', text }];
    setMessages(history); setInput(''); setBusy(true); setPending('');
    let answer = '';
    try {
      ctrl.current = new AbortController();
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.current.signal,
        body: JSON.stringify({ messages: history.filter((m) => !m.error).map(({ role, text: t }) => ({ role, text: t })) }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Асистентът не е достъпен в момента.');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += dec.decode(value, { stream: true });
        setPending(answer);
      }
      setMessages((m) => [...m, { role: 'model', text: answer || 'Нямам отговор на това. Опитай да зададеш въпроса по друг начин.' }]);
    } catch (err) {
      if (err?.name !== 'AbortError') setMessages((m) => [...m, { role: 'model', text: `⚠ ${err.message || 'Няма връзка.'}`, error: true }]);
    } finally { setPending(null); setBusy(false); ctrl.current = null; }
  }

  const clear = () => { ctrl.current?.abort(); setMessages([]); inputRef.current?.focus(); };
  const onLogClick = (e) => { if (e.target.closest('a[href^="#/"]') && window.matchMedia('(max-width: 560px)').matches) setOpen(false); };

  return (
    <div className={`fa${open ? ' open' : ''}`}>
      <section className="fa-panel" id="fa-panel" role="dialog" aria-modal="false" aria-labelledby="fa-title" hidden={!open && !shown}>
        <header className="fa-head">
          <span className="fa-avatar" aria-hidden="true"><img src="/wave-sm.png" alt="" width="26" height="23" /></span>
          <div className="fa-title"><b id="fa-title">Espy</b><span>AI асистент · Gemini</span></div>
          <button className="fa-icon" type="button" onClick={clear} title="Изчисти разговора" aria-label="Изчисти разговора">↺</button>
          <button className="fa-icon" type="button" onClick={() => { setOpen(false); fabRef.current?.focus(); }} title="Затвори" aria-label="Затвори асистента">✕</button>
        </header>
        <div className="fa-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions" onClick={onLogClick}>
          <div className="fa-msg bot"><Markdown text={GREETING} /></div>
          {messages.map((m, i) => (
            <div key={i} className={`fa-msg ${m.role === 'user' ? 'me' : 'bot'}${m.error ? ' err' : ''}`}>{m.role === 'user' ? <p>{m.text}</p> : <Markdown text={m.text} />}</div>
          ))}
          {pending !== null && (
            <div className="fa-msg bot">{pending ? <><Markdown text={pending} /><span className="fa-caret" aria-hidden="true" /></> : <span className="fa-dots" aria-label="Асистентът пише"><i /><i /><i /></span>}</div>
          )}
        </div>
        {!messages.length && <div className="fa-sugg">{SUGGESTIONS.map((s) => <button key={s} type="button" className="fa-chip" onClick={() => ask(s)}>{s}</button>)}</div>}
        <form className="fa-form" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <textarea ref={inputRef} rows={1} maxLength={1500} placeholder="Напиши въпрос…" aria-label="Въпрос към асистента" value={input}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(input); } }} />
          <button className="fa-send" type="submit" aria-label="Изпрати" disabled={busy}>➤</button>
        </form>
        <p className="fa-note">AI текст – може да греши. Не пиши лични данни.</p>
      </section>
      <button ref={fabRef} className="fa-fab" type="button" aria-controls="fa-panel" aria-expanded={open} aria-label={open ? 'Затвори асистента Espy' : 'Отвори асистента Espy'} onClick={() => setOpen((o) => !o)}>
        <span className="fa-fab-open" aria-hidden="true">✦</span><span className="fa-fab-close" aria-hidden="true">✕</span>
        <span className="fa-fab-label">Попитай Espy</span>
      </button>
    </div>
  );
}
