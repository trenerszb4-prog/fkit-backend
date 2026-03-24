const {
  sessions,
  participants,
  screenCards,
  decks
} = require('../data/db');

function getSessionOr404(req, res) {
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

function normalizeVisibleCards(session, cards) {
  const settings = session.settings || {};

  const maxCardsOnScreen = Math.max(1, Number(settings.maxCardsOnScreen || 1));
  const replaceCardEnabled = Boolean(settings.replaceCardEnabled);

  const sortedCards = [...cards].sort((a, b) => {
    const aTime = new Date(a.shownAt || a.createdAt || a.addedAt || 0).getTime();
    const bTime = new Date(b.shownAt || b.createdAt || b.addedAt || 0).getTime();
    return aTime - bTime;
  });

  if (!sortedCards.length) return [];

  if (replaceCardEnabled) {
    return [sortedCards[sortedCards.length - 1]];
  }

  return sortedCards.slice(-maxCardsOnScreen);
}

function getScreen(req, res) {
  const session = getSessionOr404(req, res);
  if (!session) return;

  const sessionParticipants = participants.filter(
    (item) => item.sessionId === session.id && item.status === 'active'
  );

const activeCards = screenCards
  .filter((item) => item.sessionId === session.id && item.isActive)
  .sort((a, b) => new Date(a.shownAt || 0) - new Date(b.shownAt || 0));

  const visibleCards = normalizeVisibleCards(session, activeCards);
  const deck = decks.find((item) => item.id === session.settings?.deckId) || null;

return res.json({
    success: true,
    session: {
      id: session.id,
      title: session.title,
      pinCode: session.pinCode,
      status: session.status,
      questions: session.questions,
      settings: session.settings
    },
    deck,
    participants: sessionParticipants,
    participantsCount: sessionParticipants.length,
    screenCards: visibleCards
  });
}

function clearScreen(req, res) {
  const session = getSessionOr404(req, res);
  if (!session) return;

  screenCards.forEach((card) => {
    if (card.sessionId === session.id && card.isActive) {
      card.isActive = false;
      card.removedAt = new Date().toISOString();
    }
  });

  return res.json({
    success: true,
    message: 'Экран очищен'
  });
}

function deleteScreenCard(req, res) {
  const session = getSessionOr404(req, res);
  if (!session) return;

  const screenCard = screenCards.find(
    (item) =>
      item.id === req.params.screenCardId &&
      item.sessionId === session.id &&
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
  deleteScreenCard
};