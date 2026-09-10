const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://autoppc-frontend.vercel.app',
    'https://www.autoppc.io'
  ]
}));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Amazon API config
const AMAZON_CLIENT_ID = process.env.AMAZON_CLIENT_ID;
const AMAZON_CLIENT_SECRET = process.env.AMAZON_CLIENT_SECRET;
const AMAZON_REDIRECT_URI = process.env.AMAZON_REDIRECT_URI;
const AMAZON_AUTH_URL = 'https://www.amazon.com/ap/oa';
const AMAZON_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const AMAZON_API_URL = 'https://advertising-api.amazon.com';

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running!' });
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create user
app.post('/api/users', async (req, res) => {
  try {
    const { email, name } = req.body;
    const result = await pool.query(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *',
      [email, name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Amazon OAuth: Start login
app.get('/auth/amazon', (req, res) => {
  const state = Math.random().toString(36).substring(7);
  const authUrl = `${AMAZON_AUTH_URL}?client_id=${AMAZON_CLIENT_ID}&scope=advertising::campaign_management&response_type=code&redirect_uri=${AMAZON_REDIRECT_URI}&state=${state}`;
  res.json({ url: authUrl });
});

// Amazon OAuth: Callback
app.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'No authorization code' });
    }
    const tokenResponse = await axios.post(AMAZON_TOKEN_URL, null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: AMAZON_REDIRECT_URI,
        client_id: AMAZON_CLIENT_ID,
        client_secret: AMAZON_CLIENT_SECRET
      }
    });
    const { access_token } = tokenResponse.data;
    res.json({ success: true, access_token: access_token.substring(0, 20) + '...' });
  } catch (err) {
    console.error('OAuth error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to authorize with Amazon' });
  }
});

// Get campaigns from Amazon
app.get('/api/amazon/campaigns', async (req, res) => {
  try {
    const { access_token } = req.query;
    if (!access_token) {
      return res.status(400).json({ error: 'Access token required' });
    }
    const response = await axios.get(`${AMAZON_API_URL}/v2/campaigns`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data);
  } catch (err) {
    console.error('Amazon API error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch campaigns from Amazon' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});