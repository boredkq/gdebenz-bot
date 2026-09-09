const api = require('../services/api');
const storage = require('../services/storage');
const formatters = require('../utils/formatters');
const keyboards = require('../keyboards/keyboards');

const PAGE_SIZE = 5;

// Популярные федеральные трассы (координаты ключевых участков)
const HIGHWAYS = {
  hw_m4: { name: 'М-4 «Дон» (Ростовское направление)', lat: 49.5, lon: 40.3, radius: 45 },
  hw_m11: { name: 'М-11 «Нева» (Москва — Санкт-Петербург)', lat: 58.2, lon: 33.1, radius: 45 },
  hw_m12: { name: 'М-12 «Восток» (Москва — Казань)', lat: 55.6, lon: 43.5, radius: 45 },
  hw_m5: { name: 'М-5 «Урал» (Москва — Самара — Челябинск)', lat: 53.8, lon: 48.0, radius: 45 },
  hw_m7: { name: 'М-7 «Волга» (Москва — Нижний Новгород)', lat: 56.1, lon: 41.5, radius: 45 },
  hw_m8: { name: 'М-8 «Холмогоры» (Ярославское направление)', lat: 57.6, lon: 39.8, radius: 45 },
  hw_m1: { name: 'М-1 «Беларусь» (Смоленское направление)', lat: 55.2, lon: 34.3, radius: 45 },
  hw_m2: { name: 'М-2 «Крым» (Тула — Белгород)', lat: 53.5, lon: 37.0, radius: 45 }
};

/**
 * Отправить или отредактировать список заправок
 */
async function sendStationsList(ctx, page = 0, isEdit = false) {
  const userId = ctx.from.id;
  const user = storage.getUser(userId);

  // Определяем координаты центра поиска
  const center = user.lastLocation || user.city || { lat: 55.7558, lon: 37.6173, name: 'Москва' };
  const locName = user.lastLocation ? 'Рядом с вами (по GPS)' : (user.city.name || 'Город');

  const fuelGrade = user.fuelGrade === 'all' ? null : user.fuelGrade;
  const statusFilter = user.statusFilter || 'all';
  const sortBy = user.sortBy || 'near';
  const radiusKm = user.radiusKm || 15;

  try {
    const stations = await api.getNearbyStations(center.lat, center.lon, radiusKm, {
      fuelGrade,
      statusFilter,
      sortBy
    });

    if (!stations || stations.length === 0) {
      const fuelDesc = fuelGrade ? `маркой <b>АИ-${fuelGrade}</b>` : 'выбранными фильтрами';
      const emptyText = `⛽ <b>АЗС не найдены</b>\n\nВ радиусе ${radiusKm} км от <b>${locName}</b> с ${fuelDesc} сейчас нет станций с отметками.\n\nПопробуйте сменить фильтр топлива или выбрать другой город.`;

      const kb = keyboards.stationListKeyboard([], 0, 0, fuelGrade, radiusKm);
      if (isEdit) {
        return await ctx.editMessageText(emptyText, { parse_mode: 'HTML', ...kb }).catch(() => {});
      } else {
        return await ctx.reply(emptyText, { parse_mode: 'HTML', ...kb });
      }
    }

    const totalPages = Math.ceil(stations.length / PAGE_SIZE);
    const validPage = Math.max(0, Math.min(page, totalPages - 1));
    user.page = validPage;
    storage.updateUser(userId, { page: validPage });

    const slice = stations.slice(validPage * PAGE_SIZE, (validPage + 1) * PAGE_SIZE);

    let header = `⛽ <b>АЗС · ${locName}</b>\n`;
    header += `<i>Найдено: ${stations.length} заправок в радиусе ${radiusKm} км</i>\n`;
    if (fuelGrade) {
      header += `Топливо: <b>АИ-${fuelGrade}</b> | Сортировка: <b>${sortBy === 'cheap' ? 'Сначала дешевле' : 'Сначала ближе'}</b>\n`;
    }
    header += `────────────────────\n\n`;

    const itemsText = slice.map((st, idx) => {
      const globalIdx = validPage * PAGE_SIZE + idx + 1;
      return formatters.formatStationListItem(st, globalIdx, fuelGrade);
    }).join('\n\n');

    const fullText = header + itemsText;
    const kb = keyboards.stationListKeyboard(slice, validPage, totalPages, fuelGrade, radiusKm);

    if (isEdit) {
      return await ctx.editMessageText(fullText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...kb
      }).catch(() => {});
    } else {
      return await ctx.reply(fullText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...kb
      });
    }
  } catch (err) {
    console.error('Ошибка в sendStationsList:', err);
    const errMsg = '⚠️ Произошла ошибка при загрузке данных АЗС. Пожалуйста, попробуйте снова через пару секунд.';
    if (isEdit) {
      return await ctx.editMessageText(errMsg).catch(() => {});
    } else {
      return await ctx.reply(errMsg);
    }
  }
}

/**
 * Обработка отправки геолокации Telegram
 */
async function handleLocation(ctx) {
  const { latitude, longitude } = ctx.message.location;
  const userId = ctx.from.id;

  storage.updateUser(userId, {
    lastLocation: { lat: latitude, lon: longitude },
    page: 0
  });

  await ctx.reply(`📍 Местоположение получено! Ищем заправки рядом с вами...`);
  return await sendStationsList(ctx, 0, false);
}

/**
 * Просмотр карточки конкретной заправки
 */
async function handleOpenStation(ctx, osmId) {
  const userId = ctx.from.id;
  const user = storage.getUser(userId);

  try {
    const details = await api.getStationDetails(osmId);
    const isFav = storage.isFavorite(userId, osmId);

    // Центр поиска для расчета расстояния
    const center = user.lastLocation || user.city;
    let dist = undefined;
    if (details && details.lat && details.lon && center) {
      dist = Number(api.calculateDistance(center.lat, center.lon, details.lat, details.lon).toFixed(1));
    }

    const stationObj = {
      osm_id: osmId,
      name: details?.name,
      brand: details?.brand,
      lat: details?.lat,
      lon: details?.lon,
      addr: details?.addr,
      status: details?.status,
      prices_now: details?.pricesNow,
      distance: dist
    };

    const text = formatters.formatStationCard(stationObj, details, isFav);
    const kb = keyboards.stationCardKeyboard(osmId, isFav, user.page || 0);

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
    console.error(`Ошибка при открытии АЗС ${osmId}:`, err);
    return await ctx.answerCbQuery('Не удалось загрузить данные АЗС');
  }
}

/**
 * Поиск городов по введенному тексту
 */
async function handleCitySearch(ctx, query) {
  const results = await api.searchCities(query);

  if (!results || results.length === 0) {
    return await ctx.reply(`🔍 По запросу «${query}» ничего не найдено.\nПопробуйте ввести название крупного города или отправьте геолокацию.`);
  }

  if (results.length === 1) {
    const c = results[0];
    const slug = c.slug || c.name.toLowerCase();
    storage.updateUser(ctx.from.id, {
      city: { name: c.name, slug, lat: c.lat, lon: c.lon },
      lastLocation: null,
      page: 0
    });
    await ctx.reply(`✅ Выбран город: <b>${c.name}</b>`, { parse_mode: 'HTML' });
    return await sendStationsList(ctx, 0, false);
  }

  // Если несколько городов, выводим inline кнопки
  const buttons = results.slice(0, 6).map(c => {
    const title = `${c.name}${c.sub ? ` (${c.sub})` : ''}`;
    return [
      {
        text: title,
        callback_data: `sel_city_${c.lat.toFixed(4)}_${c.lon.toFixed(4)}_${encodeURIComponent(c.name).slice(0, 30)}`
      }
    ];
  });

  return await ctx.reply(`Выберите подходящий город:`, {
    reply_markup: { inline_keyboard: buttons }
  });
}

/**
 * Выбор города из списка
 */
async function handleSelectCity(ctx, data) {
  // data: sel_city_lat_lon_name
  const parts = data.replace('sel_city_', '').split('_');
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  const name = decodeURIComponent(parts[2] || 'Город');

  storage.updateUser(ctx.from.id, {
    city: { name, lat, lon, slug: name.toLowerCase() },
    lastLocation: null,
    page: 0
  });

  await ctx.answerCbQuery(`Выбран город: ${name}`);
  await ctx.editMessageText(`✅ Выбран город: <b>${name}</b>`, { parse_mode: 'HTML' }).catch(() => {});
  return await sendStationsList(ctx, 0, false);
}

/**
 * Обработка выбора трассы
 */
async function handleHighway(ctx, hwKey) {
  const hw = HIGHWAYS[hwKey];
  if (!hw) return await ctx.answerCbQuery('Трасса не найдена');

  storage.updateUser(ctx.from.id, {
    city: { name: hw.name, lat: hw.lat, lon: hw.lon },
    lastLocation: { lat: hw.lat, lon: hw.lon },
    radiusKm: hw.radius,
    page: 0
  });

  await ctx.answerCbQuery(hw.name);
  await ctx.reply(`🛣 Загружаем АЗС вдоль трассы: <b>${hw.name}</b>...`, { parse_mode: 'HTML' });
  return await sendStationsList(ctx, 0, false);
}

module.exports = {
  sendStationsList,
  handleLocation,
  handleOpenStation,
  handleCitySearch,
  handleSelectCity,
  handleHighway
};
