require('dotenv').config();
const pool = require('./src/config/db');

async function setup() {
  try {
	// 1. Создаем таблицу пользователей
	await pool.query(`
	  CREATE TABLE IF NOT EXISTS users (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		email VARCHAR(255) UNIQUE NOT NULL,
		password_hash VARCHAR(255) NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	  );
	`);
	console.log('✅ Таблица users успешно создана или уже существует.');

	// 2. Добавляем колонку user_id в сессии (если её там еще нет)
	await pool.query(`
	  ALTER TABLE sessions 
	  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
	`);
	console.log('✅ Колонка user_id добавлена в таблицу sessions.');

	console.log('🎉 Подготовка базы данных завершена!');
	process.exit(0);
  } catch (err) {
	console.error('❌ Ошибка при обновлении БД:', err);
	process.exit(1);
  }
}

setup();