const { services, sessions } = require('../data/db');

function getHub(req, res) {
  const userSessions = sessions.filter(
	(session) => session.ownerUserId === req.user.id
  );

  return res.json({
	success: true,
	user: {
	  id: req.user.id,
	  name: req.user.name
	},
	services,
	activeSessions: userSessions.filter((session) =>
	  ['scheduled', 'live'].includes(session.status)
	)
  });
}

module.exports = {
  getHub
};