const axios = require('axios');
const NodeCache = require('node-cache');

// Кэш для ускорения работы и бережного отношения к API
// Станции кэшируем на 45 секунд, города на 15 минут
const cache = new NodeCache({ stdTTL: 45, checkperiod: 60 });
const cityCache = new NodeCache({ stdTTL: 900, checkperiod: 300 });

const BASE_URL = 'https://gdebenz.ru';
const CHAT_BASE_URL = 'https://api.gdebenz.ru';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Referer': 'https://gdebenz.ru/',
  'Accept': 'application/json'
};

const client = axios.create({
  baseURL: BASE_URL,
  headers: HEADERS,
  timeout: 10000
});

const chatClient = axios.create({
  baseURL: CHAT_BASE_URL,
  headers: HEADERS,
  timeout: 10000
});

/**
 * Вычисление расстояния между двумя координатами в км (формула гаверсинусов)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Радиус Земли в км
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Поиск городов и населенных пунктов по названию
 */
async function searchCities(query) {
  const q = (query || '').trim();
  if (q.length < 2) return [];

  const cacheKey = `city_${q.toLowerCase()}`;
  const cached = cityCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await client.get(`/api/cities?q=${encodeURIComponent(q)}`);
    const results = res.data && res.data.results ? res.data.results : [];
    cityCache.set(cacheKey, results);
    return results;
  } catch (err) {
    console.error('Ошибка поиска городов:', err.message);
    return [];
  }
}

/**
 * Определение примерного местоположения по IP
 */
async function getGeoIp() {
  try {
    const res = await client.get('/api/geoip');
    return res.data;
  } catch (err) {
    console.error('Ошибка getGeoIp:', err.message);
    return null;
  }
}

/**
 * Загрузка АЗС в пределах прямоугольной географической области (bounding box)
 */
async function getStationsInBounds(lat1, lon1, lat2, lon2, kinds = '') {
  // Округляем для эффективного кэширования
  const rLat1 = Number(lat1).toFixed(4);
  const rLon1 = Number(lon1).toFixed(4);
  const rLat2 = Number(lat2).toFixed(4);
  const rLon2 = Number(lon2).toFixed(4);

  const cacheKey = `st_${rLat1}_${rLon1}_${rLat2}_${rLon2}_${kinds}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    let url = `/api/stations?lat1=${rLat1}&lon1=${rLon1}&lat2=${rLat2}&lon2=${rLon2}`;
    if (kinds) url += `&kinds=${encodeURIComponent(kinds)}`;

    const res = await client.get(url);
    const stations = Array.isArray(res.data) ? res.data : (res.data && res.data.stations ? res.data.stations : []);
    cache.set(cacheKey, stations);
    return stations;
  } catch (err) {
    console.error('Ошибка загрузки станций:', err.message);
    return [];
  }
}

/**
 * Получение детальных сведений о заправке по osm_id
 */
async function getStationDetails(osmId) {
  const cacheKey = `details_${osmId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await client.get(`/api/comments/${encodeURIComponent(osmId)}`);
    if (res.data) {
      cache.set(cacheKey, res.data, 30); // 30 секунд кэш деталей
      return res.data;
    }
    return null;
  } catch (err) {
    console.error(`Ошибка получения деталей АЗС ${osmId}:`, err.message);
    return null;
  }
}

/**
 * Получение комментариев водителей по конкретной АЗС
 */
async function getStationComments(osmId, limit = 15) {
  try {
    const res = await chatClient.get(`/api/chats/${encodeURIComponent(osmId)}?limit=${limit}`);
    return res.data && res.data.comments ? res.data.comments : [];
  } catch (err) {
    console.error(`Ошибка получения отзывов АЗС ${osmId}:`, err.message);
    return [];
  }
}

/**
 * Получение сообщений городского чата взаимопомощи
 */
async function getCityChatMessages(slug, limit = 20) {
  try {
    const res = await chatClient.get(`/api/chats/city/${encodeURIComponent(slug)}/messages?limit=${limit}`);
    return res.data && res.data.messages ? res.data.messages : [];
  } catch (err) {
    console.error(`Ошибка получения сообщений городского чата ${slug}:`, err.message);
    return [];
  }
}

/**
 * Поиск ближайших АЗС вокруг заданной точки с радиусом и фильтрами
 * @param {number} lat - широта
 * @param {number} lon - долгота
 * @param {number} radiusKm - радиус поиска в км (по умолчанию 15 км)
 * @param {object} options - параметры фильтрации и сортировки
 *   options.fuelGrade: '92' | '95' | '98' | '100' | 'ДТ' | null
 *   options.statusFilter: 'all' | 'yes_only' | 'no_queue'
 *   options.sortBy: 'near' | 'cheap'
 */
async function getNearbyStations(lat, lon, radiusKm = 15, options = {}) {
  const { fuelGrade = null, statusFilter = 'all', sortBy = 'near' } = options;

  // Расчет bounding box
  const deltaLat = radiusKm / 111.0;
  const deltaLon = radiusKm / (111.0 * Math.cos(lat * Math.PI / 180));

  const lat1 = lat - deltaLat;
  const lon1 = lon - deltaLon;
  const lat2 = lat + deltaLat;
  const lon2 = lon + deltaLon;

  const rawStations = await getStationsInBounds(lat1, lon1, lat2, lon2);

  // Вычисляем расстояние для каждой станции и обогащаем данными
  let stations = rawStations.map(st => {
    const distance = calculateDistance(lat, lon, Number(st.lat), Number(st.lon));
    return {
      ...st,
      distance: Number(distance.toFixed(1))
    };
  });

  // Ограничиваем точным радиусом (круг, а не квадрат bounding box)
  stations = stations.filter(st => st.distance <= radiusKm);

  // Фильтрация по марке топлива
  if (fuelGrade) {
    stations = stations.filter(st => {
      // 1. Проверяем prices_now
      if (st.prices_now && st.prices_now[fuelGrade]) return true;
      // 2. Проверяем fuels_now
      if (st.fuels_now && typeof st.fuels_now === 'string') {
        const fn = st.fuels_now.toLowerCase();
        if (fuelGrade === 'ДТ' && (fn.includes('дт') || fn.includes('дизель'))) return true;
        if (fn.includes(fuelGrade)) return true;
      }
      // 3. Проверяем meta.f
      if (st.meta && Array.isArray(st.meta.f)) {
        if (fuelGrade === 'ДТ' && st.meta.f.includes('dt')) return true;
        if (st.meta.f.includes(fuelGrade)) return true;
      }
      return false;
    });
  }

  // Фильтрация по статусу
  if (statusFilter === 'yes_only') {
    stations = stations.filter(st => st.status === 'yes');
  } else if (statusFilter === 'no_queue') {
    // Бензин есть и нет большой очереди
    stations = stations.filter(st => st.status === 'yes' || st.status === 'low');
  }

  // Сортировка
  if (sortBy === 'cheap' && fuelGrade) {
    stations.sort((a, b) => {
      const priceA = a.prices_now && a.prices_now[fuelGrade] ? a.prices_now[fuelGrade].p : 9999;
      const priceB = b.prices_now && b.prices_now[fuelGrade] ? b.prices_now[fuelGrade].p : 9999;
      if (priceA !== priceB) {
        return priceA - priceB;
      }
      return a.distance - b.distance;
    });
  } else {
    // По умолчанию: ближе
    stations.sort((a, b) => a.distance - b.distance);
  }

  return stations;
}

module.exports = {
  calculateDistance,
  searchCities,
  getGeoIp,
  getStationsInBounds,
  getStationDetails,
  getStationComments,
  getCityChatMessages,
  getNearbyStations
};
