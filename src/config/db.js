const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Спасаем от "тихих" разрывов соединения между Render и Yandex Cloud
  keepAlive: true,
  idleTimeoutMillis: 10000, // Убиваем соединение в пуле через 10 сек простоя (меньше, чем таймаут облака)
  connectionTimeoutMillis: 5000, // Не ждем вечность при попытке подключиться
  max: 20 // Ограничиваем пул, чтобы не перегрузить базу
});

pool.connect()
  .then(() => {
    console.log('✅ PostgreSQL подключен');
  })
  .catch((err) => {
    console.error('❌ Ошибка подключения к PostgreSQL:', err.message);
  });

module.exports = pool;