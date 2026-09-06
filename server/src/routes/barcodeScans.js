const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('./auth');

const router = express.Router();
const pairings = new Map();

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
    nextScanId: 1,
    latestScan: null,
  };
  pairings.set(String(req.session.userId), pairing);
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
  res.json({ connected: true, phoneToken });
});

router.get('/status', authenticate, (req, res) => {
  if (!requireCashier(req, res)) return;
  const pairing = getPairingForCashier(req.session.userId);
  res.json({ key: pairing?.key || null, connected: Boolean(pairing?.phoneTokenHash) });
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
  res.status(201).json(pairing.latestScan);
});

router.get('/latest', authenticate, (req, res) => {
  if (!requireCashier(req, res)) return;
  const pairing = getPairingForCashier(req.session.userId);
  const after = Number(req.query.after || 0);
  res.json(pairing?.latestScan && pairing.latestScan.id > after ? pairing.latestScan : null);
});

module.exports = router;