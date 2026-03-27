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

  const token = authHeader.split(' ')[1];

  try {
	const decoded = jwt.verify(token, JWT_SECRET);

	const result = await pool.query(
	  `SELECT id, name, email FROM users WHERE id = $1`,
	  [decoded.userId]
	);

	const user = result.rows[0];

	if (!user) {
	  return res.status(401).json({
		success: false,
		message: 'Пользователь не найден'
	  });
	}

	req.user = user;
	next();

  } catch (error) {
	return res.status(401).json({
	  success: false,
	  message: 'Токен недействителен'
	});
  }
}

module.exports = authMiddleware;