const pool = require('../config/db');
const { participants, screenCards, reactions } = require('../data/db');

function formatSession(session) {
  return {
    id: session.id,
    title: session.title,
    pinCode: session.pin_code,
    status: session.status,
    settings: session.settings || {},
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    startedAt: session.started_at
  };
}

async function getDeckById(deckId) {
  if (!deckId) return null;

  const result = await pool.query(
    `
    SELECT *
    FROM decks
    WHERE id = $1
      AND is_active = true
    LIMIT 1
    `,
    [deckId]
  );

  return result.rows[0] || null;
}

async function getScreen(req, res) {
  try {
    const sessionResult = await pool.query(
      `SELECT * FROM sessions WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );

    const session = sessionResult.rows[0];

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Сессия не найдена'
      });
    }

    const deck = await getDeckById(session.settings?.deckId);

    const activeCardsResult = await pool.query(
      `
      SELECT *
      FROM screen_cards
      WHERE session_id = $1
        AND is_active = true
      ORDER BY shown_at ASC
      `,
      [session.id]
    );

    const activeCards = activeCardsResult.rows.map((c) => ({
      id: c.id,
      sessionId: c.session_id,
      participantId: c.participant_id,
      participantName: c.participant_name,
      deckCardId: c.deck_card_id,
      imageUrl: c.image_url,
      isActive: c.is_active,
      shownAt: c.shown_at,
      updatedAt: c.updated_at,
      removedAt: c.removed_at
    }));

    const sessionParticipants = participants.filter(
      (p) => String(p.sessionId) === String(session.id) && p.status === 'active'
    );

    return res.json({
      success: true,
      session: formatSession(session),
      deck: deck
        ? {
            id: deck.id,
            title: deck.title,
            description: deck.description,
            backImageUrl: deck.back_image_url
          }
        : null,
      screenCards: activeCards,
      participants: sessionParticipants,
      participantsCount: sessionParticipants.length
    });
  } catch (error) {
    console.error('getScreen error:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка получения данных экрана'
    });
  }
}

function clearScreen(req, res) {
  screenCards.forEach((c) => {
    if (String(c.sessionId) === String(req.params.id)) {
      c.isActive = false;
      c.removedAt = new Date().toISOString();
    }
  });

  return res.json({ success: true });
}

function getScreenReactions(req, res) {
  const list = reactions.filter(
    (r) => String(r.sessionId) === String(req.params.id) && !r.isProcessed
  );

  list.forEach((r) => {
    r.isProcessed = true;
  });

  return res.json({
    success: true,
    reactions: list
  });
}

function deleteScreenCard(req, res) {
  const screenCard = screenCards.find(
    (item) =>
      String(item.id) === String(req.params.screenCardId) &&
      String(item.sessionId) === String(req.params.id) &&
      item.isActive
  );

  if (!screenCard) {
    return res.status(404).json({
      success: false,
      message: 'Карта на экране не найдена'
    });
  }

  screenCard.isActive = false;
  screenCard.removedAt = new Date().toISOString();

  return res.json({
    success: true,
    message: 'Карта удалена с общего экрана',
    screenCard
  });
}

module.exports = {
  getScreen,
  clearScreen,
  deleteScreenCard,
  getScreenReactions
};