/**
 * Smart Vessel Monitoring System — Demo Server
 *
 * Express HTTP server + WebSocket for live telemetry streaming.
 * Runs a vessel simulator and pushes updates to connected browsers.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { VesselSimulator } from './simulator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;

// ─── Express Setup ──────────────────────────────────────────────────────────

const app = express();
app.use(express.static(join(__dirname, 'public')));

const server = createServer(app);

// ─── WebSocket Setup ────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected (${clients.size} total)`);

  // Send initial state immediately
  const state = simulator.getState();
  ws.send(JSON.stringify({ type: 'state', data: state }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected (${clients.size} total)`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    clients.delete(ws);
  });
});

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

// ─── Simulator ──────────────────────────────────────────────────────────────

const simulator = new VesselSimulator();

// Push updates every 1.5 seconds
const UPDATE_INTERVAL_MS = 1500;

setInterval(() => {
  const state = simulator.update();
  broadcast({ type: 'state', data: state });
}, UPDATE_INTERVAL_MS);

// ─── Start Server ───────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║   Smart Vessel Monitoring System — Demo Dashboard       ║');
  console.log('  ╠══════════════════════════════════════════════════════════╣');
  console.log(`  ║   Open in browser: http://localhost:${PORT}               ║`);
  console.log('  ║                                                          ║');
  console.log('  ║   Simulated events timeline:                             ║');
  console.log('  ║     ~30s  — Pug temperature warning                      ║');
  console.log('  ║     ~60s  — AIS collision WARNING (yellow)               ║');
  console.log('  ║     ~90s  — Shallow water CRITICAL alarm                 ║');
  console.log('  ║     ~120s — Collision DANGER (red)                       ║');
  console.log('  ║     ~150s — All alarms clear                             ║');
  console.log('  ║                                                          ║');
  console.log('  ║   Press Ctrl+C to stop                                   ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log('');
});
