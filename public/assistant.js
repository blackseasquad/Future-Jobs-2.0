// FloatingAssistant – плаващ чат асистент „Посока“ (без библиотеки).
// Говори само с /api/assistant; ключът за Gemini е на сървъра.

const STORE = 'fj-assistant-v1';
const SUGGESTIONS = ['Как работи анкетата?', 'Откъде са данните?', 'Какво е Future Skills Score?', 'Какво значи „ниска увереност“?'];
const GREETING = 'Здравей! Аз съм **Посока** – помощникът на Future Jobs. Питай ме как работи приложението, откъде са данните или къде да намериш нещо.';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Минимален и безопасен markdown: **удебелен**, _наклонен_, [текст](#/път), списъци. Само вътрешни линкове. */
function md(text) {
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|\s)_(.+?)_(?=\s|$|[.,!?])/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((#\/[a-z0-9_/-]*)\)/gi, '<a href="$2">$1</a>');
  const out = [];
  let list = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    const m = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
    if (m) {
      const type = m[1] ? 'ol' : 'ul';
      if (!list || list.type !== type) { if (list) out.push(`</${list.type}>`); list = { type }; out.push(`<${type}>`); }
      out.push(`<li>${inline(m[2])}</li>`);
      continue;
    }
    if (list) { out.push(`</${list.type}>`); list = null; }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list.type}>`);
  return out.join('');
}

export function mountAssistant() {
  /** @type {{role:'user'|'model', text:string, error?:boolean}[]} */
  let messages = [];
  try { messages = JSON.parse(sessionStorage.getItem(STORE) || '[]'); } catch { messages = []; }
  const save = () => { try { sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-30))); } catch { /* */ } };
  let busy = false;
  let controller = null;

  const root = document.createElement('div');
  root.className = 'fa';
  root.innerHTML = `
    <section class="fa-panel" id="fa-panel" role="dialog" aria-modal="false" aria-labelledby="fa-title" hidden>
      <header class="fa-head">
        <span class="fa-avatar" aria-hidden="true"><img src="/wave-sm.png" alt="" width="26" height="23"></span>
        <div class="fa-title"><b id="fa-title">Посока</b><span>AI асистент · Gemini</span></div>
        <button class="fa-icon" type="button" data-fa="clear" title="Изчисти разговора" aria-label="Изчисти разговора">↺</button>
        <button class="fa-icon" type="button" data-fa="close" title="Затвори" aria-label="Затвори асистента">✕</button>
      </header>
      <div class="fa-log" id="fa-log" role="log" aria-live="polite" aria-relevant="additions"></div>
      <div class="fa-sugg" id="fa-sugg"></div>
      <form class="fa-form" id="fa-form">
        <textarea id="fa-input" rows="1" maxlength="1500" placeholder="Напиши въпрос…" aria-label="Въпрос към асистента"></textarea>
        <button class="fa-send" type="submit" aria-label="Изпрати">➤</button>
      </form>
      <p class="fa-note">AI текст – може да греши. Не пиши лични данни.</p>
    </section>
    <button class="fa-fab" type="button" aria-controls="fa-panel" aria-expanded="false" aria-label="Отвори AI асистента">
      <span class="fa-fab-open" aria-hidden="true">✦</span><span class="fa-fab-close" aria-hidden="true">✕</span>
      <span class="fa-fab-label">Попитай Посока</span>
    </button>`;
  document.body.appendChild(root);

  const $ = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
  const panel = $('#fa-panel'), log = $('#fa-log'), sugg = $('#fa-sugg'), fab = $('.fa-fab');
  const form = /** @type {HTMLFormElement} */ ($('#fa-form'));
  const input = /** @type {HTMLTextAreaElement} */ ($('#fa-input'));

  const bubble = (m) => `<div class="fa-msg ${m.role === 'user' ? 'me' : 'bot'}${m.error ? ' err' : ''}">${m.role === 'user' ? `<p>${esc(m.text)}</p>` : md(m.text)}</div>`;
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  function paint() {
    log.innerHTML = bubble({ role: 'model', text: GREETING }) + messages.map(bubble).join('');
    sugg.innerHTML = messages.length ? '' : SUGGESTIONS.map((s) => `<button type="button" class="fa-chip" data-q="${esc(s)}">${esc(s)}</button>`).join('');
    scroll();
  }

  function open(state) {
    const isOpen = state ?? panel.hidden;
    if (isOpen) {
      panel.hidden = false;
      requestAnimationFrame(() => root.classList.add('open'));
      paint();
      setTimeout(() => input.focus(), 120);
    } else {
      root.classList.remove('open');
      setTimeout(() => { if (!root.classList.contains('open')) panel.hidden = true; }, 220);
      fab.focus();
    }
    fab.setAttribute('aria-expanded', String(isOpen));
  }

  async function ask(q) {
    const text = q.trim();
    if (!text || busy) return;
    busy = true;
    messages.push({ role: 'user', text });
    save(); paint();
    input.value = ''; autosize();
    const el = document.createElement('div');
    el.className = 'fa-msg bot';
    el.innerHTML = '<span class="fa-dots" aria-label="Асистентът пише"><i></i><i></i><i></i></span>';
    log.appendChild(el); scroll();
    let answer = '';
    try {
      controller = new AbortController();
      const res = await fetch('/api/assistant', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ messages: messages.filter((m) => !m.error).map(({ role, text: t }) => ({ role, text: t })) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Асистентът не е достъпен в момента.');
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += dec.decode(value, { stream: true });
        el.innerHTML = md(answer) + '<span class="fa-caret" aria-hidden="true"></span>';
        scroll();
      }
      el.innerHTML = md(answer);
      messages.push({ role: 'model', text: answer || 'Нямам отговор на това. Опитай да зададеш въпроса по друг начин.' });
    } catch (err) {
      if (err?.name === 'AbortError') { el.remove(); busy = false; return; }
      const msg = `⚠ ${err.message || 'Няма връзка.'}`;
      el.classList.add('err'); el.innerHTML = md(msg);
      messages.push({ role: 'model', text: msg, error: true });
    } finally {
      controller = null;
      busy = false;
      save();
    }
    scroll();
  }

  function autosize() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; }

  fab.addEventListener('click', () => open());
  root.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const b = t.closest('[data-fa], [data-q], a');
    if (!b) return;
    if (b.matches('[data-fa="close"]')) open(false);
    else if (b.matches('[data-fa="clear"]')) { controller?.abort(); messages = []; save(); paint(); input.focus(); }
    else if (b.matches('[data-q]')) ask(/** @type {HTMLElement} */ (b).dataset.q);
    else if (b.matches('a[href^="#/"]') && window.matchMedia('(max-width: 560px)').matches) open(false);
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
  });
  input.addEventListener('input', autosize);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) open(false); });
}
