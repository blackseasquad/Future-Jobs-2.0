// SQLite база (вграден модул node:sqlite) с версионирани, само добавящи миграции.
// Миграциите никога не изтриват таблици или данни — безопасни за production.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,           -- api | published_report
      url TEXT NOT NULL,
      update_frequency TEXT,
      terms_note TEXT,
      requires_key INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS source_state (
      source_id TEXT PRIMARY KEY REFERENCES sources(id),
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      last_data_period TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS refresh_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_date TEXT NOT NULL,       -- дата по Europe/Sofia (YYYY-MM-DD)
      trigger TEXT NOT NULL,        -- scheduled | manual | cli
      status TEXT NOT NULL,         -- running | success | partial | failed | skipped
      started_at TEXT NOT NULL,
      finished_at TEXT,
      message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_runs_date ON refresh_runs(run_date, status);
    CREATE TABLE IF NOT EXISTS source_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES refresh_runs(id),
      source_id TEXT NOT NULL,
      status TEXT NOT NULL,         -- success | failed | skipped
      started_at TEXT NOT NULL,
      finished_at TEXT,
      fetched INTEGER DEFAULT 0,
      inserted INTEGER DEFAULT 0,
      updated INTEGER DEFAULT 0,
      duplicates INTEGER DEFAULT 0,
      rejected INTEGER DEFAULT 0,
      data_period TEXT,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS run_lock (
      name TEXT PRIMARY KEY,
      run_id INTEGER,
      locked_at TEXT NOT NULL
    );

    -- Официални статистики (Eurostat) и публикувани прогнози (Cedefop, WEF)
    CREATE TABLE IF NOT EXISTS stat_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      dataset TEXT NOT NULL,
      series_key TEXT NOT NULL,
      geo TEXT NOT NULL,
      period TEXT NOT NULL,
      value REAL,
      unit TEXT,
      flag TEXT,
      note TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      UNIQUE(source_id, dataset, series_key, geo, period)
    );
    -- История на ревизиите: старата стойност се пази, когато източникът я промени
    CREATE TABLE IF NOT EXISTS stat_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_id INTEGER NOT NULL REFERENCES stat_observations(id),
      old_value REAL,
      new_value REAL,
      old_flag TEXT,
      revised_at TEXT NOT NULL
    );

    -- Обяви за работа: пазим само метаданни и разпознатите умения (не пълния текст)
    CREATE TABLE IF NOT EXISTS job_postings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT,
      location TEXT,
      remote INTEGER,
      url TEXT,
      posted_at TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      UNIQUE(source_id, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_postings_seen ON job_postings(first_seen_at);
    CREATE INDEX IF NOT EXISTS idx_postings_dedupe ON job_postings(dedupe_key);
    CREATE TABLE IF NOT EXISTS posting_skills (
      posting_id INTEGER NOT NULL REFERENCES job_postings(id),
      skill_id TEXT NOT NULL,
      PRIMARY KEY (posting_id, skill_id)
    );

    -- Adzuna агрегирани бройки (по държава, умение, ден)
    CREATE TABLE IF NOT EXISTS posting_counts (
      source_id TEXT NOT NULL,
      country TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      date TEXT NOT NULL,
      count INTEGER NOT NULL,
      total INTEGER,
      mean_salary REAL,
      PRIMARY KEY (source_id, country, skill_id, date)
    );

    -- ESCO
    CREATE TABLE IF NOT EXISTS esco_concepts (
      uri TEXT PRIMARY KEY,
      type TEXT NOT NULL,           -- skill | occupation
      local_id TEXT,                -- id в каталога на Future Jobs
      label_bg TEXT,
      label_en TEXT,
      code TEXT,
      essential_for_count INTEGER,
      optional_for_count INTEGER,
      fetched_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS esco_relations (
      from_uri TEXT NOT NULL,
      to_uri TEXT NOT NULL,
      to_label TEXT,
      relation TEXT NOT NULL,       -- essential | optional
      PRIMARY KEY (from_uri, to_uri, relation)
    );

    -- Изчислени показатели за умения (по ден => история)
    CREATE TABLE IF NOT EXISTS skill_metrics (
      skill_id TEXT NOT NULL,
      date TEXT NOT NULL,
      postings_total INTEGER,
      postings_with_skill INTEGER,
      demand_share REAL,
      change_30d REAL,
      change_90d REAL,
      long_term REAL,
      breadth REAL,
      learning REAL,
      score REAL,
      confidence TEXT,
      details_json TEXT NOT NULL,
      computed_at TEXT NOT NULL,
      PRIMARY KEY (skill_id, date)
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL
    );

    -- Лог на изпратените имейли: БЕЗ имейл адреса (само SHA-256 хеш)
    CREATE TABLE IF NOT EXISTS email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sent_at TEXT NOT NULL,
      email_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT
    );
    `,
  },
];

/** @param {string} dbPath */
/** @param {string} dbPath @param {{journalMode?: 'WAL'|'DELETE'}} [opts] */
export function openDb(dbPath, opts = {}) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  // DELETE режимът държи всичко в един файл – нужно, когато файлът се качва във Vercel Blob
  db.exec(`PRAGMA journal_mode = ${opts.journalMode === 'DELETE' ? 'DELETE' : 'WAL'}; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`);
  migrate(db);
  return db;
}

/** @param {DatabaseSync} db */
export function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => Number(r.version)));
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version, m.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

/** Изпълнява fn в транзакция. @template T @param {DatabaseSync} db @param {() => T} fn @returns {T} */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function setMeta(db, key, value) {
  db.prepare(`INSERT INTO app_meta(key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(key, value, new Date().toISOString());
}

export function getMeta(db, key) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row ? String(row.value) : null;
}
