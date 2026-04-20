const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function protect(req, res, next) {
  let token;

  // Проверяем, есть ли заголовок Authorization и начинается ли он с Bearer
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
	try {
	  token = req.headers.authorization.split(' ')[1];

	  // Расшифровываем токен
	  const decoded = jwt.verify(token, process.env.JWT_SECRET);

	  // 🟢 ИЗМЕНЕНИЕ: Достаем дату окончания подписки вместе с ID и email
	  const result = await pool.query('SELECT id, email, subscription_expires_at FROM users WHERE id = $1', [decoded.id]);
	  
	  if (!result.rows.length) {
		  return res.status(401).json({ success: false, message: 'Пользователь не найден' });
	  }

	  // Теперь req.user знает всё о подписке
	  req.user = result.rows[0];
	  
	  // --- БЕЗОПАСНОЕ ОБНОВЛЕНИЕ ВРЕМЕНИ ---
	  if (req.user) {
		try {
		  await pool.query(
			"UPDATE sessions SET last_active_at = CURRENT_TIMESTAMP WHERE user_id = $1",
			[req.user.id]
		  );
		} catch (dbError) {
		  console.error('Некритичная ошибка продления сессии:', dbError.message);
		}
	  }
	  // --------------------------------------------
	  
	  next(); // Пропускаем дальше к контроллеру
	} catch (error) {
	  console.error('Auth middleware error:', error);
	  return res.status(401).json({ success: false, message: 'Не авторизован, токен недействителен' });
	}
  }

  if (!token) {
	return res.status(401).json({ success: false, message: 'Не авторизован, нет токена' });
  }
}

module.exports = { protect };