// Регистър на източниците: метаданни (за UI „Статус на източниците“) + адаптери.
import { eurostat } from './eurostat.js';
import { esco } from './esco.js';
import { arbeitnow, remotive } from './jobboards.js';
import { adzuna } from './adzuna.js';
import { wef, cedefop } from './published.js';

// Редът е важен: бързите източници първо, ESCO и Adzuna (много заявки) – последни.
export const SOURCE_META = [
  {
    id: 'eurostat', name: 'Eurostat', kind: 'api', url: 'https://ec.europa.eu/eurostat/web/main/data/web-services',
    updateFrequency: 'Годишно (LFS, SES) и тримесечно (свободни работни места)',
    terms: 'Свободно повторно използване с посочване на източника (Eurostat copyright notice).', requiresKey: false, adapter: eurostat,
  },
  {
    id: 'arbeitnow', name: 'Arbeitnow Job Board API', kind: 'api', url: 'https://www.arbeitnow.com/blog/job-board-api',
    updateFrequency: 'Непрекъснато (обяви основно от Германия/ЕС)',
    terms: 'Безплатно публично API. Пазим само метаданни и разпознати умения.', requiresKey: false, adapter: arbeitnow,
  },
  {
    id: 'remotive', name: 'Remotive Remote Jobs API', kind: 'api', url: 'https://github.com/remotive-com/remote-jobs-api',
    updateFrequency: 'Ежедневно (обявите са забавени с 24 ч.)',
    terms: 'До 4 заявки/ден; посочване на Remotive като източник; без повторно публикуване на обявите.', requiresKey: false, adapter: remotive,
  },
  {
    id: 'cedefop', name: 'Cedefop Skills Forecast 2025', kind: 'published_report', url: 'https://www.cedefop.europa.eu/files/skills_forecast_-_bulgaria_2025.pdf',
    updateFrequency: 'Ново издание на ~2 години (последно: юни 2025, хоризонт 2035)',
    terms: 'Няма публично API; пълният набор е достъпен чрез регистрация (формулярът е затворен към момента). Ползваме публикувания доклад за България.',
    requiresKey: false, adapter: cedefop,
  },
  {
    id: 'wef', name: 'World Economic Forum – Future of Jobs 2025', kind: 'published_report', url: 'https://www.weforum.org/publications/the-future-of-jobs-report-2025/',
    updateFrequency: 'На ~2 години (последно: януари 2025)', terms: 'Публикуван доклад; цитираме числата с източник.', requiresKey: false, adapter: wef,
  },
  {
    id: 'esco', name: 'ESCO (Европейска комисия)', kind: 'api', url: 'https://esco.ec.europa.eu/en/use-esco/use-esco-services-api',
    updateFrequency: 'При нова версия на класификацията (проверка седмично)',
    terms: 'Безплатно, с посочване на ESCO като източник.', requiresKey: false, adapter: esco,
  },
  {
    id: 'adzuna', name: 'Adzuna Jobs API', kind: 'api', url: 'https://developer.adzuna.com/',
    updateFrequency: 'Ежедневно', terms: 'Изисква безплатна регистрация (app_id/app_key). Не покрива България.',
    requiresKey: true, adapter: adzuna,
  },
  {
    id: 'eures', name: 'EURES', kind: 'not_integrated', url: 'https://eures.europa.eu/',
    updateFrequency: '—', terms: 'Няма публично API за обяви; достъпът е само за партньори. Scraping не се използва.', requiresKey: false, adapter: null,
  },
  {
    id: 'google_trends', name: 'Google Trends', kind: 'not_integrated', url: 'https://developers.google.com/search/apis/trends',
    updateFrequency: '—', terms: 'Официалното API е в затворена алфа версия (достъп по одобрение). Неофициални методи (scraping) не се използват.',
    requiresKey: true, adapter: null,
  },
];

export function syncSources(db) {
  const up = db.prepare(`INSERT INTO sources(id, name, kind, url, update_frequency, terms_note, requires_key) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, url = excluded.url,
      update_frequency = excluded.update_frequency, terms_note = excluded.terms_note, requires_key = excluded.requires_key`);
  for (const s of SOURCE_META) up.run(s.id, s.name, s.kind, s.url, s.updateFrequency, s.terms, s.requiresKey ? 1 : 0);
}
