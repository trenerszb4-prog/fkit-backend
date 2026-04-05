const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Регистрация с логикой бета-периода
async function register(req, res) {
  try {
	const { email, password, promoCode } = req.body;
	const BETA_PROMO = 'START2026';

	if (promoCode !== BETA_PROMO) {
	  return res.status(403).json({ 
		success: false, 
		message: 'Уважаемые пользователи, проект находится на стадии бета-тестирования, регистрация недоступна' 
	  });
	}

	const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
	if (userExists.rows.length > 0) {
	  return res.status(400).json({ success: false, message: 'Пользователь с таким email уже существует' });
	}

	const hashedPassword = await bcrypt.hash(password, 10);

	// --- ВРЕМЕННАЯ ЛОГИКА ОПЛАТЫ (НАЧАЛО) ---
	// Если регистрация прошла (а она проходит только с промокодом), 
	// мы сразу ставим дату окончания через 60 дней.
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 60);
	// --- ВРЕМЕННАЯ ЛОГИКА ОПЛАТЫ (КОНЕЦ) ---

	const newUser = await pool.query(
	  'INSERT INTO users (email, password_hash, subscription_type, subscription_expires_at) VALUES ($1, $2, $3, $4) RETURNING id, email',
	  [email, hashedPassword, 'ALLIN', expiresAt]
	);

	res.status(201).json({
	  success: true,
	  token: generateToken(newUser.rows[0].id)
	});
  } catch (error) {
	console.error('Register error:', error);
	res.status(500).json({ success: false, message: 'Ошибка при регистрации' });
  }
}

// Вход
async function login(req, res) {
  try {
	const { email, password } = req.body;
	const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
	const user = result.rows[0];

	if (user && (await bcrypt.compare(password, user.password_hash))) {
	  res.json({
		success: true,
		token: generateToken(user.id)
	  });
	} else {
	  res.status(401).json({ success: false, message: 'Неверный email или пароль' });
	}
  } catch (error) {
	res.status(500).json({ success: false, message: 'Ошибка при входе' });
  }
}

// Получение данных профиля (Здесь Хаб будет узнавать срок подписки)
async function getMe(req, res) {
  try {
	// Запрашиваем из базы тип подписки и дату окончания
	const result = await pool.query(
	  'SELECT id, email, subscription_type, subscription_expires_at FROM users WHERE id = $1', 
	  [req.user.id]
	);
	
	if (result.rows.length === 0) {
	  return res.status(404).json({ success: false, message: 'Пользователь не найден' });
	}

	res.json({ 
	  success: true, 
	  user: result.rows[0] 
	});
  } catch (error) {
	res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
}

module.exports = { register, login, getMe };