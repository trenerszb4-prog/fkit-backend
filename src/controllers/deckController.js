const pool = require('../config/db');

// ================= GET ALL DECKS =================

async function getDecks(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM decks WHERE is_active = true ORDER BY created_at DESC`
    );

    return res.json({
      success: true,
      decks: result.rows
    });
  } catch (error) {
    console.error('Ошибка getDecks:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка получения колод'
    });
  }
}

// ================= GET CARDS BY DECK =================

async function getDeckCards(req, res) {
  try {
    const result = await pool.query(
      `
      SELECT * FROM deck_cards
      WHERE deck_id = $1 AND is_active = true
      ORDER BY sort_order ASC
      `,
      [req.params.deckId]
    );

    return res.json({
      success: true,
      cards: result.rows
    });
  } catch (error) {
    console.error('Ошибка getDeckCards:', error);
    return res.status(500).json({
      success: false
    });
  }
}

module.exports = {
  getDecks,
  getDeckCards
};