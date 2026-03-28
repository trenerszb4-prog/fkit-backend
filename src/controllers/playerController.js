const pool = require('../config/db');
const {
  participants,
  screenCards,
  timerStates,
  reactions
} = require('../data/db');

const PARTICIPANT_HEARTBEAT_TTL_MS = 30 * 1000;

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

async function getLiveSessionByPin(pinCode) {
  const result = await pool.query(
	`
	SELECT *
	FROM sessions
	WHERE pin_code = $1
	  AND status = 'live'
	LIMIT 1
	`,
	[pinCode]
  );

  return result.rows[0] || null;
}

async function getSessionById(sessionId) {
  const result = await pool.query(
	`
	SELECT *
	FROM sessions
	WHERE id = $1
	LIMIT 1
	`,
	[sessionId]
  );

  return result.rows[0] || null;
}

async function getDeckById(deckId) {
  const result = await pool.query(
	`
	SELECT *
	FROM decks
	WHERE id = $1
	  AND is_active = true
	LIMIT 1
	`,
	[deckId]
  );

  return result.rows[0] || null;
}

async function getDeckCardsByDeckId(deckId) {
  const result = await pool.query(
	`
	SELECT *
	FROM deck_cards
	WHERE deck_id = $1
	  AND is_active = true
	ORDER BY sort_order ASC
	`,
	[deckId]
  );

  return result.rows;
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

function replaceRandomAssignedCard(session, participant, currentCardId, allDeckCards) {
  const assignedIds = Array.isArray(participant.assignedCardIds)
	? [...participant.assignedCardIds]
	: [];

  if (!assignedIds.length) {
	const assigned = getOrAssignRandomCards(session, participant, allDeckCards);
	return {
	  replaced: null,
	  newCard: assigned[0] || null,
	  cards: assigned
	};
  }

  const replaceIndex = assignedIds.indexOf(currentCardId);
  if (replaceIndex === -1) {
	return {
	  replaced: null,
	  newCard: null,
	  cards: allDeckCards.filter((card) => assignedIds.includes(card.id))
	};
  }

  const availablePool = allDeckCards.filter(
	(card) => !assignedIds.includes(card.id)
  );

  if (!availablePool.length) {
	return {
	  replaced: null,
	  newCard: null,
	  cards: allDeckCards.filter((card) => assignedIds.includes(card.id))
	};
  }

  const newCard = availablePool[Math.floor(Math.random() * availablePool.length)];

  assignedIds[replaceIndex] = newCard.id;
  participant.assignedCardIds = assignedIds;

  return {
	replaced: currentCardId,
	newCard,
	cards: allDeckCards.filter((card) => assignedIds.includes(card.id))
  };
}

function getParticipantActiveCard(sessionId, participantId) {
  return screenCards.find(
	(item) =>
	  item.sessionId === sessionId &&
	  item.participantId === participantId &&
	  item.isActive
  );
}

async function joinByPin(req, res) {
  try {
	const { name, pinCode, source } = req.body;

	if (!name || !pinCode) {
	  return res.status(400).json({
		success: false,
		message: 'Введите имя и PIN'
	  });
	}

	const session = await getLiveSessionByPin(pinCode);

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

await pool.query(
	  `
	  INSERT INTO participants (
		id,
		session_id,
		display_name,
		source,
		status,
		assigned_card_ids,
		joined_at,
		last_seen_at
	  )
	  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	  `,
	  [
		participant.id,
		participant.sessionId,
		participant.displayName,
		participant.source,
		participant.status,
		participant.assignedCardIds,
		participant.joinedAt,
		participant.lastSeenAt
	  ]
	);

	return res.status(201).json({
	  success: true,
	  message: 'Участник вошёл в сессию',
	  participant,
	  session
	});
  } catch (error) {
	console.error('joinByPin error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка входа в сессию'
	});
  }
}

async function getPlayerSession(req, res) {
  try {
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

	const session = await getSessionById(participant.sessionId);

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
  } catch (error) {
	console.error('getPlayerSession error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка получения сессии'
	});
  }
}

async function getPlayerCards(req, res) {
  try {
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

	const session = await getSessionById(participant.sessionId);

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

	const deck = await getDeckById(session.settings?.deckId);

	if (!deck) {
	  return res.status(404).json({
		success: false,
		message: 'Колода не найдена'
	  });
	}

	const allCards = await getDeckCardsByDeckId(deck.id);

	let availableCards = allCards;

	if (session.settings?.cardMode === 'random_subset') {
	  availableCards = getOrAssignRandomCards(session, participant, allCards);
	}

	const activeScreenCard = getParticipantActiveCard(session.id, participant.id);

	return res.json({
	  success: true,
	  deck,
	  cards: availableCards,
	  activeScreenCard: activeScreenCard || null
	});
  } catch (error) {
	console.error('getPlayerCards error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка получения карт'
	});
  }
}

async function showCard(req, res) {
  try {
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

	const session = await getSessionById(participant.sessionId);

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

	const deck = await getDeckById(session.settings?.deckId);
	if (!deck) {
	  return res.status(404).json({
		success: false,
		message: 'Колода не найдена'
	  });
	}

	const allDeckCards = await getDeckCardsByDeckId(deck.id);
	const card = allDeckCards.find((item) => item.id === cardId);

	if (!card) {
	  return res.status(404).json({
		success: false,
		message: 'Карта не найдена'
	  });
	}

	const settings = session.settings || {};
	const maxCardsOnScreen = Math.max(1, Number(settings.maxCardsOnScreen || 1));

	if (settings.cardMode === 'random_subset') {
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
	  existingParticipantCard.imageUrl = card.image_url || card.imageUrl;
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
	  imageUrl: card.image_url || card.imageUrl,
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
  } catch (error) {
	console.error('showCard error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка отправки карты'
	});
  }
}

async function recallCard(req, res) {
  try {
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

	const session = await getSessionById(participant.sessionId);

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
  } catch (error) {
	console.error('recallCard error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка отзыва карты'
	});
  }
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

async function heartbeat(req, res) {
  try {
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

	const session = await getSessionById(participant.sessionId);

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
  } catch (error) {
	console.error('heartbeat error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка heartbeat'
	});
  }
}

function sendReaction(req, res) {
  const { participantId } = req.params;
  const { emoji } = req.body;

  const participant = participants.find(
	(p) => p.id === participantId && p.status === 'active'
  );

  if (!participant) {
	return res.status(404).json({
	  success: false,
	  message: 'Участник не найден'
	});
  }

  const allowed = ['❤️', '👍', '😂'];
  if (!allowed.includes(emoji)) {
	return res.status(400).json({
	  success: false,
	  message: 'Недопустимая реакция'
	});
  }

  reactions.push({
	id: `r_${Date.now()}_${Math.random()}`,
	sessionId: participant.sessionId,
	participantId,
	emoji,
	createdAt: new Date().toISOString(),
	isProcessed: false
  });

  return res.json({
	success: true
  });
}

async function replaceBlindCard(req, res) {
  try {
	const { participantId } = req.params;
	const { currentCardId } = req.body;

	const participant = participants.find(
	  (item) => item.id === participantId && item.status === 'active'
	);

	if (!participant) {
	  return res.status(404).json({
		success: false,
		message: 'Участник не найден или не активен'
	  });
	}

	const session = await getSessionById(participant.sessionId);

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

	const settings = session.settings || {};

	if (settings.cardMode !== 'random_subset') {
	  return res.status(400).json({
		success: false,
		message: 'Замена карты доступна только в режиме "Вслепую"'
	  });
	}

	if (!settings.replaceCardEnabled) {
	  return res.status(400).json({
		success: false,
		message: 'Замена карты отключена ведущим'
	  });
	}

	if (!currentCardId) {
	  return res.status(400).json({
		success: false,
		message: 'Не указана текущая карта'
	  });
	}

	const deck = await getDeckById(session.settings?.deckId);

	if (!deck) {
	  return res.status(404).json({
		success: false,
		message: 'Колода не найдена'
	  });
	}

	const allDeckCards = await getDeckCardsByDeckId(deck.id);

	const result = replaceRandomAssignedCard(
	  session,
	  participant,
	  currentCardId,
	  allDeckCards
	);

	if (!result.newCard) {
	  return res.status(400).json({
		success: false,
		message: 'Не удалось заменить карту'
	  });
	}

	touchParticipant(participant);

	return res.json({
	  success: true,
	  message: 'Карта заменена',
	  newCard: result.newCard,
	  cards: result.cards
	});
  } catch (error) {
	console.error('replaceBlindCard error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка замены карты'
	});
  }
}

module.exports = {
  joinByPin,
  getPlayerSession,
  getPlayerCards,
  showCard,
  recallCard,
  leaveSession,
  heartbeat,
  cleanupStaleParticipants,
  sendReaction,
  replaceBlindCard
};