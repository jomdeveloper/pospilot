const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { auditLog } = require('../audit');

const router = express.Router();
const sessions = new Map();

function hashPassword(password, username) {
  return crypto.scryptSync(String(password), String(username).toLowerCase(), 64).toString('hex');
}

function normalizeUser(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status,
    lastLogin: row.last_login || 'Never',
  };
}

function requireAdministrator(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = sessions.get(token);

  const role = String(session?.role || '').trim().toLowerCase();
  if (!session || !['administrator', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Only an Administrator can create accounts' });
  }

  req.session = session;
  next();
}

function requireCategoryManager(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = sessions.get(token);
  const role = String(session?.role || '').trim().toLowerCase();
  if (!session || !['administrator', 'admin', 'manager'].includes(role)) {
    return res.status(403).json({ error: 'Only a Manager or Administrator can edit categories' });
  }
  req.session = session;
  next();
}

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.status !== 'Active' || user.password_hash !== hashPassword(password, username)) {
    auditLog(req, 'Login failed', 'User', username, {}, 'Failed');
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now, user.id);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, username: user.username, role: user.role });
  req.session = { userId: user.id, username: user.username, role: user.role };
  auditLog(req, 'Login', 'User', user.id, { username: user.username });
  res.json({ ok: true, token, user: normalizeUser({ ...user, last_login: now }) });
});

module.exports = router;
module.exports.requireAdministrator = requireAdministrator;
module.exports.requireCategoryManager = requireCategoryManager;
