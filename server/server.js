// ==========================================================
// KEIRA'S DINER - BACKEND SERVER (MySQL version)
// ==========================================================

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================================
// SETTINGS
// ==========================================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'KeiraAdmin2025!';

// ==========================================================
// MYSQL CONNECTION POOL
// ==========================================================
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

// ==========================================================
// MIDDLEWARE
// ==========================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================
// HELPERS
// ==========================================================
function generateOrderId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return 'KD-' + timestamp + '-' + random;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT token FROM admin_tokens WHERE token = ?',
      [token]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }
    next();
  } catch (err) {
    console.error('Auth check error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ==========================================================
// PUBLIC ROUTES
// ==========================================================

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: "Keira's Diner backend", time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Database not reachable.' });
  }
});

app.post('/api/orders', async (req, res) => {
  const { name, phone, payment, instructions, items, total } = req.body;

  if (!name || !phone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: name, phone, or items.'
    });
  }

  const orderId = generateOrderId();

  try {
    await pool.execute(
      'INSERT INTO orders (id, name, phone, payment, instructions, total, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [orderId, name.trim(), phone.trim(), payment || 'Not specified', (instructions || '').trim(), total || 0, 'new']
    );

    for (const item of items) {
      await pool.execute(
        'INSERT INTO order_items (order_id, name, price, quantity) VALUES (?, ?, ?, ?)',
        [orderId, item.name, item.price, item.quantity]
      );
    }

    console.log(`New order saved: ${orderId} from ${name} - KES ${total}`);

    const order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      name: name.trim(),
      phone: phone.trim(),
      payment: payment || 'Not specified',
      instructions: (instructions || '').trim(),
      items: items,
      total: total || 0,
      status: 'new'
    };

    res.status(201).json({
      success: true,
      message: 'Order received successfully.',
      order: order
    });
  } catch (err) {
    console.error('Error saving order:', err);
    res.status(500).json({ success: false, message: 'Server error saving order.' });
  }
});

// ==========================================================
// ADMIN AUTH ROUTES
// ==========================================================

app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, message: 'Password required.' });
  }

  if (password !== ADMIN_PASSWORD) {
    console.log('Failed admin login attempt.');
    return res.status(401).json({ success: false, message: 'Incorrect password.' });
  }

  const token = generateToken();

  try {
    await pool.execute(
      'INSERT INTO admin_tokens (token, created_at) VALUES (?, NOW())',
      [token]
    );
    console.log('Admin logged in. Token saved to database.');
    res.json({ success: true, message: 'Login successful.', token: token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error saving token.' });
  }
});

app.post('/api/admin/logout', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (token) {
    try {
      await pool.execute('DELETE FROM admin_tokens WHERE token = ?', [token]);
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

  res.json({ success: true, message: 'Logged out.' });
});

// ==========================================================
// PROTECTED ADMIN ROUTES
// ==========================================================

app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const [orders] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');

    for (const order of orders) {
      const [items] = await pool.execute(
        'SELECT name, price, quantity FROM order_items WHERE order_id = ?',
        [order.id]
      );
      order.items = items;
      order.createdAt = order.created_at;
      order.status = order.status || 'new';
    }

    res.json({ success: true, count: orders.length, orders: orders });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ success: false, message: 'Server error fetching orders.' });
  }
});

app.get('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const [orders] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    const order = orders[0];
    const [items] = await pool.execute(
      'SELECT name, price, quantity FROM order_items WHERE order_id = ?',
      [order.id]
    );
    order.items = items;
    order.createdAt = order.created_at;
    res.json({ success: true, order: order });
  } catch (err) {
    console.error('Error fetching order:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.patch('/api/orders/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, message: 'Status required.' });
  }
  try {
    await pool.execute('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true, message: 'Order updated.' });
  } catch (err) {
    console.error('Error updating order:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    await pool.execute('DELETE FROM orders WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Order deleted.' });
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ==========================================================
// START THE SERVER
// ==========================================================
app.listen(PORT, () => {
  console.log('');
  console.log('==================================================');
  console.log("  Keira's Diner backend is running (MySQL)");
  console.log('  http://localhost:' + PORT);
  console.log('==================================================');
  console.log('');
});