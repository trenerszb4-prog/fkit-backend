const express = require('express');
const router = express.Router();

const votingController = require('../controllers/votingController');
const { protect } = require('../middleware/authMiddleware');

// 1. Получение результатов (для экрана проектора и панели фасилитатора)
// Защищаем через protect, так как эти данные смотрит админ
router.get('/:sessionId/results', protect, votingController.getResults);

// 2. Отправка голоса (от пульта участника)
// Здесь protect НЕ ставим, так как пульт не имеет токена фасилитатора
router.post('/:sessionId/vote', votingController.addVote); 

// 3. Очистка результатов (только для фасилитатора)
router.post('/:sessionId/clear', protect, votingController.clearVotes);

// 4. Управление паузой (только для фасилитатора)
router.post('/:sessionId/pause', protect, votingController.togglePause);

module.exports = router;