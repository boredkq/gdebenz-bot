const assert = require('assert');
const api = require('../src/services/api');
const storage = require('../src/services/storage');
const formatters = require('../src/utils/formatters');

async function runTests() {
  console.log('🧪 Запуск интеграционных тестов бота ГдеБЕНЗ...\n');

  // Тест 1: Поиск городов
  console.log('1. Проверка поиска городов...');
  const cities = await api.searchCities('Москва');
  assert(Array.isArray(cities), 'Результаты городов должны быть массивом');
  assert(cities.length > 0, 'Должен найтись хотя бы один город');
  console.log(`   ✅ Успешно найдено ${cities.length} совпадений (первый: ${cities[0].name})`);

  // Тест 2: Загрузка ближайших АЗС
  console.log('\n2. Проверка загрузки ближайших АЗС (Москва, радиус 10 км, АИ-95, дешевле)...');
  const stations = await api.getNearbyStations(55.7558, 37.6173, 10, {
    fuelGrade: '95',
    sortBy: 'cheap'
  });
  assert(Array.isArray(stations), 'Станции должны быть массивом');
  assert(stations.length > 0, 'В Москве должны быть найдены АЗС');
  console.log(`   ✅ Найдено ${stations.length} заправок`);

  const sampleStation = stations[0];
  console.log(`   Пример АЗС: ${sampleStation.name || sampleStation.brand} (дистанция ${sampleStation.distance} км)`);

  // Тест 3: Детали станции
  console.log('\n3. Проверка получения детальной карточки АЗС...');
  const details = await api.getStationDetails(sampleStation.osm_id);
  assert(details !== null, 'Детали станции должны загрузиться');
  console.log(`   ✅ Детали загружены. Статус: ${details.status}, просмотров: ${details.views}`);

  // Тест 4: Отзывы по АЗС
  console.log('\n4. Проверка получения отзывов по АЗС...');
  const comments = await api.getStationComments(sampleStation.osm_id, 5);
  assert(Array.isArray(comments), 'Комментарии должны быть массивом');
  console.log(`   ✅ Получен список отзывов (${comments.length} шт.)`);

  // Тест 5: Городской чат водителей
  console.log('\n5. Проверка сообщений городского чата (Москва)...');
  const chatMessages = await api.getCityChatMessages('moskva', 10);
  assert(Array.isArray(chatMessages), 'Сообщения чата должны быть массивом');
  console.log(`   ✅ Получено ${chatMessages.length} сообщений из живого чата`);

  // Тест 6: Форматирование
  console.log('\n6. Проверка работы форматтеров...');
  const listItemText = formatters.formatStationListItem(sampleStation, 1, '95');
  assert(listItemText.includes(sampleStation.name || sampleStation.brand), 'Текст списка должен содержать название');

  const cardText = formatters.formatStationCard(sampleStation, details, true);
  assert(cardText.includes('Яндекс.Навигатор'), 'Карточка должна содержать ссылки на навигатор');
  console.log('   ✅ Форматирование карточки и списка работает корректно');

  // Тест 7: Локальное хранилище настроек
  console.log('\n7. Проверка хранилища профилей и избранного...');
  const testUserId = 999999999;
  const user = storage.getUser(testUserId);
  assert(user.id === String(testUserId), 'ID пользователя должен совпадать');

  storage.toggleFavorite(testUserId, sampleStation.osm_id);
  assert(storage.isFavorite(testUserId, sampleStation.osm_id) === true, 'Станция должна быть в избранном');

  storage.toggleFavorite(testUserId, sampleStation.osm_id);
  assert(storage.isFavorite(testUserId, sampleStation.osm_id) === false, 'Станция должна быть удалена из избранного');
  console.log('   ✅ Хранилище настроек и избранного работает корректно');

  console.log('\n🎉 ВСЕ ТЕСТЫ УСПЕШНО ПРОЙДЕНЫ!');
}

runTests().catch(err => {
  console.error('\n❌ Ошибка во время выполнения тестов:', err);
  process.exit(1);
});
