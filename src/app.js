require('dotenv').config();

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const hubRoutes = require('./routes/hubRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const playerRoutes = require('./routes/playerRoutes');
const screenRoutes = require('./routes/screenRoutes');
const deckRoutes = require('./routes/deckRoutes');
const wordcloudRoutes = require('./routes/wordcloudRoutes'); // 🟢 Подключаем Облако слов

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health-check
app.get('/', (req, res) => {
  res.json({
	success: true,
	message: 'Backend работает'
  });
});

// Routes
app.use('/auth', authRoutes);
app.use('/hub', hubRoutes);
app.use('/sessions', sessionRoutes);
app.use('/player', playerRoutes);
app.use('/screen', screenRoutes);
app.use('/decks', deckRoutes);
app.use('/wordcloud', wordcloudRoutes); // 🟢 Монтируем роутер Облака слов

// ВАЖНО: временно убираем test.routes
// app.use('/test', testRoutes);

// ВАЖНО: временно отключаем cleanup (он работает с массивами)
// setInterval(() => {...})

module.exports = app;