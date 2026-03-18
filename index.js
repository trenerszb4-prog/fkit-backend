const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Тестовый маршрут
app.get('/', (req, res) => {
  res.send('Сервер работает 🚀');
});

// Логин (пока фейковый)
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email === 'admin@test.com' && password === '1234') {
	return res.json({
	  success: true,
	  message: 'Успешный вход'
	});
  } else {
	return res.json({
	  success: false,
	  message: 'Неверный email или пароль'
	});
  }
});

app.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});