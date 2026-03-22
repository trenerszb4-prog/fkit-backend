const { decks } = require('../data/db');

function getDecks(req, res) {
  return res.json({
	success: true,
	decks
  });
}

module.exports = {
  getDecks
};