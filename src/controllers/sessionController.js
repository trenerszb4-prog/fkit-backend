const pool = require('../config/db');
const { getServiceByCode } = require('../utils/services');
const { generateUniquePinCode } = require('../utils/pin');
const { cleanupStaleParticipants } = require('./playerController');
const { broadcastToSession } = require('../realtime/ws');

const OPEN_SESSION_STATUSES = ['scheduled', 'live'];
const MAX_OPEN_SESSIONS_PER_USER = 3;

function formatSession(row) {
  if (!row) return null;

  return {
	id: row.id,
	title: row.title,
	pinCode: row.pin_code,
	status: row.status,
	settings: row.settings || {},
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	startedAt: row.started_at,
	userId: row.user_id,
	serviceId: row.service_id,
	serviceType: row.service_type || 'cards'
  };
}

async function countOpenSessionsForUser(userId, excludeSessionId = null) {
  const params = [userId, OPEN_SESSION_STATUSES];
  let query = `
	SELECT COUNT(*)::int AS count
	FROM sessions
	WHERE user_id = $1
	  AND status = ANY($2)
  `;

  if (excludeSessionId) {
	params.push(excludeSessionId);
	query += ` AND id <> $3`;
  }

  const result = await pool.query(query, params);
  return result.rows[0]?.count || 0;
}

async function ensureOpenSessionsLimit(userId, excludeSessionId = null) {
  const openCount = await countOpenSessionsForUser(userId, excludeSessionId);

  if (openCount >= MAX_OPEN_SESSIONS_PER_USER) {
	return {
	  ok: false,
	  message: 'У администратора может быть не более 3 активных или запланированных сессий'
	};
  }

  return { ok: true };
}

// ================= GET ALL =================

async function getSessions(req, res) {
  try {
const result = await pool.query(
	`
	SELECT
	  s.*,
	  sv.code AS service_type
	FROM sessions s
	LEFT JOIN services sv ON sv.id = s.service_id
	WHERE s.user_id = $1
	ORDER BY s.created_at DESC
	`,
	[req.user.id]
  );

	return res.json({
	  success: true,
	  sessions: result.rows.map(formatSession)
	});
  } catch (error) {
	console.error('getSessions error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка получения сессий'
	});
  }
}

// ================= CREATE =================

async function createSession(req, res) {
  try {
	const {
	  title,
	  serviceType = 'cards',
	  deckId,
	  cardMode,
	  randomCardsCount,
	  maxCardsOnScreen,
	  timerEnabled,
	  timerMinutes,
	  replaceCardEnabled,
	  questionsEnabled,
	  questions
	} = req.body;

	if (!title) {
	  return res.status(400).json({
		success: false,
		message: 'Не хватает обязательных данных'
	  });
	}

	const limitCheck = await ensureOpenSessionsLimit(req.user.id);
	if (!limitCheck.ok) {
	  return res.status(400).json({
		success: false,
		message: limitCheck.message
	  });
	}

	const service = await getServiceByCode(serviceType);

	if (!service) {
	  return res.status(404).json({
		success: false,
		message: 'Сервис не найден'
	  });
	}

	const pinCode = await generateUniquePinCode();
	const sessionId = `s_${Date.now()}`;

const sessionSettings = {
	  // Настройки карт
	  deckId: deckId !== undefined ? deckId : 'deck1',
	  cardMode: cardMode !== undefined ? cardMode : 'full_deck',
	  randomCardsCount: randomCardsCount !== undefined ? Number(randomCardsCount) : 0,
	  maxCardsOnScreen: maxCardsOnScreen !== undefined ? Number(maxCardsOnScreen) : 1,
	  timerEnabled: timerEnabled !== undefined ? Boolean(timerEnabled) : false,
	  timerMinutes: timerMinutes !== undefined ? Number(timerMinutes) : 3,
	  replaceCardEnabled: replaceCardEnabled !== undefined ? Boolean(replaceCardEnabled) : false,
	  questionsEnabled: questionsEnabled !== undefined ? Boolean(questionsEnabled) : false,
	  questions: Array.isArray(questions) ? questions : [],
	  
	  // Настройки Облака слов
	  palette: req.body.settings?.palette || 'fkit',
	  animationEnabled: req.body.settings?.animationEnabled !== undefined ? Boolean(req.body.settings.animationEnabled) : true,
	  saveResult: req.body.settings?.saveResult !== undefined ? Boolean(req.body.settings.saveResult) : true,
	  bgWordsEnabled: req.body.settings?.bgWordsEnabled !== undefined ? Boolean(req.body.settings.bgWordsEnabled) : false,
	  duplicateWordsEnabled: req.body.settings?.duplicateWordsEnabled !== undefined ? Boolean(req.body.settings.duplicateWordsEnabled) : false,
	  duplicateCount: req.body.settings?.duplicateCount !== undefined ? Number(req.body.settings.duplicateCount) : 3
	};

	const result = await pool.query(
	  `
	  INSERT INTO sessions (
		id,
		user_id,
		service_id,
		title,
		pin_code,
		status,
		settings,
		created_at,
		updated_at
	  )
	  VALUES ($1, $2, $3, $4, $5, 'scheduled', $6::jsonb, NOW(), NOW())
	  RETURNING *
	  `,
	  [
		sessionId,
		req.user.id,
		service.id,
		title,
		pinCode,
		JSON.stringify(sessionSettings)
	  ]
	);

	return res.json({
	  success: true,
	  session: formatSession(result.rows[0])
	});
  } catch (e) {
	console.error('createSession error:', e);
	return res.status(500).json({
	  success: false,
	  message: 'Не удалось создать сессию'
	});
  }
}

// ================= GET ONE =================

async function getSessionById(req, res) {
  try {
const result = await pool.query(
	`
	SELECT
	  s.*,
	  sv.code AS service_type
	FROM sessions s
	LEFT JOIN services sv ON sv.id = s.service_id
	WHERE s.id = $1
	  AND s.user_id = $2
	LIMIT 1
	`,
	[req.params.id, req.user.id]
  );

	if (!result.rows[0]) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	return res.json({
	  success: true,
	  session: formatSession(result.rows[0])
	});
  } catch (e) {
	console.error('getSessionById error:', e);
	return res.status(500).json({
	  success: false,
	  message: 'Не удалось получить сессию'
	});
  }
}

// ================= UPDATE =================

async function updateSession(req, res) {
  try {
	const current = await pool.query(
	  `
	  SELECT *
	  FROM sessions
	  WHERE id = $1
		AND user_id = $2
	  LIMIT 1
	  `,
	  [req.params.id, req.user.id]
	);

	const session = current.rows[0];

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

const {
	  title,
	  deckId,
	  cardMode,
	  randomCardsCount,
	  maxCardsOnScreen,
	  timerEnabled,
	  timerMinutes,
	  replaceCardEnabled,
	  questionsEnabled,
	  questions
	} = req.body;

const nextSettings = {
	  ...(session.settings || {})
	};
	
	// Настройки карт (из корня body)
	if (deckId !== undefined) nextSettings.deckId = deckId;
	if (cardMode !== undefined) nextSettings.cardMode = cardMode;
	if (randomCardsCount !== undefined) nextSettings.randomCardsCount = randomCardsCount;
	if (maxCardsOnScreen !== undefined) nextSettings.maxCardsOnScreen = maxCardsOnScreen;
	if (timerEnabled !== undefined) nextSettings.timerEnabled = Boolean(timerEnabled);
	if (timerMinutes !== undefined) nextSettings.timerMinutes = timerMinutes;
	if (replaceCardEnabled !== undefined) nextSettings.replaceCardEnabled = Boolean(replaceCardEnabled);
	if (questionsEnabled !== undefined) nextSettings.questionsEnabled = Boolean(questionsEnabled);
	if (questions !== undefined) nextSettings.questions = questions;
	
	// Настройки Облака (из объекта settings в body)
	if (req.body.settings) {
	  if (req.body.settings.palette !== undefined) nextSettings.palette = req.body.settings.palette;
	  if (req.body.settings.animationEnabled !== undefined) nextSettings.animationEnabled = Boolean(req.body.settings.animationEnabled);
	  if (req.body.settings.saveResult !== undefined) nextSettings.saveResult = Boolean(req.body.settings.saveResult);
	  if (req.body.settings.bgWordsEnabled !== undefined) nextSettings.bgWordsEnabled = Boolean(req.body.settings.bgWordsEnabled);
	  if (req.body.settings.duplicateWordsEnabled !== undefined) nextSettings.duplicateWordsEnabled = Boolean(req.body.settings.duplicateWordsEnabled);
	  if (req.body.settings.duplicateCount !== undefined) nextSettings.duplicateCount = Number(req.body.settings.duplicateCount);
	}

	const result = await pool.query(
	  `
	  UPDATE sessions
	  SET
		title = COALESCE($1, title),
		settings = $2::jsonb,
		updated_at = NOW()
	  WHERE id = $3
		AND user_id = $4
	  RETURNING *
	  `,
	  [
		title !== undefined ? title : null,
		JSON.stringify(nextSettings),
		req.params.id,
		req.user.id
	  ]
	);

broadcastToSession(req.params.id, { type: 'session_updated' });
	return res.json({
	  success: true,
	  message: 'Сессия обновлена',
	  session: formatSession(result.rows[0])
	});
  } catch (e) {
	console.error('updateSession error:', e);
	return res.status(500).json({
	  success: false,
	  message: 'Не удалось обновить сессию'
	});
  }
}

// ================= SCHEDULE =================

async function scheduleSession(req, res) {
  try {
	const check = await pool.query(
	  `
	  SELECT *
	  FROM sessions
	  WHERE id = $1
		AND user_id = $2
	  LIMIT 1
	  `,
	  [req.params.id, req.user.id]
	);

	const session = check.rows[0];

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	if (session.status !== 'scheduled') {
	  const limitCheck = await ensureOpenSessionsLimit(req.user.id, session.id);
	  if (!limitCheck.ok) {
		return res.status(400).json({
		  success: false,
		  message: limitCheck.message
		});
	  }
	}

await pool.query(
	  `
	  UPDATE participants
	  SET status = 'left',
		  left_at = NOW(),
		  leave_reason = 'session_scheduled'
	  WHERE session_id = $1
		AND status = 'active'
	  `,
	  [session.id]
	);
	
	await pool.query(
	  `
	  UPDATE screen_cards
	  SET is_active = false,
		  removed_at = NOW()
	  WHERE session_id = $1
		AND is_active = true
	  `,
	  [session.id]
	);
	
	await pool.query(
	  `
	  INSERT INTO timer_states (
		session_id,
		duration_seconds,
		started_at,
		ends_at,
		state,
		updated_at
	  )
	  VALUES ($1, $2, NULL, NULL, 'idle', NOW())
	  ON CONFLICT (session_id)
	  DO UPDATE SET
		duration_seconds = EXCLUDED.duration_seconds,
		started_at = NULL,
		ends_at = NULL,
		state = 'idle',
		updated_at = NOW()
	  `,
	  [session.id, (session.settings?.timerMinutes || 3) * 60]
	);
	
	await pool.query(
	  `
	  INSERT INTO question_states (session_id, current_index, updated_at)
	  VALUES ($1, 0, NOW())
	  ON CONFLICT (session_id)
	  DO UPDATE SET
		current_index = 0,
		updated_at = NOW()
	  `,
	  [session.id]
	);

	const result = await pool.query(
	  `
	  UPDATE sessions
	  SET
		status = 'scheduled',
		updated_at = NOW()
	  WHERE id = $1
		AND user_id = $2
	  RETURNING *
	  `,
	  [req.params.id, req.user.id]
	);

	broadcastToSession(req.params.id, { type: 'session_updated' });
	return res.json({
	  success: true,
	  message: 'Сессия запланирована',
	  session: formatSession(result.rows[0])
	});
  } catch (e) {
	console.error('scheduleSession error:', e);
	return res.status(500).json({
	  success: false,
	  message: 'Не удалось запланировать сессию'
	});
  }
}

// ================= START =================

async function startSession(req, res) {
  try {
	const check = await pool.query(
	  `
	  SELECT *
	  FROM sessions
	  WHERE id = $1
		AND user_id = $2
	  LIMIT 1
	  `,
	  [req.params.id, req.user.id]
	);

	const session = check.rows[0];

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

await pool.query(
	  `
	  UPDATE participants
	  SET status = 'left',
		  left_at = NOW(),
		  leave_reason = 'session_restarted'
	  WHERE session_id = $1
		AND status = 'active'
	  `,
	  [session.id]
	);
	
	await pool.query(
	  `
	  UPDATE screen_cards
	  SET is_active = false,
		  removed_at = NOW()
	  WHERE session_id = $1
		AND is_active = true
	  `,
	  [session.id]
	);
	
	await pool.query(
	  `
	  INSERT INTO timer_states (
		session_id,
		duration_seconds,
		started_at,
		ends_at,
		state,
		updated_at
	  )
	  VALUES ($1, $2, NULL, NULL, 'idle', NOW())
	  ON CONFLICT (session_id)
	  DO UPDATE SET
		duration_seconds = EXCLUDED.duration_seconds,
		started_at = NULL,
		ends_at = NULL,
		state = 'idle',
		updated_at = NOW()
	  `,
	  [session.id, (session.settings?.timerMinutes || 3) * 60]
	);
	
	await pool.query(
	  `
	  INSERT INTO question_states (session_id, current_index, updated_at)
	  VALUES ($1, 0, NOW())
	  ON CONFLICT (session_id)
	  DO UPDATE SET
		current_index = 0,
		updated_at = NOW()
	  `,
	  [session.id]
	);

	const result = await pool.query(
	  `
	  UPDATE sessions
	  SET
		status = 'live',
		started_at = NOW(),
		updated_at = NOW()
	  WHERE id = $1
		AND user_id = $2
	  RETURNING *
	  `,
	  [req.params.id, req.user.id]
	);

	broadcastToSession(req.params.id, { type: 'session_updated' });
	return res.json({
	  success: true,
	  message: 'Сессия начата',
	  session: formatSession(result.rows[0])
	});
  } catch (e) {
	console.error('startSession error:', e);
	return res.status(500).json({
	  success: false,
	  message: 'Не удалось запустить сессию'
	});
  }
}

// ================= PARTICIPANTS =================

async function getSessionParticipants(req, res) {
  try {
	const check = await pool.query(
	  `
	  SELECT *
	  FROM sessions
	  WHERE id = $1
		AND user_id = $2
	  LIMIT 1
	  `,
	  [req.params.id, req.user.id]
	);

	const session = check.rows[0];

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	cleanupStaleParticipants(session.id);

const result = await pool.query(
	  `
	  SELECT *
	  FROM participants
	  WHERE session_id = $1
		AND status = 'active'
	  ORDER BY joined_at ASC
	  `,
	  [req.params.id]
	);
	
	const list = result.rows.map((p) => ({
	  id: p.id,
	  sessionId: p.session_id,
	  displayName: p.display_name,
	  source: p.source,
	  status: p.status,
	  joinedAt: p.joined_at,
	  lastSeenAt: p.last_seen_at
	}));
	
	return res.json({
	  success: true,
	  participants: list
	});
	
  } catch (e) {
	console.error('getSessionParticipants error:', e);
	return res.status(500).json({
	  success: false,
	  message: 'Не удалось получить участников'
	});
  }
}

// ================= DELETE =================

async function deleteSession(req, res) {
  try {
	await pool.query(
	  `
	  DELETE FROM sessions
	  WHERE id = $1
		AND user_id = $2
	  `,
	  [req.params.id, req.user.id]
	);
	
	broadcastToSession(req.params.id, { type: 'session_deleted' });
	return res.json({
	  success: true
	});
  } catch (e) {
	console.error('deleteSession error:', e);
	return res.status(500).json({
	  success: false,
	  message: 'Не удалось удалить сессию'
	});
  }
}

async function kickParticipant(req, res) {
  try {
	const sessionResult = await pool.query(
	  `
	  SELECT *
	  FROM sessions
	  WHERE id = $1 AND user_id = $2
	  LIMIT 1
	  `,
	  [req.params.id, req.user.id] // 🔥 Добавили проверку владельца сессии
	);

	const session = sessionResult.rows[0];

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена или вы не являетесь ее владельцем'
	  });
	}

	const participantResult = await pool.query(
	  `
	  SELECT *
	  FROM participants
	  WHERE id = $1
		AND session_id = $2
	  LIMIT 1
	  `,
	  [req.params.participantId, session.id]
	);

	const participant = participantResult.rows[0];

	if (!participant) {
	  return res.status(404).json({
		success: false,
		message: 'Участник не найден'
	  });
	}

	await pool.query(
	  `
	  UPDATE participants
	  SET status = 'kicked',
		  left_at = NOW(),
		  leave_reason = 'kicked'
	  WHERE id = $1
	  `,
	  [participant.id]
	);

	await pool.query(
	  `
	  UPDATE screen_cards
	  SET is_active = false,
		  removed_at = NOW()
	  WHERE participant_id = $1
		AND session_id = $2
		AND is_active = true
	  `,
	  [participant.id, session.id]
	);

	broadcastToSession(session.id, { type: 'participant_left', participantId: participant.id });
	return res.json({
	  success: true,
	  message: 'Участник удалён из комнаты',
	  participant: {
		id: participant.id,
		sessionId: participant.session_id,
		displayName: participant.display_name,
		status: 'kicked'
	  }
	});
  } catch (error) {
	console.error('kickParticipant error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Не удалось удалить участника'
	});
  }
}

module.exports = {
  getSessions,
  createSession,
  getSessionById,
  updateSession,
  scheduleSession,
  startSession,
  getSessionParticipants,
  kickParticipant,
  deleteSession
};