const express = require('express');
const router = express.Router();

const deckController = require('../controllers/deckController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', deckController.getDecks);
router.get('/:deckId/cards', deckController.getDeckCards);

module.exports = router;