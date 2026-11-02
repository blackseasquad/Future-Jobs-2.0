// Професии на бъдещето (до ~10 години) и професии, които ИИ променя най-много.
// Всичко тук е ПРОГНОЗА: няма заплати и брой обяви, защото за тези професии още няма данни.
// Всяка бъдеща професия има източник, а „доказателствата“ са:
//   strong – закон или регламент с конкретни дати;  medium – доклади и тенденции.

/** @typedef {{kind:'fact'|'forecast'|'ai', text:string, source:string, url:string|null}} Why */
/** @typedef {{id:string, title:string, description:string, expected:string, driver:string, evidence:'strong'|'medium'|'ai',
 *   closestToday:string, coreSkills:string[], complementarySkills:string[], interests:Record<string,number>,
 *   path:string[], why:Why[], note?:string, dynamic?:boolean, addedAt?:string}} FutureOccupation */

/** @type {FutureOccupation[]} */
export const FUTURE_OCCUPATIONS = [
  {
    id: 'ai_auditor', title: 'Одитор на ИИ системи', expected: '2027–2028', driver: 'Регламент на ЕС за ИИ', evidence: 'strong',
    description: 'Проверява дали ИИ системите във фирми и институции са безопасни, честни и отговарят на закона.',
    closestToday: 'cybersecurity_specialist',
    coreSkills: ['ai_ethics', 'ai_ml', 'cybersecurity', 'analytical_thinking'], complementarySkills: ['project_management', 'communication', 'english'],
    interests: { tech: 2, data: 2, business: 1, science: 1 },
    path: ['Сега: основи на ИИ и киберсигурност (безплатни курсове).', 'След 2–3 години: специалност информатика, право или киберсигурност; работа в киберсигурност или съответствие (compliance).', 'След това: специализация по Регламента за ИИ и оценка на риска.'],
    why: [{ kind: 'fact', text: 'Задълженията на Регламент (ЕС) 2024/1689 за високорисковите ИИ системи се прилагат от 2 декември 2027 г. (Приложение III) и от 2 август 2028 г. (Приложение I) – след промените „AI Omnibus“, обнародвани на 24.07.2026 г. Фирмите ще трябва да доказват, че системите им отговарят на изискванията.', source: 'Future of Privacy Forum – AI Act timeline', url: 'https://fpf.org/blog/the-ai-act-implementation-timeline-what-changes-under-the-ai-omnibus' }],
    note: 'В обявите може да се среща и като „AI compliance specialist“ или „AI governance specialist“.',
  },
  {
    id: 'ai_agent_manager', title: 'Мениджър на ИИ агенти', expected: '2026–2030', driver: 'ИИ агенти в работата', evidence: 'medium',
    description: 'Ръководи „екип“ от ИИ агенти: поставя им задачи, следи резултатите и решава кога трябва да се намеси човек.',
    closestToday: 'project_manager',
    coreSkills: ['ai_ml', 'project_management', 'analytical_thinking', 'communication'], complementarySkills: ['python', 'leadership', 'adaptability'],
    interests: { tech: 2, business: 2, people: 1, data: 1 },
    path: ['Сега: научи се да работиш с ИИ асистенти и да описваш задачи ясно.', 'След 2–3 години: опит в управление на проекти или продукт, автоматизация на процеси.', 'След това: управление на работни процеси, в които хора и ИИ агенти работят заедно.'],
    why: [{ kind: 'forecast', text: 'Harvard Business Review (12.02.2026) описва „мениджъра на агенти“ като нова роля, която компаниите въвеждат, когато ИИ агентите преминават от експерименти към реална работа.', source: 'Harvard Business Review / Harvard Kennedy School', url: 'https://www.hks.harvard.edu/centers/mrcbg/programs/growthpolicy/thrive-ai-era-companies-need-agent-managers' }],
  },
  {
    id: 'synthetic_data_specialist', title: 'Специалист по синтетични данни и прозрачност на ИИ', expected: '2026–2028', driver: 'Регламент на ЕС за ИИ (чл. 50)', evidence: 'strong',
    description: 'Създава безопасни „изкуствени“ данни за обучение на ИИ и следи генерираното от ИИ съдържание да е ясно отбелязано.',
    closestToday: 'data_scientist',
    coreSkills: ['data_analysis', 'python', 'ai_ml', 'ai_ethics'], complementarySkills: ['sql', 'cybersecurity'],
    interests: { data: 3, tech: 2, science: 1 },
    path: ['Сега: анализ на данни и Python.', 'След 2–3 години: работа с данни и защита на личните данни.', 'След това: генериране на синтетични данни и инструменти за отбелязване на ИИ съдържание.'],
    why: [{ kind: 'fact', text: 'Член 50 от Регламента за ИИ (задължения за прозрачност, вкл. отбелязване на генерирано от ИИ съдържание) се прилага от 2 август 2026 г., а за някои системи – от 2 декември 2026 г.', source: 'Future of Privacy Forum – AI Act timeline', url: 'https://fpf.org/blog/the-ai-act-implementation-timeline-what-changes-under-the-ai-omnibus' }],
  },
  {
    id: 'battery_recycling_specialist', title: 'Специалист по рециклиране на батерии', expected: '2027–2031', driver: 'Регламент на ЕС за батериите', evidence: 'strong',
    description: 'Организира събирането и рециклирането на батерии от електромобили и извличането на литий, кобалт и никел.',
    closestToday: 'ev_specialist',
    coreSkills: ['sustainability', 'electrical', 'automation_robotics'], complementarySkills: ['data_analysis', 'project_management'],
    interests: { nature: 2, hands_on: 2, science: 2, tech: 1 },
    path: ['Сега: основи на електротехниката и химията, зелени технологии.', 'След 2–3 години: инженерна или техническа специалност; работа с електромобили или отпадъци.', 'След това: технологии за рециклиране и вериги за доставка на суровини.'],
    why: [{ kind: 'fact', text: 'Регламентът на ЕС за батериите изисква извличане на 50% от лития от отпадъчните батерии до края на 2027 г. и 80% до края на 2031 г., както и минимум рециклирано съдържание в новите батерии от август 2031 г. (16% кобалт, 6% литий, 6% никел).', source: 'IEA – EU Sustainable Batteries Regulation', url: 'https://www.iea.org/policies/16763-eu-sustainable-batteries-regulation' }],
  },
  {
    id: 'energy_community_manager', title: 'Мениджър на енергийни общности', expected: '2026–2030', driver: 'Директива на ЕС за възобновяемата енергия', evidence: 'medium',
    description: 'Помага на квартали, училища и фирми да произвеждат и споделят собствена зелена енергия.',
    closestToday: 'renewable_energy_engineer',
    coreSkills: ['sustainability', 'project_management', 'communication', 'finance'], complementarySkills: ['electrical', 'leadership'],
    interests: { nature: 2, business: 2, people: 1 },
    path: ['Сега: зелени технологии и основи на финансите.', 'След 2–3 години: работа по енергийни проекти (соларни инсталации, енергийна ефективност).', 'След това: организиране и управление на общности за възобновяема енергия.'],
    why: [{ kind: 'fact', text: 'Директива (ЕС) 2018/2001 за насърчаване на използването на енергия от възобновяеми източници (RED II) дава право на гражданите, общините и малките фирми да създават общности за възобновяема енергия и да споделят произведената енергия (чл. 22).', source: 'EUR-Lex – Директива (ЕС) 2018/2001', url: 'https://eur-lex.europa.eu/eli/dir/2018/2001/oj' }],
  },
  {
    id: 'eldertech_coordinator', title: 'Координатор на технологии за грижа за възрастни', expected: '2028–2035', driver: 'Застаряване на населението', evidence: 'medium',
    description: 'Подбира и настройва сензори, роботи и приложения, с които възрастните хора живеят по-дълго самостоятелно.',
    closestToday: 'personal_care_worker',
    coreSkills: ['healthcare', 'communication', 'automation_robotics'], complementarySkills: ['customer_service', 'adaptability'],
    interests: { care: 3, people: 1, tech: 1 },
    path: ['Сега: доброволчество с възрастни хора и основи на дигиталните технологии.', 'След 2–3 години: социални дейности, здравни грижи или ИТ поддръжка.', 'След това: проекти за технологии в домашната и социалната грижа.'],
    why: [{ kind: 'forecast', text: 'По прогнозата на Eurostat (април 2026 г.) населението на България намалява с 28% до 2100 г., а делът на хората над 80 г. в ЕС расте от 6% на 16% – грижата за възрастни ще зависи все повече от технологии.', source: 'BTA по данни на Eurostat', url: 'https://www.bta.bg/en/news/1107501-eu-s-population-projected-to-drop-by-11-7-by-2100-in-bulgaria-by-28-' }],
  },
  {
    id: 'drone_operator', title: 'Оператор на дронове и U-space', expected: '2026–2030', driver: 'Регламент на ЕС за U-space', evidence: 'medium',
    description: 'Управлява доставки, инспекции и спасителни мисии с дронове в споделено въздушно пространство.',
    closestToday: 'supply_chain_specialist',
    coreSkills: ['automation_robotics', 'electrical', 'networks'], complementarySkills: ['analytical_thinking', 'english'],
    interests: { hands_on: 2, tech: 2, nature: 1 },
    path: ['Сега: онлайн обучение и изпит за дистанционен пилот (категория „Open“).', 'След 2–3 години: техническа специалност или работа в логистика, геодезия, земеделие.', 'След това: оперативно управление на дронове и U-space услуги.'],
    why: [
      { kind: 'fact', text: 'Регламент за изпълнение (ЕС) 2021/664 създава U-space – правилата за безопасно движение на много дронове в едно въздушно пространство (прилага се от 26 януари 2023 г.).', source: 'Европейска комисия – U-space', url: 'https://transport.ec.europa.eu/news-events/news/drones-commission-adopts-new-rules-and-conditions-safe-secure-and-green-drone-operations-2021-04-22_en' },
      { kind: 'forecast', text: 'WEF: специалистите по автономни и електрически превозни средства са сред най-бързо растящите професии (+48% до 2030 г.).', source: 'World Economic Forum – Future of Jobs 2025', url: 'https://euronews.com/business/2025/02/01/jobs-market-at-a-crossroads-which-are-the-fastest-growing-and-declining-jobs' },
    ],
  },
  {
    id: 'digital_twin_engineer', title: 'Инженер по дигитални двойници', expected: '2027–2032', driver: 'Интернет на нещата и големи данни', evidence: 'medium',
    description: 'Създава „живо“ дигитално копие на завод, сграда или град, за да тества промени, преди да се случат в реалността.',
    closestToday: 'iot_robotics_engineer',
    coreSkills: ['automation_robotics', 'data_analysis', 'python', 'cloud'], complementarySkills: ['analytical_thinking', 'project_management'],
    interests: { tech: 2, data: 2, hands_on: 1, science: 1 },
    path: ['Сега: Python, анализ на данни и проекти с Arduino/сензори.', 'След 2–3 години: инженерна специалност; работа с IoT или индустриална автоматизация.', 'След това: симулации и дигитални двойници на реални системи.'],
    why: [{ kind: 'forecast', text: 'WEF: специалистите по големи данни (+113%) и по интернет на нещата (+42%) са сред най-бързо растящите професии до 2030 г. – дигиталните двойници съчетават двете.', source: 'World Economic Forum – Future of Jobs 2025', url: 'https://euronews.com/business/2025/02/01/jobs-market-at-a-crossroads-which-are-the-fastest-growing-and-declining-jobs' }],
  },
];

export const FUTURE_BY_ID = new Map(FUTURE_OCCUPATIONS.map((f) => [f.id, f]));

/** Най-бързо намаляващите професии до 2030 г. по WEF Future of Jobs 2025 (световно, % промяна) – с пътека за преход. */
export const CHANGING_JOBS = [
  { id: 'postal', title: 'Служители в пощенски услуги', change: -34, field: 'logistics', todayId: 'supply_chain_specialist', futureId: 'drone_operator', skills: ['automation_robotics', 'project_management'] },
  { id: 'bank', title: 'Банкови служители', change: -31, field: 'finance', todayId: 'fintech_specialist', futureId: 'ai_agent_manager', skills: ['finance', 'ai_ml'] },
  { id: 'data_entry', title: 'Въвеждане на данни', change: -26, field: 'office', todayId: 'data_scientist', futureId: 'synthetic_data_specialist', skills: ['data_analysis', 'sql'] },
  { id: 'cashier', title: 'Касиери и билетни касиери', change: -20, field: 'retail', todayId: 'personal_care_worker', futureId: 'eldertech_coordinator', skills: ['communication', 'healthcare'] },
  { id: 'admin', title: 'Административни асистенти и секретари', change: -20, field: 'office', todayId: 'project_manager', futureId: 'ai_agent_manager', skills: ['project_management', 'ai_ml'] },
  { id: 'printing', title: 'Печатари и сродни професии', change: -20, field: 'production', todayId: 'iot_robotics_engineer', futureId: 'digital_twin_engineer', skills: ['automation_robotics', 'data_analysis'] },
  { id: 'accounting', title: 'Счетоводни служители', change: -18, field: 'finance', todayId: 'sustainability_manager', futureId: 'ai_auditor', skills: ['finance', 'analytical_thinking'] },
  { id: 'stock', title: 'Складови служители', change: -16, field: 'logistics', todayId: 'supply_chain_specialist', futureId: 'battery_recycling_specialist', skills: ['project_management', 'sustainability'] },
];

export const CHANGING_SOURCE = {
  title: 'World Economic Forum – Future of Jobs Report 2025', period: '2025–2030',
  url: 'https://euronews.com/business/2025/02/01/jobs-market-at-a-crossroads-which-are-the-fastest-growing-and-declining-jobs',
  note: 'Световна прогноза за % промяна на заетостта до 2030 г. Пътеките за преход са предложение на Future Jobs по близост на уменията.',
};
