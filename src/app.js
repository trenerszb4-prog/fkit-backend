require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./config/db');

pool.query('SELECT NOW()')
  .then((result) => {
	console.log('База подключена:', result.rows[0]);
  })
  .catch((error) => {
	console.error('Ошибка подключения к базе:', error.message);
  });

const authRoutes = require('./routes/authRoutes');
const hubRoutes = require('./routes/hubRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const playerRoutes = require('./routes/playerRoutes');
const screenRoutes = require('./routes/screenRoutes');
const { cleanupExpiredSessions } = require('./controllers/sessionController');
const deckRoutes = require('./routes/deckRoutes');
const testRoutes = require('./routes/test.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
	success: true,
	message: 'Backend работает'
  });
});

app.use('/auth', authRoutes);
app.use('/hub', hubRoutes);
app.use('/sessions', sessionRoutes);
app.use('/player', playerRoutes);
app.use('/screen', screenRoutes);
app.use('/decks', deckRoutes);
app.use('/test', testRoutes);

setInterval(() => {
  try {
	const removedCount = cleanupExpiredSessions();
	if (removedCount > 0) {
	  console.log(`[cleanup] Удалено просроченных сессий: ${removedCount}`);
	}
  } catch (error) {
	console.error('[cleanup] Ошибка автоочистки сессий:', error);
  }
}, 60 * 60 * 1000); // раз в час

module.exports = app;