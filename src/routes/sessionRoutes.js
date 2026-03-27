const express = require('express');
const router = express.Router();

const sessionController = require('../controllers/sessionController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', sessionController.getSessions);
router.post('/', sessionController.createSession);
router.get('/:id', sessionController.getSessionById);
router.patch('/:id', sessionController.updateSession);
router.delete('/:id', sessionController.deleteSession);
router.post('/:id/schedule', sessionController.scheduleSession);
router.post('/:id/start', sessionController.startSession);
router.get('/:id/participants', sessionController.getSessionParticipants);

module.exports = router;