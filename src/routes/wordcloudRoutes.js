const express = require('express');
const router = express.Router();
const wordcloudController = require('../controllers/wordcloudController');
const authMiddleware = require('../middleware/authMiddleware'); 

// Получить все слова для конкретной сессии (запрашивает проектор или фасилитатор)
router.get('/:sessionId/words', wordcloudController.getWords);

// Добавить новое слово (отправляет участник со смартфона)
router.post('/:sessionId/words', wordcloudController.addWord);

// Очистить облако (отправляет фасилитатор, защищено токеном)
router.post('/:sessionId/clear', authMiddleware, wordcloudController.clearWords);

module.exports = router;