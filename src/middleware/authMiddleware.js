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

	  // Ищем юзера и кладем его ID в req.user
	  const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [decoded.id]);
	  
	  if (!result.rows.length) {
		  return res.status(401).json({ success: false, message: 'Пользователь не найден' });
	  }

	  req.user = result.rows[0];
	  
	  // --- НОВОЕ: ОБНОВЛЯЕМ ВРЕМЯ ПОСЛЕДНЕЙ АКТИВНОСТИ ---
	  // Мы ищем текущую сессию пользователя (которая привязана к его токену) 
	  // и обновляем время на "прямо сейчас"
	  if (req.user && req.headers.authorization) {
		const currentToken = req.headers.authorization.split(' ')[1];
		await pool.query(
		  "UPDATE sessions SET last_active_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND token = $2",
		  [req.user.id, currentToken]
		);
	  }
	  // ----------------------------------------------------
	  
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