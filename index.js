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

console.log(`Starting server on port ${PORT}`);

// Add middleware to log ALL requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
  console.log('Headers:', req.headers);
  
  // Extract the real IP from Cloudflare headers
  const realIP = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  req.realIP = realIP;
  console.log(`Real IP: ${realIP}`);
  
  next();
});

// Create HTTP server that handles both Express and BitTorrent tracker
const httpServer = http.createServer((req, res) => {
  // Handle /announce requests with the tracker
  if (req.url.startsWith('/announce')) {
    console.log('🎯 Handling announce request with BitTorrent tracker');
    
    // Extract the real IP from Cloudflare headers
    const realIP = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
    console.log(`🌍 Real client IP: ${realIP}`);
    
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

console.log('Starting HTTP server with custom request routing...');

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`📍 Announce URL: https://remote-tracker.onrender.com/announce`);
  console.log(`📊 Events URL: https://remote-tracker.onrender.com/events`);
});