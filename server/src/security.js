const crypto = require('crypto');

/**
 * Shared security and money helpers used across the server.
 */

/** Constant-time-ish hashing of a password salted with the username. */
function hashPassword(password, username) {
  return crypto.scryptSync(String(password), String(username || '').toLowerCase(), 64).toString('hex');
}

/** Round a number to 2 decimal places to avoid floating-point drift in money. */
function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Shared password policy. Returns an error string when the password does not
 * meet the policy, null when it is acceptable. Enforced on create and change
 * so every route behaves identically.
 */
function passwordPolicyError(password, username) {
  const pwd = String(password || '');
  if (pwd.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) {
    return 'Password must contain at least one letter and one number.';
  }
  if (username && pwd.toLowerCase().includes(String(username).toLowerCase())) {
    return 'Password must not contain the username.';
  }
  return null;
}

/**
 * Security headers for every HTTP response.
 *
 * 'unsafe-inline' for script/style is required because the bundled SPA sets
 * style attributes directly; `default-src 'self'` still blocks any remote
 * script/stylesheet/frame, which is the important part for a LAN POS.
 */
function securityHeaders() {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(), geolocation=(), payment=()'
    );
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        // Production is same-origin (127.0.0.1:4000) but preload configures the
        // API base as localhost:4000, so both must be allowed for connect-src.
        "connect-src 'self' http://localhost:4000 https://localhost:4000",
        "media-src 'self' blob: data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "worker-src 'self' blob:",
      ].join('; ')
    );
    if (req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

module.exports = { hashPassword, roundMoney, passwordPolicyError, securityHeaders };