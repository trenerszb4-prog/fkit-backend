const pool = require('../config/db');
const { broadcastToSession } = require('../realtime/ws');

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

    const deckId = session.settings?.deckId || null;
    const deck = await getDeckById(deckId);

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

    const participantsResult = await pool.query(
      `
      SELECT *
      FROM participants
      WHERE session_id = $1
        AND status = 'active'
      `,
      [session.id]
    );

    const sessionParticipants = participantsResult.rows.map((p) => ({
      id: p.id,
      sessionId: p.session_id,
      displayName: p.display_name,
      status: p.status,
      joinedAt: p.joined_at,
      lastSeenAt: p.last_seen_at
    }));

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

async function clearScreen(req, res) {
  try {
    await pool.query(
      `
      UPDATE screen_cards
      SET is_active = false,
          removed_at = now()
      WHERE session_id = $1
        AND is_active = true
      `,
      [req.params.id]
    );
    
    broadcastToSession(req.params.id, { type: 'screen_cleared' })
    return res.json({ success: true });
  } catch (error) {
    console.error('clearScreen error:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка очистки экрана'
    });
  }
}

async function getScreenReactions(req, res) {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM reactions
      WHERE session_id = $1
        AND is_processed = false
      ORDER BY created_at ASC
      `,
      [req.params.id]
    );

    const reactionsList = result.rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      participantId: r.participant_id,
      emoji: r.emoji,
      createdAt: r.created_at
    }));

    // помечаем как обработанные
    await pool.query(
      `
      UPDATE reactions
      SET is_processed = true
      WHERE session_id = $1
        AND is_processed = false
      `,
      [req.params.id]
    );

    return res.json({
      success: true,
      reactions: reactionsList
    });
  } catch (error) {
    console.error('getScreenReactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка получения реакций'
    });
  }
}

async function deleteScreenCard(req, res) {
  try {
    const result = await pool.query(
      `
      UPDATE screen_cards
      SET is_active = false,
          removed_at = now()
      WHERE id = $1
        AND session_id = $2
        AND is_active = true
      RETURNING *
      `,
      [req.params.screenCardId, req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Карта на экране не найдена'
      });
    }

    broadcastToSession(req.params.id, { 
      type: 'card_removed', 
      screenCardId: req.params.screenCardId 
    });

    return res.json({
      success: true,
      message: 'Карта удалена',
      screenCard: result.rows[0]
    });
  } catch (error) {
    console.error('deleteScreenCard error:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка удаления карты'
    });
  }
}

async function getScreenState(req, res) {
  try {
    const sessionId = req.params.id;

    // 🔥 один запрос: session + deck
    const sessionResult = await pool.query(
      `
      SELECT 
        s.id,
        s.pin_code,
        s.settings,
        d.back_image_url
      FROM sessions s
      LEFT JOIN decks d ON d.id = (s.settings->>'deckId')
      WHERE s.id = $1
      LIMIT 1
      `,
      [sessionId]
    );

    const session = sessionResult.rows[0];

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Сессия не найдена'
      });
    }

    // 🔥 только нужные поля для карт
    const cardsResult = await pool.query(
      `
      SELECT 
        id,
        image_url,
        participant_name
      FROM screen_cards
      WHERE session_id = $1
        AND is_active = true
      ORDER BY shown_at ASC
      `,
      [sessionId]
    );

    // 🔥 только COUNT (без загрузки участников)
    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int as count
      FROM participants
      WHERE session_id = $1
        AND status = 'active'
      `,
      [sessionId]
    );

    return res.json({
      success: true,
      session: {
        id: session.id,
        pinCode: session.pin_code
      },
      deck: {
        backImageUrl: session.back_image_url
      },
      screenCards: cardsResult.rows.map(c => ({
        id: c.id,
        imageUrl: c.image_url,
        participantName: c.participant_name
      })),
      participantsCount: countResult.rows[0].count
    });

  } catch (error) {
    console.error('getScreenState error:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка получения состояния экрана'
    });
  }
}

module.exports = {
  getScreen,
  getScreenState,
  clearScreen,
  deleteScreenCard,
  getScreenReactions
};