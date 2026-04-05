const express = require('express');
const router = express.Router();

const sessionController = require('../controllers/sessionController');
const { protect } = require('../middleware/authMiddleware'); // Правильный путь и импорт

// Защищаем ВСЕ маршруты сессий. Без токена сюда никто не пройдет!
router.use(protect);

router.get('/', sessionController.getSessions);
router.post('/', sessionController.createSession);
router.get('/:id', sessionController.getSessionById);
router.patch('/:id', sessionController.updateSession);
router.delete('/:id', sessionController.deleteSession);
router.post('/:id/schedule', sessionController.scheduleSession);
router.post('/:id/start', sessionController.startSession);
router.get('/:id/participants', sessionController.getSessionParticipants);
router.post('/:id/participants/:participantId/kick', sessionController.kickParticipant);

module.exports = router;