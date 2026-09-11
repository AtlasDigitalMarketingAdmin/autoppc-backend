const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const stripe = require('stripe');
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

// File upload
const upload = multer({ storage: multer.memoryStorage() });

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'autoppc-secret-key-change-in-production';

// Stripe
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running!' });
});

// SIGNUP
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, name, and password required' });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, name, password) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, name, hashedPassword]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ user, token });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ 
      user: { id: user.id, email: user.email, name: user.name }, 
      token 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET CURRENT USER
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPLOAD CSV CAMPAIGNS
app.post('/api/campaigns/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const campaigns = [];
    
    return new Promise((resolve) => {
      Readable.from([req.file.buffer])
        .pipe(csv())
        .on('data', (row) => {
          campaigns.push({
            user_id: req.user.userId,
            campaign_name: row['Campaign Name'] || row['campaign_name'] || 'Unnamed',
            budget: parseFloat(row['Budget'] || row['budget'] || 0),
            spend: parseFloat(row['Spend'] || row['spend'] || 0),
            sales: parseFloat(row['Sales'] || row['sales'] || 0),
            acos: parseFloat(row['ACoS'] || row['acos'] || 0)
          });
        })
        .on('end', async () => {
          try {
            // Clear old campaigns for this user
            await pool.query('DELETE FROM campaign_metrics WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = $1)', [req.user.userId]);
            await pool.query('DELETE FROM campaigns WHERE user_id = $1', [req.user.userId]);

            // Insert new campaigns
            for (const campaign of campaigns) {
              await pool.query(
                'INSERT INTO campaigns (user_id, campaign_name, status) VALUES ($1, $2, $3)',
                [campaign.user_id, campaign.campaign_name, 'active']
              );
            }

            res.json({ success: true, campaignsImported: campaigns.length });
            resolve();
          } catch (err) {
            console.error('CSV insert error:', err);
            res.status(500).json({ error: err.message });
            resolve();
          }
        })
        .on('error', (err) => {
          console.error('CSV parse error:', err);
          res.status(400).json({ error: 'Invalid CSV file' });
          resolve();
        });
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET USER'S CAMPAIGNS
app.get('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE SUBSCRIPTION
app.post('/api/payments/subscribe', authenticateToken, async (req, res) => {
  try {
    const { priceId } = req.body;
    
    const user = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.userId]);
    
    let customerId = user.rows[0]?.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripeClient.customers.create({
        email: req.user.email
      });
      customerId = customer.id;
      
      await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.user.userId]);
    }
    
    const priceMap = {
      'starter': 'price_starter',
      'growth': 'price_growth',
      'professional': 'price_professional'
    };
    
    const subscription = await stripeClient.subscriptions.create({
      customer: customerId,
      items: [{ price: priceMap[priceId] || priceMap['starter'] }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent']
    });
    
    res.json({ 
      subscription, 
      clientSecret: subscription.latest_invoice.payment_intent.client_secret 
    });
  } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET USER SUBSCRIPTION
app.get('/api/payments/subscription', authenticateToken, async (req, res) => {
  try {
    const user = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.userId]);
    
    if (!user.rows[0]?.stripe_customer_id) {
      return res.json({ subscription: null });
    }
    
    const subscriptions = await stripeClient.subscriptions.list({
      customer: user.rows[0].stripe_customer_id,
      limit: 1
    });
    
    res.json({ subscription: subscriptions.data[0] || null });
  } catch (err) {
    console.error('Get subscription error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});