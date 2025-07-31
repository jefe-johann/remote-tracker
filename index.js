const Tracker = require('bittorrent-tracker');
const express = require('express');
const http = require('http');

const clients = {}; // key → latest IP

// BitTorrent tracker
const tracker = new Tracker.Server({
  udp: false, // disable UDP for now (Render only supports TCP HTTP)
  http: true,
  ws: false
});

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
app.get('/events', (req, res) => {
  const key = req.query.key;
  res.setHeader('Content-Type', 'text/event-stream');
  const interval = setInterval(() => {
    const entry = clients[key];
    if (entry) {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }
  }, 2000);
  req.on('close', () => clearInterval(interval));
});

// Combine Express and tracker onto one HTTP port for Render
const PORT = process.env.PORT || 10000;
const httpServer = http.createServer(app);

// Mount tracker announce endpoint on the same HTTP server
tracker.listen({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log(`Tracker and event stream listening on port ${PORT}`);
});