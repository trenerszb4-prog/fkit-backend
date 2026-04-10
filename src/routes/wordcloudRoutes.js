const express = require('express');
const router = express.Router();
const wordcloudController = require('../controllers/wordcloudController');

// 🟢 ИСПРАВЛЕНО: Добавили фигурные скобки для правильного импорта функции
const { authMiddleware } = require('../middleware/authMiddleware'); 

// Получить все слова для конкретной сессии
router.get('/:sessionId/words', wordcloudController.getWords);

// Добавить новое слово (отправляет участник)
router.post('/:sessionId/words', wordcloudController.addWord);

// Очистить облако (отправляет фасилитатор, защищено токеном)
// 🟢 ИСПРАВЛЕНО: Теперь здесь передается функция, а не объект
router.post('/:sessionId/clear', authMiddleware, wordcloudController.clearWords);

module.exports = router;