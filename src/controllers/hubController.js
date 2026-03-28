const pool = require('../config/db');

async function getHub(req, res) {
  try {
const sessionsResult = await pool.query(
	`
	SELECT
	  s.*,
	  sv.code AS service_type
	FROM sessions s
	LEFT JOIN services sv ON sv.id = s.service_id
	WHERE s.user_id = $1
	ORDER BY s.created_at DESC
	`,
	[req.user.id]
  );

	const servicesResult = await pool.query(
	  `
	  SELECT id, code, title, description, is_active, created_at
	  FROM services
	  WHERE is_active = true
	  ORDER BY created_at ASC
	  `
	);

	const formattedSessions = sessionsResult.rows.map((s) => ({
	  id: s.id,
	  title: s.title,
	  pinCode: s.pin_code,
	  status: s.status,
	  settings: s.settings || {},
	  createdAt: s.created_at,
	  updatedAt: s.updated_at,
	  startedAt: s.started_at,
	  serviceType: s.service_type || 'cards'
	}));

	return res.json({
	  success: true,
	  user: {
		id: req.user.id,
		name: req.user.name,
		email: req.user.email
	  },
	  services: servicesResult.rows,
	  activeSessions: formattedSessions.filter((s) =>
		['scheduled', 'live'].includes(s.status)
	  )
	});
  } catch (error) {
	console.error('getHub error:', error);
	return res.status(500).json({
	  success: false,
	  message: 'Ошибка получения данных хаба'
	});
  }
}

module.exports = { getHub };