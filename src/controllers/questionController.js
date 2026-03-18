const { sessions, questionStates } = require('../data/db');

function getQuestionState(sessionId) {
  return questionStates.find((item) => item.sessionId === sessionId);
}

function ensureQuestionState(session) {
  let state = getQuestionState(session.id);

  if (!state) {
	state = {
	  sessionId: session.id,
	  currentQuestionIndex: 0
	};
	questionStates.push(state);
  }

  return state;
}

function getQuestions(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  const questions = Array.isArray(session.questions) ? session.questions : [];
  const state = ensureQuestionState(session);

  const currentQuestion =
	questions.length > 0 ? questions[state.currentQuestionIndex] || null : null;

  return res.json({
	success: true,
	questions,
	currentQuestionIndex: state.currentQuestionIndex,
	currentQuestion
  });
}

function nextQuestion(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  const questions = Array.isArray(session.questions) ? session.questions : [];

  if (questions.length === 0) {
	return res.status(400).json({
	  success: false,
	  message: 'В сессии нет вопросов'
	});
  }

  const state = ensureQuestionState(session);

  if (state.currentQuestionIndex < questions.length - 1) {
	state.currentQuestionIndex += 1;
  }

  return res.json({
	success: true,
	currentQuestionIndex: state.currentQuestionIndex,
	currentQuestion: questions[state.currentQuestionIndex]
  });
}

function prevQuestion(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  const questions = Array.isArray(session.questions) ? session.questions : [];

  if (questions.length === 0) {
	return res.status(400).json({
	  success: false,
	  message: 'В сессии нет вопросов'
	});
  }

  const state = ensureQuestionState(session);

  if (state.currentQuestionIndex > 0) {
	state.currentQuestionIndex -= 1;
  }

  return res.json({
	success: true,
	currentQuestionIndex: state.currentQuestionIndex,
	currentQuestion: questions[state.currentQuestionIndex]
  });
}

module.exports = {
  getQuestions,
  nextQuestion,
  prevQuestion
};