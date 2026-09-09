const api = require('../services/api');
const storage = require('../services/storage');
const formatters = require('../utils/formatters');
const keyboards = require('../keyboards/keyboards');

/**
 * Переключение статуса избранного
 */
async function toggleFavoriteHandler(ctx, osmId) {
  const userId = ctx.from.id;
  const { isAdded } = storage.toggleFavorite(userId, osmId);

  const alertText = isAdded
    ? '⭐ АЗС добавлена в ваши «Избранные»!'
    : '❌ АЗС удалена из «Избранного»';

  await ctx.answerCbQuery(alertText);

  // Обновляем клавиатуру карточки
  const user = storage.getUser(userId);
  const kb = keyboards.stationCardKeyboard(osmId, isAdded, user.page || 0);

  return await ctx.editMessageReplyMarkup(kb.reply_markup).catch(() => {});
}

/**
 * Просмотр списка избранных АЗС с актуальными статусами
 */
async function showFavoritesList(ctx) {
  const userId = ctx.from.id;
  const user = storage.getUser(userId);
  const favIds = user.favorites || [];

  if (favIds.length === 0) {
    const text = `⭐ <b>Избранные заправки</b>\n\nУ вас пока нет сохраненных АЗС.\n\nВы можете добавить любую заправку в избранное, нажав кнопку «☆ В избранное» в её карточке, чтобы быстро проверять наличие топлива и цены!`;
    return await ctx.reply(text, { parse_mode: 'HTML' });
  }

  await ctx.reply(`⭐ Загружаем данные по вашим ${favIds.length} избранным АЗС...`);

  try {
    // Параллельно загружаем актуальные детали каждой заправки
    const promises = favIds.map(id => api.getStationDetails(id));
    const results = await Promise.all(promises);

    let text = `⭐ <b>Ваши избранные АЗС</b> (${favIds.length}):\n\n`;
    const buttons = [];

    results.forEach((st, idx) => {
      const osmId = favIds[idx];
      if (!st) {
        text += `${idx + 1}. ⚪ <b>АЗС #${osmId}</b>\n📍 <i>Данные временно недоступны</i>\n\n`;
        buttons.push([
          { text: `🔍 №${idx + 1} (АЗС #${osmId})`, callback_data: `open_station_${osmId}` }
        ]);
        return;
      }

      const stInfo = formatters.getStatusInfo(st.status);
      const name = st.name || st.brand || 'АЗС';
      const addr = st.addr ? `📍 <i>${st.addr}</i>\n` : '';
      const updated = st.updated ? ` · ${formatters.formatTimeAgo(st.updated)}` : '';

      text += `${idx + 1}. ${stInfo.emoji} <b>${name}</b>\n${addr}`;
      text += `Статус: <b>${stInfo.label}</b>${updated}\n`;

      if (st.pricesNow && typeof st.pricesNow === 'object') {
        const pArr = [];
        ['92', '95', 'ДТ'].forEach(g => {
          if (st.pricesNow[g] && st.pricesNow[g].p) {
            pArr.push(`${g}: ${st.pricesNow[g].p} ₽`);
          }
        });
        if (pArr.length > 0) {
          text += `💰 ${pArr.join(' | ')}\n`;
        }
      }
      text += '\n';

      buttons.push([
        { text: `🔍 №${idx + 1} · ${stInfo.emoji} ${name.slice(0, 25)}`, callback_data: `open_station_${osmId}` }
      ]);
    });

    buttons.push([
      { text: '🔄 Обновить статусы избранного', callback_data: 'refresh_favs' }
    ]);

    return await ctx.reply(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: buttons }
    });
  } catch (err) {
    console.error('Ошибка в showFavoritesList:', err);
    return await ctx.reply('⚠️ Не удалось загрузить данные избранных станций. Попробуйте позже.');
  }
}

module.exports = {
  toggleFavoriteHandler,
  showFavoritesList
};
