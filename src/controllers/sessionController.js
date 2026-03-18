const { sessions, participants } = require('../data/db');

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
	status: 'draft',
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
  kickParticipant
};