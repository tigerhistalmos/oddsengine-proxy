require('dotenv').config();  // ← ADD THIS LINE AT THE TOP

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;  // Your port
const ODDSENGINE_BASE_URL = 'https://api.oddsengine.dev';
const API_KEY = process.env.ODDSENGINE_API_KEY;

// CRITICAL: Enable CORS for localhost
app.use(cors({
  origin: '*',  // Allow all origins (or specify 'http://localhost:8080')
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key']
}));

app.use(express.json());

// Simple cache
const cache = new Map();
const CACHE_DURATION = 60 * 1000;

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    cache_size: cache.size,
    port: PORT
  });
});

// Proxy all /v1/* routes
app.get('/v1/*', async (req, res) => {
  try {
    const path = req.path;
    const queryString = new URLSearchParams(req.query).toString();
    const url = `${ODDSENGINE_BASE_URL}${path}${queryString ? '?' + queryString : ''}`;

    console.log(`Proxying: ${url}`);

    // Check cache
    const cacheKey = url;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('✅ Cache HIT');
      return res.json(cached.data);
    }

    // Get API key from header or env
    const apiKey = req.headers['x-api-key'] || API_KEY;
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'missing_api_key',
        message: 'API key required via X-API-Key header or env var'
      });
    }

    // Forward to OddsEngine
    const response = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OddsEngine error: ${response.status}`);
      return res.status(response.status).json({
        error: 'api_error',
        message: errorText,
        status: response.status
      });
    }

    const data = await response.json();
    
    // Cache it
    cache.set(cacheKey, { data, timestamp: Date.now() });
    console.log('📝 Cache MISS - stored');
    
    res.json(data);

  } catch (error) {
    console.error('❌ Proxy error:', error);
    res.status(500).json({
      error: 'proxy_error',
      message: error.message
    });
  }
});

// Clear cache endpoint
app.post('/cache/clear', (req, res) => {
  cache.clear();
  res.json({ message: 'Cache cleared', size: 0 });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Railway Proxy Server`);
  console.log(`📡 Running on: http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`💾 Cache: ${CACHE_DURATION}ms duration\n`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  cache.clear();
  process.exit(0);
});