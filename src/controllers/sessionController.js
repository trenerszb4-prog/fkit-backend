const pool = require('../config/db');
const { getServiceByCode } = require('../utils/services');
const { generateUniquePinCode } = require('../utils/pin');
const { participants, screenCards, timerStates, questionStates } = require('../data/db');
const { cleanupStaleParticipants } = require('./playerController');

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
	const { title, serviceType = 'cards', settings } = req.body;

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

	const defaultSettings = {
	  deckId: 'deck1',
	  cardMode: 'full_deck',
	  randomCardsCount: 0,
	  maxCardsOnScreen: 1,
	  timerEnabled: false,
	  timerMinutes: 3,
	  replaceCardEnabled: false,
	  questionsEnabled: false,
	  ...(settings || {})
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
		JSON.stringify(defaultSettings)
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

	if (deckId !== undefined) nextSettings.deckId = deckId;
	if (cardMode !== undefined) nextSettings.cardMode = cardMode;
	if (randomCardsCount !== undefined) nextSettings.randomCardsCount = randomCardsCount;
	if (maxCardsOnScreen !== undefined) nextSettings.maxCardsOnScreen = maxCardsOnScreen;
	if (timerEnabled !== undefined) nextSettings.timerEnabled = Boolean(timerEnabled);
	if (timerMinutes !== undefined) nextSettings.timerMinutes = timerMinutes;
	if (replaceCardEnabled !== undefined) nextSettings.replaceCardEnabled = Boolean(replaceCardEnabled);
	if (questionsEnabled !== undefined) nextSettings.questionsEnabled = Boolean(questionsEnabled);
	if (questions !== undefined) nextSettings.questions = questions;

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

	participants.forEach((participant) => {
	  if (participant.sessionId === session.id && participant.status === 'active') {
		participant.status = 'left';
		participant.leftAt = new Date().toISOString();
	  }
	});

	screenCards.forEach((card) => {
	  if (card.sessionId === session.id && card.isActive) {
		card.isActive = false;
		card.removedAt = new Date().toISOString();
	  }
	});

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

	for (let i = participants.length - 1; i >= 0; i--) {
	  if (participants[i].sessionId === session.id) {
		participants.splice(i, 1);
	  }
	}

	for (let i = screenCards.length - 1; i >= 0; i--) {
	  if (screenCards[i].sessionId === session.id) {
		screenCards.splice(i, 1);
	  }
	}

	for (let i = timerStates.length - 1; i >= 0; i--) {
	  if (timerStates[i].sessionId === session.id) {
		timerStates.splice(i, 1);
	  }
	}

	for (let i = questionStates.length - 1; i >= 0; i--) {
	  if (questionStates[i].sessionId === session.id) {
		questionStates.splice(i, 1);
	  }
	}

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

	const list = participants.filter(
	  (p) => p.sessionId === req.params.id && p.status === 'active'
	);

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
	const check = await pool.query(
	  `SELECT * FROM sessions WHERE id = $1 LIMIT 1`,
	  [req.params.id]
	);

	const session = check.rows[0];

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	const participant = participants.find(
	  (item) =>
		String(item.id) === String(req.params.participantId) &&
		String(item.sessionId) === String(session.id)
	);

	if (!participant) {
	  return res.status(404).json({
		success: false,
		message: 'Участник не найден'
	  });
	}

	participant.status = 'kicked';
	participant.kickedAt = new Date().toISOString();

	screenCards.forEach((card) => {
	  if (
		String(card.participantId) === String(participant.id) &&
		String(card.sessionId) === String(session.id) &&
		card.isActive
	  ) {
		card.isActive = false;
		card.removedAt = new Date().toISOString();
	  }
	});

	return res.json({
	  success: true,
	  message: 'Участник удалён из комнаты',
	  participant
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