const pool = require('../config/db');
const { questionStates } = require('../data/db');

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
  const questions = Array.isArray(session.settings?.questions)
    ? session.settings.questions
    : [];

  if (questions.length === 0) {
    state.currentQuestionIndex = 0;
    return {
      questions,
      currentQuestionIndex: 0,
      currentQuestion: null
    };
  }

  if (state.currentQuestionIndex < 0) state.currentQuestionIndex = 0;
  if (state.currentQuestionIndex > questions.length - 1) {
    state.currentQuestionIndex = questions.length - 1;
  }

  return {
    questions,
    currentQuestionIndex: state.currentQuestionIndex,
    currentQuestion: questions[state.currentQuestionIndex] || null
  };
}

async function getSession(req, res) {
  const result = await pool.query(
    `SELECT * FROM sessions WHERE id = $1 LIMIT 1`,
    [req.params.id]
  );

  const session = result.rows[0];

  if (!session) {
    res.status(404).json({
      success: false,
      message: 'Сессия не найдена'
    });
    return null;
  }

  return session;
}

async function getQuestions(req, res) {
  const session = await getSession(req, res);
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

async function nextQuestion(req, res) {
  const session = await getSession(req, res);
  if (!session) return;

  const state = ensureQuestionState(session);

  const questions = session.settings?.questions || [];

  if (questions.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Нет вопросов'
    });
  }

  if (state.currentQuestionIndex < questions.length - 1) {
    state.currentQuestionIndex++;
  }

  const result = normalizeQuestionState(session, state);

  return res.json({
    success: true,
    ...result
  });
}

async function prevQuestion(req, res) {
  const session = await getSession(req, res);
  if (!session) return;

  const state = ensureQuestionState(session);

  if (state.currentQuestionIndex > 0) {
    state.currentQuestionIndex--;
  }

  const result = normalizeQuestionState(session, state);

  return res.json({
    success: true,
    ...result
  });
}

module.exports = {
  getQuestions,
  nextQuestion,
  prevQuestion
};