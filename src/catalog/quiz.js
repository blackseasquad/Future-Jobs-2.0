// Анкета за интереси. Всеки отговор добавя тегла към интереси (tech, data, creative,
// people, care, nature, business, hands_on, science). Някои въпроси задават настройки.
export const INTERESTS = {
  tech: 'Технологии', data: 'Данни и анализ', creative: 'Творчество и дизайн', people: 'Работа с хора',
  care: 'Грижа и помощ', nature: 'Природа и устойчивост', business: 'Бизнес и организация',
  hands_on: 'Практическа/техническа работа', science: 'Наука и изследвания',
};

export const QUIZ = [
  {
    id: 'afternoon', type: 'single', text: 'Свободен следобед е. Кое би направил(а) с най-голямо удоволствие?',
    options: [
      { id: 'code', text: 'Ще програмирам или ще сглобя нещо техническо', w: { tech: 2, hands_on: 1 } },
      { id: 'analyze', text: 'Ще разгледам статистики – за спорт, игри, пазари', w: { data: 2, science: 1 } },
      { id: 'create', text: 'Ще рисувам, снимам, проектирам или правя видео', w: { creative: 2 } },
      { id: 'help', text: 'Ще помогна на някого или ще се включа като доброволец', w: { care: 2, people: 1 } },
      { id: 'organize', text: 'Ще организирам събитие или ще мисля бизнес идея', w: { business: 2, people: 1 } },
      { id: 'outdoor', text: 'Ще бъда навън – сред природата или в работилница', w: { nature: 2, hands_on: 1 } },
    ],
  },
  {
    id: 'subjects', type: 'multi', max: 3, text: 'Кои учебни предмети харесваш най-много? (до 3)',
    options: [
      { id: 'math', text: 'Математика', w: { data: 2, science: 1 } },
      { id: 'it', text: 'Информатика / ИТ', w: { tech: 2, data: 1 } },
      { id: 'physics', text: 'Физика / технологии', w: { hands_on: 1, science: 2, tech: 1 } },
      { id: 'bio', text: 'Биология / химия', w: { science: 2, care: 1, nature: 1 } },
      { id: 'geo', text: 'География / екология', w: { nature: 2, science: 1 } },
      { id: 'lang', text: 'Езици / литература', w: { people: 2, creative: 1 } },
      { id: 'arts', text: 'Изкуства / музика', w: { creative: 2 } },
      { id: 'econ', text: 'Икономика / предприемачество', w: { business: 2, data: 1 } },
      { id: 'social', text: 'История / философия / психология', w: { people: 2, care: 1 } },
    ],
  },
  {
    id: 'workwith', type: 'single', text: 'С какво предпочиташ да работиш най-често?',
    options: [
      { id: 'people', text: 'С хора – да обяснявам, помагам, убеждавам', w: { people: 2, care: 1 } },
      { id: 'data', text: 'С информация и числа', w: { data: 2, business: 1 } },
      { id: 'things', text: 'С машини, уреди и материали', w: { hands_on: 2, tech: 1 } },
      { id: 'ideas', text: 'С идеи – да измислям нови неща', w: { creative: 2, science: 1 } },
    ],
  },
  {
    id: 'tech_attitude', type: 'single', text: 'Какво е отношението ти към технологиите?',
    options: [
      { id: 'build', text: 'Искам да ги създавам', w: { tech: 3 } },
      { id: 'use', text: 'Искам да ги използвам умно в своята област', w: { data: 1, business: 1, creative: 1 } },
      { id: 'less', text: 'Предпочитам работа, в която те не са в центъра', w: { care: 1, hands_on: 1, people: 1 } },
    ],
  },
  {
    id: 'environment', type: 'single', text: 'Къде би искал(а) да работиш?',
    options: [
      { id: 'office', text: 'В офис или дистанционно, пред компютър', w: { tech: 1, data: 1, business: 1 } },
      { id: 'field', text: 'На терен, навън или в производство', w: { hands_on: 2, nature: 1 } },
      { id: 'clinic', text: 'В болница, лаборатория или център за хора', w: { care: 2, science: 1 } },
      { id: 'studio', text: 'В студио, клас или пред публика', w: { creative: 1, people: 2 } },
    ],
  },
  {
    id: 'values', type: 'single', text: 'Кое е най-важно за теб в бъдещата работа?', setting: 'value',
    options: [
      { id: 'income', text: 'Добро заплащане', w: { business: 1, tech: 1, data: 1 } },
      { id: 'impact', text: 'Да помагам на хората или на планетата', w: { care: 1, nature: 1, people: 1 } },
      { id: 'freedom', text: 'Творческа свобода', w: { creative: 2 } },
      { id: 'stability', text: 'Сигурност – професия с добро бъдеще', w: {} },
    ],
  },
  {
    id: 'study', type: 'single', text: 'Как искаш да продължиш след 12. клас?', setting: 'study',
    options: [
      { id: 'university', text: 'Университет (бакалавър и нагоре)', w: { science: 1 } },
      { id: 'course', text: 'Професионален курс/академия (до 2 години)', w: { hands_on: 1 } },
      { id: 'work', text: 'Започвам работа и уча в движение', w: {} },
      { id: 'unsure', text: 'Още не знам', w: {} },
    ],
  },
  {
    id: 'english', type: 'single', text: 'Какво е нивото ти на английски?', setting: 'english',
    options: [
      { id: 'basic', text: 'Начално (A1–A2)', w: {} },
      { id: 'mid', text: 'Средно (B1)', w: {} },
      { id: 'good', text: 'Добро или отлично (B2 и нагоре)', w: {} },
    ],
  },
];

/** Валидира и превръща отговорите в профил. @param {Record<string, string|string[]>} answers */
export function buildProfile(answers) {
  if (!answers || typeof answers !== 'object') throw new Error('Липсват отговори');
  const vec = Object.fromEntries(Object.keys(INTERESTS).map((k) => [k, 0]));
  const settings = {};
  for (const q of QUIZ) {
    const a = answers[q.id];
    if (a === undefined || a === null || a === '') throw new Error(`Липсва отговор на въпрос „${q.text}“`);
    const ids = Array.isArray(a) ? a : [a];
    if (q.type === 'single' && ids.length !== 1) throw new Error(`Въпрос ${q.id}: очаква се един отговор`);
    if (q.type === 'multi' && (ids.length < 1 || ids.length > (q.max || 99))) throw new Error(`Въпрос ${q.id}: избери 1–${q.max}`);
    for (const id of ids) {
      const opt = q.options.find((o) => o.id === id);
      if (!opt) throw new Error(`Въпрос ${q.id}: невалиден отговор`);
      for (const [k, v] of Object.entries(opt.w)) vec[k] += v;
      if (q.setting) settings[q.setting] = id;
    }
  }
  return { vector: vec, settings };
}
