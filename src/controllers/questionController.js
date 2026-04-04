const pool = require('../config/db');

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

async function getOrCreateQuestionState(sessionId) {
  await pool.query(
    `
    INSERT INTO question_states (session_id, current_index, updated_at)
    VALUES ($1, 0, NOW())
    ON CONFLICT (session_id) DO NOTHING
    `,
    [sessionId]
  );

  const result = await pool.query(
    `
    SELECT *
    FROM question_states
    WHERE session_id = $1
    LIMIT 1
    `,
    [sessionId]
  );

  return result.rows[0] || null;
}

function normalizeQuestionState(session, stateRow) {
  const questions = Array.isArray(session.settings?.questions)
    ? session.settings.questions
    : [];

  let currentQuestionIndex = Number(stateRow?.current_index ?? 0);

  if (questions.length === 0) {
    currentQuestionIndex = 0;

    return {
      questions,
      currentQuestionIndex,
      currentQuestion: null
    };
  }

  if (currentQuestionIndex < 0) currentQuestionIndex = 0;
  if (currentQuestionIndex > questions.length - 1) {
    currentQuestionIndex = questions.length - 1;
  }

  return {
    questions,
    currentQuestionIndex,
    currentQuestion: questions[currentQuestionIndex] || null
  };
}

async function saveQuestionIndex(sessionId, index) {
  await pool.query(
    `
    UPDATE question_states
    SET current_index = $2,
        updated_at = NOW()
    WHERE session_id = $1
    `,
    [sessionId, index]
  );
}

async function getQuestions(req, res) {
  try {
    const session = await getSession(req, res);
    if (!session) return;

    const state = await getOrCreateQuestionState(session.id);
    const normalized = normalizeQuestionState(session, state);

    if (state && normalized.currentQuestionIndex !== state.current_index) {
      await saveQuestionIndex(session.id, normalized.currentQuestionIndex);
    }

    return res.json({
      success: true,
      questions: normalized.questions,
      currentQuestionIndex: normalized.currentQuestionIndex,
      currentQuestion: normalized.currentQuestion
    });
  } catch (error) {
    console.error('getQuestions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка получения вопросов'
    });
  }
}

async function nextQuestion(req, res) {
  try {
    const session = await getSession(req, res);
    if (!session) return;

    const state = await getOrCreateQuestionState(session.id);
    const normalized = normalizeQuestionState(session, state);

    if (!normalized.questions.length) {
      return res.status(400).json({
        success: false,
        message: 'Нет вопросов'
      });
    }

    let nextIndex = normalized.currentQuestionIndex;

    if (nextIndex < normalized.questions.length - 1) {
      nextIndex += 1;
    }

    await saveQuestionIndex(session.id, nextIndex);

    return res.json({
      success: true,
      questions: normalized.questions,
      currentQuestionIndex: nextIndex,
      currentQuestion: normalized.questions[nextIndex] || null
    });
  } catch (error) {
    console.error('nextQuestion error:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка переключения вопроса'
    });
  }
}

async function prevQuestion(req, res) {
  try {
    const session = await getSession(req, res);
    if (!session) return;

    const state = await getOrCreateQuestionState(session.id);
    const normalized = normalizeQuestionState(session, state);

    let prevIndex = normalized.currentQuestionIndex;

    if (prevIndex > 0) {
      prevIndex -= 1;
    }

    await saveQuestionIndex(session.id, prevIndex);

    return res.json({
      success: true,
      questions: normalized.questions,
      currentQuestionIndex: prevIndex,
      currentQuestion: normalized.questions[prevIndex] || null
    });
  } catch (error) {
    console.error('prevQuestion error:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка переключения вопроса'
    });
  }
}

module.exports = {
  getQuestions,
  nextQuestion,
  prevQuestion
};