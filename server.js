const http = require('http');
const app = require('./src/app');
const { PORT } = require('./src/config/env');

const { initWebSocket } = require('./src/realtime/ws');

require('./src/cron');

const server = http.createServer(app);

// 👉 подключаем WebSocket
initWebSocket(server);

server.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});