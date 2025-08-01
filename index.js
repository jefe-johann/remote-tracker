const Tracker = require('bittorrent-tracker');
const express = require('express');
const http = require('http');

const clients = {}; // key → latest IP

// BitTorrent tracker - explicitly disable UDP and WebSocket for Render
const tracker = new Tracker.Server({
  udp: false,    // Disable UDP (Render doesn't support UDP)
  http: true,    // Enable HTTP only
  ws: false,     // Disable WebSocket 
  stats: false   // Disable stats server (extra HTTP endpoint)
});

console.log('BitTorrent tracker created with HTTP-only configuration');

// Add debugging for all tracker events
tracker.on('start', (addr, params) => {
  console.log(`[DEBUG] Start event - addr:`, addr, 'params:', params);
  const ip = addr.split(':')[0]; // Extract IP from "ip:port" format
  const key = params?.peer_id?.toString('hex')?.slice(-8) || 'unknown';
  clients[key] = { ip, ts: Date.now() };
  console.log(`[+] ${key} announced from ${ip}`);
});

tracker.on('update', (addr, params) => {
  console.log(`[DEBUG] Update event - addr:`, addr, 'params:', params);
  const ip = addr.split(':')[0];
  const key = params?.peer_id?.toString('hex')?.slice(-8) || 'unknown';
  clients[key] = { ip, ts: Date.now() };
  console.log(`[+] ${key} updated from ${ip}`);
});

tracker.on('complete', (addr, params) => {
  console.log(`[DEBUG] Complete event - addr:`, addr, 'params:', params);
  const ip = addr.split(':')[0];
  const key = params?.peer_id?.toString('hex')?.slice(-8) || 'unknown';
  clients[key] = { ip, ts: Date.now() };
  console.log(`[+] ${key} completed from ${ip}`);
});

// Event stream server
const app = express();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    tracker: 'running',
    clients: Object.keys(clients).length,
    timestamp: new Date().toISOString()
  });
});

// Test announce endpoint manually
app.get('/test-announce', (req, res) => {
  res.json({
    message: 'Announce endpoint should be handled by bittorrent-tracker',
    note: 'Try GET /announce with proper BitTorrent parameters',
    clients: clients
  });
});

// Simple polling endpoint instead of Server-Sent Events
app.get('/events', (req, res) => {
  const key = req.query.key;
  console.log(`[EVENTS] Polling request for key: ${key}`);
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  
  const entry = clients[key];
  if (entry) {
    console.log(`[EVENTS] Returning data for key ${key}:`, entry);
    res.json({ success: true, data: entry });
  } else {
    res.json({ success: false, message: 'No data for key' });
  }
});

// Combine Express and tracker onto one HTTP port for Render
const PORT = process.env.PORT || 10000;
const httpServer = http.createServer(app);

console.log(`Starting server on port ${PORT}`);

// Mount tracker announce endpoint on the same HTTP server
tracker.listen({ 
  server: httpServer,
  port: PORT // Explicitly set port
});

console.log('Tracker configured, starting HTTP server...');

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Tracker and event stream listening on port ${PORT}`);
  console.log(`📍 Announce URL: https://remote-tracker.onrender.com/announce`);
  console.log(`📊 Events URL: https://remote-tracker.onrender.com/events`);
});