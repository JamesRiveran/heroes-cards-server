// server.js
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
// Acepta en ws://host:3000/ws (el path es opcional; si no lo necesitas, quítalo)
const wss = new WebSocketServer({ port: PORT, path: '/ws' });

/**
 * peers: Array<{ ws, clientId, slot }>
 * - slot = 1 para el primero, 2 para el segundo
 * - se rechaza todo lo que sea > 2
 */
const peers = [];

function send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch {} }
function log(...a) { console.log('[WS]', ...a); }

wss.on('connection', (ws, req) => {
  if (peers.length >= 2) {
    send(ws, { type: 'error', error: 'server_full' });
    ws.close(1008, 'Server full'); // policy violation
    return;
  }

  const clientId = (crypto.randomUUID && crypto.randomUUID())
    || ('c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));

  const slot = peers.length + 1; // 1 o 2
  peers.push({ ws, clientId, slot });

  log('JOIN', 'clients:', peers.length, 'slot:', slot);
  send(ws, { type: 'welcome', clientId, slot });

  if (peers.length === 2) {
    // ambos conectados → sala lista
    peers.forEach(p => send(p.ws, { type: 'room_ready' }));
  }

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    // reenviar SOLO al otro
    const other = peers.find(p => p.ws !== ws);
    if (!other) return;

    const relayTypes = new Set(['bet_set', 'bet_reset', 'bet_confirm', 'deal']);
    if (relayTypes.has(msg.type)) {
      msg.from = clientId;
      log('IN ', msg.type, msg);
      send(other.ws, msg);
      log('OUT', msg.type, '→ peer slot', other.slot);
    }
  });

  ws.on('close', () => {
    const i = peers.findIndex(p => p.ws === ws);
    if (i >= 0) peers.splice(i, 1);
    log('LEAVE', 'clients:', peers.length);
    // Notifica al que queda (si queda uno)
    if (peers.length === 1) {
      send(peers[0].ws, { type: 'peer_disconnected' });
    }
  });
});

console.log(`WS server listo en ws://0.0.0.0:${PORT}/ws (máx. 2 jugadores)`);
