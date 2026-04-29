const pool = require('../config/db');
const { broadcastToSession } = require('../realtime/ws');

function formatSession(session) {
  return {
    id: session.id,
    title: session.title,
    pinCode: session.pin_code,
    status: session.status,
    settings: session.settings || {},
    serviceType: session.service_type, // Добавлено поле типа сессии
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

    let activeCards = [];

    // 🟢 ВЕТВЛЕНИЕ: Откуда брать карты для экрана
    if (session.service_type === 'moderation') {
      const activeCardsResult = await pool.query(
        `
        SELECT mc.id, mc.session_id, mc.participant_id, mc.image_data, mc.created_at, p.display_name as participant_name
        FROM moderation_cards mc
        LEFT JOIN participants p ON mc.participant_id = p.id
        WHERE mc.session_id = $1
        ORDER BY mc.created_at ASC
        `,
        [session.id]
      );
      activeCards = activeCardsResult.rows.map((c) => ({
        id: c.id,
        sessionId: c.session_id,
        participantId: c.participant_id,
        participantName: c.participant_name,
        deckCardId: null,
        imageUrl: c.image_data, // Отдаем base64 как URL
        isActive: true,
        shownAt: c.created_at,
        updatedAt: c.created_at,
        removedAt: null
      }));
    } else {
      // Старая логика для метафорических карт
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
      activeCards = activeCardsResult.rows.map((c) => ({
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
    }

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
    // Узнаем тип сессии, чтобы очистить правильную таблицу
    const sessionResult = await pool.query(`SELECT service_type FROM sessions WHERE id = $1 LIMIT 1`, [req.params.id]);
    const session = sessionResult.rows[0];

    if (session && session.service_type === 'moderation') {
      await pool.query(
        `DELETE FROM moderation_cards WHERE session_id = $1`,
        [req.params.id]
      );
    } else {
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
    }

    // 🔥 БРОДКАСТ: Сообщаем всем телефонам, что стол очищен
    const { broadcastToSession } = require('../realtime/ws');
    broadcastToSession(req.params.id, { type: 'screen_cleared' });

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
    const sessionResult = await pool.query(`SELECT service_type FROM sessions WHERE id = $1 LIMIT 1`, [req.params.id]);
    const session = sessionResult.rows[0];

    let deletedCard = null;

    if (session && session.service_type === 'moderation') {
      const result = await pool.query(
        `
        DELETE FROM moderation_cards 
        WHERE id = $1 AND session_id = $2 
        RETURNING *
        `,
        [req.params.screenCardId, req.params.id]
      );
      if (result.rows.length) {
        deletedCard = result.rows[0];
      }
    } else {
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
      if (result.rows.length) {
        deletedCard = result.rows[0];
      }
    }

    if (!deletedCard) {
      return res.status(404).json({
        success: false,
        message: 'Карта на экране не найдена'
      });
    }

    // 🔥 БРОДКАСТ: Сообщаем конкретному телефону, что его карту удалили
    const { broadcastToSession } = require('../realtime/ws');
    broadcastToSession(req.params.id, { 
      type: 'card_removed', 
      screenCardId: req.params.screenCardId,
      participantId: deletedCard.participant_id
    });

    return res.json({
      success: true,
      message: 'Карта удалена',
      screenCard: deletedCard
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

    const sessionResult = await pool.query(
      `
      SELECT 
        s.id,
        s.pin_code,
        s.settings,
        s.service_type,
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

    let screenCards = [];

    if (session.service_type === 'moderation') {
      const cardsResult = await pool.query(
        `
        SELECT mc.id, mc.image_data as image_url, p.display_name as participant_name
        FROM moderation_cards mc
        LEFT JOIN participants p ON mc.participant_id = p.id
        WHERE mc.session_id = $1
        ORDER BY mc.created_at ASC
        `,
        [sessionId]
      );
      screenCards = cardsResult.rows.map(c => ({
        id: c.id,
        imageUrl: c.image_url,
        participantName: c.participant_name
      }));
    } else {
      const cardsResult = await pool.query(
        `
        SELECT id, image_url, participant_name
        FROM screen_cards
        WHERE session_id = $1
          AND is_active = true
        ORDER BY shown_at ASC
        `,
        [sessionId]
      );
      screenCards = cardsResult.rows.map(c => ({
        id: c.id,
        imageUrl: c.image_url,
        participantName: c.participant_name
      }));
    }

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
      screenCards: screenCards,
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