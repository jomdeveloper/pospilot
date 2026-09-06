const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { auditLog } = require('../audit');
const { hashPassword, passwordPolicyError } = require('../security');

const router = express.Router();

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;      // 10 failures per 5-minute window
const LOCKOUT_MS = 5 * 60 * 1000;           // then locked out for 5 minutes
const PASSWORD_HISTORY = 3;                 // cannot reuse the last 3 passwords

/**
 * Persistent, per-username login-failure ledger. Unlike an in-memory Map it
 * survives app restarts, so restarting the app never resets a lockout.
 * Window/lockout timestamps are stored as ISO strings.
 */
function currentFailure(username) {
  return db.prepare('SELECT * FROM login_failures WHERE username = ?').get(username);
}

function clearFailure(username) {
  db.prepare('DELETE FROM login_failures WHERE username = ?').run(username);
}

function recordLoginFailure(username) {
  const now = Date.now();
  const row = currentFailure(username);
  if (!row || now - new Date(row.window_started_at).getTime() > LOGIN_WINDOW_MS) {
    db.prepare(
      `INSERT INTO login_failures (username, failed_count, window_started_at, locked_until)
       VALUES (?, 1, ?, NULL)
       ON CONFLICT(username) DO UPDATE SET failed_count = 1, window_started_at = excluded.window_started_at, locked_until = NULL`
    ).run(username, new Date(now).toISOString());
    return 1;
  }
  const count = row.failed_count + 1;
  if (count > MAX_LOGIN_ATTEMPTS) {
    // Locked out — clear the counter so the user must wait out the lock.
    db.prepare(
      `UPDATE login_failures SET failed_count = 0, locked_until = ? WHERE username = ?`
    ).run(new Date(now + LOCKOUT_MS).toISOString(), username);
    return count;
  }
  db.prepare('UPDATE login_failures SET failed_count = ? WHERE username = ?').run(count, username);
  return count;
}

/** True while the account is inside its lockout window. */
function isLockedOut(username) {
  const row = currentFailure(username);
  if (!row || !row.locked_until) return false;
  return Date.now() < new Date(row.locked_until).getTime();
}

function lockoutRemainingSeconds(username) {
  const row = currentFailure(username);
  if (!row || !row.locked_until) return 0;
  return Math.max(0, Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000));
}

/** Delete every session that has already expired. Returns rows removed. */
function cleanupSessions() {
  const expired = new Date().toISOString();
  const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(expired);
  return result.changes;
}

/** Revoke every session for a user except the current one (by token). */
function revokeAllSessions(username, exceptToken) {
  const result = db.prepare('DELETE FROM sessions WHERE username = ? AND token_hash != ?')
    .run(username, tokenHash(String(exceptToken || '')));
  return result.changes;
}

/** Total active sessions for a user (used by the Settings UI). */
function countUserSessions(username) {
  return db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE username = ?').get(username).c;
}

/** Does the password collide with one of the user's recent passwords? */
function isPasswordReused(username, password, userId) {
  const recent = db.prepare(
    'SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY id DESC LIMIT ?'
  ).all(userId, PASSWORD_HISTORY);
  return recent.some((row) => row.password_hash === hashPassword(password, username));
}

/** Record a new password in the history, pruning older entries past the window. */
function recordPasswordHistory(userId, username, password) {
  db.prepare(
    'INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)'
  ).run(userId, hashPassword(password, username));
  db.prepare(
    `DELETE FROM password_history WHERE id NOT IN (
       SELECT id FROM password_history WHERE user_id = ? ORDER BY id DESC LIMIT ?
     )`
  ).run(userId, PASSWORD_HISTORY);
}

function currentToken(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getSession(token) {
  if (!token) return undefined;
  const session = db.prepare(`
    SELECT s.user_id AS userId, s.username, s.role, s.created_at AS createdAt,
           s.expires_at AS expiresAt, u.must_change_password AS mustChangePassword
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND u.status = 'Active'
  `).get(tokenHash(token));
  if (!session) return undefined;
  if (Date.now() >= new Date(session.expiresAt).getTime()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    return undefined;
  }
  return { ...session, createdAt: new Date(session.createdAt).getTime() };
}

/** Paths a user may still hit while a password change is still required. */
function isAllowedWhilePasswordPending(req) {
  const url = String(req.originalUrl || '').split('?')[0];
  return ['/api/auth/session', '/api/auth/logout', '/api/auth/change-password', '/api/auth/revoke-all'].includes(url);
}

function authenticate(req, res, next) {
  const token = currentToken(req);
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Authentication required' });
  if (session.mustChangePassword && !isAllowedWhilePasswordPending(req)) {
    return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', error: 'You must set a new password before continuing.' });
  }
  req.session = session;
  req.token = token;
  next();
}

function requireRole(...allowedRoles) {
  const allowed = allowedRoles.map((role) => role.toLowerCase());
  return (req, res, next) => {
    const token = currentToken(req);
    const session = getSession(token);
    const role = String(session?.role || '').trim().toLowerCase();
    // No valid session → 401 (authentication problem). A session with the
    // wrong role → 403 (authorization problem).
    if (!session) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (session.mustChangePassword && !isAllowedWhilePasswordPending(req)) {
      return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', error: 'You must set a new password before continuing.' });
    }
    if (!allowed.includes(role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    req.session = session;
    req.token = token;
    next();
  };
}

function normalizeUser(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    lastLogin: row.last_login || 'Never',
  };
}

function requireAdministrator(req, res, next) {
  return requireRole('administrator', 'admin')(req, res, next);
}

function requireCategoryManager(req, res, next) {
  return requireRole('administrator', 'admin', 'manager')(req, res, next);
}

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

  // Persistent brute-force protection: per-account lockout in the database so
  // even an app restart does not reset the counter, plus a short per-IP fast
  // path below to damp distributed attempts.
  if (isLockedOut(username)) {
    const seconds = lockoutRemainingSeconds(username);
    return res.status(429).json({
      error: `Too many login attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).`,
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.status !== 'Active' || user.password_hash !== hashPassword(password, username)) {
    recordLoginFailure(username);
    auditLog(req, 'Login failed', 'User', username, {}, 'Failed');
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  clearFailure(username);
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now, user.id);
  const token = crypto.randomBytes(32).toString('hex');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
  db.prepare('INSERT INTO sessions (token_hash, user_id, username, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(tokenHash(token), user.id, user.username, user.role, createdAt.toISOString(), expiresAt.toISOString());
  req.session = { userId: user.id, username: user.username, role: user.role };
  auditLog(req, 'Login', 'User', user.id, { username: user.username });
  res.json({ ok: true, token, user: normalizeUser({ ...user, last_login: now }) });
});

router.get('/session', authenticate, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'Active'").get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  res.json({ ok: true, user: normalizeUser(user) });
});

// Change the logged-in user's password. First-login flow: seeded accounts
// (and any account still on a default password) get mustChangePassword enabled,
// which blocks everything except this endpoint until a real password is set.
router.post('/change-password', authenticate, (req, res) => {
  const currentPassword = String(req.body.currentPassword ?? '');
  const newPassword = String(req.body.newPassword ?? '');

  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'New password must be different from the current password.' });
  }
  if (!/^[\x20-\x7E]+$/.test(newPassword)) {
    return res.status(400).json({ error: 'New password may only contain printable characters.' });
  }

  const policyError = passwordPolicyError(newPassword, req.session.username);
  if (policyError) return res.status(400).json({ error: policyError });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.password_hash !== hashPassword(currentPassword, user.username)) {
    auditLog(req, 'Password change failed', 'User', user.id, {}, 'Failed');
    return res.status(403).json({ error: 'Current password is incorrect.' });
  }

  if (isPasswordReused(user.username, newPassword, user.id)) {
    return res.status(400).json({ error: `You cannot reuse any of your last ${PASSWORD_HISTORY} passwords.` });
  }

  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(hashPassword(newPassword, user.username), user.id);
  recordPasswordHistory(user.id, user.username, newPassword);
  auditLog(req, 'Changed password', 'User', user.id, {});
  res.json({ ok: true });
});

// Revoke every session for the current user except this one — a "logout all
// devices" sweep from the Settings page.
router.post('/revoke-all', authenticate, (req, res) => {
  const before = countUserSessions(req.session.username);
  const revoked = revokeAllSessions(req.session.username, req.token);
  auditLog(req, 'Revoked all sessions', 'User', req.session.userId, { before, revoked });
  res.json({ ok: true, revoked, remaining: Math.max(0, before - revoked) });
});

router.post('/logout', (req, res) => {
  const token = currentToken(req);
  const session = getSession(token);
  if (session) {
    req.session = session;
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    auditLog(req, 'Logout', 'User', session.userId, { username: session.username });
  }
  res.json({ ok: true });
});

module.exports = router;
module.exports.authenticate = authenticate;
module.exports.requireRole = requireRole;
module.exports.requireAdministrator = requireRole('administrator', 'admin');
module.exports.requireCategoryManager = requireRole('administrator', 'admin', 'manager');
module.exports.cleanupSessions = cleanupSessions;
module.exports.isLockedOut = isLockedOut;
module.exports.lockoutRemainingSeconds = lockoutRemainingSeconds;
module.exports.countUserSessions = countUserSessions;
module.exports.revokeAllSessions = revokeAllSessions;
