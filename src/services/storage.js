const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Инициализация директории данных
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let usersData = {};

try {
  if (fs.existsSync(USERS_FILE)) {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    usersData = JSON.parse(raw);
  }
} catch (e) {
  console.error('Ошибка загрузки users.json, используем пустую базу:', e.message);
  usersData = {};
}

let saveTimer = null;
function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2), 'utf8');
    } catch (err) {
      console.error('Ошибка сохранения users.json:', err.message);
    }
  }, 1000);
}

/**
 * Получить или создать профиль пользователя
 */
function getUser(userId) {
  const uid = String(userId);
  if (!usersData[uid]) {
    usersData[uid] = {
      id: uid,
      // Город по умолчанию — Москва
      city: {
        name: 'Москва',
        slug: 'moskva',
        lat: 55.7558,
        lon: 37.6173
      },
      lastLocation: null,
      fuelGrade: '95', // Самый популярный бензин по умолчанию
      statusFilter: 'all', // all | yes_only | no_queue
      sortBy: 'near', // near | cheap
      radiusKm: parseInt(process.env.DEFAULT_SEARCH_RADIUS_KM, 10) || 15,
      favorites: [], // Список osm_id
      page: 0
    };
    debouncedSave();
  }
  return usersData[uid];
}

/**
 * Обновить параметры пользователя
 */
function updateUser(userId, updates) {
  const user = getUser(userId);
  Object.assign(user, updates);
  debouncedSave();
  return user;
}

/**
 * Добавить или удалить АЗС из избранного
 */
function toggleFavorite(userId, osmId) {
  const user = getUser(userId);
  const idStr = String(osmId);
  const index = user.favorites.indexOf(idStr);
  let isAdded = false;

  if (index >= 0) {
    user.favorites.splice(index, 1);
    isAdded = false;
  } else {
    user.favorites.push(idStr);
    isAdded = true;
  }
  debouncedSave();
  return { isAdded, favorites: user.favorites };
}

/**
 * Проверить, находится ли АЗС в избранном
 */
function isFavorite(userId, osmId) {
  const user = getUser(userId);
  return user.favorites.includes(String(osmId));
}

module.exports = {
  getUser,
  updateUser,
  toggleFavorite,
  isFavorite
};
