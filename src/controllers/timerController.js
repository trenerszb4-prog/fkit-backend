const { sessions, timerStates } = require('../data/db');

function getTimerVisualState(timer) {
  const now = Date.now();

  if (!timer || timer.state === 'idle') {
	return 'idle';
  }

  if (timer.endsAt && now >= new Date(timer.endsAt).getTime()) {
	return 'expired';
  }

  return 'running';
}

function getTimerBySessionId(sessionId) {
  return timerStates.find((item) => item.sessionId === sessionId);
}

function getSessionTimer(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

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
		durationSeconds: (session.settings.timerMinutes || 3) * 60,
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
}

module.exports = {
  getSessionTimer,
  getTimerBySessionId,
  getTimerVisualState
};