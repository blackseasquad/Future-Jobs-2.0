import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { memDb, testConfig, fakeFetch } from './helpers.js';
import { createApp } from '../src/server.js';
import { runRefresh } from '../src/pipeline.js';
import { sendSmtp, buildMime } from '../src/email.js';

const ANSWERS = { afternoon: 'help', subjects: ['bio', 'social'], workwith: 'people', tech_attitude: 'less', environment: 'clinic', values: 'impact', study: 'university', english: 'good' };
let server, base, db, sent = [];

before(async () => {
  db = memDb();
  const config = testConfig({ smtp: { host: 'smtp.test', port: 1, secure: false, user: '', pass: '', from: 'FJ <a@b.bg>' } });
  const refreshImpl = (d, o) => runRefresh(d, { ...o, fetchJson: fakeFetch(), log: () => {}, politeDelayMs: 0 });
  server = createApp({ db, config, refreshImpl, sendMail: async (_s, m) => { sent.push(m); }, aiImpl: /** @type {any} */ (async () => ({ enabled: false })) });
  await new Promise((r) => server.listen(0, () => r(null)));
  base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
});
after(() => server.close());

const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body || {}) });

test('статус преди първия импорт: данните са маркирани като остарели', async () => {
  const s = await (await fetch(`${base}/api/status`)).json();
  assert.equal(s.lastSuccessfulImport, null);
  assert.equal(s.stale, true);
  assert.ok(s.sources.find((x) => x.id === 'google_trends').status === 'not_integrated');
  assert.ok(s.sources.find((x) => x.id === 'adzuna').status === 'not_configured');
});

test('планираният endpoint е защитен със секрет', async () => {
  assert.equal((await post('/api/cron/refresh')).status, 401);
  assert.equal((await post('/api/cron/refresh', {}, { authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await post('/api/cron/refresh', {}, { authorization: `Bearer ${'a'.repeat(40)}` })).status, 401, 'admin токенът не важи за cron');
  assert.equal((await fetch(`${base}/api/cron/refresh`)).status, 401, 'GET (Vercel Cron) също изисква секрет');
  const ok = await post('/api/cron/refresh?wait=1', {}, { authorization: `Bearer ${'c'.repeat(40)}` });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).status, 'success');
  const again = await (await post('/api/cron/refresh?wait=1', {}, { authorization: `Bearer ${'c'.repeat(40)}` })).json();
  assert.equal(again.status, 'skipped', 'второ планирано изпълнение в същия ден');
});

test('админ обновяване изисква X-Admin-Token', async () => {
  assert.equal((await post('/api/admin/refresh')).status, 401);
  assert.equal((await post('/api/admin/refresh', {}, { authorization: `Bearer ${'c'.repeat(40)}` })).status, 401);
  const r = await post('/api/admin/refresh?wait=1', {}, { 'x-admin-token': 'a'.repeat(40) });
  assert.equal(r.status, 200);
});

test('без конфигуриран секрет endpoint-ът е изключен (503)', async () => {
  const s = createApp({ db: memDb(), config: testConfig({ cronSecret: '' }) });
  await new Promise((r) => s.listen(0, () => r(null)));
  const res = await fetch(`http://127.0.0.1:${/** @type {any} */ (s.address()).port}/api/cron/refresh`, { method: 'POST', headers: { authorization: 'Bearer ' } });
  assert.equal(res.status, 503);
  s.close();
});

test('API: статус, умения, професии, пазар, анкета', async () => {
  const s = await (await fetch(`${base}/api/status`)).json();
  assert.ok(s.lastSuccessfulImport);
  assert.equal(s.stale, false);
  assert.ok(s.runs.length >= 2);
  const skills = await (await fetch(`${base}/api/skills`)).json();
  assert.equal(skills.skills.length, 28);
  const one = await (await fetch(`${base}/api/skills/python`)).json();
  assert.ok(one.history.length >= 1);
  const occ = await (await fetch(`${base}/api/occupations/nurse`)).json();
  assert.ok(occ.employment.BG.series.length > 3);
  assert.equal((await fetch(`${base}/api/occupations/nope`)).status, 404);
  const market = await (await fetch(`${base}/api/market`)).json();
  assert.ok(market.vacancyRate.BG.length > 0);
  const quiz = await (await fetch(`${base}/api/quiz`)).json();
  assert.equal(quiz.questions.length, 8);
});

test('препоръки и изпращане на имейл (без запис на адреса)', async () => {
  const rec = await (await post('/api/recommendations', { answers: ANSWERS })).json();
  assert.ok(['nurse', 'social_worker', 'personal_care_worker'].includes(rec.occupations[0].id), rec.occupations[0].id);
  assert.ok(!rec.horizons.flatMap((h) => h.items).some((i) => i.skillId === 'english'), 'английски вече е владян');
  assert.equal((await post('/api/email', { answers: ANSWERS, email: 'bad', consent: true })).status, 400);
  assert.equal((await post('/api/email', { answers: ANSWERS, email: 'ucenik@example.com' })).status, 400, 'нужно е съгласие');
  const ok = await post('/api/email', { answers: ANSWERS, email: 'ucenik@example.com', consent: true });
  assert.equal(ok.status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].html, /6–12 месеца/);
  const log = db.prepare('SELECT * FROM email_log').all();
  assert.equal(log.length, 1);
  assert.ok(!JSON.stringify(log).includes('ucenik'));
});

test('статичните файлове не излизат извън public/', async () => {
  const r = await fetch(`${base}/..%2F.env.example`);
  assert.ok([403, 404].includes(r.status));
  const idx = await fetch(`${base}/`);
  assert.equal(idx.status, 200);
});

test('SMTP клиентът изпраща валидно MIME съобщение', async () => {
  const received = [];
  const smtp = net.createServer((sock) => {
    let data = false;
    let buf = '';
    sock.write('220 test ESMTP\r\n');
    sock.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) { if (line === '.') { data = false; sock.write('250 queued\r\n'); } else received.push(line); continue; }
        if (/^EHLO/.test(line)) sock.write('250-test\r\n250 AUTH LOGIN\r\n');
        else if (/^AUTH LOGIN/.test(line)) sock.write('334 VXNlcm5hbWU6\r\n');
        else if (line === Buffer.from('user').toString('base64')) sock.write('334 UGFzc3dvcmQ6\r\n');
        else if (line === Buffer.from('pass').toString('base64')) sock.write('235 ok\r\n');
        else if (/^MAIL FROM/.test(line) || /^RCPT TO/.test(line)) sock.write('250 ok\r\n');
        else if (line === 'DATA') { data = true; sock.write('354 go\r\n'); }
        else if (line === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      }
    });
  });
  await new Promise((r) => smtp.listen(0, () => r(null)));
  await sendSmtp({ host: '127.0.0.1', port: /** @type {any} */ (smtp.address()).port, secure: false, user: 'user', pass: 'pass', from: 'Future Jobs <no-reply@x.bg>' },
    { to: 'a@b.bg', subject: 'Тест', text: 'здравей', html: '<b>здравей</b>' });
  smtp.close();
  const msg = received.join('\n');
  assert.match(msg, /Subject: =\?UTF-8\?B\?/);
  assert.match(msg, /multipart\/alternative/);
  assert.ok(msg.includes(Buffer.from('<b>здравей</b>').toString('base64')));
  assert.match(buildMime({ from: 'x@y.bg', to: 'a@b.bg', subject: 'S', text: 't', html: 'h' }), /To: <a@b.bg>/);
});
