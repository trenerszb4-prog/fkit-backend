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

// === 1. ФУНКЦИЯ ЗАПРОСА СБРОСА (Отправляет ссылку) ===
async function forgotPassword(req, res) {
  try {
	const { email } = req.body;
	if (!email) return res.status(400).json({ success: false, message: 'Укажите email' });

	const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
	if (userRes.rows.length === 0) {
	  return res.status(404).json({ success: false, message: 'Пользователь не найден' });
	}

	const user = userRes.rows[0];
	const resetToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
	const resetLink = `https://api.f-kit.ru/auth/reset-confirm?token=${resetToken}`;

	// ПЕРВОЕ ПИСЬМО: Фирменный сине-желтый стиль
	await transporter.sendMail({
	  from: '"Команда F-Kit" <support@f-kit.ru>',
	  to: email,
	  subject: 'Подтверждение сброса пароля в F-Kit',
	  html: `
		<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background-color: #090e1a; color: #ffffff; border-radius: 12px;">
		  <h2 style="color: #FFF993; margin-top: 0;">Сброс пароля</h2>
		  <p style="font-size: 15px; line-height: 1.6; color: #e0e0e0;">Мы получили запрос на сброс пароля для вашей учетной записи в F-Kit HUB.</p>
		  <p style="font-size: 15px; line-height: 1.6; color: #e0e0e0;">Если это были вы, нажмите на кнопку ниже для подтверждения:</p>
		  
		  <div style="text-align: center; margin: 30px 0;">
			<a href="${resetLink}" style="display: inline-block; padding: 14px 30px; background-color: #FFF993; color: #000000; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Подтвердить сброс</a>
		  </div>
		  
		  <p style="color: #888; font-size: 12px; text-align: center;">Ссылка действительна 15 минут.</p>
		  <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
		  <p style="color: #666; font-size: 12px; text-align: center;">Если вы не запрашивали сброс, просто проигнорируйте это письмо.</p>
		</div>
	  `
	});

	res.json({ success: true, message: 'Ссылка для подтверждения отправлена на почту' });
  } catch (error) {
	console.error('Forgot Password Error:', error);
	res.status(500).json({ success: false, message: 'Ошибка при отправке письма' });
  }
}

// === 2. ФУНКЦИЯ ПОДТВЕРЖДЕНИЯ (Меняет пароль и отправляет второе письмо) ===
async function confirmPasswordReset(req, res) {
  try {
	const { token } = req.query;
	if (!token) return res.status(400).send('Токен не предоставлен');

	const decoded = jwt.verify(token, process.env.JWT_SECRET);
	const userId = decoded.id;

	// 1. Ищем пользователя, чтобы узнать его email
	const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
	if (userRes.rows.length === 0) return res.status(404).send('Пользователь не найден');
	const userEmail = userRes.rows[0].email;

	// 2. Генерируем новый пароль
	const newPassword = Math.random().toString(36).slice(-8);
	const salt = await bcrypt.genSalt(10);
	const hashedPassword = await bcrypt.hash(newPassword, salt);

	// 3. Сохраняем в базу
	await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);

	// 4. ВТОРОЕ ПИСЬМО: Отправляем сам пароль в фирменном стиле
	await transporter.sendMail({
	  from: '"Команда F-Kit" <support@f-kit.ru>',
	  to: userEmail,
	  subject: 'Ваш новый пароль от F-Kit HUB',
	  html: `
		<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background-color: #090e1a; color: #ffffff; border-radius: 12px;">
		  <h2 style="color: #FFF993; margin-top: 0;">Пароль успешно изменен!</h2>
		  <p style="font-size: 15px; color: #e0e0e0;">Ваш новый пароль для входа в панель ведущего:</p>
		  
		  <div style="text-align: center; margin: 25px 0;">
			<span style="display: inline-block; font-size: 24px; font-weight: bold; background: rgba(255, 249, 147, 0.1); color: #FFF993; padding: 15px 30px; border-radius: 8px; border: 1px dashed #FFF993; letter-spacing: 2px;">
			  ${newPassword}
			</span>
		  </div>
		  
		  <div style="text-align: center; margin-top: 30px;">
			<a href="https://f-kit.ru/login" style="display: inline-block; padding: 14px 30px; background-color: #FFF993; color: #000000; text-decoration: none; border-radius: 8px; font-weight: bold;">Войти в аккаунт</a>
		  </div>
		</div>
	  `
	});

	// 5. ЭКРАН УСПЕХА: Показываем в браузере (БЕЗ ПАРОЛЯ)
	const htmlResponse = `
	  <!DOCTYPE html>
	  <html lang="ru">
	  <head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Пароль изменен</title>
	  </head>
	  <body style="font-family: 'TildaSans', Arial, sans-serif; background: #090e1a; background-image: radial-gradient(circle at top center, #162854 0%, #05080f 80%); color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
		<div style="background: rgba(255,255,255,0.05); padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); text-align: center; max-width: 420px; width: 90%; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);">
		  <h2 style="color: #FFF993; margin-top: 0; font-size: 26px;">Пароль успешно сброшен!</h2>
		  <p style="font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.8); margin-bottom: 30px;">Новый пароль только что был отправлен на вашу электронную почту.</p>
		  <a href="https://f-kit.ru/login" style="display: inline-block; background: #FFF993; color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; transition: all 0.2s ease;">Вернуться к входу</a>
		</div>
	  </body>
	  </html>
	`;
	
	res.send(htmlResponse);

  } catch (error) {
	console.error('Confirm Reset Error:', error);
	res.status(400).send(`
	  <body style="background: #090e1a; color: #fff; font-family: Arial, sans-serif; text-align:center; padding-top: 100px;">
		<h2 style="color: #ff5c5c;">Ссылка недействительна или устарела</h2>
		<p>Срок действия ссылки составляет 15 минут. Пожалуйста, вернитесь на сайт и запросите сброс пароля еще раз.</p>
	  </body>
	`);
  }
}

module.exports = { register, login, getMe, getAdminData, updateSubscription, closeUserSessions, deleteUser, forgotPassword, confirmPasswordReset };