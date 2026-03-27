const express = require('express');
const router = express.Router();

const deckController = require('../controllers/deckController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', deckController.getDecks);
router.get('/:deckId/cards', deckController.getDeckCards);

module.exports = router;