const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { users } = require('../data/db');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
	return res.status(401).json({
	  success: false,
	  message: 'Нет токена доступа'
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

	const user = users.find((item) => item.id === decoded.userId);

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