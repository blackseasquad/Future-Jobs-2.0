// Зарежда конфигурацията от process.env и (ако съществува) от .env файл.
// Без външни зависимости.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

if (process.env.NODE_ENV !== 'test') loadDotEnv(path.join(ROOT, '.env'));

/** @returns {Record<string, any>} */
export function getConfig() {
  const e = process.env;
  return {
    port: Number(e.PORT || 3000),
    publicUrl: e.PUBLIC_URL || (e.VERCEL_PROJECT_PRODUCTION_URL ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL}` : `http://localhost:${e.PORT || 3000}`),
    // Vercel: базата се пази във Vercel Blob (виж src/storage.js)
    onVercel: Boolean(e.VERCEL),
    blobConfigured: Boolean(e.BLOB_READ_WRITE_TOKEN || e.BLOB_STORE_ID),
    blobPathname: e.BLOB_DB_PATHNAME || 'future-jobs/db.sqlite',
    // Колко време може да отнеме един импорт (Vercel Hobby: функцията има максимум 300 s)
    refreshBudgetMs: Number(e.REFRESH_BUDGET_MS || (e.VERCEL ? 240_000 : 0)),
    databasePath: e.DATABASE_PATH || path.join(ROOT, 'data', 'future-jobs.db'),
    cronSecret: e.CRON_SECRET || '',
    adminToken: e.ADMIN_TOKEN || '',
    timezone: 'Europe/Sofia',
    scheduledHour: 6,
    adzuna: {
      appId: e.ADZUNA_APP_ID || '',
      appKey: e.ADZUNA_APP_KEY || '',
      countries: (e.ADZUNA_COUNTRIES || 'de,pl').split(',').map((s) => s.trim()).filter(Boolean),
    },
    anthropic: {
      apiKey: e.ANTHROPIC_API_KEY || '',
      model: e.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    },
    smtp: {
      host: e.SMTP_HOST || '',
      port: Number(e.SMTP_PORT || 465),
      secure: (e.SMTP_SECURE || 'true') !== 'false',
      user: e.SMTP_USER || '',
      pass: e.SMTP_PASS || '',
      from: e.MAIL_FROM || 'Future Jobs <no-reply@example.com>',
    },
    // Данните се считат за остарели след толкова часа без успешен импорт
    staleAfterHours: Number(e.STALE_AFTER_HOURS || 36),
    fetchTimeoutMs: Number(e.FETCH_TIMEOUT_MS || 20000),
  };
}
