// Railway Proxy Server for OddsEngine API
// This proxy handles CORS, caching, and API key management

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const ODDSENGINE_BASE_URL = 'https://api.oddsengine.dev';
const API_KEY = process.env.ODDSENGINE_API_KEY; // Set this in Railway environment variables

// Enable CORS for all origins (adjust for production)
app.use(cors());
app.use(express.json());

// Simple in-memory cache (use Redis for production)
const cache = new Map();
const CACHE_DURATION = 60 * 1000; // 1 minute

// Cache middleware
function cacheMiddleware(duration) {
  return (req, res, next) => {
    const key = req.originalUrl;
    const cachedResponse = cache.get(key);

    if (cachedResponse && Date.now() - cachedResponse.timestamp < duration) {
      console.log(`Cache HIT: ${key}`);
      return res.json(cachedResponse.data);
    }

    console.log(`Cache MISS: ${key}`);
    res.sendResponse = res.json;
    res.json = (body) => {
      cache.set(key, {
        data: body,
        timestamp: Date.now()
      });
      res.sendResponse(body);
    };
    next();
  };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    cache_size: cache.size
  });
});

// Clear cache endpoint (useful for testing)
app.post('/cache/clear', (req, res) => {
  cache.clear();
  res.json({ message: 'Cache cleared', size: cache.size });
});

// Proxy endpoint for OddsEngine API
app.get('/v1/*', cacheMiddleware(CACHE_DURATION), async (req, res) => {
  try {
    // Get the path and query string
    const path = req.path; // e.g., /v1/events
    const queryString = new URLSearchParams(req.query).toString();
    const url = `${ODDSENGINE_BASE_URL}${path}${queryString ? '?' + queryString : ''}`;

    console.log(`Proxying request to: ${url}`);

    // Forward request to OddsEngine with API key
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OddsEngine API Error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: 'api_error',
        message: errorText,
        status: response.status
      });
    }

    const data = await response.json();
    
    // Add cache headers
    res.set('X-Cache', 'MISS');
    res.set('X-Cache-Duration', `${CACHE_DURATION}ms`);
    
    res.json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'proxy_error',
      message: error.message
    });
  }
});

// Rate limit info endpoint
app.get('/rate-limit', (req, res) => {
  // In a real implementation, track rate limits from OddsEngine headers
  res.json({
    message: 'Rate limit info would be tracked from OddsEngine API headers',
    limit: 200,
    window: '1 minute'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Railway Proxy Server running on port ${PORT}`);
  console.log(`📡 Proxying to: ${ODDSENGINE_BASE_URL}`);
  console.log(`🔑 API Key configured: ${API_KEY ? 'Yes' : 'No (WARNING!)'}`);
  console.log(`💾 Cache duration: ${CACHE_DURATION}ms`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  cache.clear();
  process.exit(0);
});
