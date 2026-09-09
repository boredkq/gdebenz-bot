const { Markup } = require('telegraf');

/**
 * Главное меню бота (Reply Keyboard)
 */
function mainMenuKeyboard(webAppUrl = 'https://gdebenz.ru/') {
  return Markup.keyboard([
    [
      Markup.button.locationRequest('📍 Найти АЗС рядом'),
      Markup.button.text('🏙 Сменить город')
    ],
    [
      Markup.button.text('⛽ Наличие бензина'),
      Markup.button.text('💰 Где дешевле')
    ],
    [
      Markup.button.text('⭐ Избранные АЗС'),
      Markup.button.text('💬 Чат водителей')
    ],
    [
      Markup.button.text('🛣 Трассы'),
      Markup.button.webApp('🗺 Карта (WebApp)', webAppUrl),
      Markup.button.text('ℹ️ Инфо')
    ]
  ]).resize();
}

/**
 * Клавиатура выбора марки топлива
 */
function fuelGradeKeyboard(selected = '95') {
  const fuels = [
    { id: 'all', label: 'Все марки' },
    { id: '92', label: 'АИ-92' },
    { id: '95', label: 'АИ-95' },
    { id: '98', label: 'АИ-98' },
    { id: '100', label: 'АИ-100' },
    { id: 'ДТ', label: 'Дизель (ДТ)' }
  ];

  const buttons = fuels.map(f => {
    const isSelected = (selected === f.id) || (f.id === 'all' && !selected);
    const text = isSelected ? `✅ ${f.label}` : f.label;
    return Markup.button.callback(text, `set_fuel_${f.id}`);
  });

  return Markup.inlineKeyboard([
    [buttons[0]],
    [buttons[1], buttons[2]],
    [buttons[3], buttons[4]],
    [buttons[5]],
    [Markup.button.callback('🔙 Назад к списку', 'back_to_stations')]
  ]);
}

/**
 * Клавиатура выбора фильтра по статусу
 */
function statusFilterKeyboard(selected = 'all') {
  const statuses = [
    { id: 'all', label: 'Все статусы' },
    { id: 'yes_only', label: '🟢 Только где есть бензин' },
    { id: 'no_queue', label: '🟢🟡 Без очередей' }
  ];

  const buttons = statuses.map(s => {
    const isSelected = selected === s.id;
    const text = isSelected ? `✅ ${s.label}` : s.label;
    return [Markup.button.callback(text, `set_status_${s.id}`)];
  });

  buttons.push([Markup.button.callback('🔙 Назад к списку', 'back_to_stations')]);
  return Markup.inlineKeyboard(buttons);
}

/**
 * Клавиатура списка АЗС с номерами и пагинацией
 */
function stationListKeyboard(stations, page, totalPages, currentFuel = null) {
  const keyboard = [];

  // Кнопки для быстрого перехода в карточку конкретной станции (по 3 или 4 в ряд)
  const stationButtons = stations.map((st, idx) => {
    const num = page * 5 + idx + 1;
    return Markup.button.callback(`🔍 №${num}`, `open_station_${st.osm_id}`);
  });

  // Группируем по 3 кнопки в строке
  for (let i = 0; i < stationButtons.length; i += 3) {
    keyboard.push(stationButtons.slice(i, i + 3));
  }

  // Кнопки пагинации
  const navRow = [];
  if (page > 0) {
    navRow.push(Markup.button.callback('⬅️ Назад', `page_${page - 1}`));
  }
  navRow.push(Markup.button.callback(`📄 ${page + 1}/${Math.max(1, totalPages)}`, 'noop'));
  if (page < totalPages - 1) {
    navRow.push(Markup.button.callback('Вперед ➡️', `page_${page + 1}`));
  }
  keyboard.push(navRow);

  // Фильтры и обновление
  keyboard.push([
    Markup.button.callback(`⛽ Топливо: ${currentFuel || 'Все'}`, 'open_fuel_menu'),
    Markup.button.callback('🔄 Обновить', 'refresh_stations')
  ]);

  return Markup.inlineKeyboard(keyboard);
}

/**
 * Меню детальной карточки АЗС
 */
function stationCardKeyboard(osmId, isFav = false, fromPage = 0) {
  const favBtn = isFav
    ? Markup.button.callback('⭐ Удалить из избранного', `fav_toggle_${osmId}`)
    : Markup.button.callback('☆ В избранное', `fav_toggle_${osmId}`);

  return Markup.inlineKeyboard([
    [favBtn],
    [
      Markup.button.callback('💬 Отзывы водителей', `reviews_${osmId}`),
      Markup.button.callback('✍️ Отметить ситуацию', `mark_menu_${osmId}`)
    ],
    [Markup.button.callback('🔙 Назад к списку', `page_${fromPage}`)]
  ]);
}

/**
 * Меню отметки ситуации на АЗС
 */
function markStationKeyboard(osmId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🟢 Есть бензин', `do_mark_${osmId}_yes`),
      Markup.button.callback('🟡 Очередь', `do_mark_${osmId}_queue`)
    ],
    [
      Markup.button.callback('🟠 Мало', `do_mark_${osmId}_low`),
      Markup.button.callback('🔴 Нет бензина', `do_mark_${osmId}_no`)
    ],
    [
      Markup.button.callback('🟣 Лимит на отпуск', `do_mark_${osmId}_limit`)
    ],
    [Markup.button.callback('🔙 Назад к карточке', `open_station_${osmId}`)]
  ]);
}

/**
 * Клавиатура популярных трасс
 */
function highwaysKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🛣 М-4 «Дон»', 'hw_m4'),
      Markup.button.callback('🛣 М-11 «Нева»', 'hw_m11')
    ],
    [
      Markup.button.callback('🛣 М-12 «Восток»', 'hw_m12'),
      Markup.button.callback('🛣 М-5 «Урал»', 'hw_m5')
    ],
    [
      Markup.button.callback('🛣 М-7 «Волга»', 'hw_m7'),
      Markup.button.callback('🛣 М-8 «Холмогоры»', 'hw_m8')
    ],
    [
      Markup.button.callback('🛣 М-1 «Беларусь»', 'hw_m1'),
      Markup.button.callback('🛣 М-2 «Крым»', 'hw_m2')
    ]
  ]);
}

/**
 * Клавиатура городского чата
 */
function cityChatKeyboard(citySlug) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔄 Обновить чат', `refresh_chat_${citySlug}`),
      Markup.button.callback('🏙 Другой город', 'change_city_from_chat')
    ]
  ]);
}

module.exports = {
  mainMenuKeyboard,
  fuelGradeKeyboard,
  statusFilterKeyboard,
  stationListKeyboard,
  stationCardKeyboard,
  markStationKeyboard,
  highwaysKeyboard,
  cityChatKeyboard
};
