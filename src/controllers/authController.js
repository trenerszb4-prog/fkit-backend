const bcrypt = require('bcryptjs');
const { users } = require('../data/db');
const { createToken } = require('../utils/token');

function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
	return res.status(400).json({
	  success: false,
	  message: 'Введите email и пароль'
	});
  }

  const user = users.find((item) => item.email === email);

  if (!user) {
	return res.status(401).json({
	  success: false,
	  message: 'Неверный email или пароль'
	});
  }

  const isPasswordCorrect = bcrypt.compareSync(password, user.passwordHash);

  if (!isPasswordCorrect) {
	return res.status(401).json({
	  success: false,
	  message: 'Неверный email или пароль'
	});
  }

  const token = createToken(user);

  return res.json({
	success: true,
	message: 'Вход выполнен',
	token,
	user: {
	  id: user.id,
	  name: user.name,
	  email: user.email
	}
  });
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
	success: true,
	message: 'Выход выполнен'
  });
}

module.exports = {
  login,
  me,
  logout
};