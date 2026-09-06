const express = require('express');
const db = require('../db');
const { authenticate } = require('./auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const query = String(req.query.q || '').trim();
  const customers = query
    ? db.prepare("SELECT * FROM customers WHERE name LIKE ? OR COALESCE(phone, '') LIKE ? OR COALESCE(email, '') LIKE ? OR COALESCE(member_id, '') LIKE ? ORDER BY name ASC").all(...Array(4).fill(`%${query}%`))
    : db.prepare('SELECT * FROM customers ORDER BY name ASC').all();
  res.json(customers);
});

router.post('/', authenticate, (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim() || null;
  const email = String(req.body.email || '').trim() || null;
  const customerType = String(req.body.customerType || 'Walk-in').trim();
  const memberId = String(req.body.memberId || '').trim() || null;
  if (!name) return res.status(400).json({ error: 'Customer name is required' });

  try {
    const result = db.prepare('INSERT INTO customers (name, phone, email, customer_type, member_id) VALUES (?, ?, ?, ?, ?)').run(name, phone, email, customerType, memberId);
    res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid));
  } catch {
    res.status(500).json({ error: 'Unable to create customer' });
  }
});

module.exports = router;