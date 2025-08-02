const Tracker = require('bittorrent-tracker');
const express = require('express');
const http = require('http');

const clients = {}; // key → { ips: Set, ts: timestamp }

// BitTorrent tracker - explicitly disable UDP and WebSocket for Render
const tracker = new Tracker.Server({
  udp: false,    // Disable UDP (Render doesn't support UDP)
  http: true,    // Enable HTTP only
  ws: false,     // Disable WebSocket 
  stats: false,  // Disable stats server (extra HTTP endpoint)
  interval: 60000 // Tell clients to announce every 60 seconds (1 minute) for continuous monitoring
});

console.log('BitTorrent tracker created with HTTP-only configuration');

// Track tracker events
tracker.on('start', (addr, params) => {
  const rawIp = addr.split(':')[0]; // Extract IP part (before port)
  const infoHashHex = params?.info_hash?.toString('hex');
  // Support both old 8-char keys (last 8 of hash) and new 16-char session keys (first 16 of hash)
  const key = infoHashHex?.slice(0, 16) || 'unknown';
  
  // Initialize session if doesn't exist
  if (!clients[key]) {
    clients[key] = { ips: new Set(), ts: Date.now() };
  }
  
  // Parse multiple IPs if comma-separated
  const ips = rawIp.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
  
  // Add each IP individually to the set and always update timestamp
  ips.forEach(ip => {
    clients[key].ips.add(ip);
  });
  clients[key].ts = Date.now(); // Always update timestamp on every announce
  
  console.log(`[+] IP(s) detected: ${ips.join(', ')} (session: ${key}, total: ${clients[key].ips.size}, timestamp: ${clients[key].ts})`);
});

tracker.on('update', (addr, params) => {
  const rawIp = addr.split(':')[0]; // Extract IP part (before port)
  const infoHashHex = params?.info_hash?.toString('hex');
  // Support both old 8-char keys (last 8 of hash) and new 16-char session keys (first 16 of hash)
  const key = infoHashHex?.slice(0, 16) || 'unknown';
  
  // Initialize session if doesn't exist
  if (!clients[key]) {
    clients[key] = { ips: new Set(), ts: Date.now() };
  }
  
  // Parse multiple IPs if comma-separated
  const ips = rawIp.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
  
  // Add each IP individually to the set and always update timestamp
  ips.forEach(ip => {
    clients[key].ips.add(ip);
  });
  clients[key].ts = Date.now(); // Always update timestamp on every announce
  
  console.log(`[+] IP(s) updated: ${ips.join(', ')} (session: ${key}, total: ${clients[key].ips.size}, timestamp: ${clients[key].ts})`);
});

tracker.on('complete', (addr, params) => {
  const rawIp = addr.split(':')[0]; // Extract IP part (before port)
  const infoHashHex = params?.info_hash?.toString('hex');
  // Support both old 8-char keys (last 8 of hash) and new 16-char session keys (first 16 of hash)
  const key = infoHashHex?.slice(0, 16) || 'unknown';
  
  // Initialize session if doesn't exist
  if (!clients[key]) {
    clients[key] = { ips: new Set(), ts: Date.now() };
  }
  
  // Parse multiple IPs if comma-separated
  const ips = rawIp.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
  
  // Add each IP individually to the set and always update timestamp
  ips.forEach(ip => {
    clients[key].ips.add(ip);
  });
  clients[key].ts = Date.now(); // Always update timestamp on every announce
  
  console.log(`[+] IP(s) complete: ${ips.join(', ')} (session: ${key}, total: ${clients[key].ips.size}, timestamp: ${clients[key].ts})`);
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
    const clientIP = req.headers['cf-connecting-ip'] || req.connection.remoteAddress;
    const url = new URL(req.url, `http://${req.headers.host}`);
    console.log(`[Tracker] ${new Date().toISOString()} - Announce request from ${clientIP}`);
    console.log(`[Tracker] ${new Date().toISOString()} - Request params:`, {
      event: url.searchParams.get('event'),
      info_hash: url.searchParams.get('info_hash'),
      peer_id: url.searchParams.get('peer_id'),
      port: url.searchParams.get('port'),
      uploaded: url.searchParams.get('uploaded'),
      downloaded: url.searchParams.get('downloaded'),
      left: url.searchParams.get('left')
    });
    
    // Extract the real IP from Cloudflare headers
    const realIP = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
    
    // Override the request's remote address so the tracker sees the real IP
    req.connection.remoteAddress = realIP;
    req.socket.remoteAddress = realIP;
    
    // Intercept the response to log what we're sending back
    const originalEnd = res.end;
    res.end = function(chunk) {
      if (chunk) {
        console.log(`[Tracker] ${new Date().toISOString()} - Response body length: ${chunk.length} bytes`);
        // Try to log if it's a bencode response (BitTorrent format)
        try {
          const decoded = require('bencode').decode(chunk);
          console.log(`[Tracker] ${new Date().toISOString()} - Response data:`, {
            interval: decoded.interval,
            'min interval': decoded['min interval'],
            complete: decoded.complete,
            incomplete: decoded.incomplete
          });
        } catch (e) {
          console.log(`[Tracker] ${new Date().toISOString()} - Non-bencode response (probably error)`);
        }
      }
      originalEnd.call(this, chunk);
    };
    
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