const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { JWT_SECRET } = require('../config/env');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
	return res.status(401).json({
	  success: false,
	  message: 'Нет токена'
	});
  }

  const parts = authHeader.split(' ');
  const token = parts[1];

  if (!token) {
	return res.status(401).json({
	  success: false,
	  message: 'Неверный формат токена'
	});
  }

  try {
	const decoded = jwt.verify(token, JWT_SECRET);

	const userId = decoded.id;
	if (!userId) {
	  return res.status(401).json({
		success: false,
		message: 'Токен недействителен'
	  });
	}

	const result = await pool.query(
	  `SELECT id, email, display_name FROM users WHERE id = $1 LIMIT 1`,
	  [userId]
	);

	const user = result.rows[0];

	if (!user) {
	  return res.status(401).json({
		success: false,
		message: 'Пользователь не найден'
	  });
	}

	req.user = {
	  id: user.id,
	  email: user.email,
	  name: user.display_name || 'Vitalii'
	};

	next();
  } catch (error) {
	console.error('AUTH ERROR:', error.message);
	return res.status(401).json({
	  success: false,
	  message: 'Токен недействителен'
	});
  }
}

module.exports = authMiddleware;