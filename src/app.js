const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const hubRoutes = require('./routes/hubRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const playerRoutes = require('./routes/playerRoutes');
const screenRoutes = require('./routes/screenRoutes');

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

module.exports = app;