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
	  `
	  SELECT id, email, password_hash, display_name, role
	  FROM users
	  WHERE email = $1
	  LIMIT 1
	  `,
	  [email]
	);

	const user = result.rows[0];

	if (!user) {
	  return res.status(401).json({
		success: false,
		message: 'Неверный email или пароль'
	  });
	}

	const passwordHash = user.password_hash || '';
	const isPasswordCorrect = await bcrypt.compare(password, passwordHash);

	if (!isPasswordCorrect) {
	  return res.status(401).json({
		success: false,
		message: 'Неверный email или пароль'
	  });
	}

	const token = createToken({
	  id: user.id,
	  email: user.email,
	  display_name: user.display_name,
	  role: user.role
	});

	return res.json({
	  success: true,
	  token,
	  user: {
		id: user.id,
		name: user.display_name || 'User',
		email: user.email,
		role: user.role
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
	  name: req.user.name || 'User',
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