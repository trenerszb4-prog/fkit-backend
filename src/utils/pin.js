const pool = require('../config/db');

function generatePinCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function generateUniquePinCode(maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i += 1) {
	const pinCode = generatePinCode();

	const result = await pool.query(
	  'SELECT 1 FROM sessions WHERE pin_code = $1 LIMIT 1',
	  [pinCode]
	);

	if (result.rowCount === 0) {
	  return pinCode;
	}
  }

  throw new Error('Не удалось сгенерировать уникальный PIN');
}

module.exports = {
  generateUniquePinCode,
};