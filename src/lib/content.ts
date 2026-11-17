// Все тексты и ссылки сайта. Пустые массивы означают, что сцена отсутствует.
// Не добавлять неподтверждённые цифры, отзывы, кейсы и факты.

export const content = {
  brand: "n3c3ss",
  slogan: "лучше так, чем никак",

  cta: {
    label: "НАПИСАТЬ",
    href: "https://t.me/n3c3ssary",
    micro: "Вы можете написать мне: t.me/n3c3ssary",
  },
  secondary: {
    label: "мой гитхаб",
    href: "https://github.com/n3c3ss",
  },

  offer: {
    label: "// ОФФЕР",
    title: "Сделаю что угодно по вашему запросу",
    subtitle: "Создаю сайты для компаний и Telegram-ботов под ваши задачи.",
    mainNumber: null as { value: number; suffix?: string; caption: string } | null,
    minorNumbers: [] as { value: number; caption: string }[],
  },

  list: { label: "// ЧТО ВНУТРИ", items: [] as string[] },

  catalog: {
    label: "// КАТАЛОГ",
    items: [] as { name: string; value: number }[],
    link: null as { label: string; href: string } | null,
  },

  people: [] as { name: string; roles: string; text: string; photo?: string }[],
  proof: [] as { src: string; w: number; h: number }[],

  join: {
    label: "// КАК НАЧАТЬ",
    steps: [] as { title: string; text: string }[],
  },

  faq: {
    label: "// FAQ",
    items: [
      { q: "Как меня зовут?", a: "Меня зовут Николай." },
      { q: "Сколько мне лет?", a: "Мне 19 лет." },
      {
        q: "Чем я занимаюсь?",
        a: "Я студент 2 курса направления «Информационная безопасность». Также занимаюсь разработкой сайтов и Telegram-ботов.",
      },
      {
        q: "Что я могу для вас сделать?",
        a: "Могу разработать сайт для вашей компании, создать Telegram-бота или помочь реализовать вашу идею.",
      },
      {
        q: "Как со мной связаться?",
        a: "Напишите мне в Telegram: t.me/n3c3ssary.",
      },
    ],
  },
} as const;

export type Content = typeof content;
