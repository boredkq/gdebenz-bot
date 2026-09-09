require('dotenv').config();
const { Telegraf } = require('telegraf');

const api = require('./services/api');
const storage = require('./services/storage');
const formatters = require('./utils/formatters');
const keyboards = require('./keyboards/keyboards');

const stationsHandlers = require('./handlers/stations');
const chatHandlers = require('./handlers/chat');
const favoritesHandlers = require('./handlers/favorites');
const markHandlers = require('./handlers/mark');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://gdebenz.ru/';

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  console.error('\n' + '='.repeat(65));
  console.error('⚠️  ВНИМАНИЕ: Не задан токен Telegram-бота!');
  console.error('Откройте файл .env и укажите ваш реальный BOT_TOKEN:');
  console.error('BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ');
  console.error('Получить токен можно у официального бота Telegram: @BotFather');
  console.error('='.repeat(65) + '\n');
}

const bot = new Telegraf(BOT_TOKEN || 'dummy_token');

// Middleware для логирования и проверки пользователя
bot.use(async (ctx, next) => {
  if (ctx.from) {
    storage.getUser(ctx.from.id);
  }
  return next();
});

// Команда /start
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const user = storage.getUser(userId);
  const firstName = ctx.from.first_name || 'водитель';

  const welcomeText = `👋 Здравствуйте, <b>${firstName}</b>!

Добро пожаловать в бота <b>ГдеБЕНЗ</b> (gdebenz.ru) — народной карты наличия топлива и цен на АЗС России.

Ваш текущий город: <b>${user.city?.name || 'Москва'}</b>
Предпочитаемое топливо: <b>АИ-${user.fuelGrade || '95'}</b>

<b>Быстрые действия:</b>
📍 Нажмите <b>«Найти АЗС рядом»</b> ниже, чтобы отправить геопозицию и увидеть ближайшие заправки
🏙 Нажмите <b>«Сменить город»</b> или просто напишите название любого города/села
⛽ Нажмите <b>«Наличие бензина»</b>, чтобы просмотреть список АЗС с фильтром по маркам
💰 Нажмите <b>«Где дешевле»</b> для поиска минимальных цен на стелах
🗺 Нажмите <b>«Карта (WebApp)»</b> для запуска интерактивной карты прямо в Telegram!`;

  return ctx.reply(welcomeText, {
    parse_mode: 'HTML',
    ...keyboards.mainMenuKeyboard(WEBAPP_URL)
  });
});

// Команда /help и кнопка "Инфо"
bot.help(async (ctx) => {
  return ctx.reply(formatters.getHelpText(), {
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
});

bot.hears('ℹ️ Инфо', async (ctx) => {
  return ctx.reply(formatters.getHelpText(), {
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
});

// Обработка геолокации
bot.on('location', async (ctx) => {
  return stationsHandlers.handleLocation(ctx);
});

bot.hears('📍 Найти АЗС рядом', async (ctx) => {
  return ctx.reply('Отправьте ваше текущее местоположение с помощью кнопки «Найти АЗС рядом» или значка скрепки 📎 в поле ввода.');
});

// Смена города
bot.hears('🏙 Сменить город', async (ctx) => {
  return ctx.reply('Введите название вашего города, посёлка или села в чат (например: <code>Краснодар</code>, <code>Воронеж</code>, <code>Казань</code>):', {
    parse_mode: 'HTML'
  });
});

// Просмотр заправок / Наличие бензина
bot.hears('⛽ Наличие бензина', async (ctx) => {
  const user = storage.getUser(ctx.from.id);
  storage.updateUser(ctx.from.id, { sortBy: 'near', page: 0 });
  return stationsHandlers.sendStationsList(ctx, 0, false);
});

// Где дешевле
bot.hears('💰 Где дешевле', async (ctx) => {
  const user = storage.getUser(ctx.from.id);
  storage.updateUser(ctx.from.id, { sortBy: 'cheap', page: 0 });
  return stationsHandlers.sendStationsList(ctx, 0, false);
});

// Избранное
bot.hears('⭐ Избранные АЗС', async (ctx) => {
  return favoritesHandlers.showFavoritesList(ctx);
});

// Чат водителей
bot.hears('💬 Чат водителей', async (ctx) => {
  return chatHandlers.showCityChat(ctx, false);
});

// Трассы России
bot.hears('🛣 Трассы', async (ctx) => {
  const text = `🛣 <b>Федеральные трассы России</b>\n\nВыберите нужную трассу для просмотра АЗС и ситуации с топливом вдоль маршрута:`;
  return ctx.reply(text, {
    parse_mode: 'HTML',
    ...keyboards.highwaysKeyboard()
  });
});

// Callback-обработчики

// Заглушка для информационных кнопок пагинатора
bot.action('noop', async (ctx) => {
  return ctx.answerCbQuery();
});

// Пагинация списка АЗС
bot.action(/^page_(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1], 10);
  await ctx.answerCbQuery();
  return stationsHandlers.sendStationsList(ctx, page, true);
});

// Открытие карточки заправки
bot.action(/^open_station_(.+)$/, async (ctx) => {
  const osmId = ctx.match[1];
  await ctx.answerCbQuery();
  return stationsHandlers.handleOpenStation(ctx, osmId);
});

// Возврат к списку заправок
bot.action('back_to_stations', async (ctx) => {
  const user = storage.getUser(ctx.from.id);
  await ctx.answerCbQuery();
  return stationsHandlers.sendStationsList(ctx, user.page || 0, true);
});

// Обновление списка заправок
bot.action('refresh_stations', async (ctx) => {
  const user = storage.getUser(ctx.from.id);
  await ctx.answerCbQuery('Обновляем список АЗС...');
  return stationsHandlers.sendStationsList(ctx, user.page || 0, true);
});

// Меню выбора марки топлива
bot.action('open_fuel_menu', async (ctx) => {
  const user = storage.getUser(ctx.from.id);
  await ctx.answerCbQuery();
  const text = `⛽ <b>Выберите марку топлива для фильтрации:</b>\n\nБот покажет станции, где доступна выбранная марка и цены на нее.`;
  return ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...keyboards.fuelGradeKeyboard(user.fuelGrade)
  }).catch(() => {});
});

// Выбор конкретной марки топлива
bot.action(/^set_fuel_(.+)$/, async (ctx) => {
  const grade = ctx.match[1];
  const fuelGrade = grade === 'all' ? null : grade;
  storage.updateUser(ctx.from.id, { fuelGrade, page: 0 });

  await ctx.answerCbQuery(fuelGrade ? `Выбрана марка АИ-${fuelGrade}` : 'Выбраны все марки');
  return stationsHandlers.sendStationsList(ctx, 0, true);
});

// Меню выбора радиуса поиска
bot.action('open_radius_menu', async (ctx) => {
  const user = storage.getUser(ctx.from.id);
  await ctx.answerCbQuery();
  const text = `📏 <b>Выберите радиус поиска АЗС:</b>\n\nТекущий радиус: <b>${user.radiusKm || 15} км</b>. Чем больше радиус, тем больше заправок найдет бот (особенно полезно на трассах и в небольших населенных пунктах).`;
  return ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...keyboards.radiusKeyboard(user.radiusKm || 15)
  }).catch(() => {});
});

// Выбор конкретного радиуса
bot.action(/^set_radius_(\d+)$/, async (ctx) => {
  const r = parseInt(ctx.match[1], 10);
  storage.updateUser(ctx.from.id, { radiusKm: r, page: 0 });

  await ctx.answerCbQuery(`Радиус поиска изменен на ${r} км`);
  return stationsHandlers.sendStationsList(ctx, 0, true);
});

// Переключение избранного
bot.action(/^fav_toggle_(.+)$/, async (ctx) => {
  const osmId = ctx.match[1];
  return favoritesHandlers.toggleFavoriteHandler(ctx, osmId);
});

// Обновление списка избранного
bot.action('refresh_favs', async (ctx) => {
  await ctx.answerCbQuery('Обновляем...');
  return favoritesHandlers.showFavoritesList(ctx);
});

// Просмотр отзывов по АЗС
bot.action(/^reviews_(.+)$/, async (ctx) => {
  const osmId = ctx.match[1];
  await ctx.answerCbQuery();
  return chatHandlers.showStationReviews(ctx, osmId);
});

// Меню отметки ситуации
bot.action(/^mark_menu_(.+)$/, async (ctx) => {
  const osmId = ctx.match[1];
  await ctx.answerCbQuery();
  return markHandlers.showMarkMenu(ctx, osmId);
});

// Выполнение отметки
bot.action(/^do_mark_([^_]+)_(.+)$/, async (ctx) => {
  const osmId = ctx.match[1];
  const status = ctx.match[2];
  return markHandlers.handleDoMark(ctx, osmId, status);
});

// Выбор города из inline-кнопок
bot.action(/^sel_city_/, async (ctx) => {
  return stationsHandlers.handleSelectCity(ctx, ctx.match.input);
});

// Выбор трассы
bot.action(/^hw_(.+)$/, async (ctx) => {
  return stationsHandlers.handleHighway(ctx, ctx.match.input);
});

// Обновление городского чата
bot.action(/^refresh_chat_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Обновляем сообщения чата...');
  return chatHandlers.showCityChat(ctx, true);
});

bot.action('change_city_from_chat', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Введите название города, чат которого вы хотите прочитать:');
});

// Обработка любого текстового ввода (поиск города)
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  // Игнорируем команды со слешем
  if (text.startsWith('/')) return;

  // Ищем город по введенному тексту
  return stationsHandlers.handleCitySearch(ctx, text);
});

// Глобальная обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Ошибка при обработке запроса для ${ctx.updateType}:`, err);
});

// HTTP сервер для health-check на облачных хостингах (Render, Koyeb, Railway и др.)
const http = require('http');
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('GdeBenz Telegram Bot is running! ⛽\n');
});

server.listen(PORT, () => {
  console.log(`🌐 Health-check сервер активен на порту ${PORT}`);
});

// Запуск бота, если токен задан
if (BOT_TOKEN && BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  bot.launch()
    .then(() => {
      console.log('✅ Бот ГдеБЕНЗ успешно запущен и ожидает сообщения!');
    })
    .catch((err) => {
      console.error('❌ Ошибка запуска бота:', err.message);
    });

  // Корректная остановка при сигналах системы
  process.once('SIGINT', () => {
    server.close();
    bot.stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    server.close();
    bot.stop('SIGTERM');
  });
}

module.exports = bot;

