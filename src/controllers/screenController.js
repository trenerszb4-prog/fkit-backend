const pool = require('../config/db');
const { participants, screenCards, reactions } = require('../data/db');

// ================= GET SCREEN =================

async function getScreen(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM sessions WHERE id = $1`,
      [req.params.id]
    );

    const session = result.rows[0];

    if (!session) {
      return res.status(404).json({ success: false });
    }

    const activeCards = screenCards.filter(
      c => c.sessionId === session.id && c.isActive
    );

    return res.json({
      success: true,
      session,
      screenCards: activeCards,
      participants: participants.filter(p => p.sessionId === session.id)
    });
  } catch {
    return res.status(500).json({ success: false });
  }
}

// ================= CLEAR =================

function clearScreen(req, res) {
  screenCards.forEach(c => {
    if (c.sessionId === req.params.id) c.isActive = false;
  });

  return res.json({ success: true });
}

// ================= REACTIONS =================

function getScreenReactions(req, res) {
  const list = reactions.filter(r => r.sessionId === req.params.id && !r.isProcessed);

  list.forEach(r => (r.isProcessed = true));

  return res.json({
    success: true,
    reactions: list
  });
}

module.exports = {
  getScreen,
  clearScreen,
  getScreenReactions
};