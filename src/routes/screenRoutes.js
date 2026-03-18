const express = require('express');
const router = express.Router();

const screenController = require('../controllers/screenController');
const timerController = require('../controllers/timerController');
const questionController = require('../controllers/questionController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/:id', screenController.getScreen);
router.post('/:id/clear', screenController.clearScreen);
router.delete('/:id/cards/:screenCardId', screenController.deleteScreenCard);
router.get('/:id/timer', timerController.getSessionTimer);

router.get('/:id/questions', questionController.getQuestions);
router.post('/:id/questions/next', questionController.nextQuestion);
router.post('/:id/questions/prev', questionController.prevQuestion);

module.exports = router;