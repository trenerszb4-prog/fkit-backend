const express = require('express');
const router = express.Router();

const playerController = require('../controllers/playerController');

router.post('/join/by-pin', playerController.joinByPin);
router.get('/:participantId/session', playerController.getPlayerSession);
router.get('/:participantId/cards', playerController.getPlayerCards);
router.post('/:participantId/cards/show', playerController.showCard);
router.post('/:participantId/cards/recall', playerController.recallCard);
router.post('/:participantId/leave', playerController.leaveSession);

module.exports = router;