const {
  sessions,
  participants,
  decks,
  deckCards,
  screenCards,
  timerStates
} = require('../data/db');

function generateParticipantId() {
  return `p_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function getSessionByPin(pinCode) {
  return sessions.find(
	(session) =>
	  session.pinCode === pinCode &&
	  ['scheduled', 'live'].includes(session.status) &&
	  session.serviceType === 'cards'
  );
}

function startOrRestartTimer(session) {
  if (!session.settings.timerEnabled) {
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
	displayName: name,
	source: source || 'browser',
	status: 'active',
	joinedAt: new Date().toISOString()
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

  const deck = decks.find((item) => item.id === session.settings.deckId);

  if (!deck) {
	return res.status(404).json({
	  success: false,
	  message: 'Колода не найдена'
	});
  }

  const cards = deckCards.filter((item) => item.deckId === deck.id);

  let availableCards = cards;

  if (session.settings.cardMode === 'random_subset') {
	const count = session.settings.randomCardsCount || 1;
	availableCards = cards.slice(0, count);
  }

  const activeScreenCard = screenCards.find(
	(item) =>
	  item.sessionId === session.id &&
	  item.participantId === participant.id &&
	  item.isActive
  );

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

  const card = deckCards.find((item) => item.id === cardId);

  if (!card) {
	return res.status(404).json({
	  success: false,
	  message: 'Карта не найдена'
	});
  }

  const participantActiveCard = screenCards.find(
	(item) =>
	  item.sessionId === session.id &&
	  item.participantId === participant.id &&
	  item.isActive
  );

  if (participantActiveCard) {
	participantActiveCard.isActive = false;
	participantActiveCard.removedAt = new Date().toISOString();
  }

  const activeCards = screenCards
	.filter((item) => item.sessionId === session.id && item.isActive)
	.sort((a, b) => new Date(a.shownAt) - new Date(b.shownAt));

  if (activeCards.length >= session.settings.maxCardsOnScreen) {
	activeCards[0].isActive = false;
	activeCards[0].removedAt = new Date().toISOString();
  }

  const newScreenCard = {
	id: `sc_${Date.now()}`,
	sessionId: session.id,
	participantId: participant.id,
	participantName: participant.displayName,
	deckCardId: card.id,
	imageUrl: card.imageUrl,
	isActive: true,
	shownAt: new Date().toISOString(),
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

  const activeCard = screenCards.find(
	(item) =>
	  item.sessionId === participant.sessionId &&
	  item.participantId === participant.id &&
	  item.isActive
  );

  if (!activeCard) {
	return res.status(404).json({
	  success: false,
	  message: 'Активная карта не найдена'
	});
  }

  activeCard.isActive = false;
  activeCard.removedAt = new Date().toISOString();

  return res.json({
	success: true,
	message: 'Карта отозвана'
  });
}

module.exports = {
  joinByPin,
  getPlayerSession,
  getPlayerCards,
  showCard,
  recallCard
};