// Simple CORS proxy for OddsEngine API
// Save as: proxy.js
// Install: npm install express cors node-fetch@2
// Run: node proxy.js

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all origins
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    message: 'OddsEngine CORS Proxy',
    endpoints: {
      leagues: '/api/v1/leagues',
      events: '/api/v1/events?league=nfl',
      odds: '/api/v1/odds?event_id=EVENT_ID'
    }
  });
});

// Proxy endpoint for OddsEngine API
app.get('/api/:version/:endpoint', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ error: 'X-API-Key header required' });
    }

    const { version, endpoint } = req.params;
    const queryString = new URLSearchParams(req.query).toString();
    const url = `https://api.oddsengine.dev/${version}/${endpoint}${queryString ? '?' + queryString : ''}`;
    
    console.log(`[${new Date().toISOString()}] Proxying: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error ${response.status}: ${errorText}`);
      return res.status(response.status).json({ 
        error: `OddsEngine API returned ${response.status}`,
        details: errorText 
      });
    }

    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Success: ${Object.keys(data).join(', ')}`);
    res.json(data);

  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ 
      error: 'Proxy server error',
      message: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log('=================================');
  console.log('OddsEngine CORS Proxy Server');
  console.log('=================================');
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`Ready to proxy requests to api.oddsengine.dev`);
  console.log('=================================');
});