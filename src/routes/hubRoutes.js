const express = require('express');
const router = express.Router();

const hubController = require('../controllers/hubController');
// Исправлено: путь к файлу и импорт функции { protect }
const { protect } = require('../middleware/authMiddleware');

// Исправлено: используем protect вместо authMiddleware
router.get('/', protect, hubController.getHub);

module.exports = router;