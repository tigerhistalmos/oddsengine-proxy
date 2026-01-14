require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;
const ODDSENGINE_BASE_URL = 'https://api.oddsengine.dev';
const API_KEY = process.env.ODDSENGINE_API_KEY;

// CRITICAL: Proper CORS configuration for localhost
app.use(cors({
  origin: '*',  // Allow all origins (or specify ['http://localhost:8080'])
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
  credentials: true
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Simple in-memory cache
const cache = new Map();
const CACHE_DURATION = 60 * 1000; // 1 minute

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    cache_size: cache.size,
    port: PORT,
    api_key_configured: !!API_KEY
  });
});

// Clear cache endpoint
app.post('/cache/clear', (req, res) => {
  cache.clear();
  res.json({ message: 'Cache cleared', size: 0 });
});

// Proxy endpoint for OddsEngine API
app.get('/v1/*', async (req, res) => {
  try {
    const path = req.path;
    const queryString = new URLSearchParams(req.query).toString();
    const url = `${ODDSENGINE_BASE_URL}${path}${queryString ? '?' + queryString : ''}`;

    console.log(`\n📡 Proxying request to: ${url}`);

    // Check cache first
    const cacheKey = url;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('✅ Cache HIT - returning cached data');
      return res.json(cached.data);
    }

    console.log('❌ Cache MISS - fetching from OddsEngine');

    // Get API key from request header or environment variable
    const apiKey = req.headers['x-api-key'] || API_KEY;
    
    if (!apiKey) {
      console.error('⚠️  No API key provided');
      return res.status(401).json({
        error: 'missing_api_key',
        message: 'API key required via X-API-Key header or ODDSENGINE_API_KEY env var'
      });
    }

    // Forward request to OddsEngine
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OddsEngine API Error ${response.status}:`, errorText);
      return res.status(response.status).json({
        error: 'api_error',
        message: errorText,
        status: response.status
      });
    }

    const data = await response.json();
    
    // Cache the successful response
    cache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });
    
    console.log('✅ Success - response cached');
    
    res.json(data);

  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    res.status(500).json({
      error: 'proxy_error',
      message: error.message
    });
  }
});

// Serve static files from public directory
app.use(express.static('public'));

// Default homepage
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>OddsEngine Proxy</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: white;
            padding: 40px;
            margin: 0;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
          }
          h1 { color: #a855f7; margin-bottom: 10px; }
          .status {
            background: rgba(168, 85, 247, 0.1);
            border: 1px solid #a855f7;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .status-item {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
          }
          .tools {
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid #10b981;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          a {
            color: #a855f7;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          .check {
            color: #10b981;
            font-weight: bold;
          }
          .cross {
            color: #ef4444;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🚀 OddsEngine Proxy Server</h1>
          <p>Your local proxy for betting tools</p>
          
          <div class="status">
            <h3>Server Status</h3>
            <div class="status-item">
              <span>Port:</span>
              <span class="check">${PORT}</span>
            </div>
            <div class="status-item">
              <span>API Key:</span>
              <span class="${API_KEY ? 'check' : 'cross'}">${API_KEY ? '✅ Configured' : '❌ Missing'}</span>
            </div>
            <div class="status-item">
              <span>Cache Size:</span>
              <span>${cache.size} items</span>
            </div>
            <div class="status-item">
              <span>Base URL:</span>
              <span style="font-size: 12px;">http://localhost:${PORT}</span>
            </div>
          </div>
          
          <div class="tools">
            <h3>Available Tools</h3>
            <ul>
              <li><a href="/arb-scanner.html">📊 Arb Scanner</a></li>
              <li><a href="/parlay-builder.html">🎯 Parlay Builder</a></li>
            </ul>
          </div>
          
          <div class="status">
            <h3>API Endpoints</h3>
            <ul>
              <li><a href="/health">GET /health</a> - Health check</li>
              <li>GET /v1/events?league=NBA - List events</li>
              <li>GET /v1/odds?event_id=XXX - Get odds</li>
              <li>POST /cache/clear - Clear cache</li>
            </ul>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 OddsEngine Proxy Server');
  console.log('='.repeat(50));
  console.log(`📡 Running on: http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${API_KEY ? '✅ Configured' : '❌ Missing (check .env file)'}`);
  console.log(`💾 Cache Duration: ${CACHE_DURATION}ms`);
  console.log(`🌐 CORS: Enabled for all origins`);
  console.log('='.repeat(50) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  cache.clear();
  process.exit(0);
});
