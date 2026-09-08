const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('./auth');
const { auditLog } = require('../audit');

const router = express.Router();
const pairings = new Map();
const PHONE_HEARTBEAT_TIMEOUT_MS = 10000;

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getPairingForCashier(userId) {
  return pairings.get(String(userId));
}

function requireCashier(req, res) {
  if (String(req.session.role || '').trim().toLowerCase() !== 'cashier') {
    res.status(403).json({ error: 'Only a cashier can manage a scanner connection' });
    return false;
  }
  return true;
}

router.post('/pairing', authenticate, (req, res) => {
  if (!requireCashier(req, res)) return;
  const key = crypto.randomBytes(4).toString('hex').toUpperCase();
  const pairing = {
    key,
    cashierTokenHash: tokenHash(req.token),
    phoneTokenHash: null,
    lastSeenAt: null,
    nextScanId: 1,
    latestScan: null,
  };
  pairings.set(String(req.session.userId), pairing);
  auditLog(req, 'Created barcode scanner pairing', 'BarcodeScanner', req.session.userId, { cashierUserId: req.session.userId });
  res.status(201).json({ key, connected: false });
});

router.post('/connect', (req, res) => {
  const key = String(req.body.key || '').trim().toUpperCase();
  const pairing = [...pairings.values()].find((candidate) => candidate.key === key);
  if (!pairing) return res.status(404).json({ error: 'Invalid connection key' });
  const existingPhoneToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const phoneToken = existingPhoneToken || crypto.randomBytes(32).toString('hex');
  const phoneTokenHash = tokenHash(phoneToken);
  if (pairing.phoneTokenHash && pairing.phoneTokenHash !== phoneTokenHash) {
    return res.status(409).json({ error: 'This cashier already has a scanner connected' });
  }
  pairing.phoneTokenHash = phoneTokenHash;
  pairing.lastSeenAt = Date.now();
  auditLog(req, 'Connected barcode scanner', 'BarcodeScanner', pairing.key, { cashierUserId: [...pairings.entries()].find(([, value]) => value === pairing)?.[0] || null });
  res.json({ connected: true, phoneToken });
});

router.post('/heartbeat', (req, res) => {
  const phoneToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const pairing = phoneToken ? [...pairings.values()].find((candidate) => candidate.phoneTokenHash === tokenHash(phoneToken)) : null;
  if (!pairing) return res.status(403).json({ error: 'Connect this scanner to a cashier first' });
  pairing.lastSeenAt = Date.now();
  res.json({ ok: true });
});

router.get('/status', authenticate, (req, res) => {
  if (!requireCashier(req, res)) return;
  const pairing = getPairingForCashier(req.session.userId);
  const connected = Boolean(
    pairing?.phoneTokenHash &&
    pairing.lastSeenAt &&
    Date.now() - pairing.lastSeenAt <= PHONE_HEARTBEAT_TIMEOUT_MS
  );
  res.json({ key: pairing?.key || null, connected });
});

router.post('/', (req, res) => {
  const phoneToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const pairing = phoneToken ? [...pairings.values()].find((candidate) => candidate.phoneTokenHash === tokenHash(phoneToken)) : null;
  if (!pairing) return res.status(403).json({ error: 'Connect this scanner to a cashier first' });
  const barcode = String(req.body.barcode || '').trim();
  if (!barcode) return res.status(400).json({ error: 'Barcode is required' });

  pairing.latestScan = {
    id: pairing.nextScanId++,
    barcode,
    createdAt: new Date().toISOString(),
  };
  pairing.lastSeenAt = Date.now();
  auditLog(req, 'Scanned barcode', 'BarcodeScan', pairing.latestScan.id, { barcode, cashierUserId: [...pairings.entries()].find(([, value]) => value === pairing)?.[0] || null });
  res.status(201).json(pairing.latestScan);
});

router.get('/latest', authenticate, (req, res) => {
  if (!requireCashier(req, res)) return;
  const pairing = getPairingForCashier(req.session.userId);
  const after = Number(req.query.after || 0);
  const scan = pairing?.latestScan && pairing.latestScan.id > after ? pairing.latestScan : null;
  res.json(scan);
});

module.exports = router;