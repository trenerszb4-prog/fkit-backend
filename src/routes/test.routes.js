const express = require('express');
const pool = require('../config/db');

const router = express.Router();

router.get('/services', async (req, res) => {
  try {
	const result = await pool.query('SELECT * FROM services');
	res.json(result.rows);
  } catch (error) {
	console.error(error);
	res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;