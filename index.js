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

tracker.on('start', (addr) => {
  const ip = addr.address;
  const key = addr.peerId?.toString('hex')?.slice(-8) || 'unknown';
  clients[key] = { ip, ts: Date.now() };
  console.log(`[+] ${key} announced from ${ip}`);
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