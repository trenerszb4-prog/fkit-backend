const pool = require('../config/db');
const { broadcastToSession } = require('../realtime/ws'); 

// 1. Получение результатов (для экрана проектора)
async function getResults(req, res) {
  try {
	const { sessionId } = req.params;
	
	// Считаем количество голосов для каждой опции
	const result = await pool.query(
	  `SELECT option_id as id, COUNT(*)::int as count
	   FROM voting_votes
	   WHERE session_id = $1
	   GROUP BY option_id`,
	  [sessionId]
	);

	// Преобразуем ответ базы в удобный объект (например: { opt_1: 5, opt_2: 12 })
	const resultsMap = {};
	result.rows.forEach(row => {
	  resultsMap[row.id] = row.count;
	});

	return res.json({ success: true, results: resultsMap });
  } catch (error) {
	console.error('getResults error:', error);
	return res.status(500).json({ success: false, message: 'Ошибка получения результатов' });
  }
}

// 2. Отправка голоса (от пульта участника)
async function addVote(req, res) {
  try {
	const { sessionId } = req.params;
	const { participantId, optionIds } = req.body;

	if (!participantId || !Array.isArray(optionIds) || optionIds.length === 0) {
	  return res.status(400).json({ success: false, message: 'Некорректные данные голоса' });
	}

	// 🟢 ЖЕЛЕЗОБЕТОННАЯ ЗАЩИТА: Проверяем статус паузы и настройки
	const sessionRes = await pool.query(`SELECT settings FROM sessions WHERE id = $1`, [sessionId]);
	if (sessionRes.rows.length > 0) {
	  const settings = sessionRes.rows[0].settings || {};
	  if (settings.isPaused) {
		return res.status(403).json({ success: false, message: 'Опрос остановлен ведущим' });
	  }
	  if (!settings.allowMultiple && optionIds.length > 1) {
		return res.status(400).json({ success: false, message: 'Разрешен только один вариант ответа' });
	  }
	}

	// Используем транзакцию: удаляем старый голос участника (позволяем переголосовать) и пишем новые
	const client = await pool.connect();
	try {
	  await client.query('BEGIN');
	  
	  // Удаляем предыдущие голоса этого участника в этой сессии
	  await client.query(
		`DELETE FROM voting_votes WHERE session_id = $1 AND participant_id = $2`, 
		[sessionId, participantId]
	  );

	  // Записываем новые голоса
	  for (const optId of optionIds) {
		await client.query(
		  `INSERT INTO voting_votes (session_id, participant_id, option_id, created_at)
		   VALUES ($1, $2, $3, NOW())`,
		  [sessionId, participantId, optId]
		);
	  }
	  
	  await client.query('COMMIT');
	} catch (err) {
	  await client.query('ROLLBACK');
	  throw err;
	} finally {
	  client.release();
	}

	// Рассылаем сигнал проектору и пультам, что результаты обновились
	if (typeof broadcastToSession === 'function') {
	  broadcastToSession(sessionId, { type: 'voting_results_updated' });
	}

	return res.json({ success: true, message: 'Голос учтен' });
  } catch (error) {
	console.error('addVote error:', error);
	return res.status(500).json({ success: false, message: 'Ошибка сохранения голоса' });
  }
}

// 3. Очистка результатов голосования (от фасилитатора)
async function clearVotes(req, res) {
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

	await pool.query(`DELETE FROM voting_votes WHERE session_id = $1`, [sessionId]);

	if (typeof broadcastToSession === 'function') {
	  broadcastToSession(sessionId, { type: 'voting_cleared' });
	}

	return res.json({ success: true, message: 'Результаты очищены' });
  } catch (error) {
	console.error('clearVotes error:', error);
	return res.status(500).json({ success: false, message: 'Ошибка очистки' });
  }
}

// 4. Управление паузой (от фасилитатора)
async function togglePause(req, res) {
  try {
	const { sessionId } = req.params;
	const { isPaused } = req.body;
	const userId = req.user.id;

	const sessionCheck = await pool.query(
	  `SELECT id FROM sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
	  [sessionId, userId]
	);

	if (sessionCheck.rows.length === 0) {
	  return res.status(403).json({ success: false, message: 'Нет прав на управление сессией' });
	}

	// Сохраняем статус паузы прямо в настройки сессии
	await pool.query(
	  `UPDATE sessions SET settings = coalesce(settings, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
	  [sessionId, JSON.stringify({ isPaused })]
	);

	if (typeof broadcastToSession === 'function') {
	  // Рассылаем сигнал всем пультам, чтобы они заблокировали/разблокировали кнопки
	  broadcastToSession(sessionId, { type: 'session_updated' });
	}

	return res.json({ success: true, message: isPaused ? 'Опрос остановлен' : 'Опрос возобновлен' });
  } catch (error) {
	console.error('togglePause error:', error);
	return res.status(500).json({ success: false, message: 'Ошибка изменения статуса' });
  }
}

module.exports = {
  getResults,
  addVote,
  clearVotes,
  togglePause
};