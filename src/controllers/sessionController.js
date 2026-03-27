const pool = require('../config/db');
const { getServiceByCode } = require('../utils/services');
const { generateUniquePinCode } = require('../utils/pin');
const { participants, screenCards, timerStates, questionStates } = require('../data/db');
const { cleanupStaleParticipants } = require('./playerController');

const USER_ID = '1150c796-2de8-4cff-bff8-6377398f7796';

// ================= GET ALL =================

async function getSessions(req, res) {
  try {
	const result = await pool.query(
	  `
	  SELECT s.*, sv.code AS service_type
	  FROM sessions s
	  JOIN services sv ON sv.id = s.service_id
	  WHERE s.user_id = $1
	  ORDER BY s.created_at DESC
	  `,
	  [USER_ID]
	);

	return res.json({
	  success: true,
	  sessions: result.rows
	});
  } catch (error) {
	console.error(error);
	return res.status(500).json({ success: false });
  }
}

// ================= CREATE =================

async function createSession(req, res) {
  try {
	const { title, serviceType = 'cards', settings } = req.body;

	if (!title) {
	  return res.status(400).json({ success: false });
	}

	const service = await getServiceByCode(serviceType);

	const pinCode = await generateUniquePinCode();
	const sessionId = `s_${Date.now()}`;

	const result = await pool.query(
	  `
	  INSERT INTO sessions (id, user_id, service_id, title, pin_code, status, settings)
	  VALUES ($1, $2, $3, $4, $5, 'scheduled', $6)
	  RETURNING *
	  `,
	  [
		sessionId,
		USER_ID,
		service.id,
		title,
		pinCode,
		JSON.stringify(settings || {})
	  ]
	);

	return res.json({
	  success: true,
	  session: result.rows[0]
	});
  } catch (e) {
	console.error(e);
	return res.status(500).json({ success: false });
  }
}

// ================= GET ONE =================

async function getSessionById(req, res) {
  try {
	const result = await pool.query(
	  `SELECT * FROM sessions WHERE id = $1 AND user_id = $2`,
	  [req.params.id, USER_ID]
	);

	if (!result.rows[0]) {
	  return res.status(404).json({ success: false, message: 'Сессия не найдена' });
	}

	return res.json({
	  success: true,
	  session: result.rows[0]
	});
  } catch (e) {
	return res.status(500).json({ success: false });
  }
}

// ================= UPDATE =================

async function updateSession(req, res) {
  try {
	const { title, settings } = req.body;

	const result = await pool.query(
	  `
	  UPDATE sessions
	  SET title = COALESCE($1, title),
		  settings = COALESCE($2, settings),
		  updated_at = NOW()
	  WHERE id = $3
	  RETURNING *
	  `,
	  [title, settings ? JSON.stringify(settings) : null, req.params.id]
	);

	return res.json({ success: true, session: result.rows[0] });
  } catch (e) {
	return res.status(500).json({ success: false });
  }
}

// ================= SCHEDULE =================

async function scheduleSession(req, res) {
  try {
	const result = await pool.query(
	  `UPDATE sessions SET status = 'scheduled' WHERE id = $1 RETURNING *`,
	  [req.params.id]
	);

	return res.json({ success: true, session: result.rows[0] });
  } catch (e) {
	return res.status(500).json({ success: false });
  }
}

// ================= START =================

async function startSession(req, res) {
  try {
	// очищаем runtime данные
	for (let i = participants.length - 1; i >= 0; i--) {
	  if (participants[i].sessionId === req.params.id) participants.splice(i, 1);
	}

	const result = await pool.query(
	  `
	  UPDATE sessions
	  SET status = 'live', started_at = NOW()
	  WHERE id = $1
	  RETURNING *
	  `,
	  [req.params.id]
	);

	return res.json({ success: true, session: result.rows[0] });
  } catch (e) {
	return res.status(500).json({ success: false });
  }
}

// ================= PARTICIPANTS =================

async function getSessionParticipants(req, res) {
  try {
	cleanupStaleParticipants(req.params.id);

	const list = participants.filter(
	  p => p.sessionId === req.params.id && p.status === 'active'
	);

	return res.json({ success: true, participants: list });
  } catch (e) {
	return res.status(500).json({ success: false });
  }
}

// ================= DELETE =================

async function deleteSession(req, res) {
  try {
	await pool.query(`DELETE FROM sessions WHERE id = $1`, [req.params.id]);

	return res.json({ success: true });
  } catch (e) {
	return res.status(500).json({ success: false });
  }
}

// ================= EXPORT =================

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