const api = require('../services/api');
const storage = require('../services/storage');
const formatters = require('../utils/formatters');
const keyboards = require('../keyboards/keyboards');

/**
 * Словарь сопоставления русских названий городов с slug для чатов
 */
const CITY_SLUGS = {
  'москва': 'moskva',
  'санкт-петербург': 'spb',
  'петербург': 'spb',
  'питер': 'spb',
  'краснодар': 'krasnodar',
  'ростов-на-дону': 'rostov-na-donu',
  'ростов': 'rostov-na-donu',
  'воронеж': 'voronezh',
  'казань': 'kazan',
  'сочи': 'sochi',
  'волгоград': 'volgograd',
  'самара': 'samara',
  'уфа': 'ufa',
  'екатеринбург': 'ekaterinburg',
  'нижний новгород': 'nizhny-novgorod',
  'челябинск': 'chelyabinsk',
  'оренбург': 'orenburg',
  'ставрополь': 'stavropol',
  'белгород': 'belgorod',
  'брянск': 'bryansk',
  'курск': 'kursk'
};

function getCitySlug(cityName) {
  if (!cityName) return 'moskva';
  const clean = cityName.toLowerCase().trim();
  if (CITY_SLUGS[clean]) return CITY_SLUGS[clean];
  
  // Простая транслитерация при отсутствии в словаре
  const ru = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя ';
  const en = ['a','b','v','g','d','e','e','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','h','ts','ch','sh','sch','','y','','e','yu','ya','-'];
  let slug = '';
  for (const ch of clean) {
    const idx = ru.indexOf(ch);
    if (idx >= 0) slug += en[idx];
    else if (/[a-z0-9\-]/.test(ch)) slug += ch;
  }
  return slug || 'moskva';
}

/**
 * Показать сообщения городского чата
 */
async function showCityChat(ctx, isEdit = false) {
  const userId = ctx.from.id;
  const user = storage.getUser(userId);
  const cityName = user.city?.name || 'Москва';
  const slug = user.city?.slug || getCitySlug(cityName);

  try {
    const messages = await api.getCityChatMessages(slug, 20);
    const text = formatters.formatChatMessages(messages, cityName);
    const kb = keyboards.cityChatKeyboard(slug);

    if (isEdit) {
      return await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...kb
      }).catch(() => {});
    } else {
      return await ctx.reply(text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...kb
      });
    }
  } catch (err) {
    console.error('Ошибка в showCityChat:', err);
    const text = `💬 <b>Чат водителей · ${cityName}</b>\n\nНе удалось загрузить сообщения. Попробуйте обновить чуть позже.`;
    const kb = keyboards.cityChatKeyboard(slug);
    if (isEdit) {
      return await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb }).catch(() => {});
    } else {
      return await ctx.reply(text, { parse_mode: 'HTML', ...kb });
    }
  }
}

/**
 * Показать отзывы водителей по конкретной заправке
 */
async function showStationReviews(ctx, osmId) {
  try {
    const comments = await api.getStationComments(osmId, 15);
    const details = await api.getStationDetails(osmId);
    const stName = details?.name || details?.brand || 'АЗС';

    let text = `💬 <b>Отзывы водителей по АЗС «${stName}»</b>\n`;
    if (details?.addr) {
      text += `📍 <i>${details.addr}</i>\n\n`;
    }

    if (!comments || comments.length === 0) {
      text += `<i>Водители еще не оставляли текстовых комментариев по этой станции.</i>\n\nВы можете стать первым и поделиться обстановкой!`;
    } else {
      text += `<i>Последние сообщения:</i>\n\n`;
      for (const c of comments) {
        const author = c.author_name || 'Водитель';
        const time = c.created_at ? formatters.formatTimeAgo(c.created_at) : '';
        const body = c.body || '';
        text += `👤 <b>${author}</b> (${time}):\n${body}\n\n`;
      }
    }

    const kb = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✍️ Оставить отзыв / отметку', callback_data: `mark_menu_${osmId}` }
          ],
          [
            { text: '🔙 Назад к карточке АЗС', callback_data: `open_station_${osmId}` }
          ]
        ]
      }
    };

    return await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...kb
    }).catch(async () => {
      return await ctx.reply(text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...kb
      });
    });
  } catch (err) {
    console.error('Ошибка showStationReviews:', err);
    return await ctx.answerCbQuery('Не удалось загрузить отзывы');
  }
}

module.exports = {
  showCityChat,
  showStationReviews,
  getCitySlug
};
