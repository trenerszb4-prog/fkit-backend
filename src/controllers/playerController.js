const {
  sessions,
  participants,
  decks,
  deckCards,
  screenCards,
  timerStates
} = require('../data/db');

const PARTICIPANT_HEARTBEAT_TTL_MS = 30 * 1000; // 30 секунд

function nowIso() {
  return new Date().toISOString();
}

function generateParticipantId() {
  return `p_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function normalizeName(value) {
  return String(value || '')
	.trim()
	.replace(/\s+/g, ' ')
	.toLowerCase();
}

function looksFeminine(name) {
  const trimmed = String(name || '').trim().toLowerCase();
  return /[ая]$/.test(trimmed);
}

function getHumorSuffixes(name) {
  if (looksFeminine(name)) {
	return [
	  'Прекрасная',
	  'Мудрая',
	  'Великолепная',
	  'Очаровательная',
	  'Легендарная',
	  'Сияющая',
	  'Неповторимая'
	];
  }

  return [
	'Великий',
	'Мудрый',
	'Легендарный',
	'Несравненный',
	'Блистательный',
	'Доблестный',
	'Великолепный'
  ];
}

function makeUniqueDisplayName(sessionId, rawName) {
  const baseName = String(rawName || '').trim().replace(/\s+/g, ' ');

  const activeNames = participants
	.filter((item) => item.sessionId === sessionId && item.status === 'active')
	.map((item) => normalizeName(item.displayName));

  if (!activeNames.includes(normalizeName(baseName))) {
	return baseName;
  }

  const suffixes = getHumorSuffixes(baseName);

  for (const suffix of suffixes) {
	const candidate = `${baseName} ${suffix}`;
	if (!activeNames.includes(normalizeName(candidate))) {
	  return candidate;
	}
  }

  let counter = 2;
  while (true) {
	for (const suffix of suffixes) {
	  const candidate = `${baseName} ${suffix} ${counter}`;
	  if (!activeNames.includes(normalizeName(candidate))) {
		return candidate;
	  }
	}
	counter += 1;
  }
}

function getSessionByPin(pinCode) {
  return sessions.find(
	(session) =>
	  session.pinCode === pinCode &&
	  session.status === 'live' &&
	  session.serviceType === 'cards'
  );
}

function touchParticipant(participant) {
  participant.lastSeenAt = nowIso();
}

function deactivateParticipantCards(participant) {
  screenCards.forEach((card) => {
	if (
	  card.participantId === participant.id &&
	  card.sessionId === participant.sessionId &&
	  card.isActive
	) {
	  card.isActive = false;
	  card.removedAt = nowIso();
	}
  });
}

function markParticipantLeft(participant, reason = 'left') {
  participant.status = 'left';
  participant.leftAt = nowIso();
  participant.leaveReason = reason;
  deactivateParticipantCards(participant);
}

function cleanupStaleParticipants(sessionId = null) {
  const now = Date.now();

  participants.forEach((participant) => {
	if (participant.status !== 'active') return;
	if (sessionId && participant.sessionId !== sessionId) return;

	const lastSeen = participant.lastSeenAt || participant.joinedAt;
	if (!lastSeen) return;

	const diff = now - new Date(lastSeen).getTime();
	if (diff > PARTICIPANT_HEARTBEAT_TTL_MS) {
	  markParticipantLeft(participant, 'timeout');
	}
  });
}

function startOrRestartTimer(session) {
  if (!session.settings?.timerEnabled) {
	return null;
  }

  const durationSeconds = (session.settings.timerMinutes || 3) * 60;
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + durationSeconds * 1000);

  let timer = timerStates.find((item) => item.sessionId === session.id);

  if (!timer) {
	timer = {
	  sessionId: session.id,
	  durationSeconds,
	  startedAt: startedAt.toISOString(),
	  endsAt: endsAt.toISOString(),
	  state: 'running'
	};
	timerStates.push(timer);
  } else {
	timer.durationSeconds = durationSeconds;
	timer.startedAt = startedAt.toISOString();
	timer.endsAt = endsAt.toISOString();
	timer.state = 'running';
  }

  return timer;
}

function getOrAssignRandomCards(session, participant, cards) {
  const count = Math.max(1, Number(session.settings?.randomCardsCount || 1));

  if (Array.isArray(participant.assignedCardIds) && participant.assignedCardIds.length) {
	return cards.filter((card) => participant.assignedCardIds.includes(card.id));
  }

  const shuffled = [...cards].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, cards.length));

  participant.assignedCardIds = selected.map((card) => card.id);
  return selected;
}

function getParticipantActiveCard(sessionId, participantId) {
  return screenCards.find(
	(item) =>
	  item.sessionId === sessionId &&
	  item.participantId === participantId &&
	  item.isActive
  );
}

function getSessionActiveCards(sessionId) {
  return screenCards
	.filter((item) => item.sessionId === sessionId && item.isActive)
	.sort((a, b) => new Date(a.shownAt || 0) - new Date(b.shownAt || 0));
}

function joinByPin(req, res) {
  const { name, pinCode, source } = req.body;

  if (!name || !pinCode) {
	return res.status(400).json({
	  success: false,
	  message: 'Введите имя и PIN'
	});
  }

  const session = getSessionByPin(pinCode);

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена или не активна'
	});
  }

  const participant = {
	id: generateParticipantId(),
	sessionId: session.id,
	displayName: makeUniqueDisplayName(session.id, name),
	source: source || 'browser',
	status: 'active',
	assignedCardIds: [],
	joinedAt: nowIso(),
	lastSeenAt: nowIso()
  };

  participants.push(participant);

  return res.status(201).json({
	success: true,
	message: 'Участник вошёл в сессию',
	participant,
	session: {
	  id: session.id,
	  title: session.title,
	  pinCode: session.pinCode,
	  serviceType: session.serviceType,
	  status: session.status,
	  settings: session.settings,
	  questions: session.questions
	}
  });
}

function getPlayerSession(req, res) {
  const { participantId } = req.params;

  const participant = participants.find(
	(item) => item.id === participantId && item.status === 'active'
  );

  if (!participant) {
	return res.status(404).json({
	  success: false,
	  message: 'Участник не найден или не активен'
	});
  }

  const session = sessions.find((item) => item.id === participant.sessionId);

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  if (session.status !== 'live') {
	markParticipantLeft(participant, 'session_inactive');

	return res.status(403).json({
	  success: false,
	  message: 'Сессия больше не активна'
	});
  }

  touchParticipant(participant);

  return res.json({
	success: true,
	participant,
	session
  });
}

function getPlayerCards(req, res) {
  const { participantId } = req.params;

  const participant = participants.find(
	(item) => item.id === participantId && item.status === 'active'
  );

  if (!participant) {
	return res.status(404).json({
	  success: false,
	  message: 'Участник не найден или не активен'
	});
  }

  const session = sessions.find((item) => item.id === participant.sessionId);

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  if (session.status !== 'live') {
	markParticipantLeft(participant, 'session_inactive');

	return res.status(403).json({
	  success: false,
	  message: 'Сессия больше не активна'
	});
  }

  touchParticipant(participant);

  const deck = decks.find((item) => item.id === session.settings?.deckId);

  if (!deck) {
	return res.status(404).json({
	  success: false,
	  message: 'Колода не найдена'
	});
  }

  const cards = deckCards.filter((item) => item.deckId === deck.id);

  let availableCards = cards;

  if (session.settings?.cardMode === 'random_subset') {
	availableCards = getOrAssignRandomCards(session, participant, cards);
  }

  const activeScreenCard = getParticipantActiveCard(session.id, participant.id);

  return res.json({
	success: true,
	deck,
	cards: availableCards,
	activeScreenCard: activeScreenCard || null
  });
}

function showCard(req, res) {
  const { participantId } = req.params;
  const { cardId } = req.body;

  const participant = participants.find(
	(item) => item.id === participantId && item.status === 'active'
  );

  if (!participant) {
	return res.status(404).json({
	  success: false,
	  message: 'Участник не найден или не активен'
	});
  }

  const session = sessions.find((item) => item.id === participant.sessionId);

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  if (session.status !== 'live') {
	markParticipantLeft(participant, 'session_inactive');

	return res.status(403).json({
	  success: false,
	  message: 'Сессия больше не активна'
	});
  }

  touchParticipant(participant);

  const card = deckCards.find((item) => item.id === cardId);

  if (!card) {
	return res.status(404).json({
	  success: false,
	  message: 'Карта не найдена'
	});
  }

  const settings = session.settings || {};
  const maxCardsOnScreen = Math.max(1, Number(settings.maxCardsOnScreen || 1));

  if (settings.cardMode === 'random_subset') {
	const allDeckCards = deckCards.filter((item) => item.deckId === card.deckId);
	const allowedCards = getOrAssignRandomCards(session, participant, allDeckCards);
	const allowedCardIds = allowedCards.map((item) => item.id);

	if (!allowedCardIds.includes(cardId)) {
	  return res.status(403).json({
		success: false,
		message: 'Эта карта недоступна участнику'
	  });
	}
  }

  const activeCards = screenCards
	.filter((item) => item.sessionId === session.id && item.isActive)
	.sort((a, b) => new Date(a.shownAt || 0) - new Date(b.shownAt || 0));

  const existingParticipantCard = activeCards.find(
	(item) => item.participantId === participant.id
  );

  if (existingParticipantCard) {
	existingParticipantCard.deckCardId = card.id;
	existingParticipantCard.imageUrl = card.imageUrl;
	existingParticipantCard.participantName = participant.displayName;
	existingParticipantCard.updatedAt = nowIso();

	const timer = startOrRestartTimer(session);

	return res.json({
	  success: true,
	  message: 'Карта участника обновлена на общем экране',
	  screenCard: existingParticipantCard,
	  timer: timer || null
	});
  }

  if (activeCards.length >= maxCardsOnScreen) {
	const oldestCard = activeCards[0];
	if (oldestCard) {
	  oldestCard.isActive = false;
	  oldestCard.removedAt = nowIso();
	}
  }

  const newScreenCard = {
	id: `sc_${Date.now()}`,
	sessionId: session.id,
	participantId: participant.id,
	participantName: participant.displayName,
	deckCardId: card.id,
	imageUrl: card.imageUrl,
	isActive: true,
	shownAt: nowIso(),
	updatedAt: null,
	removedAt: null
  };

  screenCards.push(newScreenCard);

  const timer = startOrRestartTimer(session);

  return res.json({
	success: true,
	message: 'Карта отправлена на общий экран',
	screenCard: newScreenCard,
	timer: timer || null
  });
}

function recallCard(req, res) {
  const { participantId } = req.params;

  const participant = participants.find(
	(item) => item.id === participantId && item.status === 'active'
  );

  if (!participant) {
	return res.status(404).json({
	  success: false,
	  message: 'Участник не найден или не активен'
	});
  }

  const session = sessions.find((item) => item.id === participant.sessionId);

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  if (session.status !== 'live') {
	markParticipantLeft(participant, 'session_inactive');

	return res.status(403).json({
	  success: false,
	  message: 'Сессия больше не активна'
	});
  }

  touchParticipant(participant);

  const activeCard = getParticipantActiveCard(participant.sessionId, participant.id);

  if (!activeCard) {
	return res.status(404).json({
	  success: false,
	  message: 'Активная карта не найдена'
	});
  }

  activeCard.isActive = false;
  activeCard.removedAt = nowIso();

  return res.json({
	success: true,
	message: 'Карта отозвана'
  });
}

function leaveSession(req, res) {
  const { participantId } = req.params;

  const participant = participants.find((item) => item.id === participantId);

  if (!participant) {
	return res.status(404).json({
	  success: false,
	  message: 'Участник не найден'
	});
  }

  markParticipantLeft(participant, 'manual_leave');

  return res.json({
	success: true,
	message: 'Участник вышел из сессии'
  });
}

function heartbeat(req, res) {
  const { participantId } = req.params;

  const participant = participants.find(
	(item) => item.id === participantId && item.status === 'active'
  );

  if (!participant) {
	return res.status(404).json({
	  success: false,
	  message: 'Участник не найден или не активен'
	});
  }

  const session = sessions.find((item) => item.id === participant.sessionId);

  if (!session || session.status !== 'live') {
	markParticipantLeft(participant, 'session_inactive');

	return res.status(403).json({
	  success: false,
	  message: 'Сессия больше не активна'
	});
  }

  touchParticipant(participant);

  return res.json({
	success: true,
	message: 'Heartbeat принят'
  });
}

module.exports = {
  joinByPin,
  getPlayerSession,
  getPlayerCards,
  showCard,
  recallCard,
  leaveSession,
  heartbeat,
  cleanupStaleParticipants
};