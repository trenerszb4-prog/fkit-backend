const express = require('express');
const router = express.Router();

const hubController = require('../controllers/hubController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, hubController.getHub);

module.exports = router;