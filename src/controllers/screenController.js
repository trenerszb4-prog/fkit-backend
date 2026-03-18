const {
  sessions,
  participants,
  screenCards
} = require('../data/db');

function getScreen(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

  const sessionParticipants = participants.filter(
	(item) => item.sessionId === session.id && item.status === 'active'
  );

  const activeCards = screenCards.filter(
	(item) => item.sessionId === session.id && item.isActive
  );

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
	participants: sessionParticipants,
	participantsCount: sessionParticipants.length,
	screenCards: activeCards
  });
}

function clearScreen(req, res) {
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

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
  const session = sessions.find(
	(item) => item.id === req.params.id && item.ownerUserId === req.user.id
  );

  if (!session) {
	return res.status(404).json({
	  success: false,
	  message: 'Сессия не найдена'
	});
  }

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