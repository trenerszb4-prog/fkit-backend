const pool = require('../config/db');
const { broadcastToSession } = require('../realtime/ws'); 

async function getWords(req, res) {
  try {
	const { sessionId } = req.params;
	const result = await pool.query(
	  `SELECT word, COUNT(*)::int as weight
	   FROM wordcloud_words
	   WHERE session_id = $1
	   GROUP BY word
	   ORDER BY weight DESC`,
	  [sessionId]
	);

	return res.json({ success: true, words: result.rows });
  } catch (error) {
	console.error('getWords error:', error);
	return res.status(500).json({ success: false, message: 'Ошибка получения слов' });
  }
}

async function addWord(req, res) {
  try {
	const { sessionId } = req.params;
	const { word, participantId } = req.body;

	if (!word || !word.trim()) {
	  return res.status(400).json({ success: false, message: 'Слово не может быть пустым' });
	}

	const cleanWord = word.trim().toLowerCase();

	await pool.query(
	  `INSERT INTO wordcloud_words (session_id, participant_id, word, created_at)
	   VALUES ($1, $2, $3, NOW())`,
	  [sessionId, participantId, cleanWord]
	);

	if (typeof broadcastToSession === 'function') {
	  broadcastToSession(sessionId, { type: 'word_added', word: cleanWord });
	}

	return res.json({ success: true, message: 'Слово добавлено' });
  } catch (error) {
	console.error('addWord error:', error);
	return res.status(500).json({ success: false, message: 'Ошибка добавления слова' });
  }
}

async function clearWords(req, res) {
  try {
	const { sessionId } = req.params;
	const userId = req.user.id; 

	const sessionCheck = await pool.query(
	  `SELECT id FROM sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
	  [sessionId, userId]
	);

	if (sessionCheck.rows.length === 0) {
	  return res.status(403).json({ success: false, message: 'Нет прав на очистку этой сессии' });
	}

	await pool.query(`DELETE FROM wordcloud_words WHERE session_id = $1`, [sessionId]);

	if (typeof broadcastToSession === 'function') {
	  broadcastToSession(sessionId, { type: 'cloud_cleared' });
	}

	return res.json({ success: true, message: 'Облако очищено' });
  } catch (error) {
	console.error('clearWords error:', error);
	return res.status(500).json({ success: false, message: 'Ошибка очистки' });
  }
}

// 🟢 НОВАЯ ФУНКЦИЯ УДАЛЕНИЯ КОНКРЕТНОГО СЛОВА
async function deleteWord(req, res) {
  try {
	const { sessionId, word } = req.params;
	const userId = req.user.id; 

	// Проверяем, принадлежит ли сессия пользователю (фасилитатору)
	const sessionCheck = await pool.query(
	  `SELECT id FROM sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
	  [sessionId, userId]
	);

	if (sessionCheck.rows.length === 0) {
	  return res.status(403).json({ success: false, message: 'Нет прав на удаление из этой сессии' });
	}

	const cleanWord = word.trim().toLowerCase();

	await pool.query(
	  `DELETE FROM wordcloud_words WHERE session_id = $1 AND word = $2`,
	  [sessionId, cleanWord]
	);

	// Рассылаем сигнал всем экранам для мгновенного обновления облака
	if (typeof broadcastToSession === 'function') {
	  broadcastToSession(sessionId, { type: 'cloud_cleared' }); 
	}

	return res.json({ success: true, message: 'Слово удалено' });
  } catch (error) {
	console.error('deleteWord error:', error);
	return res.status(500).json({ success: false, message: 'Ошибка удаления слова' });
  }
}

module.exports = {
  getWords,
  addWord,
  clearWords,
  deleteWord
};