const express = require('express');
const router = express.Router();
const wordcloudController = require('../controllers/wordcloudController');

// Умный импорт мидлвара (защита от падений, если он экспортирован как объект)
const authMod = require('../middleware/authMiddleware');
const authMiddleware = (typeof authMod === 'function') ? authMod : authMod.authMiddleware;

// Маршруты
router.get('/:sessionId/words', wordcloudController.getWords);
router.post('/:sessionId/words', wordcloudController.addWord);
router.post('/:sessionId/clear', authMiddleware, wordcloudController.clearWords);

module.exports = router;