const express = require('express');
const router = express.Router();

// НОВОЕ: Мы добавили getAdminData и updateSubscription в список загружаемых функций
const { register, login, getMe, getAdminData, updateSubscription, closeUserSessions, deleteUser } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe); // Этот маршрут защищен токеном

// --- НОВЫЕ МАРШРУТЫ ДЛЯ АДМИНКИ ---
// Они тоже защищены токеном (protect), чтобы никто чужой не смог отправить запрос
router.get('/admin/data', protect, getAdminData);
router.post('/admin/subscription', protect, updateSubscription);
router.post('/admin/user/close-sessions', protect, closeUserSessions);
router.post('/admin/user/delete', protect, deleteUser);

module.exports = router;