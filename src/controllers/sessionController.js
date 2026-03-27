const {
  sessions,
  participants,
  screenCards,
  timerStates,
  questionStates
} = require('../data/db');

const { cleanupStaleParticipants } = require('./playerController');

const pool = require('../config/db');
const { getServiceByCode } = require('../utils/services');
const { generateUniquePinCode } = require('../utils/pin');

const OPEN_SESSION_STATUSES = ['scheduled', 'live'];
const MAX_OPEN_SESSIONS_PER_USER = 3;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function isPinInUse(pinCode, excludeSessionId = null) {
  return sessions.some((session) => {
	if (excludeSessionId && session.id === excludeSessionId) return false;
	return session.pinCode === pinCode;
  });
}

function generateUniquePin(excludeSessionId = null) {
  const maxAttempts = 100;

  for (let i = 0; i < maxAttempts; i += 1) {
	const pin = generatePin();
	if (!isPinInUse(pin, excludeSessionId)) {
	  return pin;
	}
  }

  throw new Error('Не удалось сгенерировать уникальный PIN');
}

function nowIso() {
  return new Date().toISOString();
}

function getSessionIndexByOwner(sessionId, ownerUserId) {
  return sessions.findIndex(
	(item) => item.id === sessionId && item.ownerUserId === ownerUserId
  );
}

function getSessionByOwner(sessionId, ownerUserId) {
  return sessions.find(
	(item) => item.id === sessionId && item.ownerUserId === ownerUserId
  );
}

function touchSession(session) {
  session.updatedAt = nowIso();
}

function countOpenSessionsForUser(userId, excludeSessionId = null) {
  return sessions.filter((session) => {
	if (session.ownerUserId !== userId) return false;
	if (excludeSessionId && session.id === excludeSessionId) return false;
	return OPEN_SESSION_STATUSES.includes(session.status);
  }).length;
}

function ensureOpenSessionsLimit(userId, excludeSessionId = null) {
  const openCount = countOpenSessionsForUser(userId, excludeSessionId);

  if (openCount >= MAX_OPEN_SESSIONS_PER_USER) {
	return {
	  ok: false,
	  message: 'У администратора может быть не более 3 активных или запланированных сессий'
	};
  }

  return { ok: true };
}

function removeSessionById(sessionId) {
  const sessionIndex = sessions.findIndex((item) => item.id === sessionId);
  if (sessionIndex === -1) return false;

  sessions.splice(sessionIndex, 1);

  for (let i = participants.length - 1; i >= 0; i--) {
	if (participants[i].sessionId === sessionId) {
	  participants.splice(i, 1);
	}
  }

  for (let i = screenCards.length - 1; i >= 0; i--) {
	if (screenCards[i].sessionId === sessionId) {
	  screenCards.splice(i, 1);
	}
  }

  for (let i = timerStates.length - 1; i >= 0; i--) {
	if (timerStates[i].sessionId === sessionId) {
	  timerStates.splice(i, 1);
	}
  }

  for (let i = questionStates.length - 1; i >= 0; i--) {
	if (questionStates[i].sessionId === sessionId) {
	  questionStates.splice(i, 1);
	}
  }

  return true;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  const expiredIds = sessions
	.filter((session) => {
	  const baseDate = session.updatedAt || session.createdAt;
	  if (!baseDate) return false;

	  const age = now - new Date(baseDate).getTime();
	  return age > SESSION_TTL_MS;
	})
	.map((session) => session.id);

  expiredIds.forEach(removeSessionById);

  return expiredIds.length;
}

function getSessions(req, res) {
  const userSessions = sessions.filter(
	(session) => session.ownerUserId === req.user.id
  );

  return res.json({
	success: true,
	sessions: userSessions
  });
}

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
	  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())
	  RETURNING *
	  `,
	  [
		sessionId,
		'1150c796-2de8-4cff-bff8-6377398f7796',
		service.id,
		title,
		pinCode,
		'scheduled',
		JSON.stringify(defaultSettings)
	  ]
	);

	return res.status(201).json({
	  success: true,
	  session: {
		id: result.rows[0].id,
		title: result.rows[0].title,
		pinCode: result.rows[0].pin_code,
		status: result.rows[0].status,
		serviceType,
		settings: result.rows[0].settings,
		createdAt: result.rows[0].created_at
	  }
	});
  } catch (error) {
	console.error('Ошибка createSession:', error);

	return res.status(500).json({
	  success: false,
	  message: 'Не удалось создать сессию'
	});
  }
}
function getSessionById(req, res) {
  const session = getSessionByOwner(req.params.id, req.user.id);

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }
  
  cleanupStaleParticipants(session.id);

  return res.json({
	success: true,
	session
  });
}

function updateSession(req, res) {
  const session = getSessionByOwner(req.params.id, req.user.id);

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
	questions,
	replaceCardEnabled,
	questionsEnabled
  } = req.body;

  if (title !== undefined) session.title = title;
  if (deckId !== undefined) session.settings.deckId = deckId;
  if (cardMode !== undefined) session.settings.cardMode = cardMode;
  if (randomCardsCount !== undefined) session.settings.randomCardsCount = randomCardsCount;
  if (maxCardsOnScreen !== undefined) session.settings.maxCardsOnScreen = maxCardsOnScreen;
  if (timerEnabled !== undefined) session.settings.timerEnabled = Boolean(timerEnabled);
  if (timerMinutes !== undefined) session.settings.timerMinutes = timerMinutes;
  if (replaceCardEnabled !== undefined) session.settings.replaceCardEnabled = Boolean(replaceCardEnabled);
  if (questionsEnabled !== undefined) session.settings.questionsEnabled = Boolean(questionsEnabled);
  if (questions !== undefined && Array.isArray(questions)) session.questions = questions;

  touchSession(session);

  return res.json({
	success: true,
	message: 'Сессия обновлена',
	session
  });
}

function scheduleSession(req, res) {
  const session = getSessionByOwner(req.params.id, req.user.id);

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  if (session.status === 'scheduled') {
	touchSession(session);

	return res.json({
	  success: true,
	  message: 'Сессия уже запланирована',
	  session
	});
  }

  const openedLimitCheck = ensureOpenSessionsLimit(req.user.id, session.id);
  if (!openedLimitCheck.ok) {
	return res.status(400).json({
	  success: false,
	  message: openedLimitCheck.message
	});
  }

  session.status = 'scheduled';
  participants.forEach((participant) => {
	if (participant.sessionId === session.id && participant.status === 'active') {
	  participant.status = 'left';
	  participant.leftAt = nowIso();
	}
  });
  
  screenCards.forEach((card) => {
	if (card.sessionId === session.id && card.isActive) {
	  card.isActive = false;
	  card.removedAt = nowIso();
	}
  });
  touchSession(session);

  return res.json({
	success: true,
	message: 'Сессия запланирована',
	session
  });
}

function startSession(req, res) {
  const session = getSessionByOwner(req.params.id, req.user.id);

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  if (session.status === 'live') {
	return res.status(400).json({
	  success: false,
	  message: 'Сессия уже запущена'
	});
  }

  const openedLimitCheck = ensureOpenSessionsLimit(req.user.id, session.id);
  if (!openedLimitCheck.ok) {
	return res.status(400).json({
	  success: false,
	  message: openedLimitCheck.message
	});
  }

  session.status = 'live';
  // Очищаем старых участников этой сессии
  for (let i = participants.length - 1; i >= 0; i--) {
	if (participants[i].sessionId === session.id) {
	  participants.splice(i, 1);
	}
  }
  
  // Очищаем старые карты экрана
  for (let i = screenCards.length - 1; i >= 0; i--) {
	if (screenCards[i].sessionId === session.id) {
	  screenCards.splice(i, 1);
	}
  }
  
  // Сбрасываем таймер сессии
  for (let i = timerStates.length - 1; i >= 0; i--) {
	if (timerStates[i].sessionId === session.id) {
	  timerStates.splice(i, 1);
	}
  }
  
  // Сбрасываем состояние текущего вопроса
  for (let i = questionStates.length - 1; i >= 0; i--) {
	if (questionStates[i].sessionId === session.id) {
	  questionStates.splice(i, 1);
	}
  }
  session.startedAt = session.startedAt || nowIso();
  touchSession(session);

  return res.json({
	success: true,
	message: 'Сессия начата',
	session
  });
}
function getSessionParticipants(req, res) {
  const session = getSessionByOwner(req.params.id, req.user.id);

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }
  
  cleanupStaleParticipants(session.id);

const sessionParticipants = participants.filter(
	(item) => item.sessionId === session.id && item.status === 'active'
  );

  touchSession(session);

  return res.json({
	success: true,
	participants: sessionParticipants,
	count: sessionParticipants.filter((item) => item.status === 'active').length
  });
}

function kickParticipant(req, res) {
  const session = getSessionByOwner(req.params.id, req.user.id);

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  const participant = participants.find(
	(item) =>
	  item.id === req.params.participantId &&
	  item.sessionId === session.id
  );

  if (!participant) {
	return res.status(404).json({
	  success: false,
	  message: 'Участник не найден'
	});
  }

  participant.status = 'kicked';
  participant.kickedAt = nowIso();
  
  // Убираем активные карты этого участника с экрана
	screenCards.forEach((card) => {
	  if (
		card.participantId === participant.id &&
		card.sessionId === session.id &&
		card.isActive
	  ) {
		card.isActive = false;
		card.removedAt = nowIso();
	  }
	});

  touchSession(session);

  return res.json({
	success: true,
	message: 'Участник удалён из комнаты',
	participant
  });
}

function deleteSession(req, res) {
  const sessionIndex = getSessionIndexByOwner(req.params.id, req.user.id);

  if (sessionIndex === -1) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  const sessionId = sessions[sessionIndex].id;
  removeSessionById(sessionId);

  return res.json({
	success: true,
	message: 'Сессия завершена и удалена'
  });
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
  deleteSession,
  cleanupExpiredSessions
};