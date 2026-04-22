const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const sharp = require("sharp");
const crypto = require("crypto");

// Инициализация клиента для Яндекс Клауда
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "ru-central1",
  credentials: {
	accessKeyId: process.env.S3_ACCESS_KEY_ID,
	secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

async function uploadPollImage(req, res) {
  try {
	if (!req.file) {
	  return res.status(400).json({ success: false, message: "Файл не найден" });
	}

	// 1. Оптимизация изображения "на лету" (в памяти, не сохраняя на диск сервера)
	const buffer = await sharp(req.file.buffer)
	  .resize(800, 800, { fit: 'inside', withoutEnlargement: true }) // Сжимаем большие фото
	  .webp({ quality: 80 }) // Конвертируем в webp для максимальной скорости
	  .toBuffer();

	// 2. Генерируем случайное имя файла
	const fileName = `polls/${crypto.randomBytes(8).toString("hex")}.webp`;

	// 3. Отправляем в Yandex Object Storage
	await s3.send(new PutObjectCommand({
	  Bucket: process.env.S3_BUCKET_NAME,
	  Key: fileName,
	  Body: buffer,
	  ContentType: "image/webp",
	  ACL: "public-read", // Делаем файл доступным по прямой ссылке
	}));

	// 4. Формируем красивую ссылку
	const imageUrl = `https://storage.yandexcloud.net/${process.env.S3_BUCKET_NAME}/${fileName}`;
	
	return res.json({ success: true, imageUrl });
  } catch (error) {
	console.error("S3 Upload Error:", error);
	return res.status(500).json({ success: false, message: "Ошибка при загрузке картинки" });
  }
}

module.exports = { uploadPollImage };