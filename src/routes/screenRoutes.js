const express = require('express');
const router = express.Router();

const screenController = require('../controllers/screenController');
const timerController = require('../controllers/timerController');
const questionController = require('../controllers/questionController');
// ИСПРАВЛЕНО: правильное название файла и импорт
const { protect } = require('../middleware/authMiddleware');

// ИСПРАВЛЕНО: защищаем все пути проектора через protect
router.use(protect);

router.get('/:id', screenController.getScreen);
router.get('/:id/state', screenController.getScreenState);
router.post('/:id/clear', screenController.clearScreen);
router.delete('/:id/cards/:screenCardId', screenController.deleteScreenCard);

router.get('/:id/timer', timerController.getSessionTimer);

router.get('/:id/questions', questionController.getQuestions);
router.post('/:id/questions/next', questionController.nextQuestion);
router.post('/:id/questions/prev', questionController.prevQuestion);

router.get('/:id/reactions', screenController.getScreenReactions);

module.exports = router;