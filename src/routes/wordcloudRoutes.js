const express = require('express');
const router = express.Router();

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
  const authFn = typeof authMod === 'function' ? authMod : (authMod.authMiddleware || authMod.verifyToken || authMod.protect || Object.values(authMod)[0]);
  if (typeof authFn !== 'function') return res.status(500).json({ success: false, message: 'Мидлвар авторизации не найден' });

  authFn(req, res, () => {
  const ctrl = require('../controllers/wordcloudController');
  if (!ctrl.clearWords) return res.status(500).json({ success: false, message: 'clearWords не найдена' });
  return ctrl.clearWords(req, res, next);
  });
});

router.delete('/:sessionId/words/:word', (req, res, next) => {
  const authMod = require('../middleware/authMiddleware');
  const authFn = typeof authMod === 'function' ? authMod : (authMod.authMiddleware || authMod.verifyToken || authMod.protect || Object.values(authMod)[0]);
  if (typeof authFn !== 'function') return res.status(500).json({ success: false, message: 'Мидлвар авторизации не найден' });

  authFn(req, res, () => {
  const ctrl = require('../controllers/wordcloudController');
  if (!ctrl.deleteWord) return res.status(500).json({ success: false, message: 'deleteWord не найдена' });
  return ctrl.deleteWord(req, res, next);
  });
});

// 🟢 НОВЫЙ МАРШРУТ ДЛЯ КНОПКИ ПАУЗЫ
router.post('/:sessionId/pause', (req, res, next) => {
  const authMod = require('../middleware/authMiddleware');
  const authFn = typeof authMod === 'function' ? authMod : (authMod.authMiddleware || authMod.verifyToken || authMod.protect || Object.values(authMod)[0]);
  if (typeof authFn !== 'function') return res.status(500).json({ success: false, message: 'Мидлвар авторизации не найден' });

  authFn(req, res, () => {
    const ctrl = require('../controllers/wordcloudController');
    if (!ctrl.togglePause) return res.status(500).json({ success: false, message: 'togglePause не найдена' });
    return ctrl.togglePause(req, res, next);
  });
});

module.exports = router;