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

// ================= SESSION FROM DB =================

async function getSessionByPin(pinCode) {
  const result = await pool.query(
	`SELECT * FROM sessions WHERE pin_code = $1 AND status = 'live' LIMIT 1`,
	[pinCode]
  );

  return result.rows[0] || null;
}

// ================= JOIN =================

async function joinByPin(req, res) {
  try {
	const { name, pinCode } = req.body;

	if (!name || !pinCode) {
	  return res.status(400).json({ success: false });
	}

	const session = await getSessionByPin(pinCode);

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	const participant = {
	  id: generateParticipantId(),
	  sessionId: session.id,
	  displayName: name,
	  status: 'active',
	  joinedAt: nowIso(),
	  lastSeenAt: nowIso(),
	  assignedCardIds: []
	};

	participants.push(participant);

const cardsResult = await pool.query(
	  `SELECT * FROM deck_cards WHERE deck_id = $1`,
	  [session.settings?.deckId]
	);
	
	return res.json({
	  success: true,
	  cards: cardsResult.rows,
	  session
	});
  } catch (e) {
	return res.status(500).json({ success: false });
  }
}

// ================= GET SESSION =================

async function getPlayerSession(req, res) {
  try {
	const participant = participants.find(p => p.id === req.params.participantId);

	if (!participant) {
	  return res.status(404).json({ success: false });
	}

	const result = await pool.query(
	  `SELECT * FROM sessions WHERE id = $1`,
	  [participant.sessionId]
	);

	const session = result.rows[0];

	if (!session || session.status !== 'live') {
	  return res.status(403).json({ success: false });
	}

	return res.json({
	  success: true,
	  participant,
	  session
	});
  } catch {
	return res.status(500).json({ success: false });
  }
}

// ================= CARDS =================

async function getPlayerCards(req, res) {
  try {
	const participant = participants.find(p => p.id === req.params.participantId);

	if (!participant) return res.status(404).json({ success: false });

	const result = await pool.query(
	  `SELECT * FROM sessions WHERE id = $1`,
	  [participant.sessionId]
	);

	const session = result.rows[0];

	if (!session) return res.status(404).json({ success: false });

	return res.json({
	  success: true,
	  cards: [], // временно
	  session
	});
  } catch {
	return res.status(500).json({ success: false });
  }
}

// ================= SHOW CARD =================

function showCard(req, res) {
  const participant = participants.find(p => p.id === req.params.participantId);

  if (!participant) return res.status(404).json({ success: false });

  const newCard = {
	id: `sc_${Date.now()}`,
	sessionId: participant.sessionId,
	participantId: participant.id,
	imageUrl: req.body.imageUrl,
	isActive: true,
	shownAt: nowIso()
  };

  screenCards.push(newCard);

  return res.json({
	success: true,
	screenCard: newCard
  });
}

// ================= HEARTBEAT =================

function heartbeat(req, res) {
  const participant = participants.find(p => p.id === req.params.participantId);

  if (!participant) return res.status(404).json({ success: false });

  participant.lastSeenAt = nowIso();

  return res.json({ success: true });
}

// ================= REACTIONS =================

function sendReaction(req, res) {
  const participant = participants.find(p => p.id === req.params.participantId);

  if (!participant) return res.status(404).json({ success: false });

  reactions.push({
	id: `r_${Date.now()}`,
	sessionId: participant.sessionId,
	emoji: req.body.emoji,
	isProcessed: false
  });

  return res.json({ success: true });
}

module.exports = {
  joinByPin,
  getPlayerSession,
  getPlayerCards,
  showCard,
  heartbeat,
  sendReaction
};