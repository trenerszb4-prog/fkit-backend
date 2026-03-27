const pool = require('../config/db');

async function getHub(req, res) {
  try {
	const result = await pool.query(`
	  SELECT *
	  FROM sessions
	  ORDER BY created_at DESC
	`);

	const sessions = result.rows;

	const formatted = sessions.map((s) => ({
	  id: s.id,
	  title: s.title,
	  pinCode: s.pin_code,
	  status: s.status,
	  settings: s.settings,
	  createdAt: s.created_at,
	  updatedAt: s.updated_at,
	  startedAt: s.started_at
	}));

	return res.json({
	  success: true,
	  user: {
		id: req.user.id,
		name: req.user.name,
		email: req.user.email
	  },
	  services: [],
	  activeSessions: formatted.filter((s) =>
		['scheduled', 'live'].includes(s.status)
	  )
	});

  } catch (error) {
	console.error('getHub error:', error);
	return res.status(500).json({
	  success: false
	});
  }
}

module.exports = { getHub };