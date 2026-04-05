const pool = require('../config/db');
const { broadcastToSession } = require('../realtime/ws');

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

async function makeUniqueDisplayName(sessionId, rawName) {
  const baseName = String(rawName || '').trim().replace(/\s+/g, ' ');

  const result = await pool.query(
	`
	SELECT display_name
	FROM participants
	WHERE session_id = $1
	  AND status = 'active'
	`,
	[sessionId]
  );

  const activeNames = result.rows.map((item) => normalizeName(item.display_name));

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

async function getParticipantById(participantId) {
  const result = await pool.query(
	`
	SELECT *
	FROM participants
	WHERE id = $1
	LIMIT 1
	`,
	[participantId]
  );

  return result.rows[0] || null;
}

async function updateParticipantFields(participantId, fields) {
  const keys = Object.keys(fields);

  if (!keys.length) return;

  const setParts = keys.map((key, index) => `${key} = $${index + 2}`);
  const values = keys.map((key) => fields[key]);

  await pool.query(
	`
	UPDATE participants
	SET ${setParts.join(', ')}
	WHERE id = $1
	`,
	[participantId, ...values]
  );
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

function formatDeck(deck) {
  if (!deck) return null;

  return {
	id: deck.id,
	title: deck.title,
	description: deck.description,
	backImageUrl: deck.back_image_url
  };
}

function formatDeckCard(card) {
  return {
	id: card.id,
	deckId: card.deck_id,
	title: card.title,
	imageUrl: card.image_url,
	sortOrder: card.sort_order
  };
}

async function startOrRestartTimer(session) {
  if (!session.settings?.timerEnabled) {
	return null;
  }

  const durationSeconds = (session.settings.timerMinutes || 3) * 60;
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + durationSeconds * 1000);

  const result = await pool.query(
	`
	INSERT INTO timer_states (
	  session_id,
	  duration_seconds,
	  started_at,
	  ends_at,
	  state,
	  updated_at
	)
	VALUES ($1, $2, $3, $4, 'running', now())
	ON CONFLICT (session_id)
	DO UPDATE SET
	  duration_seconds = EXCLUDED.duration_seconds,
	  started_at = EXCLUDED.started_at,
	  ends_at = EXCLUDED.ends_at,
	  state = 'running',
	  updated_at = now()
	RETURNING *
	`,
	[
	  session.id,
	  durationSeconds,
	  startedAt,
	  endsAt
	]
  );

  return result.rows[0];
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

async function getParticipantActiveCard(sessionId, participantId) {
  const result = await pool.query(
	`
	SELECT *
	FROM screen_cards
	WHERE session_id = $1
	  AND participant_id = $2
	  AND is_active = true
	ORDER BY shown_at DESC
	LIMIT 1
	`,
	[sessionId, participantId]
  );

  if (!result.rows[0]) return null;

  const row = result.rows[0];

  return {
	id: row.id,
	sessionId: row.session_id,
	participantId: row.participant_id,
	participantName: row.participant_name,
	deckCardId: row.deck_card_id,
	imageUrl: row.image_url,
	isActive: row.is_active,
	shownAt: row.shown_at,
	updatedAt: row.updated_at,
	removedAt: row.removed_at
  };
}

function cleanupStaleParticipants(sessionId = null) {
  (async () => {
	const params = ['active'];
	let query = `
	  SELECT id, session_id, last_seen_at, joined_at
	  FROM participants
	  WHERE status = $1
	`;

	if (sessionId) {
	  params.push(sessionId);
	  query += ` AND session_id = $2`;
	}

	const result = await pool.query(query, params);
	const now = Date.now();

	for (const participant of result.rows) {
	  const lastSeen = participant.last_seen_at || participant.joined_at;
	  if (!lastSeen) continue;

	  const diff = now - new Date(lastSeen).getTime();

	  if (diff > PARTICIPANT_HEARTBEAT_TTL_MS) {
		await pool.query(
		  `
		  UPDATE participants
		  SET status = 'left',
			  left_at = now(),
			  leave_reason = 'timeout'
		  WHERE id = $1
		  `,
		  [participant.id]
		);

		await pool.query(
		  `
		  UPDATE screen_cards
		  SET is_active = false,
			  removed_at = now()
		  WHERE participant_id = $1
			AND session_id = $2
			AND is_active = true
		  `,
		  [participant.id, participant.session_id]
		);
		broadcastToSession(participant.session_id, { type: 'participant_left' });
		broadcastToSession(participant.session_id, { type: 'card_removed' });
	  }
	}
  })().catch((error) => {
	console.error('cleanupStaleParticipants error:', error);
  });
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
	  displayName: await makeUniqueDisplayName(session.id, name),
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

// Сообщаем экрану, что зашел новый участник
	broadcastToSession(session.id, {
	  type: 'participant_joined',
	  participantId: participant.id,
	  displayName: participant.displayName
	});

	return res.status(201).json({
	  success: true,
	  message: 'Участник вошёл в сессию',
	  participant,
	  session: formatSession(session)
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

	const participant = await getParticipantById(participantId);

	if (!participant || participant.status !== 'active') {
	  return res.status(404).json({
		success: false,
		message: 'Участник не найден или не активен'
	  });
	}

	const session = await getSessionById(participant.session_id);

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	if (session.status !== 'live') {
	  await updateParticipantFields(participant.id, {
		status: 'left',
		left_at: nowIso(),
		leave_reason: 'session_inactive'
	  });

	  return res.status(403).json({
		success: false,
		message: 'Сессия больше не активна'
	  });
	}

	await updateParticipantFields(participant.id, {
	  last_seen_at: nowIso()
	});

	return res.json({
	  success: true,
	  participant: {
		id: participant.id,
		sessionId: participant.session_id,
		displayName: participant.display_name,
		source: participant.source,
		status: participant.status,
		joinedAt: participant.joined_at,
		lastSeenAt: nowIso()
	  },
	  session: formatSession(session)
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

	const participant = await getParticipantById(participantId);

	if (!participant || participant.status !== 'active') {
	  return res.status(404).json({
		success: false,
		message: 'Участник не найден или не активен'
	  });
	}

	const session = await getSessionById(participant.session_id);

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	if (session.status !== 'live') {
	  await updateParticipantFields(participant.id, {
		status: 'left',
		left_at: nowIso(),
		leave_reason: 'session_inactive'
	  });

	  return res.status(403).json({
		success: false,
		message: 'Сессия больше не активна'
	  });
	}

	await updateParticipantFields(participant.id, {
	  last_seen_at: nowIso()
	});

	const deck = await getDeckById(session.settings?.deckId);

	if (!deck) {
	  return res.status(404).json({
		success: false,
		message: 'Колода не найдена'
	  });
	}

	const allCards = await getDeckCardsByDeckId(deck.id);

	let availableCards = allCards;

	const participantForLogic = {
	  id: participant.id,
	  sessionId: participant.session_id,
	  displayName: participant.display_name,
	  status: participant.status,
	  assignedCardIds: Array.isArray(participant.assigned_card_ids)
		? participant.assigned_card_ids
		: []
	};

	if (session.settings?.cardMode === 'random_subset') {
	  availableCards = getOrAssignRandomCards(session, participantForLogic, allCards);

	  await updateParticipantFields(participant.id, {
		assigned_card_ids: participantForLogic.assignedCardIds
	  });
	}

	const activeScreenCard = await getParticipantActiveCard(session.id, participant.id);

	return res.json({
	  success: true,
	  deck: formatDeck(deck),
	  cards: availableCards.map(formatDeckCard),
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

	// 🔥 ОБЪЕДИНЁННЫЙ ЗАПРОС
	const dataResult = await pool.query(
	  `
	  SELECT 
		p.id as participant_id,
		p.display_name,
		p.status as participant_status,
		p.session_id,
	
		s.id as session_id,
		s.status as session_status,
		s.settings,
	
		d.id as deck_id,
		d.is_active as deck_active
	
	  FROM participants p
	  JOIN sessions s ON s.id = p.session_id
	  LEFT JOIN decks d ON d.id = (s.settings->>'deckId')
	
	  WHERE p.id = $1
	  LIMIT 1
	  `,
	  [participantId]
	);

	const data = dataResult.rows[0];

	if (!data || data.participant_status !== 'active') {
	  return res.status(404).json({
		success: false,
		message: 'Участник не найден или не активен'
	  });
	}

	if (data.session_status !== 'live') {
	  return res.status(403).json({
		success: false,
		message: 'Сессия больше не активна'
	  });
	}

	if (!data.deck_id || !data.deck_active) {
	  return res.status(404).json({
		success: false,
		message: 'Колода не найдена'
	  });
	}

	// 🔥 ПОЛУЧАЕМ КАРТУ (у тебя уже оптимизировано)
	const cardResult = await pool.query(
	  `
	  SELECT *
	  FROM deck_cards
	  WHERE id = $1
		AND deck_id = $2
		AND is_active = true
	  LIMIT 1
	  `,
	  [cardId, data.deck_id]
	);

	const card = cardResult.rows[0];

	if (!card) {
	  return res.status(404).json({
		success: false,
		message: 'Карта не найдена'
	  });
	}

	const settings = data.settings || {};
	const maxCardsOnScreen = Math.max(1, Number(settings.maxCardsOnScreen || 1));

	// 🔥 АКТИВНЫЕ КАРТЫ (у тебя уже оптимизировано)
	const activeCardsResult = await pool.query(
	  `
	  SELECT id, participant_id
	  FROM screen_cards
	  WHERE session_id = $1
		AND is_active = true
	  ORDER BY shown_at ASC
	  `,
	  [data.session_id]
	);

	const activeCards = activeCardsResult.rows;

	const existingCard = activeCards.find(
	  (c) => c.participant_id === data.participant_id
	);

	// 🔥 ОБНОВЛЕНИЕ КАРТЫ
	if (existingCard) {
	  const result = await pool.query(
		`
		UPDATE screen_cards
		SET deck_card_id = $1,
			image_url = $2,
			participant_name = $3,
			updated_at = now()
		WHERE id = $4
		RETURNING *
		`,
		[
		  card.id,
		  card.image_url,
		  data.display_name,
		  existingCard.id
		]
	  );

	  startOrRestartTimer({ id: data.session_id, settings: data.settings }).catch(console.error);

	  const response = {
		success: true,
		message: 'Карта обновлена',
		screenCard: result.rows[0],
		timer: null
	  };

	  broadcastToSession(data.session_id, {
		type: 'card_updated'
	  });

	  return res.json(response);
	}

	// 🔥 УДАЛЕНИЕ СТАРОЙ КАРТЫ (если лимит)
	if (activeCards.length >= maxCardsOnScreen) {
	  const oldest = activeCards[0];

	  await pool.query(
		`
		UPDATE screen_cards
		SET is_active = false,
			removed_at = now()
		WHERE id = $1
		`,
		[oldest.id]
	  );
	}

	// 🔥 ВСТАВКА НОВОЙ КАРТЫ
	const newCardResult = await pool.query(
	  `
	  INSERT INTO screen_cards (
		id,
		session_id,
		participant_id,
		participant_name,
		deck_card_id,
		image_url,
		is_active,
		shown_at
	  )
	  VALUES ($1,$2,$3,$4,$5,$6,true,now())
	  RETURNING *
	  `,
	  [
		`sc_${Date.now()}`,
		data.session_id,
		data.participant_id,
		data.display_name,
		card.id,
		card.image_url
	  ]
	);

	startOrRestartTimer({ id: data.session_id, settings: data.settings }).catch(console.error);

	const response = {
	  success: true,
	  message: 'Карта показана',
	  screenCard: newCardResult.rows[0],
	  timer: null
	};

	broadcastToSession(data.session_id, {
	  type: 'card_shown'
	});

	return res.json(response);

  } catch (error) {
	console.error('showCard error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка показа карты'
	});
  }
}

async function recallCard(req, res) {
  try {
	const { participantId } = req.params;

	const participant = await getParticipantById(participantId);

	if (!participant || participant.status !== 'active') {
	  return res.status(404).json({
		success: false,
		message: 'Участник не найден или не активен'
	  });
	}

	const session = await getSessionById(participant.session_id);

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	if (session.status !== 'live') {
	  await updateParticipantFields(participant.id, {
		status: 'left',
		left_at: nowIso(),
		leave_reason: 'session_inactive'
	  });

	  return res.status(403).json({
		success: false,
		message: 'Сессия больше не активна'
	  });
	}

	await updateParticipantFields(participant.id, {
	  last_seen_at: nowIso()
	});

	const result = await pool.query(
	  `
	  UPDATE screen_cards
	  SET is_active = false,
		  removed_at = now()
	  WHERE participant_id = $1
		AND session_id = $2
		AND is_active = true
	  RETURNING *
	  `,
	  [participant.id, participant.session_id]
	);

	if (!result.rows.length) {
	  return res.status(404).json({
		success: false,
		message: 'Активная карта не найдена'
	  });
	}

broadcastToSession(participant.session_id, {
	  type: 'card_removed'
	});
	
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

async function leaveSession(req, res) {
  try {
	const { participantId } = req.params;

	const participant = await getParticipantById(participantId);

	if (!participant) {
	  return res.status(404).json({
		success: false,
		message: 'Участник не найден'
	  });
	}

	await updateParticipantFields(participant.id, {
	  status: 'left',
	  left_at: nowIso(),
	  leave_reason: 'manual_leave'
	});

	await pool.query(
	  `
	  UPDATE screen_cards
	  SET is_active = false,
		  removed_at = now()
	  WHERE participant_id = $1
		AND session_id = $2
		AND is_active = true
	  `,
	  [participant.id, participant.session_id]
	);

broadcastToSession(participant.session_id, {
	  type: 'participant_left'
	});
	
	return res.json({
	  success: true,
	  message: 'Участник вышел из сессии'
	});
  } catch (error) {
	console.error('leaveSession error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка выхода из сессии'
	});
  }
}

async function heartbeat(req, res) {
  try {
	const { participantId } = req.params;

	const participant = await getParticipantById(participantId);

	if (!participant || participant.status !== 'active') {
	  return res.status(404).json({
		success: false,
		message: 'Участник не найден или не активен'
	  });
	}

	const session = await getSessionById(participant.session_id);

	if (!session || session.status !== 'live') {
	  await updateParticipantFields(participant.id, {
		status: 'left',
		left_at: nowIso(),
		leave_reason: 'session_inactive'
	  });

	  return res.status(403).json({
		success: false,
		message: 'Сессия больше не активна'
	  });
	}

	await updateParticipantFields(participant.id, {
	  last_seen_at: nowIso()
	});

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

async function sendReaction(req, res) {
  try {
	const { participantId } = req.params;
	const { emoji } = req.body;

	const participant = await getParticipantById(participantId);

	if (!participant || participant.status !== 'active') {
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

await pool.query(
	  `
	  INSERT INTO reactions (
		id,
		session_id,
		participant_id,
		emoji,
		is_processed,
		created_at
	  )
	  VALUES ($1, $2, $3, $4, false, now())
	  `,
	  [
		`r_${Date.now()}`,
		participant.session_id,
		participant.id,
		emoji
	  ]
	);

broadcastToSession(participant.session_id, {
	  type: 'reaction_added',
	  emoji
	});
	
	return res.json({
	  success: true
	});
  } catch (error) {
	console.error('sendReaction error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка отправки реакции'
	});
  }
}

async function replaceBlindCard(req, res) {
  try {
	const { participantId } = req.params;
	const { currentCardId } = req.body;

	const participant = await getParticipantById(participantId);

	if (!participant || participant.status !== 'active') {
	  return res.status(404).json({
		success: false,
		message: 'Участник не найден или не активен'
	  });
	}

	const session = await getSessionById(participant.session_id);

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	if (session.status !== 'live') {
	  await updateParticipantFields(participant.id, {
		status: 'left',
		left_at: nowIso(),
		leave_reason: 'session_inactive'
	  });

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

	const participantForLogic = {
	  id: participant.id,
	  sessionId: participant.session_id,
	  displayName: participant.display_name,
	  status: participant.status,
	  assignedCardIds: participant.assigned_card_ids || []
	};

	const result = replaceRandomAssignedCard(
	  session,
	  participantForLogic,
	  currentCardId,
	  allDeckCards
	);

	if (!result.newCard) {
	  return res.status(400).json({
		success: false,
		message: 'Не удалось заменить карту'
	  });
	}

	await updateParticipantFields(participant.id, {
	  assigned_card_ids: participantForLogic.assignedCardIds,
	  last_seen_at: nowIso()
	});

broadcastToSession(participant.session_id, {
	  type: 'card_replaced'
	});
	
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

function formatSession(session) {
  if (!session) return null;

  return {
	id: session.id,
	title: session.title,
	pinCode: session.pin_code,
	status: session.status,
	settings: session.settings || {},
	createdAt: session.created_at,
	updatedAt: session.updated_at,
	startedAt: session.started_at
  };
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