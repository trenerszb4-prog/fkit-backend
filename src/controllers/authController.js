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

// --- АДМИНСКИЕ ФУНКЦИИ ---

// 1. Получение статистики и списка всех пользователей
async function getAdminData(req, res) {
  try {
	// ВПИШИ СЮДА СВОЙ EMAIL
	const SUPER_ADMIN = 'support@f-kit.ru'; 

	// Проверяем, кто делает запрос
	const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
	if (!userRes.rows[0] || userRes.rows[0].email !== SUPER_ADMIN) {
	  return res.status(403).json({ success: false, message: 'Доступ запрещен. Вы не администратор.' });
	}

	// Собираем данные
	const usersResult = await pool.query('SELECT id, email, subscription_type, subscription_expires_at, created_at FROM users ORDER BY created_at DESC');
	const totalUsers = usersResult.rowCount;
	
	// Считаем "одновременные подключения" (количество сессий со статусом live)
	const liveSessionsResult = await pool.query("SELECT COUNT(*) FROM sessions WHERE status = 'live'");
	const liveSessions = liveSessionsResult.rows[0].count;

	res.json({
	  success: true,
	  stats: { totalUsers, liveSessions },
	  users: usersResult.rows
	});
  } catch (error) {
	console.error('Admin Data Error:', error);
	res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
}

// 2. Ручное изменение подписки
async function updateSubscription(req, res) {
  try {
	const SUPER_ADMIN = 'test@mail.ru'; 
	const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
	if (!userRes.rows[0] || userRes.rows[0].email !== SUPER_ADMIN) {
	  return res.status(403).json({ success: false, message: 'Доступ запрещен' });
	}

	const { targetUserId, days } = req.body;

	// Устанавливаем новую дату (текущее время + X дней)
	const newDate = new Date();
	newDate.setDate(newDate.getDate() + parseInt(days));

	await pool.query(
	  'UPDATE users SET subscription_expires_at = $1 WHERE id = $2',
	  [newDate, targetUserId]
	);

	res.json({ success: true, message: 'Подписка обновлена' });
  } catch (error) {
	console.error('Update Sub Error:', error);
	res.status(500).json({ success: false, message: 'Ошибка обновления' });
  }
}

// 3. Закрытие всех активных сессий пользователя
async function closeUserSessions(req, res) {
  try {
	const SUPER_ADMIN = 'test@mail.ru'; // Твой email
	const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
	if (!userRes.rows[0] || userRes.rows[0].email !== SUPER_ADMIN) {
	  return res.status(403).json({ success: false, message: 'Доступ запрещен' });
	}

	const { targetUserId } = req.body;
	// Удаляем все сессии этого пользователя со статусом live
	await pool.query("DELETE FROM sessions WHERE user_id = $1 AND status = 'live'", [targetUserId]);

	res.json({ success: true, message: 'Активные сессии закрыты' });
  } catch (error) {
	console.error('Close Sessions Error:', error);
	res.status(500).json({ success: false, message: 'Ошибка закрытия сессий' });
  }
}

// 4. Полное удаление пользователя
async function deleteUser(req, res) {
  try {
	const SUPER_ADMIN = 'test@mail.ru'; // Твой email
	const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
	if (!userRes.rows[0] || userRes.rows[0].email !== SUPER_ADMIN) {
	  return res.status(403).json({ success: false, message: 'Доступ запрещен' });
	}

	const { targetUserId } = req.body;
	
	// ВАЖНО: Сначала удаляем ВСЕ сессии пользователя, чтобы база данных не ругалась на связанные данные
	await pool.query('DELETE FROM sessions WHERE user_id = $1', [targetUserId]);
	
	// Теперь удаляем саму учетную запись
	await pool.query('DELETE FROM users WHERE id = $1', [targetUserId]);

	res.json({ success: true, message: 'Пользователь и его сессии удалены' });
  } catch (error) {
	console.error('Delete User Error:', error);
	res.status(500).json({ success: false, message: 'Ошибка удаления пользователя' });
  }
}

module.exports = { register, login, getMe, getAdminData, updateSubscription, closeUserSessions, deleteUser };