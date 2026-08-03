// Telegram-бот для приёма заявок мастера-отделочника «Ремонт под ключ»
// Библиотека: node-telegram-bot-api

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

if (!BOT_TOKEN) {
  console.error('Ошибка: не задан BOT_TOKEN в файле .env');
  process.exit(1);
}
if (!ADMIN_ID) {
  console.error('Ошибка: не задан ADMIN_ID в файле .env');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ---------------------------------------------------------------------------
// Данные об услугах и ценах (для примера, при необходимости отредактируйте)
// ---------------------------------------------------------------------------
const SERVICES_TEXT =
  '🛠 *Услуги и ориентировочные цены*\n\n' +
  '• Поклейка обоев — от 350 ₽/м²\n' +
  '• Покраска стен и потолков — от 250 ₽/м²\n' +
  '• Укладка плитки — от 800 ₽/м²\n' +
  '• Укладка ламината / паркетной доски — от 400 ₽/м²\n' +
  '• Шпаклёвка и штукатурка стен — от 450 ₽/м²\n' +
  '• Электромонтаж (розетки, выключатели, освещение) — от 500 ₽/точка\n' +
  '• Сантехнические работы (установка, замена) — от 1500 ₽/точка\n' +
  '• Ремонт под ключ (всё включено) — от 8000 ₽/м²\n\n' +
  'Точная стоимость зависит от объёма и сложности работ — рассчитаем после осмотра.';

const CONTACTS_TEXT =
  '📞 *Контакты*\n\n' +
  'Мастер: Иван Иванов\n' +
  'Телефон: +7 900 000-00-00\n' +
  'Telegram: @master_otdelka\n' +
  'Работаем по Москве и области, ежедневно с 9:00 до 20:00.';

// Варианты кнопок для шагов опроса
const WORK_TYPES = ['Поклейка обоев', 'Покраска', 'Плитка', 'Ламинат', 'Другое'];
const TIMING_OPTIONS = ['Срочно', 'В течение недели', 'В течение месяца', 'Пока просто узнаю'];

// Главное меню (обычная клавиатура)
const mainMenuKeyboard = {
  reply_markup: {
    keyboard: [
      ['📝 Оставить заявку'],
      ['🛠 Услуги', '📞 Контакты'],
    ],
    resize_keyboard: true,
  },
};

// ---------------------------------------------------------------------------
// Хранилище состояний опроса по каждому пользователю (по chat id)
// Чтобы заявки разных людей не смешивались, у каждого chatId — своя запись
// ---------------------------------------------------------------------------
// sessions: Map<chatId, { step: string, data: { workType, area, timing, name, phone } }>
const sessions = new Map();

const STEPS = {
  NONE: 'NONE',
  WORK_TYPE: 'WORK_TYPE',
  AREA: 'AREA',
  TIMING: 'TIMING',
  NAME: 'NAME',
  PHONE: 'PHONE',
};

function resetSession(chatId) {
  sessions.set(chatId, { step: STEPS.NONE, data: {} });
}

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    resetSession(chatId);
  }
  return sessions.get(chatId);
}

// ---------------------------------------------------------------------------
// Вспомогательные функции для отправки шагов опроса
// ---------------------------------------------------------------------------
function askWorkType(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.WORK_TYPE;

  bot.sendMessage(chatId, 'Шаг 1 из 5. Какой вид работ вам нужен?', {
    reply_markup: {
      inline_keyboard: WORK_TYPES.map((type) => [
        { text: type, callback_data: `work_type:${type}` },
      ]),
    },
  });
}

function askArea(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.AREA;

  bot.sendMessage(
    chatId,
    'Шаг 2 из 5. Укажите примерную площадь помещения (в м²).\nНапишите ответ текстом, например: 35',
    { reply_markup: { remove_keyboard: true } }
  );
}

function askTiming(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.TIMING;

  bot.sendMessage(chatId, 'Шаг 3 из 5. Когда планируете начать работы?', {
    reply_markup: {
      inline_keyboard: TIMING_OPTIONS.map((option) => [
        { text: option, callback_data: `timing:${option}` },
      ]),
    },
  });
}

function askName(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.NAME;

  bot.sendMessage(chatId, 'Шаг 4 из 5. Как вас зовут?');
}

function askPhone(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.PHONE;

  bot.sendMessage(chatId, 'Шаг 5 из 5. Укажите номер телефона для связи.');
}

// Формирует текст сводки заявки (используется и для клиента, и для админа)
function buildSummary(data) {
  return (
    `Вид работ: ${data.workType}\n` +
    `Площадь: ${data.area} м²\n` +
    `Сроки начала: ${data.timing}\n` +
    `Имя: ${data.name}\n` +
    `Телефон: ${data.phone}`
  );
}

async function finishSurvey(chatId) {
  const session = getSession(chatId);
  const summary = buildSummary(session.data);

  // Сообщение клиенту
  await bot.sendMessage(
    chatId,
    `Спасибо! Ваша заявка принята ✅\n\n${summary}\n\nМастер свяжется с вами в ближайшее время.`,
    mainMenuKeyboard
  );

  // Сообщение администратору — одним сообщением все ответы
  const clientUsername = (await bot.getChat(chatId)).username;
  const contactLine = clientUsername ? `\nTelegram: @${clientUsername}` : '';

  await bot.sendMessage(
    ADMIN_ID,
    `📩 Новая заявка!\n\n${summary}${contactLine}\nchat id клиента: ${chatId}`
  );

  resetSession(chatId);
}

// ---------------------------------------------------------------------------
// Обработка команды /start — сбрасывает опрос в любой момент
// ---------------------------------------------------------------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  resetSession(chatId);

  bot.sendMessage(
    chatId,
    'Здравствуйте! 👋\n' +
      'Я бот мастера-отделочника «Ремонт под ключ».\n' +
      'Помогу быстро оставить заявку на замер и расчёт стоимости.\n\n' +
      'Выберите действие в меню ниже.',
    mainMenuKeyboard
  );
});

// ---------------------------------------------------------------------------
// Обработка текстовых сообщений
// ---------------------------------------------------------------------------
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/start')) {
    // /start уже обработан выше, остальные команды здесь не нужны
    return;
  }

  // Кнопки главного меню
  if (text === '📝 Оставить заявку') {
    resetSession(chatId);
    askWorkType(chatId);
    return;
  }

  if (text === '🛠 Услуги') {
    bot.sendMessage(chatId, SERVICES_TEXT, { parse_mode: 'Markdown' });
    return;
  }

  if (text === '📞 Контакты') {
    bot.sendMessage(chatId, CONTACTS_TEXT, { parse_mode: 'Markdown' });
    return;
  }

  // Обработка текстовых ответов внутри опроса
  const session = getSession(chatId);

  if (session.step === STEPS.AREA) {
    session.data.area = text.trim();
    askTiming(chatId);
    return;
  }

  if (session.step === STEPS.NAME) {
    session.data.name = text.trim();
    askPhone(chatId);
    return;
  }

  if (session.step === STEPS.PHONE) {
    session.data.phone = text.trim();
    finishSurvey(chatId);
    return;
  }

  // Если сообщение не подошло ни под один сценарий — подсказываем, что делать
  bot.sendMessage(chatId, 'Пожалуйста, воспользуйтесь кнопками меню ниже или командой /start.', mainMenuKeyboard);
});

// ---------------------------------------------------------------------------
// Обработка нажатий на инлайн-кнопки (callback_query)
// ---------------------------------------------------------------------------
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const session = getSession(chatId);
  const data = query.data;

  // Всегда отвечаем на callback, чтобы у пользователя пропали «часики» на кнопке
  bot.answerCallbackQuery(query.id);

  if (data.startsWith('work_type:') && session.step === STEPS.WORK_TYPE) {
    session.data.workType = data.replace('work_type:', '');
    askArea(chatId);
    return;
  }

  if (data.startsWith('timing:') && session.step === STEPS.TIMING) {
    session.data.timing = data.replace('timing:', '');
    askName(chatId);
    return;
  }
});

// ---------------------------------------------------------------------------
// Обработка ошибок опроса (например, обрыв соединения)
// ---------------------------------------------------------------------------
bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error.message);
});

console.log('Бот запущен и ожидает сообщения...');
