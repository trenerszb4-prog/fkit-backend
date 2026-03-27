const pool = require('../config/db');
const { timerStates } = require('../data/db');

function getTimerVisualState(timer) {
  const now = Date.now();

  if (!timer || timer.state === 'idle') return 'idle';

  if (timer.endsAt && now >= new Date(timer.endsAt).getTime()) {
	return 'expired';
  }

  return 'running';
}

function getTimerBySessionId(sessionId) {
  return timerStates.find((item) => item.sessionId === sessionId);
}

async function getSessionTimer(req, res) {
  try {
	const result = await pool.query(
	  `SELECT * FROM sessions WHERE id = $1 LIMIT 1`,
	  [req.params.id]
	);

	const session = result.rows[0];

	if (!session) {
	  return res.status(404).json({
		success: false,
		message: 'Сессия не найдена'
	  });
	}

	const timer = getTimerBySessionId(session.id);

	if (!timer) {
	  return res.json({
		success: true,
		timer: {
		  sessionId: session.id,
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
		...timer,
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
  getTimerBySessionId,
  getTimerVisualState
};