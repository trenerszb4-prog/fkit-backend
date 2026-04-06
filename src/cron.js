const cron = require('node-cron');
const pool = require('./config/db'); // Подключаемся к базе

// Эта команда означает: "Запускать каждый день ровно в 03:00 ночи"
cron.schedule('0 3 * * *', async () => {
  console.log('[CRON] Запуск очистки старых сессий...');
  try {
	// Удаляем сессии, где дата последней активности была больше 30 дней назад
	const result = await pool.query(
	  "DELETE FROM sessions WHERE last_active_at < NOW() - INTERVAL '30 days'"
	);
	console.log(`[CRON] Очистка завершена. Удалено мертвых сессий: ${result.rowCount}`);
  } catch (err) {
	console.error('[CRON] Ошибка при очистке сессий:', err);
  }
});

console.log('Планировщик задач (cron) успешно запущен!');