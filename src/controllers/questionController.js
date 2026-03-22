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

function normalizeQuestionState(session, state) {
  const questions = Array.isArray(session.questions) ? session.questions : [];

  if (questions.length === 0) {
	state.currentQuestionIndex = 0;
	return {
	  questions,
	  currentQuestionIndex: 0,
	  currentQuestion: null
	};
  }

  if (state.currentQuestionIndex < 0) {
	state.currentQuestionIndex = 0;
  }

  if (state.currentQuestionIndex > questions.length - 1) {
	state.currentQuestionIndex = questions.length - 1;
  }

  return {
	questions,
	currentQuestionIndex: state.currentQuestionIndex,
	currentQuestion: questions[state.currentQuestionIndex] || null
  };
}

function getSessionForScreenQuestions(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (!session) {
	res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
	return null;
  }

  return session;
}

function getQuestions(req, res) {
  const session = getSessionForScreenQuestions(req, res);
  if (!session) return;

  const state = ensureQuestionState(session);
  const result = normalizeQuestionState(session, state);

  return res.json({
	success: true,
	questions: result.questions,
	currentQuestionIndex: result.currentQuestionIndex,
	currentQuestion: result.currentQuestion
  });
}

function nextQuestion(req, res) {
  const session = getSessionForScreenQuestions(req, res);
  if (!session) return;

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

  const result = normalizeQuestionState(session, state);

  return res.json({
	success: true,
	questions: result.questions,
	currentQuestionIndex: result.currentQuestionIndex,
	currentQuestion: result.currentQuestion
  });
}

function prevQuestion(req, res) {
  const session = getSessionForScreenQuestions(req, res);
  if (!session) return;

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

  const result = normalizeQuestionState(session, state);

  return res.json({
	success: true,
	questions: result.questions,
	currentQuestionIndex: result.currentQuestionIndex,
	currentQuestion: result.currentQuestion
  });
}

module.exports = {
  getQuestions,
  nextQuestion,
  prevQuestion
};