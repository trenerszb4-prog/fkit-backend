const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Генерация токена (на 30 дней)
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
	expiresIn: '30d',
  });
};

// Регистрация
async function register(req, res) {
  try {
	// === ВРЕМЕННАЯ ФУНКЦИЯ БЕТА-ТЕСТА (НАЧАЛО) ===
	// Добавили promoCode для проверки на бэкенде
	const { email, password, promoCode } = req.body;
	const BETA_PROMO = 'START2026';

	if (promoCode !== BETA_PROMO) {
	  return res.status(403).json({ 
		success: false, 
		message: 'Уважаемые пользователи, проект находится на стадии бета-тестирования, регистрация недоступна' 
	  });
	}
	// === ВРЕМЕННАЯ ФУНКЦИЯ БЕТА-ТЕСТА (КОНЕЦ) ===

	if (!email || !password) {
	  return res.status(400).json({ success: false, message: 'Введите email и пароль' });
	}

	// Проверяем, свободен ли email
	const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
	if (userExists.rows.length > 0) {
	  return res.status(400).json({ success: false, message: 'Пользователь с таким email уже существует' });
	}

	// Шифруем пароль
	const salt = await bcrypt.genSalt(10);
	const hashedPassword = await bcrypt.hash(password, salt);

	// Создаем пользователя
	const newUser = await pool.query(
	  'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
	  [email, hashedPassword]
	);

	const user = newUser.rows[0];

	res.status(201).json({
	  success: true,
	  user: { id: user.id, email: user.email },
	  token: generateToken(user.id)
	});
  } catch (error) {
	console.error('Register error:', error);
	res.status(500).json({ success: false, message: 'Ошибка при регистрации' });
  }
}

// Логин
async function login(req, res) {
  try {
	const { email, password } = req.body;

	const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
	const user = result.rows[0];

	if (user && (await bcrypt.compare(password, user.password_hash))) {
	  res.json({
		success: true,
		user: { id: user.id, email: user.email },
		token: generateToken(user.id)
	  });
	} else {
	  res.status(401).json({ success: false, message: 'Неверный email или пароль' });
	}
  } catch (error) {
	console.error('Login error:', error);
	res.status(500).json({ success: false, message: 'Ошибка при входе' });
  }
}

// Получение данных себя (по токену)
async function getMe(req, res) {
  try {
	const result = await pool.query('SELECT id, email, created_at FROM users WHERE id = $1', [req.user.id]);
	res.json({ success: true, user: result.rows[0] });
  } catch (error) {
	res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
}

module.exports = { register, login, getMe };