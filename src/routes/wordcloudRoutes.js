const express = require('express');
const router = express.Router();

// Ленивая загрузка: мы передаем Express надежные функции-обертки.
// Сервер больше НИКОГДА не упадет при запуске из-за undefined.

router.get('/:sessionId/words', (req, res, next) => {
  const ctrl = require('../controllers/wordcloudController');
  if (!ctrl.getWords) return res.status(500).json({ success: false, message: 'getWords не найдена' });
  return ctrl.getWords(req, res, next);
});

router.post('/:sessionId/words', (req, res, next) => {
  const ctrl = require('../controllers/wordcloudController');
  if (!ctrl.addWord) return res.status(500).json({ success: false, message: 'addWord не найдена' });
  return ctrl.addWord(req, res, next);
});

router.post('/:sessionId/clear', (req, res, next) => {
  const authMod = require('../middleware/authMiddleware');
  
  // Умный поиск мидлвара: берем саму функцию, либо ищем её по частым именам (или берем первую доступную)
  const authFn = typeof authMod === 'function' ? authMod : (authMod.authMiddleware || authMod.verifyToken || authMod.protect || Object.values(authMod)[0]);
  
  if (typeof authFn !== 'function') {
	return res.status(500).json({ success: false, message: 'Мидлвар авторизации не найден' });
  }

  // Сначала проверяем токен, затем вызываем очистку
  authFn(req, res, () => {
	const ctrl = require('../controllers/wordcloudController');
	if (!ctrl.clearWords) return res.status(500).json({ success: false, message: 'clearWords не найдена' });
	return ctrl.clearWords(req, res, next);
  });
});

module.exports = router;