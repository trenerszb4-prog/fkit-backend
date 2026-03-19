const {
  sessions,
  participants,
  screenCards,
  timerStates,
  questionStates
} = require('../data/db');

function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
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

function createSession(req, res) {
  const {
	title,
	deckId,
	cardMode,
	randomCardsCount,
	maxCardsOnScreen,
	timerEnabled,
	timerMinutes,
	questions
  } = req.body;

  if (!title) {
	return res.status(400).json({
	  success: false,
	  message: 'Название сессии обязательно'
	});
  }

  const newSession = {
	id: `s_${Date.now()}`,
	ownerUserId: req.user.id,
	serviceType: 'cards',
	title,
	pinCode: generatePin(),
	status: 'scheduled',
	settings: {
	  deckId: deckId || 'default-deck',
	  cardMode: cardMode || 'full_deck',
	  randomCardsCount: randomCardsCount || 0,
	  maxCardsOnScreen: maxCardsOnScreen || 1,
	  timerEnabled: Boolean(timerEnabled),
	  timerMinutes: timerMinutes || 3
	},
	questions: Array.isArray(questions) ? questions : [],
	createdAt: new Date().toISOString()
  };

  sessions.push(newSession);

  return res.status(201).json({
	success: true,
	message: 'Сессия создана',
	session: newSession
  });
}

function getSessionById(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  return res.json({
	success: true,
	session
  });
}

function updateSession(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

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
	questions
  } = req.body;

  if (title !== undefined) session.title = title;
  if (deckId !== undefined) session.settings.deckId = deckId;
  if (cardMode !== undefined) session.settings.cardMode = cardMode;
  if (randomCardsCount !== undefined) session.settings.randomCardsCount = randomCardsCount;
  if (maxCardsOnScreen !== undefined) session.settings.maxCardsOnScreen = maxCardsOnScreen;
  if (timerEnabled !== undefined) session.settings.timerEnabled = Boolean(timerEnabled);
  if (timerMinutes !== undefined) session.settings.timerMinutes = timerMinutes;
  if (questions !== undefined && Array.isArray(questions)) session.questions = questions;

  return res.json({
	success: true,
	message: 'Сессия обновлена',
	session
  });
}

function scheduleSession(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  session.status = 'scheduled';

  return res.json({
	success: true,
	message: 'Сессия запланирована',
	session
  });
}

function startSession(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  session.status = 'live';

  return res.json({
	success: true,
	message: 'Сессия начата',
	session
  });
}

function getSessionParticipants(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  const sessionParticipants = participants.filter(
	(item) => item.sessionId === session.id
  );

  return res.json({
	success: true,
	participants: sessionParticipants,
	count: sessionParticipants.filter((item) => item.status === 'active').length
  });
}

function kickParticipant(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

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
  participant.kickedAt = new Date().toISOString();

  return res.json({
	success: true,
	message: 'Участник удалён из комнаты',
	participant
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
  deleteSession
};

function deleteSession(req, res) {
  const sessionIndex = sessions.findIndex(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (sessionIndex === -1) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  const sessionId = sessions[sessionIndex].id;

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

  return res.json({
	success: true,
	message: 'Сессия завершена и удалена'
  });
}