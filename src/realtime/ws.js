const { WebSocketServer } = require('ws');

const sessions = new Map(); // sessionId -> Set(ws)

function initWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
	try {
	  const url = new URL(req.url, 'http://localhost');
	  const sessionId = url.searchParams.get('sessionId');
	  const role = url.searchParams.get('role');

	  if (!sessionId) {
		ws.close();
		return;
	  }

	  ws.sessionId = sessionId;
	  ws.role = role;

	  if (!sessions.has(sessionId)) {
		sessions.set(sessionId, new Set());
	  }

	  sessions.get(sessionId).add(ws);

	  ws.on('close', () => {
		const set = sessions.get(sessionId);
		if (set) {
		  set.delete(ws);
		  if (set.size === 0) {
			sessions.delete(sessionId);
		  }
		}
	  });

	} catch (e) {
	  console.error('WS connection error:', e);
	  ws.close();
	}
  });

  console.log('WebSocket запущен');
}

function broadcastToSession(sessionId, payload) {
  const clients = sessions.get(sessionId);
  if (!clients) return;

  const message = JSON.stringify(payload);

  clients.forEach(ws => {
	if (ws.readyState === 1) {
	  ws.send(message);
	}
  });
}

module.exports = {
  initWebSocket,
  broadcastToSession
};