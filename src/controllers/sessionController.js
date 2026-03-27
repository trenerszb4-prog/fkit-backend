const pool = require('../config/db');
const { getServiceByCode } = require('../utils/services');
const { generateUniquePinCode } = require('../utils/pin');
const { participants, screenCards, timerStates, questionStates } = require('../data/db');
const { cleanupStaleParticipants } = require('./playerController');

const USER_ID = '1150c796-2de8-4cff-bff8-6377398f7796';

// ================= GET ALL =================

const getSessions = async (req, res) => {
  try {
	const result = await pool.query(`
	  SELECT *
	  FROM sessions
	  ORDER BY created_at DESC
	`);

	return res.json({
	  success: true,
	  sessions: result.rows
	});
  } catch (error) {
	console.error('getSessions error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка получения сессий'
	});
  }
};

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
	  INSERT INTO sessions (id, user_id, service_id, title, pin_code, status, settings, created_at, updated_at)
	  VALUES ($1, $2, $3, $4, $5, 'scheduled', $6::jsonb, NOW(), NOW())
	  RETURNING *
	  `,
	  [
		sessionId,
		USER_ID,
		service.id,
		title,
		pinCode,
		JSON.stringify(defaultSettings)
	  ]
	);

	return res.json({
	  success: true,
	  session: result.rows[0]
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
	  `SELECT * FROM sessions WHERE id = $1 LIMIT 1`,
	  [req.params.id]
	);

	if (!result.rows[0]) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	return res.json({
	  success: true,
	  session: result.rows[0]
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
	  `SELECT * FROM sessions WHERE id = $1 LIMIT 1`,
	  [req.params.id]
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
	  questionsEnabled
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

	const result = await pool.query(
	  `
	  UPDATE sessions
	  SET
		title = COALESCE($1, title),
		settings = $2::jsonb,
		updated_at = NOW()
	  WHERE id = $3
	  RETURNING *
	  `,
	  [
		title !== undefined ? title : null,
		JSON.stringify(nextSettings),
		req.params.id
	  ]
	);

	return res.json({
	  success: true,
	  message: 'Сессия обновлена',
	  session: result.rows[0]
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
	  RETURNING *
	  `,
	  [req.params.id]
	);

	return res.json({
	  success: true,
	  message: 'Сессия запланирована',
	  session: result.rows[0]
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
	  RETURNING *
	  `,
	  [req.params.id]
	);

	return res.json({
	  success: true,
	  message: 'Сессия начата',
	  session: result.rows[0]
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

	cleanupStaleParticipants(session.id);

	const list = participants.filter(
	  p => p.sessionId === req.params.id && p.status === 'active'
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
	await pool.query(`DELETE FROM sessions WHERE id = $1`, [req.params.id]);

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

module.exports = {
  getSessions,
  createSession,
  getSessionById,
  updateSession,
  scheduleSession,
  startSession,
  getSessionParticipants,
  deleteSession
};