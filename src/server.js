// HTTP сървър на Future Jobs: REST API + статичен frontend. Без външни зависимости.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getConfig, ROOT } from './config.js';
import { openDb, getMeta } from './db.js';
import { SOURCE_META, syncSources } from './sources/index.js';
import { SKILLS, SKILL_BY_ID } from './catalog/skills.js';
import { OCCUPATIONS, OCCUPATION_BY_ID, ISCO_MAJOR_LABELS } from './catalog/occupations.js';
import { WEF_2025, CEDEFOP_BG_2025 } from './catalog/published.js';
import { QUIZ, INTERESTS } from './catalog/quiz.js';
import { latestSkillMetrics, skillHistory, occupationOutlook, employmentTrend, WEIGHTS, MODEL_VERSION, MIN_POSTINGS } from './model/scoring.js';
import { recommend, salaryFor, planFor } from './model/recommend.js';
import { explainWithAi } from './ai.js';
import { streamWithFallback } from './assistant/gemini.js';
import { buildSystemInstruction } from './assistant/knowledge.js';
import { buildPrompt, validatePlan, answersToText } from '../public/plan-prompt.js';
import { buildResultEmail, sanitizePlans, sendSmtp, isValidEmail, hashEmail, explainSmtpError } from './email.js';
import { runRefresh, AlreadyRunningError } from './pipeline.js';
import { localProvider, blobProvider, loadVercelBlob, StorageConflictError } from './storage.js';
import { nextSofiaRun } from './lib/time.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' };

/** Сравнение на секрети с постоянно време */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' https://www.gstatic.com https://www.google.com https://www.recaptcha.net; connect-src 'self' https://*.googleapis.com https://www.google.com https://www.gstatic.com; frame-src https://www.google.com https://recaptcha.google.com https://www.recaptcha.net; frame-ancestors 'none'",
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : headers['Content-Type'] || 'text/plain; charset=utf-8',
    ...SECURITY_HEADERS,
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readJson(req, limit = 64 * 1024) {
  // Vercel Node runtime може да е прочел и парснал тялото предварително (req.body)
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (text.length > limit) throw new HttpError(413, 'Твърде голяма заявка');
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw new HttpError(400, 'Невалиден JSON'); }
  }
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'Твърде голяма заявка');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Невалиден JSON'); }
}

// Прост лимит на заявки по IP (в паметта)
function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return false;
    arr.push(now);
    hits.set(key, arr);
    return true;
  };
}

/**
 * Връща (req, res) handler – използва се и от Node сървъра, и от Vercel функцията (api/index.js).
 * @param {{db?:any, provider?:import('./storage.js').Provider, config:any, refreshImpl?:Function, sendMail?:Function, aiImpl?:Function, assistantFetch?:typeof fetch}} o
 */
export function createHandler({ db: initialDb, provider, config, refreshImpl = runRefresh, sendMail = sendSmtp, aiImpl = explainWithAi, assistantFetch = undefined }) {
  if (!provider) {
    if (!initialDb) throw new Error('createHandler: нужен е db или provider');
    syncSources(initialDb);
    provider = localProvider(initialDb);
  }
  /** @type {import('node:sqlite').DatabaseSync} */
  let db = initialDb || null;
  const alwaysWait = provider.mode !== 'local';
  const emailLimit = rateLimiter(5, 3600 * 1000);
  const recLimit = rateLimiter(60, 3600 * 1000);
  const assistantLimit = rateLimiter(30, 10 * 60 * 1000);
  const planLimit = rateLimiter(40, 10 * 60 * 1000);

  /** Проверява историята на чата от браузъра: само роли user/model, ограничена дължина. */
  function chatContents(body) {
    const msgs = Array.isArray(body?.messages) ? body.messages.slice(-16) : [];
    const out = msgs.map((m) => ({ role: m?.role === 'model' ? 'model' : m?.role === 'user' ? 'user' : null, text: String(m?.text ?? '').trim().slice(0, 1500) }))
      .filter((m) => m.role && m.text);
    while (out.length && out[0].role !== 'user') out.shift(); // Gemini иска разговорът да започва с user
    if (!out.length || out[out.length - 1].role !== 'user') throw new HttpError(400, 'Няма въпрос');
    let total = 0;
    for (let i = out.length - 1; i >= 0; i--) { total += out[i].text.length; if (total > 8000) return out.slice(i + 1); }
    return out;
  }

  function assistantContext() {
    const last = getMeta(db, 'last_successful_import_at');
    return {
      status: last ? `Последно успешно обновяване на данните: ${new Date(last).toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' })} (българско време). Днес е ${new Date().toLocaleDateString('bg-BG', { timeZone: 'Europe/Sofia' })}.` : 'Все още няма успешно обновяване на данните.',
      occupations: OCCUPATIONS.map((o) => ({ id: o.id, title: o.title })),
      skills: SKILLS.map((x) => ({ id: x.id, name: x.name })),
    };
  }
  let backgroundRun = null;

  function startRefresh(opts) {
    if (backgroundRun) throw new AlreadyRunningError('Обновяване вече тече');
    const p = provider.write((wdb) => refreshImpl(wdb, { config, deadlineMs: config.refreshBudgetMs || undefined, ...opts }))
      .catch((err) => ({ status: err instanceof AlreadyRunningError || err instanceof StorageConflictError ? 'conflict' : 'failed', error: err.message }))
      .finally(() => { backgroundRun = null; });
    backgroundRun = p;
    return p;
  }

  function statusPayload() {
    const now = new Date();
    const last = getMeta(db, 'last_successful_import_at');
    const ageH = last ? (now.getTime() - Date.parse(last)) / 3600000 : null;
    const states = new Map(db.prepare('SELECT * FROM source_state').all().map((r) => [String(r.source_id), r]));
    const sources = SOURCE_META.map((s) => {
      const st = states.get(s.id);
      const configured = s.id === 'adzuna' ? Boolean(config.adzuna.appId && config.adzuna.appKey) : true;
      let status = 'never';
      if (s.kind === 'not_integrated') status = 'not_integrated';
      else if (!configured) status = 'not_configured';
      else if (st?.last_error && (!st.last_success_at || String(st.last_attempt_at) > String(st.last_success_at))) status = 'error';
      else if (st?.last_success_at) status = 'ok';
      const stale = s.kind === 'api' && st?.last_success_at ? (now.getTime() - Date.parse(String(st.last_success_at))) / 3600000 > config.staleAfterHours : false;
      return {
        id: s.id, name: s.name, kind: s.kind, url: s.url, updateFrequency: s.updateFrequency, terms: s.terms, requiresKey: s.requiresKey,
        configured, status, stale,
        lastSuccessAt: st?.last_success_at || null, lastAttemptAt: st?.last_attempt_at || null, lastError: st?.last_error || null,
        dataPeriod: st?.last_data_period || null, consecutiveFailures: st ? Number(st.consecutive_failures) : 0,
      };
    });
    const runs = db.prepare('SELECT * FROM refresh_runs ORDER BY id DESC LIMIT 20').all().map((r) => ({
      ...r, sources: db.prepare('SELECT source_id, status, fetched, inserted, updated, duplicates, rejected, data_period, error FROM source_runs WHERE run_id = ? ORDER BY id').all(r.id),
    }));
    const c = (sql) => Number(db.prepare(sql).get().n);
    return {
      now: now.toISOString(), timezone: config.timezone,
      lastSuccessfulImport: last, ageHours: ageH === null ? null : Math.round(ageH * 10) / 10,
      stale: ageH === null || ageH > config.staleAfterHours, staleAfterHours: config.staleAfterHours,
      nextScheduledRun: nextSofiaRun(now, config.scheduledHour).toISOString(),
      schedule: `Всеки ден в 06:00 ч. (Europe/Sofia) чрез ${config.onVercel ? 'Vercel Cron' : 'системен планировчик на сървъра'} – независимо дали някой е отворил приложението.`,
      running: Boolean(backgroundRun),
      storage: { ...provider.info(), warning: provider.persistent ? null
        : 'Базата е временна (Vercel без свързан Blob store) – данните ще изчезнат при следващия cold start. Свържи private Blob store към проекта.' },
      sources, runs,
      counts: {
        postings: c('SELECT COUNT(*) n FROM job_postings'),
        observations: c('SELECT COUNT(*) n FROM stat_observations'),
        revisions: c('SELECT COUNT(*) n FROM stat_revisions'),
        escoConcepts: c('SELECT COUNT(*) n FROM esco_concepts WHERE local_id IS NOT NULL'),
        metricDays: c('SELECT COUNT(DISTINCT date) n FROM skill_metrics'),
      },
    };
  }

  function skillSummary(s, m) {
    return {
      id: s.id, name: s.name, en: s.en, category: s.category, description: s.description,
      score: m?.score ?? null, confidence: m?.confidence ?? 'insufficient', date: m?.date ?? null,
      demandShare: m?.demand_share ?? null, postings: m?.postings_with_skill ?? null, postingsTotal: m?.postings_total ?? null,
      change30: m?.change_30d ?? null, change90: m?.change_90d ?? null, longTerm: m?.long_term ?? null,
      escoOccupations: m?.breadth ?? null, wef: s.wef ? WEF_2025.growingSkills.find((g) => g.key === s.wef) || null : null,
    };
  }

  function escoFor(type, id) {
    return db.prepare('SELECT uri, label_bg, label_en, code, essential_for_count, optional_for_count, fetched_at FROM esco_concepts WHERE type = ? AND local_id = ?').get(type, id) || null;
  }

  function occSummary(o) {
    const esco = escoFor('occupation', o.id);
    const isco2 = esco?.code && /^\d\d/.test(String(esco.code)) ? String(esco.code).slice(0, 2) : null;
    const outlook = occupationOutlook(db, o, isco2);
    return {
      id: o.id, title: o.title, description: o.description, isco: o.isco, iscoLabel: ISCO_MAJOR_LABELS[o.isco], isco2: isco2 || o.isco2,
      interests: Object.keys(o.interests).map((k) => INTERESTS[k]),
      coreSkills: o.coreSkills.map((id) => ({ id, name: SKILL_BY_ID.get(id)?.name })),
      complementarySkills: o.complementarySkills.map((id) => ({ id, name: SKILL_BY_ID.get(id)?.name })),
      wefFastest: o.wefFastest ? WEF_2025.fastestGrowingJobs.find((j) => j.key === o.wefFastest) : null,
      wefLargest: o.wefLargest ? WEF_2025.largestGrowthJobs.find((j) => j.key === o.wefLargest) : null,
      outlook: { index: outlook.index, signals: outlook.signals },
      salary: salaryFor(db, o),
      esco,
    };
  }

  function requireSecret(req, expected, headerName) {
    if (!expected || expected.length < 16) throw new HttpError(503, 'Endpoint-ът не е конфигуриран (липсва секрет на сървъра)');
    const auth = String(req.headers.authorization || '');
    const provided = headerName ? String(req.headers[headerName] || '') : auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!safeEqual(provided, expected)) throw new HttpError(401, 'Неоторизиран достъп');
  }

  async function handleApi(req, res, url) {
    const p = url.pathname;
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

    if (req.method === 'GET' && p === '/api/status') return send(res, 200, statusPayload());
    if (req.method === 'GET' && p === '/api/quiz') return send(res, 200, { questions: QUIZ.map((q) => ({ id: q.id, type: q.type, max: q.max, text: q.text, options: q.options.map((o) => ({ id: o.id, text: o.text })) })) });

    if (req.method === 'GET' && p === '/api/skills') {
      const m = latestSkillMetrics(db);
      return send(res, 200, { skills: SKILLS.map((s) => skillSummary(s, m.get(s.id))), weights: WEIGHTS, modelVersion: MODEL_VERSION, minPostings: MIN_POSTINGS });
    }
    let mm = p.match(/^\/api\/skills\/([a-z_]+)$/);
    if (req.method === 'GET' && mm) {
      const s = SKILL_BY_ID.get(mm[1]);
      if (!s) throw new HttpError(404, 'Няма такова умение');
      const m = latestSkillMetrics(db).get(s.id);
      return send(res, 200, {
        ...skillSummary(s, m), resources: s.resources, synonyms: s.patterns, firstStep: planFor(s, 'mid').firstStep,
        details: m?.details ? { ...m.details, cooccurrence: (m.details.cooccurrence || []).map((c) => ({ ...c, name: SKILL_BY_ID.get(c.skill)?.name || c.skill })) } : null,
        history: skillHistory(db, s.id), esco: escoFor('skill', s.id),
        occupations: OCCUPATIONS.filter((o) => o.coreSkills.includes(s.id) || o.complementarySkills.includes(s.id)).map((o) => ({ id: o.id, title: o.title, core: o.coreSkills.includes(s.id) })),
      });
    }
    if (req.method === 'GET' && p === '/api/occupations') return send(res, 200, { occupations: OCCUPATIONS.map(occSummary) });
    mm = p.match(/^\/api\/occupations\/([a-z_]+)$/);
    if (req.method === 'GET' && mm) {
      const o = OCCUPATION_BY_ID.get(mm[1]);
      if (!o) throw new HttpError(404, 'Няма такава професия');
      const escoRel = db.prepare(`SELECT r.to_label, r.relation FROM esco_relations r JOIN esco_concepts c ON c.uri = r.from_uri
        WHERE c.type = 'occupation' AND c.local_id = ? ORDER BY r.relation, r.to_label LIMIT 60`).all(o.id);
      return send(res, 200, {
        ...occSummary(o),
        employment: { BG: employmentTrend(db, o.isco, 'BG'), EU: employmentTrend(db, o.isco, 'EU27_2020'), source: 'Eurostat lfsa_egais', unit: 'хил. заети' },
        escoSkills: escoRel,
      });
    }
    if (req.method === 'GET' && p === '/api/market') {
      // предпочитаме sizeclas=TOTAL; ако за дадена територия няма такава редица – GE10 (10+ заети)
      const series = (geo, indic) => {
        for (const size of ['TOTAL', 'GE10']) {
          const rows = db.prepare(`SELECT period, value FROM stat_observations WHERE source_id='eurostat' AND dataset='jvs_q_nace2'
            AND geo = ? AND series_key = ? AND value IS NOT NULL ORDER BY period`).all(geo, `indic_em=${indic}|sizeclas=${size}`);
          if (rows.length) return rows;
        }
        return [];
      };
      return send(res, 200, {
        vacancyRate: { BG: series('BG', 'JVR'), EU: series('EU27_2020', 'JVR'), source: 'Eurostat jvs_q_nace2 (B–S, без сезонно изглаждане)', unit: '%' },
        wef: { title: WEF_2025.title, url: WEF_2025.url, period: WEF_2025.period, method: WEF_2025.method, headline: WEF_2025.headline,
          growingSkills: WEF_2025.growingSkills, fastestGrowingJobs: WEF_2025.fastestGrowingJobs, fastestDecliningJobs: WEF_2025.fastestDecliningJobs },
        cedefop: { title: CEDEFOP_BG_2025.title, url: CEDEFOP_BG_2025.url, period: CEDEFOP_BG_2025.period, method: CEDEFOP_BG_2025.method,
          headline: CEDEFOP_BG_2025.headline, openings: CEDEFOP_BG_2025.openingsShareByIsco, shortages: CEDEFOP_BG_2025.shortageIsco2 },
      });
    }
    if (req.method === 'POST' && p === '/api/recommendations') {
      if (!recLimit(ip)) throw new HttpError(429, 'Твърде много заявки. Опитай по-късно.');
      const body = await readJson(req);
      let rec;
      try { rec = recommend(db, body.answers); } catch (err) { throw new HttpError(400, err.message); }
      const ai = body.ai === false ? { enabled: false } : await aiImpl(rec, config.anthropic);
      return send(res, 200, { ...rec, ai });
    }
    if (req.method === 'POST' && p === '/api/email') {
      const body = await readJson(req);
      if (!body.consent) throw new HttpError(400, 'Нужно е съгласие за изпращане на имейл');
      const email = String(body.email || '').trim();
      if (!isValidEmail(email)) throw new HttpError(400, 'Невалиден имейл адрес');
      if (!emailLimit(ip)) throw new HttpError(429, 'Достигнат е лимитът за изпращане на имейли. Опитай след час.');
      if (!config.smtp.host) throw new HttpError(503, 'Изпращането на имейли не е конфигурирано на сървъра');
      let rec;
      try { rec = recommend(db, body.answers); } catch (err) { throw new HttpError(400, err.message); }
      const ai = body.ai === false ? { enabled: false } : await aiImpl(rec, config.anthropic);
      const mail = buildResultEmail(rec, ai, config.publicUrl, sanitizePlans(body.plans, rec));
      // На Vercel потребителските заявки не пишат в базата (тя е споделен файл в Blob) – само лог.
      const logEmail = (status, error = null) => {
        if (provider.userWrites) db.prepare('INSERT INTO email_log(sent_at, email_hash, status, error) VALUES (?, ?, ?, ?)').run(new Date().toISOString(), hashEmail(email), status, error);
        else console.log(JSON.stringify({ event: 'email', status, emailHash: hashEmail(email).slice(0, 16), error, hint: error ? explainSmtpError(error) : null }));
      };
      try {
        await sendMail(config.smtp, { to: email, ...mail });
        logEmail('sent');
      } catch (err) {
        logEmail('failed', String(err.message).slice(0, 300));
        throw new HttpError(502, 'Имейлът не можа да бъде изпратен. Опитай отново по-късно.');
      }
      return send(res, 200, { ok: true });
    }
    // Личен план за едно умение – резервен път, ако Firebase AI Logic в браузъра не отговори.
    // Сървърът сам преизчислява резултата от отговорите, така че в промпта влизат само негови данни.
    if (req.method === 'POST' && p === '/api/plan') {
      if (!config.gemini?.apiKey) throw new HttpError(503, 'Резервният път към Gemini не е конфигуриран (липсва GEMINI_API_KEY).');
      if (!planLimit(ip)) throw new HttpError(429, 'Твърде много заявки. Опитай след няколко минути.');
      const body = await readJson(req);
      let rec;
      try { rec = recommend(db, body.answers); } catch (err) { throw new HttpError(400, err.message); }
      const h = rec.horizons.find((x) => x.key === body.horizon);
      const item = h?.items.find((x) => x.skillId === body.skillId);
      if (!item) throw new HttpError(400, 'Няма такова умение в резултата');
      const prompt = buildPrompt({
        answers: answersToText(QUIZ, body.answers), interests: rec.profile.topInterests, skill: item.name, description: item.description || '',
        horizon: `${h.label} (${h.subtitle})`, firstStep: item.firstStep.text, fact: `${item.fact.text} (${item.fact.source}, ${item.fact.period})`,
        occupation: rec.occupations[0]?.title || '',
      });
      try {
        const r = await streamWithFallback({ apiKey: config.gemini.apiKey, models: config.gemini.models, fetchImpl: assistantFetch,
          systemInstruction: 'Отговаряш само с валиден JSON по зададената схема.', contents: [{ role: 'user', text: prompt }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 600, responseMimeType: 'application/json',
            responseSchema: { type: 'OBJECT', properties: { why: { type: 'STRING' }, steps: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['why', 'steps'] } } });
        let text = '';
        for await (const c of r.stream) text += c;
        return send(res, 200, { plan: validatePlan(text, prompt), model: r.model, via: 'ai-studio' });
      } catch (err) {
        console.warn(JSON.stringify({ event: 'plan_failed', error: String(err.message).slice(0, 300), tried: (err.errors || []).map((e) => `${e.model}:${e.status}`) }));
        throw new HttpError(503, 'Gemini не е наличен в момента.');
      }
    }
    // Чат асистент: прокси към Google AI Studio (Gemini) с резервни модели; ключът е само тук.
    if (req.method === 'POST' && p === '/api/assistant') {
      if (!config.gemini?.apiKey) throw new HttpError(503, 'Асистентът не е конфигуриран (липсва GEMINI_API_KEY).');
      if (!assistantLimit(ip)) throw new HttpError(429, 'Задаваш въпроси твърде бързо. Опитай пак след няколко минути.');
      const contents = chatContents(await readJson(req, 32 * 1024));
      let result;
      try {
        result = await streamWithFallback({ apiKey: config.gemini.apiKey, models: config.gemini.models, systemInstruction: buildSystemInstruction(assistantContext()), contents, fetchImpl: assistantFetch });
      } catch (err) {
        console.warn(JSON.stringify({ event: 'assistant_failed', error: String(err.message).slice(0, 300), tried: (err.errors || []).map((e) => `${e.model}:${e.status}`) }));
        throw new HttpError(503, 'Асистентът е зает в момента. Опитай отново след минута.');
      }
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Assistant-Model': result.model });
      try {
        for await (const chunk of result.stream) res.write(chunk);
      } catch (err) {
        console.warn(JSON.stringify({ event: 'assistant_stream_error', model: result.model, error: String(err.message).slice(0, 200) }));
        res.write('\n\n_(Отговорът прекъсна. Опитай отново.)_');
      }
      return res.end();
    }
    // Планирани endpoint-и, защитени с CRON_SECRET (Authorization: Bearer ...).
    //  /api/cron/daily   – за Vercel Cron (GET); изпълнява само ако в София е 06:xx ч.
    //  /api/cron/refresh – за външен cron (GitHub Actions, curl); ?window=sofia по избор
    if ((req.method === 'GET' || req.method === 'POST') && (p === '/api/cron/refresh' || p === '/api/cron/daily')) {
      requireSecret(req, config.cronSecret);
      const sofiaOnly = p === '/api/cron/daily' || url.searchParams.get('window') === 'sofia';
      const opts = { trigger: 'scheduled', onlyInSofiaHour: sofiaOnly ? config.scheduledHour : null };
      return runOrAccept(res, opts, alwaysWait || url.searchParams.get('wait') === '1');
    }
    if (req.method === 'POST' && p === '/api/admin/refresh') {
      requireSecret(req, config.adminToken, 'x-admin-token');
      return runOrAccept(res, { trigger: 'manual', force: true }, alwaysWait || url.searchParams.get('wait') === '1');
    }
    // Тестов имейл за администратора – показва точната SMTP грешка и насока как да се оправи
    if (req.method === 'POST' && p === '/api/admin/test-email') {
      requireSecret(req, config.adminToken, 'x-admin-token');
      const body = await readJson(req);
      const to = String(body.to || config.smtp.user || '').trim();
      if (!isValidEmail(to)) throw new HttpError(400, 'Невалиден имейл адрес');
      const settings = { host: config.smtp.host || '(липсва)', port: config.smtp.port, secure: config.smtp.secure,
        user: config.smtp.user || '(липсва)', passLength: config.smtp.pass.length, from: config.smtp.from };
      try {
        await sendMail(config.smtp, { to, subject: 'Future Jobs – тестов имейл', text: 'Изпращането на имейли работи.', html: '<p>Изпращането на имейли работи. ✅</p>' });
        return send(res, 200, { ok: true, settings });
      } catch (err) {
        return send(res, 200, { ok: false, error: String(err.message).slice(0, 400), hint: explainSmtpError(err), settings });
      }
    }
    if (req.method === 'GET' && p === '/api/admin/check') {
      requireSecret(req, config.adminToken, 'x-admin-token');
      return send(res, 200, { ok: true });
    }
    throw new HttpError(404, 'Няма такъв endpoint');
  }

  async function runOrAccept(res, opts, wait) {
    let p;
    try { p = startRefresh(opts); } catch (err) {
      if (err instanceof AlreadyRunningError) throw new HttpError(409, err.message);
      throw err;
    }
    if (wait) {
      const r = await p;
      return send(res, r?.status === 'conflict' ? 409 : 200, r);
    }
    return send(res, 202, { accepted: true, message: 'Обновяването е стартирано. Следи статуса в /api/status.' });
  }

  function serveStatic(req, res, url) {
    const publicDir = path.join(ROOT, 'public');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || !path.extname(rel)) rel = '/index.html';
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir)) return send(res, 403, 'Forbidden');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found');
    send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  }

  return async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        db = await provider.read();
        await handleApi(req, res, url);
      }
      else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
      else send(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      send(res, status, { error: status === 500 ? 'Вътрешна грешка' : err.message });
    }
  };
}

/** Node HTTP сървър (VPS / локално) */
export function createApp(opts) {
  return http.createServer(createHandler(opts));
}

/** Избира хранилище според средата: Vercel + Blob, Vercel без Blob (временно) или локален файл. */
export async function createProvider(config) {
  if (config.onVercel) {
    if (config.blobConfigured) return blobProvider({ blob: await loadVercelBlob(), pathname: config.blobPathname });
    console.warn('[storage] VERCEL без Blob store – базата е временна в /tmp');
    return localProvider(openDb('/tmp/future-jobs.db'), { persistent: false, mode: 'vercel-tmp' });
  }
  const db = openDb(config.databasePath);
  syncSources(db);
  return localProvider(db);
}

// Стартиране като самостоятелен процес
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const config = getConfig();
  const db = openDb(config.databasePath);
  const server = createApp({ db, config });
  server.listen(config.port, () => {
    console.log(`Future Jobs работи на ${config.publicUrl} (порт ${config.port})`);
    if (!config.cronSecret) console.warn('ВНИМАНИЕ: CRON_SECRET не е зададен – /api/cron/refresh е изключен.');
    if (!config.adminToken) console.warn('ВНИМАНИЕ: ADMIN_TOKEN не е зададен – ръчното обновяване е изключено.');
  });
}
