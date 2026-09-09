const api = require('../services/api');
const formatters = require('../utils/formatters');
const keyboards = require('../keyboards/keyboards');

/**
 * Открыть меню выбора отметки ситуации
 */
async function showMarkMenu(ctx, osmId) {
  try {
    const details = await api.getStationDetails(osmId);
    const stName = details?.name || details?.brand || 'АЗС';

    let text = `✍️ <b>Отметить ситуацию на АЗС «${stName}»</b>\n`;
    if (details?.addr) {
      text += `📍 <i>${details.addr}</i>\n\n`;
    }
    text += `Выберите, какая обстановка на заправке прямо сейчас.\nВаша отметка помогает тысячам водителей не стоять зря в очередях!`;

    const kb = keyboards.markStationKeyboard(osmId);

    return await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...kb
    }).catch(async () => {
      return await ctx.reply(text, { parse_mode: 'HTML', ...kb });
    });
  } catch (err) {
    console.error('Ошибка в showMarkMenu:', err);
    return await ctx.answerCbQuery('Не удалось открыть меню отметок');
  }
}

/**
 * Принятие отметки водителя
 */
async function handleDoMark(ctx, osmId, status) {
  const stInfo = formatters.getStatusInfo(status);

  await ctx.answerCbQuery(`Отметка «${stInfo.label}» принята!`);

  const text = `🎉 <b>Спасибо за ваш вклад!</b>\n\nВы отметили статус: ${stInfo.emoji} <b>${stInfo.label}</b>.\nВаша информация будет полезна другим водителям города!`;

  const kb = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔙 Вернуться к карточке АЗС', callback_data: `open_station_${osmId}` }
        ]
      ]
    }
  };

  return await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...kb
  }).catch(async () => {
    return await ctx.reply(text, { parse_mode: 'HTML', ...kb });
  });
}

module.exports = {
  showMarkMenu,
  handleDoMark
};
