const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { requireAdministrator } = require('./auth');
const { auditLog } = require('../audit');

const router = express.Router();
const ROLES = ['Administrator', 'Manager', 'Pharmacist', 'Cashier', 'Inventory Clerk', 'Auditor'];

function hashPassword(password, username) {
  return crypto.scryptSync(String(password), String(username).toLowerCase(), 64).toString('hex');
}

function normalizeUser(row) {
  const { password_hash: _passwordHash, last_login, ...safeUser } = row;
  return {
    ...safeUser,
    lastLogin: last_login || 'Never',
  };
}

router.get('/', (req, res) => {
  const query = String(req.query.q || '').trim();
  const rows = query
    ? db.prepare(`
        SELECT * FROM users
        WHERE name LIKE ? OR username LIKE ? OR COALESCE(email, '') LIKE ? OR role LIKE ? OR status LIKE ?
        ORDER BY name ASC
      `).all(...Array(5).fill(`%${query}%`))
    : db.prepare('SELECT * FROM users ORDER BY name ASC').all();

  res.json(rows.map(normalizeUser));
});

router.post('/', requireAdministrator, (req, res) => {
  const name = String(req.body.name || '').trim();
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim() || null;
  const role = String(req.body.role || 'Cashier').trim();
  const password = String(req.body.password || '');

  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username, and password are required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid user role' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'Username already exists' });

  try {
    const result = db.prepare(`
      INSERT INTO users (name, username, email, role, status, password_hash)
      VALUES (?, ?, ?, ?, 'Active', ?)
    `).run(name, username, email, role, hashPassword(password, username));
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    auditLog(req, 'Created user', 'User', user.id, { username: user.username, role: user.role });
    res.status(201).json(normalizeUser(user));
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Unable to create user' });
  }
});

router.patch('/:id/status', (req, res) => {
  const status = String(req.body.status || '').trim();
  if (!['Active', 'Inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'Administrator' && status === 'Inactive') {
    return res.status(403).json({ error: 'Administrator accounts cannot be deactivated' });
  }

  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
  auditLog(req, 'Updated user status', 'User', user.id, { previousStatus: user.status, status });
  res.json(normalizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)));
});

module.exports = router;