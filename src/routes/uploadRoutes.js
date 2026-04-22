const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadPollImage } = require('../controllers/uploadController');
const { protect } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 } // Лимит 5 МБ
});

// Обертка для аккуратного перехвата ошибок Multer
router.post('/poll-image', protect, function (req, res, next) {
  upload.single('image')(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: "Файл слишком большой. Максимум 5 МБ" });
      }
      return res.status(400).json({ success: false, message: "Ошибка загрузки: " + err.message });
    } else if (err) {
      return res.status(500).json({ success: false, message: "Неизвестная ошибка сервера" });
    }
    
    // Если ошибок нет, передаем файл дальше в контроллер на сжатие и отправку в S3
    uploadPollImage(req, res, next);
  });
});

module.exports = router;