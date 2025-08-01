const Tracker = require('bittorrent-tracker');
const express = require('express');
const http = require('http');

const clients = {}; // key → { ips: Set, ts: timestamp }

// BitTorrent tracker - explicitly disable UDP and WebSocket for Render
const tracker = new Tracker.Server({
  udp: false,    // Disable UDP (Render doesn't support UDP)
  http: true,    // Enable HTTP only
  ws: false,     // Disable WebSocket 
  stats: false   // Disable stats server (extra HTTP endpoint)
});

console.log('BitTorrent tracker created with HTTP-only configuration');

// Track tracker events
tracker.on('start', (addr, params) => {
  const ip = addr.split(':')[0];
  const infoHashHex = params?.info_hash?.toString('hex');
  const key = infoHashHex?.slice(-8) || 'unknown';
  
  // Initialize session if doesn't exist
  if (!clients[key]) {
    clients[key] = { ips: new Set(), ts: Date.now() };
  }
  
  // Add IP to set and update timestamp
  clients[key].ips.add(ip);
  clients[key].ts = Date.now();
  
  console.log(`[+] IP detected: ${ip} (session: ${key}, total: ${clients[key].ips.size})`);
});

tracker.on('update', (addr, params) => {
  const ip = addr.split(':')[0];
  const infoHashHex = params?.info_hash?.toString('hex');
  const key = infoHashHex?.slice(-8) || 'unknown';
  
  // Initialize session if doesn't exist
  if (!clients[key]) {
    clients[key] = { ips: new Set(), ts: Date.now() };
  }
  
  // Add IP to set and update timestamp
  clients[key].ips.add(ip);
  clients[key].ts = Date.now();
  
  console.log(`[+] IP updated: ${ip} (session: ${key}, total: ${clients[key].ips.size})`);
});

tracker.on('complete', (addr, params) => {
  const ip = addr.split(':')[0];
  const infoHashHex = params?.info_hash?.toString('hex');
  const key = infoHashHex?.slice(-8) || 'unknown';
  
  // Initialize session if doesn't exist
  if (!clients[key]) {
    clients[key] = { ips: new Set(), ts: Date.now() };
  }
  
  // Add IP to set and update timestamp
  clients[key].ips.add(ip);
  clients[key].ts = Date.now();
  
  console.log(`[+] IP complete: ${ip} (session: ${key}, total: ${clients[key].ips.size})`);
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

// Polling endpoint for IP detection data - FIXED VERSION
app.get('/events', (req, res) => {
  const key = req.query.key;
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  
  const entry = clients[key];
  if (entry && entry.ips.size > 0) {
    // Return each unique IP as separate array elements (FIXED)
    const ips = Array.from(entry.ips);
    res.json({ 
      success: true, 
      data: {
        ips: ips,  // This is now properly an array of individual IP strings
        count: ips.length,
        ts: entry.ts
      }
    });
  } else {
    res.json({ success: false, message: 'No data for key' });
  }
});

// Combine Express and tracker onto one HTTP port for Render
const PORT = process.env.PORT || 10000;

console.log(`Starting server on port ${PORT}`);

// Extract real IP from proxy headers
app.use((req, res, next) => {
  const realIP = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  req.realIP = realIP;
  next();
});

// Create HTTP server that handles both Express and BitTorrent tracker
const httpServer = http.createServer((req, res) => {
  // Handle /announce requests with the tracker
  if (req.url.startsWith('/announce')) {
    // Extract the real IP from Cloudflare headers
    const realIP = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
    
    // Override the request's remote address so the tracker sees the real IP
    req.connection.remoteAddress = realIP;
    req.socket.remoteAddress = realIP;
    
    tracker.onHttpRequest(req, res, { trustProxy: true });
  }
  // Handle all other requests with Express
  else {
    app(req, res);
  }
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`📍 Announce URL: https://remote-tracker.onrender.com/announce`);
  console.log(`📊 Events URL: https://remote-tracker.onrender.com/events`);
});