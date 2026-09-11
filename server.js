// ... all your other code ...

// GET USER'S CAMPAIGNS
app.get('/api/campaigns', authenticateToken, async (req, res) => {
  // ... code ...
});

// ADD STRIPE CODE HERE ↓↓↓
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/api/payments/subscribe', authenticateToken, async (req, res) => {
  // ... Stripe code ...
});

app.get('/api/payments/subscription', authenticateToken, async (req, res) => {
  // ... Stripe code ...
});
// ADD STRIPE CODE HERE ↑↑↑

// THEN app.listen() comes last
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});

Add the Stripe code right before the app.listen() section!

Once done, also run the SQL in DBeaver to add the stripe_customer_id column, then push!

Do this now and reply "Stripe code added ✓"! 🚀

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {

Perfect! Add the Stripe code right before that.

In Sublime:

Click right before the line const PORT = process.env.PORT || 3000;
Press Enter a couple times to create space
Paste this:
javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// CREATE SUBSCRIPTION
app.post('/api/payments/subscribe', authenticateToken, async (req, res) => {
  try {
    const { priceId } = req.body;
    
    const user = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.userId]);
    
    let customerId = user.rows[0]?.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
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
    
    const subscription = await stripe.subscriptions.create({
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
    
    const subscriptions = await stripe.subscriptions.list({
      customer: user.rows[0].stripe_customer_id,
      limit: 1
    });
    
    res.json({ subscription: subscriptions.data[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});// ... all your other code ...

// GET USER'S CAMPAIGNS
app.get('/api/campaigns', authenticateToken, async (req, res) => {
  // ... code ...
});

// ADD STRIPE CODE HERE ↓↓↓
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/api/payments/subscribe', authenticateToken, async (req, res) => {
  // ... Stripe code ...
});

app.get('/api/payments/subscription', authenticateToken, async (req, res) => {
  // ... Stripe code ...
});
// ADD STRIPE CODE HERE ↑↑↑

// THEN app.listen() comes last
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});

Add the Stripe code right before the app.listen() section!

Once done, also run the SQL in DBeaver to add the stripe_customer_id column, then push!

Do this now and reply "Stripe code added ✓"! 🚀

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {

Perfect! Add the Stripe code right before that.

In Sublime:

Click right before the line const PORT = process.env.PORT || 3000;
Press Enter a couple times to create space
Paste this:
javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// CREATE SUBSCRIPTION
app.post('/api/payments/subscribe', authenticateToken, async (req, res) => {
  try {
    const { priceId } = req.body;
    
    const user = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.userId]);
    
    let customerId = user.rows[0]?.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
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
    
    const subscription = await stripe.subscriptions.create({
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
    
    const subscriptions = await stripe.subscriptions.list({
      customer: user.rows[0].stripe_customer_id,
      limit: 1
    });
    
    res.json({ subscription: subscriptions.data[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});