// WebSocket server for PandaHub real-time notifications
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

let wss = null;
const clients = new Map(); // userId -> Set<ws>

function init(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    let userId = null;
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'auth') {
          try {
            const decoded = jwt.verify(msg.token, JWT_SECRET);
            userId = decoded.id;   // 与 auth.js 签发的 claim 名保持一致
            ws.userId = userId;
            if (!clients.has(userId)) clients.set(userId, new Set());
            clients.get(userId).add(ws);
            ws.send(JSON.stringify({ type: 'auth_ok', userId }));
            console.log('[WS] Client authenticated:', userId);
          } catch(e) {
            ws.send(JSON.stringify({ type: 'auth_error', error: 'Invalid token' }));
            ws.close();
          }
        }
      } catch(e) {}
    });

    ws.on('close', () => {
      if (userId && clients.has(userId)) {
        clients.get(userId).delete(ws);
        if (clients.get(userId).size === 0) clients.delete(userId);
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
    });
  });

  // Heartbeat ping
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));
  console.log('[WS] WebSocket server running on /ws');
}

function broadcastToUser(userId, payload) {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return false;
  const data = JSON.stringify(payload);
  userClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(data);
  });
  return true;
}

function broadcastAll(payload) {
  if (!wss) return;
  const data = JSON.stringify(payload);
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(data);
  });
}

module.exports = { init, broadcastToUser, broadcastAll };
