/**
 * Словарь статусов наличия топлива
 */
const STATUS_DICT = {
  yes: {
    emoji: '🟢',
    label: 'Есть бензин',
    desc: 'Топливо недавно подтверждено водителями'
  },
  queue: {
    emoji: '🟡',
    label: 'Очередь',
    desc: 'Бензин есть, но образовалась очередь'
  },
  low: {
    emoji: '🟠',
    label: 'Мало',
    desc: 'Топливо заканчивается, может быстро иссякнуть'
  },
  no: {
    emoji: '🔴',
    label: 'Нет бензина',
    desc: 'Водители сообщили, что топливо кончилось'
  },
  limit: {
    emoji: '🟣',
    label: 'Лимит',
    desc: 'Отпускают ограниченно (по литрам/талонам)'
  }
};

/**
 * Получить статус с эмодзи
 */
function getStatusInfo(status) {
  return STATUS_DICT[status] || {
    emoji: '⚪',
    label: 'Нет свежих отметок',
    desc: 'Водители пока не отмечали эту заправку'
  };
}

/**
 * Форматирование относительного времени
 */
function formatTimeAgo(timeInput) {
  if (!timeInput) return 'недавно';
  
  let date;
  if (typeof timeInput === 'number') {
    date = new Date(timeInput);
  } else if (typeof timeInput === 'string') {
    // Поддержка формата '2026-08-22 14:30:42'
    date = new Date(timeInput.replace(' ', 'T') + 'Z');
    if (isNaN(date.getTime())) {
      date = new Date(timeInput);
    }
  } else {
    date = new Date(timeInput);
  }

  if (isNaN(date.getTime())) return timeInput;

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  if (diffSeconds < 60) return 'только что';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн назад`;

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * Форматирование цен на заправке
 */
function formatPricesBlock(pricesNow) {
  if (!pricesNow || typeof pricesNow !== 'object') {
    return '<i>Цены на стеле пока не указаны</i>';
  }

  const grades = ['92', '95', '98', '100', 'ДТ'];
  const lines = [];

  for (const g of grades) {
    if (pricesNow[g] && pricesNow[g].p) {
      const p = pricesNow[g].p;
      const votes = pricesNow[g].n ? ` (${pricesNow[g].n} подтв.)` : '';
      const time = pricesNow[g].t ? ` · ${formatTimeAgo(pricesNow[g].t)}` : '';
      lines.push(`  ▫️ <b>АИ-${g === 'ДТ' ? 'ДТ' : g}:</b> <code>${Number(p).toFixed(2)} ₽</code>${votes}${time}`);
    }
  }

  if (lines.length === 0) {
    return '<i>Цены на стеле пока не указаны</i>';
  }

  return lines.join('\n');
}

/**
 * Форматирование краткого элемента в списке АЗС
 */
function formatStationListItem(station, index, selectedFuel = null) {
  const st = getStatusInfo(station.status);
  const name = station.name || station.brand || 'АЗС';
  const dist = station.distance !== undefined ? ` · <b>${station.distance} км</b>` : '';
  const addr = station.addr ? `📍 <i>${station.addr}</i>\n` : '';

  // Краткая строка цен
  let priceStr = '';
  if (station.prices_now && typeof station.prices_now === 'object') {
    const pArr = [];
    if (selectedFuel && station.prices_now[selectedFuel]) {
      pArr.push(`⭐ <b>${selectedFuel}: ${station.prices_now[selectedFuel].p} ₽</b>`);
    } else {
      ['92', '95', 'ДТ'].forEach(g => {
        if (station.prices_now[g]) {
          pArr.push(`${g}: ${station.prices_now[g].p} ₽`);
        }
      });
    }
    if (pArr.length > 0) {
      priceStr = `💰 ${pArr.join(' | ')}\n`;
    }
  }

  return `${index}. ${st.emoji} <b>${name}</b>${dist}\n${addr}${priceStr}`;
}

/**
 * Форматирование детальной карточки АЗС
 */
function formatStationCard(station, details = null, isFav = false) {
  const stInfo = getStatusInfo(details?.status || station.status);
  const name = details?.name || station.name || station.brand || 'АЗС';
  const brand = details?.brand || station.brand;
  const addr = details?.addr || station.addr || 'Адрес не указан';
  const dist = station.distance !== undefined ? ` (${station.distance} км от вас)` : '';
  const favIcon = isFav ? ' ⭐ <i>[В избранном]</i>' : '';

  const prices = details?.pricesNow || station.prices_now;
  const confirmations = details?.confirmations || details?.confirmationsFresh || 0;
  const updatedTime = details?.updated ? formatTimeAgo(details.updated) : null;

  let text = `⛽ <b>${name}</b>${favIcon}\n`;
  if (brand && brand !== name) {
    text += `🏷 Сеть: <b>${brand}</b>\n`;
  }
  text += `📍 Адрес: <code>${addr}</code>${dist}\n\n`;

  text += `<b>Текущий статус:</b>\n`;
  text += `${stInfo.emoji} <b>${stInfo.label}</b> — ${stInfo.desc}\n`;
  if (updatedTime) {
    text += `🕒 Последняя отметка: <i>${updatedTime}</i>\n`;
  }
  if (confirmations > 0) {
    text += `👥 Подтвердили водителей: <b>${confirmations}</b>\n`;
  }

  text += `\n<b>Цены на топливо:</b>\n`;
  text += formatPricesBlock(prices) + '\n\n';

  // Ссылки на навигацию
  const lat = station.lat;
  const lon = station.lon;
  const yandexNavi = `https://yandex.ru/navi/?whatshere%5Bpoint%5D=${lon}%2C${lat}&whatshere%5Bzoom%5D=16`;
  const yandexMaps = `https://yandex.ru/maps/?pt=${lon},${lat}&z=16&l=map`;
  const twoGis = `https://2gis.ru/geo/${lon},${lat}`;

  text += `🧭 <b>Построить маршрут:</b>\n`;
  text += `<a href="${yandexNavi}">🚗 Яндекс.Навигатор</a> | <a href="${yandexMaps}">🗺 Карты</a> | <a href="${twoGis}">📍 2ГИС</a>`;

  return text;
}

/**
 * Форматирование сообщений чата водителей
 */
function formatChatMessages(messages, cityName) {
  if (!messages || messages.length === 0) {
    return `💬 <b>Чат водителей · ${cityName}</b>\n\n<i>В чате этого города пока нет сообщений. Будьте первым!</i>`;
  }

  let text = `💬 <b>Чат водителей · ${cityName}</b>\n`;
  text += `<i>Актуальные сообщения об обстановке на дорогах и заправках:</i>\n\n`;

  // Показываем последние 8 сообщений (для читаемости в Telegram)
  const recent = messages.slice(0, 8);

  for (const m of recent) {
    const author = m.author_name || 'Водитель';
    const time = m.created_ms ? formatTimeAgo(m.created_ms) : '';
    const body = m.body || '';

    let reply = '';
    if (m.reply_to_name && m.reply_to_excerpt) {
      reply = `  ┌ <i>Ответ для ${m.reply_to_name}: «${m.reply_to_excerpt.slice(0, 35)}...»</i>\n`;
    }

    text += `${reply}👤 <b>${author}</b> <tg-spoiler>${time}</tg-spoiler>:\n${body}\n\n`;
  }

  return text;
}

/**
 * Справочная информация о сервисе и безопасность
 */
function getHelpText() {
  return `ℹ️ <b>О сервисе ГдеБЕНЗ (gdebenz.ru)</b>

ГдеБЕНЗ — это независимая народная карта наличия топлива и цен на АЗС России в реальном времени.

<b>Что значат цвета меток:</b>
🟢 <b>Есть</b> — топливо недавно подтверждено водителями.
🟡 <b>Очередь</b> — бензин есть, но на АЗС очередь.
🟠 <b>Мало</b> — остатки топлива, может скоро закончиться.
🔴 <b>Нет</b> — топливо закончилось или водители не смогли заправиться.
🟣 <b>Лимит</b> — отпускают ограниченно (по талонам или литрам).

⚠️ <b>Внимание: защита от мошенников!</b>
Сервис ГдеБЕНЗ полностью бесплатный, без платных подписок и броней.
Никогда не переводите деньги за «электронные талоны», «скидочные ваучеры» или бронь бензина в сторонних каналах и ботах!

🌐 <b>Официальный сайт:</b> <a href="https://gdebenz.ru/">gdebenz.ru</a>
💬 <b>Канал проекта:</b> @gdebenzru`;
}

module.exports = {
  STATUS_DICT,
  getStatusInfo,
  formatTimeAgo,
  formatPricesBlock,
  formatStationListItem,
  formatStationCard,
  formatChatMessages,
  getHelpText
};
