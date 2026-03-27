const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { createToken } = require('../utils/token');

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
	return res.status(400).json({
	  success: false,
	  message: 'Введите email и пароль'
	});
  }

  try {
	const result = await pool.query(
	  `SELECT * FROM users WHERE email = $1`,
	  [email]
	);

	const user = result.rows[0];

	if (!user) {
	  return res.status(401).json({
		success: false,
		message: 'Неверный email или пароль'
	  });
	}

	const isPasswordCorrect = bcrypt.compareSync(password, user.password_hash);

	if (!isPasswordCorrect) {
	  return res.status(401).json({
		success: false,
		message: 'Неверный email или пароль'
	  });
	}

	const token = createToken(user);

	return res.json({
	  success: true,
	  token,
	  user: {
		id: user.id,
		name: user.name,
		email: user.email
	  }
	});

  } catch (error) {
	console.error('LOGIN ERROR:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка сервера'
	});
  }
}

function me(req, res) {
  return res.json({
	success: true,
	user: {
	  id: req.user.id,
	  name: req.user.name,
	  email: req.user.email
	}
  });
}

function logout(req, res) {
  return res.json({
	success: true
  });
}

module.exports = {
  login,
  me,
  logout
};