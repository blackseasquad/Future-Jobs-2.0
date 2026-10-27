// Публикувани прогнози, които НЯМАТ публично API. Стойностите са въведени ръчно,
// дословно от посочените документи, с цитат. Те НЕ се обновяват ежедневно —
// импортът ги вписва в базата веднъж (и при нова версия на този файл).
// Когато Cedefop/WEF публикуват ново издание, обнови този файл и увеличи `version`.

export const PUBLISHED_VERSION = '2025.1';

export const WEF_2025 = {
  sourceId: 'wef',
  title: 'World Economic Forum – Future of Jobs Report 2025',
  url: 'https://www.weforum.org/publications/the-future-of-jobs-report-2025/',
  secondaryUrls: [
    'https://digital-skills-jobs.europa.eu/en/latest/research/future-jobs-report-2025',
    'https://www.euronews.com/business/2025/02/01/jobs-market-at-a-crossroads-which-are-the-fastest-growing-and-declining-jobs',
  ],
  published: '2025-01-07',
  period: '2025–2030',
  method: 'Глобално проучване сред работодатели (прогнози на работодателите, не статистика).',
  headline: [
    { key: 'jobs_created_m', label: 'Нови работни места до 2030 г. (глобално)', value: 170, unit: 'млн.' },
    { key: 'jobs_displaced_m', label: 'Изместени работни места до 2030 г.', value: 92, unit: 'млн.' },
    { key: 'net_jobs_m', label: 'Нетен ръст на работните места', value: 78, unit: 'млн.' },
    { key: 'skills_change_pct', label: 'Дял от ключовите умения, които ще се променят до 2030 г.', value: 39, unit: '%' },
  ],
  // Топ 10 най-бързо растящи умения (по реда, в който ги посочва докладът)
  growingSkills: [
    { key: 'ai_big_data', label: 'ИИ и големи данни', rank: 1 },
    { key: 'networks_cyber', label: 'Мрежи и киберсигурност', rank: 2 },
    { key: 'tech_literacy', label: 'Технологична грамотност', rank: 3 },
    { key: 'creative', label: 'Креативно мислене', rank: 4 },
    { key: 'resilience', label: 'Устойчивост, гъвкавост и адаптивност', rank: 5 },
    { key: 'curiosity', label: 'Любопитство и учене през целия живот', rank: 6 },
    { key: 'leadership', label: 'Лидерство и социално влияние', rank: 7 },
    { key: 'talent_mgmt', label: 'Управление на таланти', rank: 8 },
    { key: 'analytical', label: 'Аналитично мислене', rank: 9 },
    { key: 'environmental', label: 'Грижа за околната среда', rank: 10 },
  ],
  // Топ 10 най-бързо растящи професии (% ръст 2025–2030)
  fastestGrowingJobs: [
    { key: 'big_data', label: 'Специалисти по големи данни', pct: 113 },
    { key: 'fintech', label: 'FinTech инженери', pct: 93 },
    { key: 'ai_ml', label: 'Специалисти по ИИ и машинно обучение', pct: 82 },
    { key: 'software_dev', label: 'Разработчици на софтуер и приложения', pct: 57 },
    { key: 'security_mgmt', label: 'Специалисти по управление на сигурността', pct: 53 },
    { key: 'data_warehousing', label: 'Специалисти по хранилища за данни', pct: 49 },
    { key: 'autonomous_ev', label: 'Специалисти по автономни и електрически превозни средства', pct: 48 },
    { key: 'ui_ux', label: 'UI и UX дизайнери', pct: 48 },
    { key: 'delivery_drivers', label: 'Шофьори на леки товарни/куриерски автомобили', pct: 46 },
    { key: 'iot', label: 'Специалисти по Интернет на нещата', pct: 42 },
  ],
  // Най-голям абсолютен ръст (без числа в ползваните източници – само ред)
  largestGrowthJobs: [
    { key: 'farmworkers', label: 'Земеделски работници' },
    { key: 'delivery_drivers', label: 'Куриери/шофьори' },
    { key: 'software_dev', label: 'Разработчици на софтуер' },
    { key: 'construction_workers', label: 'Строителни работници' },
    { key: 'shop_sales', label: 'Продавачи в магазини' },
    { key: 'food_processing', label: 'Работници в хранителната промишленост' },
    { key: 'nursing', label: 'Медицински сестри' },
    { key: 'social_workers', label: 'Социални работници' },
    { key: 'counselling', label: 'Консултанти (психологическо консултиране)' },
  ],
  fastestDecliningJobs: [
    { key: 'postal_clerks', label: 'Пощенски служители', pct: -34 },
    { key: 'bank_tellers', label: 'Банкови касиери', pct: -31 },
    { key: 'data_entry', label: 'Оператори на въвеждане на данни', pct: -26 },
    { key: 'cashiers', label: 'Касиери и билетни касиери', pct: -20 },
    { key: 'admin_assistants', label: 'Административни асистенти и секретари', pct: -20 },
    { key: 'printing', label: 'Печатари', pct: -20 },
    { key: 'bookkeeping', label: 'Счетоводни и ведомостни служители', pct: -18 },
    { key: 'stock_clerks', label: 'Складови служители', pct: -16 },
    { key: 'street_vendors', label: 'Уличен и директен търговец', pct: -14 },
  ],
};

export const CEDEFOP_BG_2025 = {
  sourceId: 'cedefop',
  title: 'Cedefop Skills Forecast 2025 – Bulgaria (country report)',
  url: 'https://www.cedefop.europa.eu/files/skills_forecast_-_bulgaria_2025.pdf',
  toolUrl: 'https://www.cedefop.europa.eu/en/tools/skills-forecast',
  published: '2025-06-05',
  period: '2023–2035',
  method: 'Макроикономически модел на Cedefop (основен сценарий), хармонизирани данни за ЕС.',
  // ISCO основни групи, в които заетостта в България расте до 2035 г. (Раздел 4)
  risingIscoMajor: ['2', '3', '9'],
  // Дял от общите очаквани свободни работни места (job openings) 2023–2035, Фиг. 4
  openingsShareByIsco: [
    { isco: '2', label: 'Специалисти', pct: 20 },
    { isco: '5', label: 'Персонал, зает с услуги за населението и търговията', pct: 17 },
    { isco: '3', label: 'Техници и приложни специалисти', pct: 17 },
    { isco: '8', label: 'Машинни оператори и монтажници', pct: 15 },
  ],
  // 2-цифрени ISCO групи с най-висок индекс на недостиг до 2035 г. (Фиг. 7)
  shortageIsco2: [
    { isco2: '71', label: 'Строителни и сродни работници' },
    { isco2: '82', label: 'Монтажници' },
    { isco2: '54', label: 'Персонал по охрана' },
    { isco2: '53', label: 'Персонал за лични грижи' },
    { isco2: '26', label: 'Специалисти в областта на правото, социалната сфера и културата' },
  ],
  headline: [
    { key: 'openings_high_skill_pct', label: 'Дял на свободните работни места, изискващи висока квалификация', value: 44, unit: '%' },
    { key: 'openings_medium_skill_pct', label: 'Дял на свободните работни места, изискващи средна квалификация', value: 50, unit: '%' },
    { key: 'labour_force_high_qual_2035_pct', label: 'Дял на работната сила с висока квалификация през 2035 г.', value: 38, unit: '%' },
    { key: 'business_services_growth_pa', label: 'Ръст на заетостта в бизнес и други услуги (год., 2023–2035)', value: 0.85, unit: '% год.', note: 'Докладът дава диапазон 0,8–0,9%; записано е средното.' },
  ],
};
