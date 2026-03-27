const pool = require('../config/db');

async function getServiceByCode(code) {
  const result = await pool.query(
	'SELECT * FROM services WHERE code = $1 LIMIT 1',
	[code]
  );

  return result.rows[0] || null;
}

module.exports = {
  getServiceByCode,
};