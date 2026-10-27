// Каталог на уменията, които Future Jobs проследява.
// patterns  – синоними (EN/DE/BG), по които се разпознава умението в обявите за работа.
//             Това е и механизмът за свързване на синонимни умения: всички варианти се
//             нормализират до един skill id.
// escoQuery – термин за търсене в ESCO API (за стандартизирано наименование и
//             брой професии, за които умението е съществено/по избор).
// wef       – ключ към списъка с най-бързо растящи умения в WEF Future of Jobs 2025 (ако има).
// resources – реални ресурси за обучение (проверявай периодично дали линковете са активни).

/** @typedef {{title:string,url:string,provider:string,free:boolean,lang:string}} Resource */
/** @typedef {{id:string,name:string,en:string,category:string,description:string,patterns:string[],casePatterns?:string[],escoQuery:string,wef?:string,iscoGroups:string[],resources:Resource[]}} Skill */

/** @type {Skill[]} */
export const SKILLS = [
  {
    id: 'ai_ml', name: 'Изкуствен интелект и машинно обучение', en: 'AI & machine learning', category: 'tech',
    description: 'Разбиране и прилагане на модели за машинно обучение и генеративен ИИ.',
    patterns: ['machine learning', 'maschinelles lernen', 'deep learning', 'artificial intelligence', 'künstliche intelligenz',
      'generative ai', 'genai', 'large language model', 'llm', 'llms', 'nlp', 'computer vision', 'pytorch', 'tensorflow',
      'изкуствен интелект', 'машинно обучение'],
    casePatterns: ['AI', 'KI', 'ML'],
    escoQuery: 'machine learning', wef: 'ai_big_data', iscoGroups: ['2'],
    resources: [
      { title: 'Elements of AI (има и на български)', url: 'https://www.elementsofai.com/', provider: 'University of Helsinki / MinnaLearn', free: true, lang: 'bg/en' },
      { title: 'Machine Learning Crash Course', url: 'https://developers.google.com/machine-learning/crash-course', provider: 'Google', free: true, lang: 'en' },
      { title: 'Practical Deep Learning for Coders', url: 'https://course.fast.ai/', provider: 'fast.ai', free: true, lang: 'en' },
      { title: 'Kaggle Learn – Intro to Machine Learning', url: 'https://www.kaggle.com/learn', provider: 'Kaggle', free: true, lang: 'en' },
    ],
  },
  {
    id: 'data_analysis', name: 'Анализ на данни', en: 'Data analysis', category: 'data',
    description: 'Събиране, почистване, анализ и визуализация на данни за вземане на решения.',
    patterns: ['data analysis', 'data analytics', 'data analyst', 'datenanalyse', 'data science', 'data scientist', 'big data',
      'power bi', 'tableau', 'business intelligence', 'statistics', 'statistik', 'pandas', 'анализ на данни'],
    casePatterns: ['BI'],
    escoQuery: 'data analytics', wef: 'ai_big_data', iscoGroups: ['2', '3'],
    resources: [
      { title: 'Google Data Analytics Professional Certificate', url: 'https://www.coursera.org/professional-certificates/google-data-analytics', provider: 'Google / Coursera', free: false, lang: 'en' },
      { title: 'Статистика и вероятности', url: 'https://www.khanacademy.org/math/statistics-probability', provider: 'Khan Academy', free: true, lang: 'en' },
      { title: 'Kaggle Learn – Pandas, Data Visualization', url: 'https://www.kaggle.com/learn', provider: 'Kaggle', free: true, lang: 'en' },
    ],
  },
  {
    id: 'python', name: 'Програмиране на Python', en: 'Python', category: 'tech',
    description: 'Най-използваният език за анализ на данни, автоматизация и ИИ.',
    patterns: ['python', 'django', 'flask', 'fastapi'],
    escoQuery: 'Python (computer programming)', wef: 'tech_literacy', iscoGroups: ['2', '3'],
    resources: [
      { title: 'Официален Python Tutorial', url: 'https://docs.python.org/3/tutorial/', provider: 'Python Software Foundation', free: true, lang: 'en' },
      { title: 'CS50’s Introduction to Programming with Python', url: 'https://cs50.harvard.edu/python/', provider: 'Harvard', free: true, lang: 'en' },
      { title: 'Курсове по програмиране', url: 'https://softuni.bg/', provider: 'СофтУни', free: false, lang: 'bg' },
    ],
  },
  {
    id: 'sql', name: 'Бази данни и SQL', en: 'SQL & databases', category: 'data',
    description: 'Работа с релационни бази данни и заявки към тях.',
    patterns: ['sql', 'postgresql', 'postgres', 'mysql', 'mariadb', 'sql server', 'database', 'datenbank', 'oracle db', 'бази данни'],
    escoQuery: 'SQL', wef: 'ai_big_data', iscoGroups: ['2', '3'],
    resources: [
      { title: 'SQLBolt – интерактивни уроци', url: 'https://sqlbolt.com/', provider: 'SQLBolt', free: true, lang: 'en' },
      { title: 'Kaggle Learn – Intro to SQL', url: 'https://www.kaggle.com/learn', provider: 'Kaggle', free: true, lang: 'en' },
    ],
  },
  {
    id: 'cloud', name: 'Облачни технологии', en: 'Cloud computing', category: 'tech',
    description: 'Изграждане и поддръжка на услуги в AWS, Azure или Google Cloud.',
    patterns: ['cloud', 'aws', 'amazon web services', 'azure', 'google cloud', 'gcp', 'serverless'],
    escoQuery: 'cloud technologies', wef: 'tech_literacy', iscoGroups: ['2', '3'],
    resources: [
      { title: 'AWS Skill Builder', url: 'https://skillbuilder.aws/', provider: 'Amazon Web Services', free: true, lang: 'en' },
      { title: 'Microsoft Learn – Azure Fundamentals', url: 'https://learn.microsoft.com/training/', provider: 'Microsoft', free: true, lang: 'en' },
    ],
  },
  {
    id: 'devops', name: 'DevOps и автоматизация на инфраструктура', en: 'DevOps', category: 'tech',
    description: 'Контейнери, CI/CD и инфраструктура като код.',
    patterns: ['devops', 'docker', 'kubernetes', 'k8s', 'ci/cd', 'terraform', 'ansible', 'gitlab ci', 'github actions', 'linux'],
    escoQuery: 'DevOps', wef: 'tech_literacy', iscoGroups: ['2', '3'],
    resources: [
      { title: 'Linux Journey', url: 'https://linuxjourney.com/', provider: 'Linux Journey', free: true, lang: 'en' },
      { title: 'Pro Git (книга)', url: 'https://git-scm.com/book/', provider: 'git-scm.com', free: true, lang: 'en' },
    ],
  },
  {
    id: 'cybersecurity', name: 'Киберсигурност', en: 'Cybersecurity', category: 'tech',
    description: 'Защита на системи, мрежи и данни от атаки.',
    patterns: ['cybersecurity', 'cyber security', 'information security', 'it security', 'it-sicherheit', 'informationssicherheit',
      'penetration test', 'pentest', 'siem', 'iso 27001', 'soc analyst', 'security engineer', 'киберсигурност'],
    escoQuery: 'cyber security', wef: 'networks_cyber', iscoGroups: ['2', '3'],
    resources: [
      { title: 'Google Cybersecurity Professional Certificate', url: 'https://www.coursera.org/professional-certificates/google-cybersecurity', provider: 'Google / Coursera', free: false, lang: 'en' },
      { title: 'TryHackMe – практически упражнения', url: 'https://tryhackme.com/', provider: 'TryHackMe', free: true, lang: 'en' },
      { title: 'Cisco Networking Academy – Introduction to Cybersecurity', url: 'https://www.netacad.com/', provider: 'Cisco', free: true, lang: 'en' },
    ],
  },
  {
    id: 'networks', name: 'Компютърни мрежи', en: 'Networking', category: 'tech',
    description: 'Проектиране и администриране на мрежи и свързани устройства.',
    patterns: ['network administration', 'networking', 'tcp/ip', 'cisco', 'netzwerk', 'network engineer', 'ccna', 'компютърни мрежи'],
    escoQuery: 'ICT network administration', wef: 'networks_cyber', iscoGroups: ['3', '2'],
    resources: [
      { title: 'Cisco Networking Academy', url: 'https://www.netacad.com/', provider: 'Cisco', free: true, lang: 'en' },
    ],
  },
  {
    id: 'web_dev', name: 'Уеб разработка (JavaScript/TypeScript)', en: 'Web development', category: 'tech',
    description: 'Създаване на уеб приложения – фронтенд и бекенд.',
    patterns: ['javascript', 'typescript', 'react', 'vue', 'angular', 'node.js', 'nodejs', 'frontend', 'front-end', 'html', 'css', 'web development', 'webentwicklung'],
    escoQuery: 'JavaScript', wef: 'tech_literacy', iscoGroups: ['2', '3'],
    resources: [
      { title: 'freeCodeCamp', url: 'https://www.freecodecamp.org/learn', provider: 'freeCodeCamp', free: true, lang: 'en' },
      { title: 'The Odin Project', url: 'https://www.theodinproject.com/', provider: 'The Odin Project', free: true, lang: 'en' },
      { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/', provider: 'Mozilla', free: true, lang: 'en' },
    ],
  },
  {
    id: 'software_engineering', name: 'Софтуерно инженерство', en: 'Software engineering', category: 'tech',
    description: 'Проектиране, писане, тестване и поддръжка на софтуер (Java, C#, C++, Go и др.).',
    patterns: ['software engineer', 'software developer', 'softwareentwicklung', 'softwareentwickler', 'java', 'c#', '.net', 'c++',
      'golang', 'kotlin', 'swift', 'rust', 'git', 'unit test', 'софтуерен инженер', 'програмист'],
    escoQuery: 'computer programming', wef: 'tech_literacy', iscoGroups: ['2'],
    resources: [
      { title: 'CS50x – Introduction to Computer Science', url: 'https://cs50.harvard.edu/x/', provider: 'Harvard', free: true, lang: 'en' },
      { title: 'Telerik Academy', url: 'https://www.telerikacademy.com/', provider: 'Telerik Academy', free: false, lang: 'bg' },
      { title: 'СофтУни', url: 'https://softuni.bg/', provider: 'СофтУни', free: false, lang: 'bg' },
    ],
  },
  {
    id: 'ux_design', name: 'UX/UI дизайн', en: 'UX/UI design', category: 'creative',
    description: 'Проектиране на удобни и достъпни дигитални продукти.',
    patterns: ['ux', 'ui/ux', 'ux/ui', 'user experience', 'user interface', 'figma', 'interaction design', 'usability', 'product design'],
    escoQuery: 'user experience', wef: 'creative', iscoGroups: ['2'],
    resources: [
      { title: 'Google UX Design Professional Certificate', url: 'https://www.coursera.org/professional-certificates/google-ux-design', provider: 'Google / Coursera', free: false, lang: 'en' },
      { title: 'OpenLearn – безплатни курсове', url: 'https://www.open.edu/openlearn/', provider: 'The Open University', free: true, lang: 'en' },
    ],
  },
  {
    id: 'digital_marketing', name: 'Дигитален маркетинг', en: 'Digital marketing', category: 'business',
    description: 'SEO, реклама в интернет, социални мрежи и анализ на кампании.',
    patterns: ['digital marketing', 'online marketing', 'performance marketing', 'seo', 'sem', 'google ads', 'social media', 'content marketing', 'дигитален маркетинг'],
    escoQuery: 'digital marketing techniques', iscoGroups: ['2', '3'],
    resources: [
      { title: 'OpenLearn – Marketing', url: 'https://www.open.edu/openlearn/', provider: 'The Open University', free: true, lang: 'en' },
      { title: 'Платформа за цифрови умения и работни места на ЕС', url: 'https://digital-skills-jobs.europa.eu/', provider: 'Европейска комисия', free: true, lang: 'bg/en' },
    ],
  },
  {
    id: 'project_management', name: 'Управление на проекти', en: 'Project management', category: 'business',
    description: 'Планиране, организиране и доставяне на резултати в срок (Agile, Scrum).',
    patterns: ['project management', 'project manager', 'projektmanagement', 'projektleiter', 'scrum', 'agile', 'kanban', 'pmp', 'prince2', 'управление на проекти'],
    escoQuery: 'project management', wef: 'leadership', iscoGroups: ['1', '2'],
    resources: [
      { title: 'Google Project Management Professional Certificate', url: 'https://www.coursera.org/professional-certificates/google-project-management', provider: 'Google / Coursera', free: false, lang: 'en' },
      { title: 'EU Academy', url: 'https://academy.europa.eu/', provider: 'Европейска комисия', free: true, lang: 'bg/en' },
    ],
  },
  {
    id: 'analytical_thinking', name: 'Аналитично и критично мислене', en: 'Analytical thinking', category: 'human',
    description: 'Разлагане на проблеми, оценка на информация и вземане на обосновани решения.',
    patterns: ['analytical', 'analytisch', 'problem solving', 'problem-solving', 'problemlösung', 'critical thinking', 'kritisches denken', 'аналитично'],
    escoQuery: 'think analytically', wef: 'analytical', iscoGroups: ['1', '2', '3', '4', '5', '7', '8', '9'],
    resources: [
      { title: 'OpenLearn – Critical thinking', url: 'https://www.open.edu/openlearn/', provider: 'The Open University', free: true, lang: 'en' },
      { title: 'Khan Academy – логика и математика', url: 'https://bg.khanacademy.org/', provider: 'Khan Academy', free: true, lang: 'bg' },
    ],
  },
  {
    id: 'creativity', name: 'Креативно мислене', en: 'Creative thinking', category: 'human',
    description: 'Генериране на нови идеи и решения.',
    patterns: ['creative', 'creativity', 'kreativ', 'kreativität', 'innovation', 'innovative', 'design thinking', 'креативн'],
    escoQuery: 'think creatively', wef: 'creative', iscoGroups: ['2', '3', '5', '7'],
    resources: [
      { title: 'OpenLearn – Creativity & innovation', url: 'https://www.open.edu/openlearn/', provider: 'The Open University', free: true, lang: 'en' },
    ],
  },
  {
    id: 'adaptability', name: 'Устойчивост, гъвкавост и адаптивност', en: 'Resilience, flexibility & agility', category: 'human',
    description: 'Справяне с промени, натиск и несигурност.',
    patterns: ['adaptability', 'adaptable', 'flexibility', 'flexible', 'flexibel', 'resilience', 'resilient', 'belastbar', 'belastbarkeit', 'stress resistant', 'гъвкавост'],
    escoQuery: 'adapt to change', wef: 'resilience', iscoGroups: ['1', '2', '3', '4', '5', '7', '8', '9'],
    resources: [
      { title: 'Learning How to Learn', url: 'https://www.coursera.org/learn/learning-how-to-learn', provider: 'Coursera', free: true, lang: 'en' },
    ],
  },
  {
    id: 'lifelong_learning', name: 'Любопитство и учене през целия живот', en: 'Curiosity & lifelong learning', category: 'human',
    description: 'Навик за постоянно учене на нови неща.',
    patterns: ['willingness to learn', 'eager to learn', 'lernbereitschaft', 'curiosity', 'curious', 'neugier', 'continuous learning', 'self-learner'],
    escoQuery: 'manage personal professional development', wef: 'curiosity', iscoGroups: ['1', '2', '3', '4', '5', '7', '8', '9'],
    resources: [
      { title: 'Learning How to Learn', url: 'https://www.coursera.org/learn/learning-how-to-learn', provider: 'Coursera', free: true, lang: 'en' },
      { title: 'Khan Academy на български', url: 'https://bg.khanacademy.org/', provider: 'Khan Academy', free: true, lang: 'bg' },
    ],
  },
  {
    id: 'communication', name: 'Комуникация и презентиране', en: 'Communication', category: 'human',
    description: 'Ясно изразяване устно и писмено, работа с клиенти и екипи.',
    patterns: ['communication skills', 'communicative', 'kommunikationsfähigkeit', 'kommunikationsstark', 'kommunikativ', 'presentation skills', 'stakeholder', 'комуникативн'],
    escoQuery: 'communication', wef: 'leadership', iscoGroups: ['1', '2', '3', '4', '5'],
    resources: [
      { title: 'Toastmasters (клубове и в България)', url: 'https://www.toastmasters.org/', provider: 'Toastmasters International', free: false, lang: 'en/bg' },
      { title: 'OpenLearn – Communication', url: 'https://www.open.edu/openlearn/', provider: 'The Open University', free: true, lang: 'en' },
    ],
  },
  {
    id: 'teamwork', name: 'Работа в екип', en: 'Teamwork', category: 'human',
    description: 'Сътрудничество с хора с различни роли и опит.',
    patterns: ['teamwork', 'team player', 'teamfähig', 'teamfähigkeit', 'teamplayer', 'collaboration', 'collaborative', 'работа в екип'],
    escoQuery: 'work in teams', iscoGroups: ['1', '2', '3', '4', '5', '7', '8', '9'],
    resources: [
      { title: 'Junior Achievement България – програми за ученици', url: 'https://jabulgaria.org/', provider: 'JA България', free: true, lang: 'bg' },
    ],
  },
  {
    id: 'leadership', name: 'Лидерство и социално влияние', en: 'Leadership & social influence', category: 'human',
    description: 'Мотивиране и водене на хора, поемане на отговорност.',
    patterns: ['leadership', 'team lead', 'teamleitung', 'führungskompetenz', 'führungserfahrung', 'people management', 'mentoring', 'лидерство'],
    escoQuery: 'lead others', wef: 'leadership', iscoGroups: ['1', '2'],
    resources: [
      { title: 'Junior Achievement България', url: 'https://jabulgaria.org/', provider: 'JA България', free: true, lang: 'bg' },
      { title: 'OpenLearn – Leadership', url: 'https://www.open.edu/openlearn/', provider: 'The Open University', free: true, lang: 'en' },
    ],
  },
  {
    id: 'english', name: 'Английски език', en: 'English', category: 'language',
    description: 'Работен английски – основен език в международните обяви.',
    patterns: ['english', 'englisch', 'английски'],
    escoQuery: 'English', iscoGroups: ['1', '2', '3', '4', '5'],
    resources: [
      { title: 'Duolingo', url: 'https://www.duolingo.com/', provider: 'Duolingo', free: true, lang: 'bg/en' },
      { title: 'BBC Learning English', url: 'https://www.bbc.co.uk/learningenglish/', provider: 'BBC', free: true, lang: 'en' },
    ],
  },
  {
    id: 'german', name: 'Немски език', en: 'German', category: 'language',
    description: 'Предимство за работа в Германия, Австрия и немски компании в България.',
    patterns: ['german', 'deutsch', 'deutschkenntnisse', 'немски'],
    escoQuery: 'German', iscoGroups: ['1', '2', '3', '4', '5', '7'],
    resources: [
      { title: 'Deutsche Welle – Learn German', url: 'https://learngerman.dw.com/', provider: 'Deutsche Welle', free: true, lang: 'en/de' },
      { title: 'Duolingo', url: 'https://www.duolingo.com/', provider: 'Duolingo', free: true, lang: 'bg/en' },
    ],
  },
  {
    id: 'sustainability', name: 'Устойчивост и зелени технологии', en: 'Environmental stewardship', category: 'green',
    description: 'Енергийна ефективност, възобновяеми източници, ESG и грижа за околната среда.',
    patterns: ['sustainability', 'sustainable', 'nachhaltigkeit', 'esg', 'renewable energy', 'erneuerbare energien', 'photovoltaik',
      'photovoltaic', 'solar', 'wind energy', 'energy efficiency', 'energieeffizienz', 'climate', 'klimaschutz', 'устойчивост'],
    escoQuery: 'environmental protection', wef: 'environmental', iscoGroups: ['2', '3', '7'],
    resources: [
      { title: 'UN CC:Learn – курсове за климата', url: 'https://unccelearn.org/', provider: 'ООН', free: true, lang: 'en' },
      { title: 'EU Academy – Green transition', url: 'https://academy.europa.eu/', provider: 'Европейска комисия', free: true, lang: 'bg/en' },
    ],
  },
  {
    id: 'automation_robotics', name: 'Автоматизация, роботика и IoT', en: 'Automation, robotics & IoT', category: 'tech',
    description: 'Програмиране на контролери, роботи и свързани устройства.',
    patterns: ['automation', 'automatisierung', 'robotics', 'robotik', 'plc', 'sps', 'mechatronics', 'mechatronik', 'iot', 'internet of things', 'embedded', 'arduino', 'роботика'],
    escoQuery: 'robotics', wef: 'tech_literacy', iscoGroups: ['2', '3', '7', '8'],
    resources: [
      { title: 'Arduino Documentation & tutorials', url: 'https://docs.arduino.cc/', provider: 'Arduino', free: true, lang: 'en' },
      { title: 'edX – Robotics courses', url: 'https://www.edx.org/', provider: 'edX', free: false, lang: 'en' },
    ],
  },
  {
    id: 'electrical', name: 'Електротехника и е-мобилност', en: 'Electrical & e-mobility', category: 'hands_on',
    description: 'Електрически инсталации, батерии, зарядна инфраструктура и електромобили.',
    patterns: ['electrical engineering', 'electrician', 'elektrotechnik', 'elektroniker', 'elektriker', 'electric vehicle', 'e-mobility',
      'elektromobilität', 'battery', 'charging infrastructure', 'hochvolt', 'електротехник'],
    casePatterns: ['EV'],
    escoQuery: 'electrical engineering', wef: 'environmental', iscoGroups: ['2', '3', '7'],
    resources: [
      { title: 'OpenLearn – Engineering & technology', url: 'https://www.open.edu/openlearn/', provider: 'The Open University', free: true, lang: 'en' },
    ],
  },
  {
    id: 'healthcare', name: 'Грижа за здравето и хората', en: 'Healthcare & care', category: 'care',
    description: 'Медицински и социални грижи, работа с пациенти и уязвими хора.',
    patterns: ['nursing', 'nurse', 'pflege', 'pflegefachkraft', 'krankenpfleger', 'healthcare', 'patient care', 'caregiver', 'social work', 'sozialarbeit', 'медицинск'],
    escoQuery: 'patient care', iscoGroups: ['2', '3', '5'],
    resources: [
      { title: 'Курсове по първа помощ – БЧК', url: 'https://www.redcross.bg/', provider: 'Български Червен кръст', free: false, lang: 'bg' },
      { title: 'OpenLearn – Health, sports & psychology', url: 'https://www.open.edu/openlearn/', provider: 'The Open University', free: true, lang: 'en' },
    ],
  },
  {
    id: 'customer_service', name: 'Обслужване на клиенти и продажби', en: 'Customer service & sales', category: 'business',
    description: 'Работа с клиенти, консултиране и продажби.',
    patterns: ['customer service', 'customer support', 'kundenservice', 'kundenorientiert', 'kundenbetreuung', 'sales', 'vertrieb', 'account manager', 'business development'],
    escoQuery: 'customer service', iscoGroups: ['3', '4', '5'],
    resources: [
      { title: 'OpenLearn – Business & management', url: 'https://www.open.edu/openlearn/', provider: 'The Open University', free: true, lang: 'en' },
    ],
  },
  {
    id: 'finance', name: 'Финанси и финансови технологии', en: 'Finance & fintech', category: 'business',
    description: 'Финансов анализ, счетоводство, дигитални плащания и fintech.',
    patterns: ['finance', 'financial analysis', 'fintech', 'accounting', 'buchhaltung', 'controlling', 'ifrs', 'payments', 'banking', 'финанс'],
    escoQuery: 'financial analysis', iscoGroups: ['2', '3', '4'],
    resources: [
      { title: 'Khan Academy – Personal finance', url: 'https://www.khanacademy.org/college-careers-more/personal-finance', provider: 'Khan Academy', free: true, lang: 'en' },
      { title: 'OpenLearn – Money & business', url: 'https://www.open.edu/openlearn/', provider: 'The Open University', free: true, lang: 'en' },
    ],
  },
];

export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Компилира шаблоните до регулярни изрази (граници на думи, поддръжка на кирилица). */
const COMPILED = SKILLS.map((s) => {
  const insensitive = s.patterns.map((p) => {
    const body = escapeRe(p.toLowerCase());
    // Шаблони, завършващи на основа (напр. "креативн"), позволяват окончание
    const open = /[а-я]$/.test(p) && p.length >= 6;
    return open ? `(?<![\\p{L}\\p{N}])${body}` : `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`;
  });
  const re = new RegExp(insensitive.join('|'), 'iu');
  const caseRe = s.casePatterns?.length
    ? new RegExp(s.casePatterns.map((p) => `(?<![\\p{L}\\p{N}])${escapeRe(p)}(?![\\p{L}\\p{N}])`).join('|'), 'u')
    : null;
  return { id: s.id, re, caseRe };
});

/**
 * Разпознава уменията в текст на обява. Нормализира синонимите до skill id.
 * @param {string} text @returns {string[]}
 */
export function detectSkills(text) {
  if (!text) return [];
  const found = [];
  for (const c of COMPILED) {
    if (c.re.test(text) || (c.caseRe && c.caseRe.test(text))) found.push(c.id);
  }
  return found;
}
