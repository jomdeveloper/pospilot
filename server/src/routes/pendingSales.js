const express = require('express');
const db = require('../db');
const { authenticate } = require('./auth');
const { auditLog } = require('../audit');

const router = express.Router();

function serializePendingSale(row) {
  return {
    id: row.id,
    cashierSessionId: row.cashier_session_id,
    customerName: row.customer_name,
    customerType: row.customer_type,
    memberId: row.member_id,
    status: row.status,
    payload: row.payload_json ? JSON.parse(row.payload_json || '{}') : {},
    createdAt: row.created_at,
    recalledAt: row.recalled_at,
    recalledByUserId: row.recalled_by_user_id,
    recalledByUsername: row.recalled_by_username,
  };
}

router.get('/', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM pending_sales
    WHERE status = 'active'
    ORDER BY created_at DESC, id DESC
    LIMIT 200
  `).all();

  return res.json({ pendingSales: rows.map(serializePendingSale) });
});

router.post('/', authenticate, (req, res) => {
  const body = req.body || {};
  const cashierSessionId = body.cashierSessionId == null || body.cashierSessionId === '' ? null : Number(body.cashierSessionId);
  const customerName = String(body.customerName || body.customer || 'Walk-in Customer').trim() || 'Walk-in Customer';
  const customerType = String(body.customerType || 'walkin').trim() || 'walkin';
  const memberId = String(body.memberId || '').trim() || null;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : { cart: [], discountPct: 0 };

  if (cashierSessionId !== null && (!Number.isInteger(cashierSessionId) || cashierSessionId <= 0)) {
    return res.status(400).json({ error: 'Invalid cashier session id.' });
  }

  if (cashierSessionId !== null) {
    const session = db.prepare('SELECT id, status FROM cashier_sessions WHERE id = ?').get(cashierSessionId);
    if (!session) return res.status(404).json({ error: 'Cashier session not found.' });
    if (session.status !== 'Open') return res.status(409).json({ error: 'Cashier session is already closed.' });
  }

  const result = db.prepare(`
    INSERT INTO pending_sales (
      cashier_session_id, customer_name, customer_type, member_id, payload_json, status
    ) VALUES (?, ?, ?, ?, ?, 'active')
  `).run(cashierSessionId, customerName, customerType, memberId, JSON.stringify(payload));

  const row = db.prepare('SELECT * FROM pending_sales WHERE id = ?').get(result.lastInsertRowid);
  auditLog(req, 'Held pending sale', 'PendingSale', row.id, {
    cashierSessionId,
    customerName,
    customerType,
    cartLines: Array.isArray(payload.cart) ? payload.cart.length : 0,
  });

  return res.status(201).json({ pendingSale: serializePendingSale(row) });
});

router.patch('/:id/recall', authenticate, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Pending sale id is invalid.' });
  }

  const existing = db.prepare('SELECT * FROM pending_sales WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Pending sale not found.' });
  if (existing.status !== 'active') return res.status(409).json({ error: 'This pending sale is no longer available for recall.' });

  db.prepare(`
    UPDATE pending_sales
    SET status = 'in_progress', recalled_at = datetime('now', 'localtime'), recalled_by_user_id = ?, recalled_by_username = ?
    WHERE id = ?
  `).run(req.session.userId, req.session.username, id);

  const row = db.prepare('SELECT * FROM pending_sales WHERE id = ?').get(id);
  auditLog(req, 'Recalled pending sale', 'PendingSale', row.id, {
    cashierSessionId: row.cashier_session_id,
    customerName: row.customer_name,
  });

  return res.json({ pendingSale: serializePendingSale(row), recalled: true });
});

function transitionPendingSale(req, res, nextStatus, message) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Pending sale id is invalid.' });
  const result = db.prepare(`
    UPDATE pending_sales
    SET status = ?
    WHERE id = ? AND status = 'in_progress'
  `).run(nextStatus, id);
  if (result.changes !== 1) return res.status(409).json({ error: message });
  const row = db.prepare('SELECT * FROM pending_sales WHERE id = ?').get(id);
  auditLog(req, nextStatus === 'completed' ? 'Completed pending sale' : 'Cancelled pending sale', 'PendingSale', id, { status: nextStatus });
  return res.json({ pendingSale: serializePendingSale(row), status: nextStatus });
}

router.patch('/:id/complete', authenticate, (req, res) => transitionPendingSale(req, res, 'completed', 'This pending sale is not in progress.'));
router.patch('/:id/cancel', authenticate, (req, res) => transitionPendingSale(req, res, 'cancelled', 'This pending sale is not in progress.'));

module.exports = router;
