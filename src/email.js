// Изпращане на резултатите по имейл чрез SMTP (без външни библиотеки).
// Поддържа SMTPS (порт 465) и STARTTLS (порт 587).
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
export const isValidEmail = (e) => typeof e === 'string' && e.length <= 254 && EMAIL_RE.test(e);
export const hashEmail = (e) => crypto.createHash('sha256').update(String(e).trim().toLowerCase()).digest('hex');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KIND = { fact: 'Факт', forecast: 'Прогноза', model: 'Модел на Future Jobs', ai: 'AI текст' };

export function buildResultEmail(rec, ai, publicUrl) {
  const occ = rec.occupations.map((o) => `<li><b>${esc(o.title)}</b> – съвпадение ${o.match}%` +
    (o.outlook.index !== null ? `, индекс на перспективата ${o.outlook.index}/100` : '') +
    (o.salary?.bg ? `<br><small>Средна брутна заплата в България: ≈ ${o.salary.bg.monthly.toLocaleString('bg-BG')} EUR/мес. – „${esc(o.salary.group)}“${o.salary.sector ? ` в „${esc(o.salary.sector)}“` : ''} (${o.salary.bg.isEstimate ? `оценка за ${esc(o.salary.bg.period)}` : `Eurostat SES ${esc(o.salary.bg.period)}`})</small>` : '') +
    '</li>').join('');
  const hz = rec.horizons.map((h) => `
    <h3 style="color:#0f5c4d;margin:24px 0 4px">${esc(h.label)}</h3><p style="margin:0 0 8px;color:#555">${esc(h.subtitle)}</p>
    ${ai?.ok && ai.texts[h.key] ? `<p style="background:#f3efe6;padding:8px 12px;border-radius:6px"><small><b>AI текст</b> (${esc(ai.model)}), базиран само на данните по-долу:</small><br>${esc(ai.texts[h.key])}</p>` : ''}
    ${h.items.map((i) => `
      <div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin:8px 0">
        <b style="font-size:16px">${esc(i.name)}</b>${i.score !== null ? ` <span style="color:#0f5c4d">· Future Skills Score ${i.score}/100</span>` : ''}
        <p style="margin:6px 0">${i.why.map(esc).join(' ')}</p>
        <ul style="margin:4px 0;padding-left:18px">${i.evidence.map((e) => `<li><small><b>${KIND[e.kind]}:</b> ${esc(e.text)} <i>(${esc(e.source)}; ${esc(e.period)})</i></small></li>`).join('')}</ul>
        <p style="margin:6px 0"><b>Стъпки:</b></p><ol style="margin:0;padding-left:18px">${i.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <p style="margin:6px 0"><b>Ресурси:</b> ${i.resources.map((r) => `<a href="${esc(r.url)}">${esc(r.title)}</a>`).join(' · ')}</p>
        ${i.nextSkills.length ? `<p style="margin:6px 0"><b>След това:</b> ${i.nextSkills.map(esc).join(', ')}</p>` : ''}
      </div>`).join('')}`).join('');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1d1d1b;max-width:680px;margin:auto;padding:16px">
    <h1 style="color:#0f5c4d;margin-bottom:0">Future Jobs</h1><p style="margin-top:4px">Твоят план за бъдещите умения</p>
    <p>Интереси: <b>${esc(rec.profile.topInterests.join(', '))}</b>. Данни към: ${esc(rec.dataAsOf ? new Date(rec.dataAsOf).toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' }) : 'няма импорт')}.</p>
    <h2>Професии, подходящи за теб</h2><ul>${occ}</ul>
    <h2>Умения по хоризонти</h2>${hz}
    <hr><p><small>${rec.disclaimers.map(esc).join('<br>')}</small></p>
    <p><small>Източници: Eurostat, ESCO, Cedefop Skills Forecast 2025, WEF Future of Jobs 2025, обяви от Arbeitnow и Remotive.</small></p>
    <p><a href="${esc(publicUrl)}">${esc(publicUrl)}</a></p></body></html>`;
  const text = [
    'Future Jobs – твоят план за бъдещите умения', '',
    ...rec.occupations.map((o) => `• ${o.title} (${o.match}%)`), '',
    ...rec.horizons.flatMap((h) => [`== ${h.label} ==`, ...h.items.map((i) => `- ${i.name}: ${i.steps[0] || ''}`), '']),
    ...rec.disclaimers, publicUrl,
  ].join('\n');
  return { subject: 'Future Jobs: твоите препоръчани умения и професии', html, text };
}

function encodeHeader(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
const b64lines = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');

export function buildMime({ from, to, subject, text, html }) {
  const boundary = `fj_${crypto.randomBytes(12).toString('hex')}`;
  const fromMatch = from.match(/^(.*)<(.+)>$/);
  const fromHeader = fromMatch ? `${encodeHeader(fromMatch[1].trim().replace(/^"|"$/g, ''))} <${fromMatch[2]}>` : from;
  return [
    `From: ${fromHeader}`, `To: <${to}>`, `Subject: ${encodeHeader(subject)}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@future-jobs>`, 'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64lines(text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64lines(html),
    `--${boundary}--`, '',
  ].join('\r\n');
}

/** Превежда честите SMTP грешки в разбираеми насоки (показва се само на администратора). */
export function explainSmtpError(err) {
  const m = String(err?.message || err);
  if (/535|Username and Password not accepted|BadCredentials|authentication failed/i.test(m))
    return 'Gmail отхвърля потребителя/паролата. SMTP_PASS трябва да е „парола за приложение“ (16 знака) от myaccount.google.com/apppasswords, а SMTP_USER – същият Gmail адрес. Нужна е включена двуетапна проверка.';
  if (/534|Application-specific password required|WebLoginRequired/i.test(m))
    return 'Google изисква парола за приложение (обикновената парола не става) или вход през браузъра. Създай парола за приложение.';
  if (/wrong version number|EPROTO|ssl3_get_record/i.test(m))
    return 'Несъответствие на порт и TLS: за порт 465 SMTP_SECURE=true, за порт 587 SMTP_SECURE=false.';
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return 'Грешен SMTP_HOST (за Gmail: smtp.gmail.com).';
  if (/ECONNREFUSED|ETIMEDOUT|timeout/i.test(m)) return 'Няма връзка със SMTP сървъра – провери SMTP_HOST и SMTP_PORT (Gmail: 465).';
  if (/не е конфигуриран/i.test(m)) return 'Липсва SMTP_HOST. Добави променливите и направи Redeploy.';
  if (/55[0-4]|sender|From/i.test(m)) return 'Сървърът отказва адреса на подателя. Сложи MAIL_FROM със същия адрес като SMTP_USER.';
  return 'Виж точния отговор на сървъра по-горе.';
}

/** Минимален SMTP клиент */
export async function sendSmtp(smtp, { to, subject, text, html }) {
  if (!smtp.host) throw new Error('SMTP не е конфигуриран (SMTP_HOST)');
  if (!isValidEmail(to)) throw new Error('Невалиден имейл адрес');
  let socket = smtp.secure
    ? tls.connect({ host: smtp.host, port: smtp.port, servername: smtp.host, rejectUnauthorized: smtp.rejectUnauthorized !== false })
    : net.connect({ host: smtp.host, port: smtp.port });
  socket.setTimeout(20000);
  let buffer = '';
  let waiter = null;
  const onData = (d) => {
    buffer += d.toString('utf8');
    if (!waiter) return; // пазим отговора, докато някой го поиска
    const lines = buffer.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i])) {
        const resp = lines.slice(0, i + 1).join('\n');
        buffer = lines.slice(i + 1).join('\r\n');
        const w = waiter; waiter = null;
        if (w) w.resolve(resp);
        return;
      }
    }
  };
  const attach = (s) => {
    s.on('data', onData);
    s.on('error', (e) => waiter?.reject(e));
    s.on('timeout', () => { waiter?.reject(new Error('SMTP timeout')); s.destroy(); });
  };
  attach(socket);
  const read = () => new Promise((resolve, reject) => { waiter = { resolve, reject }; onData(Buffer.alloc(0)); });
  const cmd = async (line, expect) => {
    const p = read();
    if (line !== null) socket.write(`${line}\r\n`);
    const resp = await p;
    const code = Number(resp.slice(0, 3));
    if (!expect.includes(code)) throw new Error(`SMTP: неочакван отговор на „${String(line).split(' ')[0]}“: ${resp.slice(0, 200)}`);
    return resp;
  };
  try {
    if (smtp.secure) await new Promise((res, rej) => { socket.once('secureConnect', res); socket.once('error', rej); });
    await cmd(null, [220]);
    let ehlo = await cmd('EHLO future-jobs.local', [250]);
    if (!smtp.secure && /STARTTLS/i.test(ehlo)) {
      await cmd('STARTTLS', [220]);
      socket.removeListener('data', onData);
      socket = tls.connect({ socket, servername: smtp.host, rejectUnauthorized: smtp.rejectUnauthorized !== false });
      await new Promise((res, rej) => { socket.once('secureConnect', res); socket.once('error', rej); });
      attach(socket);
      ehlo = await cmd('EHLO future-jobs.local', [250]);
    }
    if (smtp.user) {
      await cmd('AUTH LOGIN', [334]);
      await cmd(Buffer.from(smtp.user).toString('base64'), [334]);
      await cmd(Buffer.from(smtp.pass).toString('base64'), [235]);
    }
    const fromAddr = (smtp.from.match(/<(.+)>/) || [null, smtp.from])[1];
    await cmd(`MAIL FROM:<${fromAddr}>`, [250]);
    await cmd(`RCPT TO:<${to}>`, [250, 251]);
    await cmd('DATA', [354]);
    await cmd(`${buildMime({ from: smtp.from, to, subject, text, html })}\r\n.`, [250]);
    await cmd('QUIT', [221]).catch(() => {});
  } finally {
    socket.end();
  }
}
