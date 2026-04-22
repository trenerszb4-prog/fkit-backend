const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadPollImage } = require('../controllers/uploadController');
const { protect } = require('../middleware/authMiddleware');

// Храним файл в оперативной памяти (buffer), чтобы сразу передать в sharp
const storage = multer.memoryStorage();
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 } // Лимит 5 МБ
});

// Роут доступен только авторизованным (protect)
router.post('/poll-image', protect, upload.single('image'), uploadPollImage);

module.exports = router;