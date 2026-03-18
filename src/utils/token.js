const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

function createToken(user) {
  return jwt.sign(
	{
	  userId: user.id,
	  email: user.email
	},
	JWT_SECRET,
	{ expiresIn: '7d' }
  );
}

module.exports = {
  createToken
};