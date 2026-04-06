const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const nodemailer = require('nodemailer');

// === 1. НАСТРОЙКА ПОЧТЫ REG.RU ===
const transporter = nodemailer.createTransport({
  host: 'mail.hosting.reg.ru', // Стандартный сервер REG.RU
  port: 465,                   // Безопасный порт
  secure: true,                
  auth: {
	user: 'support@f-kit.ru',     // 🔴 ВПИШИ СЮДА СОЗДАННЫЙ ЯЩИК ЦЕЛИКОМ
	pass: 'zN3iN5vJ0coS8wB4'  // 🔴 ВПИШИ ПАРОЛЬ, КОТОРЫЙ ТЫ ПРИДУМАЛ В ШАГЕ 1
  }
});

// Генерация токена
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
	const SUPER_ADMIN = 'support@f-kit.ru'; 
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
	const SUPER_ADMIN = 'support@f-kit.ru'; // Твой email
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
	const SUPER_ADMIN = 'support@f-kit.ru'; // Твой email
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

// === 1. ОБНОВЛЕННАЯ ФУНКЦИЯ ЗАПРОСА СБРОСА ===
async function forgotPassword(req, res) {
  try {
	const { email } = req.body;
	if (!email) return res.status(400).json({ success: false, message: 'Укажите email' });

	const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
	if (userRes.rows.length === 0) {
	  return res.status(404).json({ success: false, message: 'Пользователь не найден' });
	}

	const user = userRes.rows[0];

	// Генерируем временный ключ для ссылки (действует 15 минут)
	const resetToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });

	// Формируем ссылку, ведущую обратно на наш сервер
	const resetLink = `https://api.f-kit.ru/auth/reset-confirm?token=${resetToken}`;

	// Отправляем письмо с HTML-разметкой и кнопкой
	await transporter.sendMail({
	  from: '"Команда F-Kit" <support@f-kit.ru>',
	  to: email,
	  subject: 'Подтверждение сброса пароля в F-Kit',
	  html: `
		<div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px;">
		  <h3>Здравствуйте!</h3>
		  <p>Мы получили запрос на сброс пароля для вашей учетной записи.</p>
		  <p>Если это были вы, нажмите на ссылку ниже, чтобы сгенерировать новый пароль:</p>
		  <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #54D87A; color: #000; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0;">Подтвердить сброс пароля</a>
		  <p style="color: #666; font-size: 12px;">Ссылка действительна 15 минут.</p>
		  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
		  <p style="color: #999; font-size: 12px;">Если вы не запрашивали сброс, просто проигнорируйте это письмо. Ваш текущий пароль в безопасности.</p>
		</div>
	  `
	});

	res.json({ success: true, message: 'Ссылка для подтверждения отправлена на почту' });
  } catch (error) {
	console.error('Forgot Password Error:', error);
	res.status(500).json({ success: false, message: 'Ошибка при отправке письма' });
  }
}

// === 2. НОВАЯ ФУНКЦИЯ ПОДТВЕРЖДЕНИЯ (когда кликнули по ссылке в письме) ===
async function confirmPasswordReset(req, res) {
  try {
	const { token } = req.query; // Получаем токен из ссылки
	if (!token) return res.status(400).send('Токен не предоставлен');

	// Расшифровываем токен. Если прошло больше 15 минут, будет ошибка
	const decoded = jwt.verify(token, process.env.JWT_SECRET);
	const userId = decoded.id;

	// Генерируем новый пароль
	const newPassword = Math.random().toString(36).slice(-8);
	const salt = await bcrypt.genSalt(10);
	const hashedPassword = await bcrypt.hash(newPassword, salt);

	// Сохраняем в базу
	await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);

	// Рисуем пользователю красивую страницу прямо из сервера
	const htmlResponse = `
	  <!DOCTYPE html>
	  <html lang="ru">
	  <head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Пароль изменен</title>
	  </head>
	  <body style="font-family: Arial, sans-serif; background: #090e1a; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
		<div style="background: rgba(255,255,255,0.05); padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); text-align: center; max-width: 400px; width: 90%;">
		  <h2 style="color: #54D87A; margin-top: 0;">Пароль успешно сброшен!</h2>
		  <p>Ваш новый пароль для входа:</p>
		  <div style="font-size: 28px; font-weight: bold; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin: 20px 0; letter-spacing: 2px;">
			${newPassword}
		  </div>
		  <p style="font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 30px;">Обязательно скопируйте или сохраните его прямо сейчас.</p>
		  <a href="https://f-kit.ru/login" style="display: inline-block; background: #FFF993; color: #000; padding: 14px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; transition: opacity 0.2s;">Вернуться к входу</a>
		</div>
	  </body>
	  </html>
	`;
	
	// Отправляем готовую HTML страницу
	res.send(htmlResponse);

  } catch (error) {
	console.error('Confirm Reset Error:', error);
	// Если токен просрочен или неверный:
	res.status(400).send(`
	  <body style="background: #090e1a; color: #fff; font-family: Arial, sans-serif; text-align:center; padding-top: 100px;">
		<h2 style="color: #ff5c5c;">Ссылка недействительна или устарела</h2>
		<p>Срок действия ссылки составляет 15 минут. Пожалуйста, вернитесь на сайт и запросите сброс пароля еще раз.</p>
	  </body>
	`);
  }
}

module.exports = { register, login, getMe, getAdminData, updateSubscription, closeUserSessions, deleteUser, forgotPassword, confirmPasswordReset };