const app = require('./src/app');
const { PORT } = require('./src/config/env');

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});