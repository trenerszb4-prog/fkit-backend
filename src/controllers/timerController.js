const pool = require('../config/db');

function getTimerVisualState(timer) {
  const now = Date.now();

  if (!timer || timer.state === 'idle') return 'idle';

  if (timer.ends_at && now >= new Date(timer.ends_at).getTime()) {
	return 'expired';
  }

  return 'running';
}

async function getSessionTimer(req, res) {
  try {
	const sessionId = req.params.id;

	const sessionResult = await pool.query(
	  `SELECT * FROM sessions WHERE id = $1 LIMIT 1`,
	  [sessionId]
	);

	const session = sessionResult.rows[0];

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	const timerResult = await pool.query(
	  `SELECT * FROM timer_states WHERE session_id = $1 LIMIT 1`,
	  [sessionId]
	);

	const timer = timerResult.rows[0];

	if (!timer) {
	  return res.json({
		success: true,
		timer: {
		  sessionId,
		  durationSeconds: (session.settings?.timerMinutes || 3) * 60,
		  startedAt: null,
		  endsAt: null,
		  state: 'idle',
		  visualState: 'idle'
		}
	  });
	}

	return res.json({
	  success: true,
	  timer: {
		id: timer.id,
		sessionId: timer.session_id,
		durationSeconds: timer.duration_seconds,
		startedAt: timer.started_at,
		endsAt: timer.ends_at,
		state: timer.state,
		visualState: getTimerVisualState(timer)
	  }
	});

  } catch (error) {
	console.error('getSessionTimer error:', error);
	return res.status(500).json({ success: false });
  }
}

module.exports = {
  getSessionTimer,
  getTimerVisualState
};