const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Проверка подключения (один раз при старте)
pool.connect()
  .then(() => {
    console.log('✅ PostgreSQL подключен');
  })
  .catch((err) => {
    console.error('❌ Ошибка подключения к PostgreSQL:', err.message);
  });

module.exports = pool;