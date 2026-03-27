const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

function createToken(user) {
  return jwt.sign(
	{
	  id: user.id, // ВАЖНО: было userId
	  email: user.email
	},
	JWT_SECRET,
	{ expiresIn: '7d' }
  );
}

module.exports = {
  createToken
};