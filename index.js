const Tracker = require('bittorrent-tracker');
const express = require('express');

const clients = {}; // key → latest IP

// BitTorrent tracker
const server = new Tracker.Server({
  udp: false, // disable UDP for now (Render only supports TCP HTTP)
  http: true,
  ws: false
});

server.on('start', (addr) => {
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

app.listen(10000, () => {
  console.log('Event server running on port 10000');
});

server.listen(10001, () => {
  console.log('HTTP tracker running on port 10001');
});