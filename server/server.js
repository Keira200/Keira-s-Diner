// ==========================================================
// KEIRA'S DINER - BACKEND SERVER
// ==========================================================

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const ORDERS_FILE = path.join(__dirname, 'orders.json');

// ==========================================================
// ADMIN AUTHENTICATION
// CHANGE THE PASSWORD BELOW TO SOMETHING ONLY YOU KNOW
// ==========================================================
const ADMIN_PASSWORD = 'KeiraAdmin2025!';
const ADMIN_TOKENS = new Set();

// ==========================================================
// MIDDLEWARE
// ==========================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================
// HELPERS
// ==========================================================
function readOrders() {
  try {
    if (!fs.existsSync(ORDERS_FILE)) return [];
    const data = fs.readFileSync(ORDERS_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading orders:', err);
    return [];
  }
}

function writeOrders(orders) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing orders:', err);
  }
}

function generateOrderId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return 'KD-' + timestamp + '-' + random;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token || !ADMIN_TOKENS.has(token)) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
  }

  next();
}

// ==========================================================
// PUBLIC ROUTES
// ==========================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: "Keira's Diner backend", time: new Date().toISOString() });
});

// Create a new order (public - customers use this)
app.post('/api/orders', (req, res) => {
  const { name, phone, payment, instructions, items, total } = req.body;

  if (!name || !phone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: name, phone, or items.'
    });
  }

  const order = {
    id: generateOrderId(),
    createdAt: new Date().toISOString(),
    name: name.trim(),
    phone: phone.trim(),
    payment: payment || 'Not specified',
    instructions: (instructions || '').trim(),
    items: items,
    total: total || 0,
    status: 'new'
  };

  const orders = readOrders();
  orders.unshift(order);
  writeOrders(orders);

  console.log(`New order received: ${order.id} from ${order.name} - KES ${order.total}`);

  res.status(201).json({
    success: true,
    message: 'Order received successfully.',
    order: order
  });
});

// ==========================================================
// ADMIN AUTH ROUTES
// ==========================================================

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: 'Password required.' });
  }

  if (password !== ADMIN_PASSWORD) {
    console.log('Failed admin login attempt.');
    return res.status(401).json({ success: false, message: 'Incorrect password.' });
  }

  const token = generateToken();
  ADMIN_TOKENS.add(token);

  console.log('Admin logged in. Token issued.');

  res.json({ success: true, message: 'Login successful.', token: token });
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (token) {
    ADMIN_TOKENS.delete(token);
  }

  res.json({ success: true, message: 'Logged out.' });
});

// ==========================================================
// PROTECTED ADMIN ROUTES
// These require a valid admin token
// ==========================================================

// Get all orders
app.get('/api/orders', requireAdmin, (req, res) => {
  const orders = readOrders();
  res.json({ success: true, count: orders.length, orders: orders });
});

// Get a single order
app.get('/api/orders/:id', requireAdmin, (req, res) => {
  const orders = readOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }
  res.json({ success: true, order: order });
});

// Update order status
app.patch('/api/orders/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  const orders = readOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }
  if (status) {
    order.status = status;
    writeOrders(orders);
  }
  res.json({ success: true, order: order });
});

// Delete an order
app.delete('/api/orders/:id', requireAdmin, (req, res) => {
  let orders = readOrders();
  const before = orders.length;
  orders = orders.filter(o => o.id !== req.params.id);
  if (orders.length === before) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }
  writeOrders(orders);
  res.json({ success: true, message: 'Order deleted.' });
});
// Redirect root to login page
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// ==========================================================
// START THE SERVER
// ==========================================================
app.listen(PORT, () => {
  console.log('');
  console.log('==================================================');
  console.log("  Keira's Diner backend is running");
  console.log('  http://localhost:' + PORT);
  console.log('  Admin login: http://localhost:' + PORT + '/login.html');
  console.log('  Admin panel: http://localhost:' + PORT + '/admin.html');
  console.log('  API health: http://localhost:' + PORT + '/api/health');
  console.log('==================================================');
  console.log('');
});