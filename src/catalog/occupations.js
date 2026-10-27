// Каталог на бъдещите професии в Future Jobs.
// isco/isco2 – ISCO-08 основна (1 цифра) и подгрупа (2 цифри). Ако ESCO върне код при
//              импорта, ESCO кодът има предимство (виж esco_concepts.code).
// interests  – тегла по интереси (използват се от анкетата).
// wefFastest/wefLargest – ключове от WEF_2025 (catalog/published.js), ако професията
//              съответства на позиция в списъците на доклада.

/** @typedef {{id:string,title:string,description:string,escoQuery:string,isco:string,isco2:string,interests:Record<string,number>,coreSkills:string[],complementarySkills:string[],wefFastest?:string,wefLargest?:string}} Occupation */

/** @type {Occupation[]} */
export const OCCUPATIONS = [
  {
    id: 'ai_ml_specialist', title: 'Специалист по изкуствен интелект и машинно обучение',
    description: 'Създава и обучава модели, които разпознават, предсказват и генерират.',
    escoQuery: 'machine learning engineer', isco: '2', isco2: '25',
    interests: { tech: 3, data: 3, science: 2 },
    coreSkills: ['python', 'ai_ml', 'data_analysis', 'sql'], complementarySkills: ['cloud', 'analytical_thinking', 'english', 'lifelong_learning'],
    wefFastest: 'ai_ml',
  },
  {
    id: 'data_scientist', title: 'Специалист по данни (Data Scientist / Big Data)',
    description: 'Превръща големи масиви от данни в изводи и решения за бизнеса и обществото.',
    escoQuery: 'data scientist', isco: '2', isco2: '25',
    interests: { data: 3, science: 2, tech: 2, business: 1 },
    coreSkills: ['data_analysis', 'sql', 'python', 'analytical_thinking'], complementarySkills: ['ai_ml', 'cloud', 'communication', 'english'],
    wefFastest: 'big_data',
  },
  {
    id: 'software_developer', title: 'Разработчик на софтуер и приложения',
    description: 'Проектира и пише софтуер – от мобилни приложения до големи системи.',
    escoQuery: 'software developer', isco: '2', isco2: '25',
    interests: { tech: 3, creative: 1, data: 1 },
    coreSkills: ['software_engineering', 'web_dev', 'sql', 'teamwork'], complementarySkills: ['cloud', 'devops', 'ai_ml', 'english'],
    wefFastest: 'software_dev', wefLargest: 'software_dev',
  },
  {
    id: 'cybersecurity_specialist', title: 'Специалист по киберсигурност',
    description: 'Пази системите и данните на организациите от атаки и изтичане.',
    escoQuery: 'ICT security engineer', isco: '2', isco2: '25',
    interests: { tech: 3, science: 1, data: 1 },
    coreSkills: ['cybersecurity', 'networks', 'devops', 'analytical_thinking'], complementarySkills: ['cloud', 'python', 'communication', 'english'],
    wefFastest: 'security_mgmt',
  },
  {
    id: 'cloud_engineer', title: 'Облачен и DevOps инженер',
    description: 'Изгражда и автоматизира инфраструктурата, на която работят онлайн услугите.',
    escoQuery: 'cloud engineer', isco: '2', isco2: '25',
    interests: { tech: 3, hands_on: 1 },
    coreSkills: ['cloud', 'devops', 'networks', 'python'], complementarySkills: ['cybersecurity', 'sql', 'teamwork', 'english'],
    wefFastest: 'data_warehousing',
  },
  {
    id: 'ux_designer', title: 'UX/UI дизайнер',
    description: 'Проектира как хората използват приложения и сайтове – удобно и красиво.',
    escoQuery: 'user interface designer', isco: '2', isco2: '21',
    interests: { creative: 3, people: 2, tech: 1 },
    coreSkills: ['ux_design', 'creativity', 'communication', 'web_dev'], complementarySkills: ['data_analysis', 'ai_ml', 'teamwork', 'english'],
    wefFastest: 'ui_ux',
  },
  {
    id: 'iot_robotics_engineer', title: 'Инженер по роботика, автоматизация и IoT',
    description: 'Създава умни машини, сензори и автоматизирани производствени линии.',
    escoQuery: 'robotics engineer', isco: '2', isco2: '21',
    interests: { tech: 2, hands_on: 3, science: 2 },
    coreSkills: ['automation_robotics', 'electrical', 'python', 'analytical_thinking'], complementarySkills: ['networks', 'ai_ml', 'teamwork', 'german'],
    wefFastest: 'iot',
  },
  {
    id: 'ev_specialist', title: 'Специалист по електромобили и автономни превозни средства',
    description: 'Работи с батерии, електрически задвижвания и софтуер на автомобили.',
    escoQuery: 'automotive engineer', isco: '2', isco2: '21',
    interests: { hands_on: 3, tech: 2, nature: 1 },
    coreSkills: ['electrical', 'automation_robotics', 'analytical_thinking', 'software_engineering'], complementarySkills: ['sustainability', 'german', 'teamwork', 'lifelong_learning'],
    wefFastest: 'autonomous_ev',
  },
  {
    id: 'renewable_energy_engineer', title: 'Инженер/техник по възобновяема енергия',
    description: 'Проектира и поддържа соларни, вятърни и енергоефективни системи.',
    escoQuery: 'solar energy engineer', isco: '2', isco2: '21',
    interests: { nature: 3, hands_on: 2, science: 2 },
    coreSkills: ['sustainability', 'electrical', 'analytical_thinking', 'project_management'], complementarySkills: ['automation_robotics', 'data_analysis', 'english', 'adaptability'],
  },
  {
    id: 'sustainability_manager', title: 'Мениджър по устойчиво развитие (ESG)',
    description: 'Помага на компаниите да намалят въздействието си върху климата и да отчитат ESG.',
    escoQuery: 'sustainability manager', isco: '2', isco2: '21',
    interests: { nature: 3, business: 2, people: 1 },
    coreSkills: ['sustainability', 'data_analysis', 'communication', 'project_management'], complementarySkills: ['finance', 'leadership', 'english', 'analytical_thinking'],
  },
  {
    id: 'fintech_specialist', title: 'FinTech специалист',
    description: 'Съчетава финанси и технологии – дигитални плащания, банкиране и анализ на риска.',
    escoQuery: 'financial analyst', isco: '2', isco2: '24',
    interests: { business: 3, data: 2, tech: 2 },
    coreSkills: ['finance', 'data_analysis', 'sql', 'python'], complementarySkills: ['cybersecurity', 'ai_ml', 'communication', 'english'],
    wefFastest: 'fintech',
  },
  {
    id: 'digital_marketer', title: 'Специалист по дигитален маркетинг',
    description: 'Планира и анализира онлайн кампании, съдържание и присъствие в социалните мрежи.',
    escoQuery: 'online marketer', isco: '2', isco2: '24',
    interests: { creative: 2, business: 3, people: 2 },
    coreSkills: ['digital_marketing', 'data_analysis', 'communication', 'creativity'], complementarySkills: ['ai_ml', 'ux_design', 'english', 'adaptability'],
  },
  {
    id: 'project_manager', title: 'Мениджър на ИТ и дигитални проекти',
    description: 'Организира екипи и ресурси, за да бъдат доставени проектите в срок.',
    escoQuery: 'ICT project manager', isco: '2', isco2: '24',
    interests: { business: 3, people: 3, tech: 1 },
    coreSkills: ['project_management', 'leadership', 'communication', 'teamwork'], complementarySkills: ['data_analysis', 'ai_ml', 'english', 'adaptability'],
  },
  {
    id: 'nurse', title: 'Медицинска сестра / медицински специалист',
    description: 'Грижи се за пациенти – професия с растящо търсене заради застаряването на населението.',
    escoQuery: 'nurse responsible for general care', isco: '2', isco2: '22',
    interests: { care: 3, people: 3, science: 1 },
    coreSkills: ['healthcare', 'communication', 'adaptability', 'teamwork'], complementarySkills: ['data_analysis', 'german', 'english', 'lifelong_learning'],
    wefLargest: 'nursing',
  },
  {
    id: 'personal_care_worker', title: 'Специалист по лични и социални грижи',
    description: 'Подкрепя възрастни хора и хора с увреждания в ежедневието им.',
    escoQuery: 'home care aide', isco: '5', isco2: '53',
    interests: { care: 3, people: 3 },
    coreSkills: ['healthcare', 'communication', 'adaptability', 'teamwork'], complementarySkills: ['german', 'lifelong_learning', 'customer_service', 'english'],
  },
  {
    id: 'social_worker', title: 'Социален работник / психолог-консултант',
    description: 'Помага на хора и семейства в трудни ситуации; консултира и подкрепя.',
    escoQuery: 'social worker', isco: '2', isco2: '26',
    interests: { people: 3, care: 3, science: 1 },
    coreSkills: ['communication', 'healthcare', 'analytical_thinking', 'adaptability'], complementarySkills: ['leadership', 'teamwork', 'english', 'lifelong_learning'],
    wefLargest: 'social_workers',
  },
  {
    id: 'teacher', title: 'Учител и специалист по дигитално образование',
    description: 'Обучава и вдъхновява – с нови дигитални инструменти и ИИ в класната стая.',
    escoQuery: 'secondary school teacher', isco: '2', isco2: '23',
    interests: { people: 3, creative: 2, science: 1 },
    coreSkills: ['communication', 'leadership', 'creativity', 'lifelong_learning'], complementarySkills: ['ai_ml', 'data_analysis', 'english', 'adaptability'],
  },
  {
    id: 'construction_specialist', title: 'Специалист в строителството (вкл. енергийно обновяване)',
    description: 'Строи и обновява сгради – с нови материали, енергийна ефективност и дигитални модели.',
    escoQuery: 'construction manager', isco: '7', isco2: '71',
    interests: { hands_on: 3, nature: 1, business: 1 },
    coreSkills: ['sustainability', 'project_management', 'teamwork', 'electrical'], complementarySkills: ['automation_robotics', 'leadership', 'german', 'adaptability'],
    wefLargest: 'construction_workers',
  },
  {
    id: 'supply_chain_specialist', title: 'Специалист по логистика и вериги на доставки',
    description: 'Организира движението на стоки – от склада до клиента, с данни и автоматизация.',
    escoQuery: 'supply chain manager', isco: '1', isco2: '13',
    interests: { business: 3, data: 2, hands_on: 1 },
    coreSkills: ['data_analysis', 'project_management', 'communication', 'analytical_thinking'], complementarySkills: ['automation_robotics', 'sustainability', 'english', 'german'],
    wefLargest: 'delivery_drivers',
  },
  {
    id: 'agritech_specialist', title: 'Специалист по агротехнологии',
    description: 'Използва сензори, дронове и данни за по-ефективно и устойчиво земеделие.',
    escoQuery: 'agricultural technician', isco: '3', isco2: '31',
    interests: { nature: 3, hands_on: 2, tech: 1 },
    coreSkills: ['sustainability', 'data_analysis', 'automation_robotics', 'adaptability'], complementarySkills: ['analytical_thinking', 'project_management', 'english', 'lifelong_learning'],
    wefLargest: 'farmworkers',
  },
];

export const OCCUPATION_BY_ID = new Map(OCCUPATIONS.map((o) => [o.id, o]));

export const ISCO_MAJOR_LABELS = {
  '0': 'Въоръжени сили', '1': 'Ръководители', '2': 'Специалисти', '3': 'Техници и приложни специалисти',
  '4': 'Помощен административен персонал', '5': 'Персонал, зает с услуги и търговия',
  '6': 'Квалифицирани работници в селското стопанство', '7': 'Квалифицирани работници и занаятчии',
  '8': 'Машинни оператори и монтажници', '9': 'Професии, неизискващи специална квалификация',
};
