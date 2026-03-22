const express = require('express');
const router = express.Router();

const deckController = require('../controllers/deckController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', deckController.getDecks);

module.exports = router;