const express = require('express');
const db = require('../db');
const { requireRole } = require('./auth');
const { auditLog } = require('../audit');

const router = express.Router();
const requireCashierOrAbove = requireRole('administrator', 'admin', 'manager', 'cashier');

function elevated(req) {
  return ['administrator', 'admin', 'manager'].includes(String(req.session?.role || '').trim().toLowerCase());
}

function sessionActivity(req, sessionId) {
  return db.prepare(
    `SELECT 1 FROM register_cashier_activity
     WHERE cashier_session_id = ? AND user_id = ? AND status = 'Active'`
  ).get(sessionId, req.session.userId);
}

function serializePendingSale(row) {
  const originSession = row.cashier_session_id
    ? db.prepare('SELECT terminal FROM cashier_sessions WHERE id = ?').get(row.cashier_session_id)
    : null;
  return {
    id: row.id,
    cashierSessionId: row.cashier_session_id,
    originTerminal: originSession?.terminal || null,
    customerName: row.customer_name,
    customerType: row.customer_type,
    memberId: row.member_id,
    status: row.status,
    payload: row.payload_json ? JSON.parse(row.payload_json || '{}') : {},
    createdAt: row.created_at,
    recalledAt: row.recalled_at,
    recalledByUserId: row.recalled_by_user_id,
    recalledByUsername: row.recalled_by_username,
    destinationTerminal: row.destination_terminal || null,
    transferredAt: row.transferred_at,
    transferredByUsername: row.transferred_by_username,
    currentSessionId: row.current_session_id,
    currentTerminal: row.current_terminal,
    version: Number(row.version) || 1,
    completedSaleId: row.completed_sale_id || null,
  };
}

router.get('/', requireCashierOrAbove, (req, res) => {
  const terminal = String(req.query.terminal || '').trim();
  const rows = elevated(req)
    ? terminal
      ? db.prepare(`SELECT * FROM pending_sales WHERE status = 'active' AND (destination_terminal = ? OR destination_terminal IS NULL) ORDER BY created_at DESC, id DESC LIMIT 200`).all(terminal)
      : db.prepare(`SELECT * FROM pending_sales WHERE status = 'active' ORDER BY created_at DESC, id DESC LIMIT 200`).all()
    : terminal
      ? db.prepare(`
          SELECT ps.* FROM pending_sales ps
          JOIN cashier_sessions cs ON cs.terminal = ? AND cs.status = 'Open'
          JOIN register_cashier_activity rca ON rca.cashier_session_id = cs.id
          WHERE ps.status = 'active'
            AND rca.user_id = ? AND rca.status = 'Active'
            AND (ps.destination_terminal = ? OR (ps.destination_terminal IS NULL AND ps.cashier_session_id = cs.id))
          ORDER BY ps.created_at DESC, ps.id DESC LIMIT 200
        `).all(terminal, req.session.userId, terminal)
      : db.prepare(`
          SELECT ps.* FROM pending_sales ps
          JOIN register_cashier_activity rca ON rca.cashier_session_id = ps.cashier_session_id
          WHERE ps.status = 'active' AND rca.user_id = ? AND rca.status = 'Active'
          ORDER BY ps.created_at DESC, ps.id DESC LIMIT 200
        `).all(req.session.userId);

  return res.json({ pendingSales: rows.map(serializePendingSale) });
});

router.post('/', requireCashierOrAbove, (req, res) => {
  const body = req.body || {};
  const cashierSessionId = body.cashierSessionId == null || body.cashierSessionId === '' ? null : Number(body.cashierSessionId);
  const customerName = String(body.customerName || body.customer || 'Walk-in Customer').trim() || 'Walk-in Customer';
  const customerType = String(body.customerType || 'walkin').trim() || 'walkin';
  const memberId = String(body.memberId || '').trim() || null;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : { cart: [], discountPct: 0 };
  const destinationTerminal = String(body.destinationTerminal || '').trim().slice(0, 40) || null;

  if (cashierSessionId !== null && (!Number.isInteger(cashierSessionId) || cashierSessionId <= 0)) {
    return res.status(400).json({ error: 'Invalid cashier session id.' });
  }

  if (cashierSessionId !== null) {
    const session = db.prepare('SELECT id, status FROM cashier_sessions WHERE id = ?').get(cashierSessionId);
    if (!session) return res.status(404).json({ error: 'Cashier session not found.' });
    if (session.status !== 'Open') return res.status(409).json({ error: 'Cashier session is already closed.' });
    if (!elevated(req) && !sessionActivity(req, cashierSessionId)) return res.status(403).json({ error: 'You are not assigned to this register session.' });
  } else if (!elevated(req)) {
    return res.status(400).json({ error: 'An open cashier session is required.' });
  }

  if (destinationTerminal) {
    const target = db.prepare("SELECT id FROM cashier_sessions WHERE terminal = ? AND status = 'Open' ORDER BY id DESC LIMIT 1").get(destinationTerminal);
    if (!target) return res.status(409).json({ error: 'Destination POS does not have an open register.' });
    if (cashierSessionId !== null) {
      const source = db.prepare('SELECT terminal FROM cashier_sessions WHERE id = ?').get(cashierSessionId);
      if (source && source.terminal === destinationTerminal) return res.status(400).json({ error: 'Choose a different destination POS.' });
    }
  }

  const result = db.prepare(`
    INSERT INTO pending_sales (
      cashier_session_id, customer_name, customer_type, member_id, payload_json, status,
      destination_terminal, transferred_at, transferred_by_user_id, transferred_by_username
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', 'localtime') END, ?, ?)
  `).run(cashierSessionId, customerName, customerType, memberId, JSON.stringify(payload), destinationTerminal, destinationTerminal, destinationTerminal ? req.session.userId : null, destinationTerminal ? req.session.username : null);

  const row = db.prepare('SELECT * FROM pending_sales WHERE id = ?').get(result.lastInsertRowid);
  auditLog(req, destinationTerminal ? 'Transferred pending sale' : 'Held pending sale', 'PendingSale', row.id, {
    cashierSessionId,
    destinationTerminal,
    customerName,
    customerType,
    cartLines: Array.isArray(payload.cart) ? payload.cart.length : 0,
  });

  return res.status(201).json({ pendingSale: serializePendingSale(row) });
});

router.patch('/:id/recall', requireCashierOrAbove, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Pending sale id is invalid.' });
  }

  const existing = db.prepare('SELECT * FROM pending_sales WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Pending sale not found.' });
  if (existing.status !== 'active') return res.status(409).json({ error: 'This pending sale is no longer available for recall.' });
  if (existing.destination_terminal) return res.status(409).json({ error: 'This transaction must be claimed from its destination POS.' });
  if (!elevated(req) && !sessionActivity(req, existing.cashier_session_id)) return res.status(403).json({ error: 'You are not assigned to this register session.' });

    const result = db.prepare(`
    UPDATE pending_sales
    SET status = 'in_progress', recalled_at = datetime('now', 'localtime'), recalled_by_user_id = ?, recalled_by_username = ?, current_session_id = ?, current_terminal = (SELECT terminal FROM cashier_sessions WHERE id = ?), version = version + 1
    WHERE id = ? AND status = 'active' AND version = ?
    `).run(req.session.userId, req.session.username, existing.cashier_session_id, existing.cashier_session_id, id, existing.version || 1);
  if (result.changes !== 1) return res.status(409).json({ error: 'This pending sale was claimed by another cashier.' });

  const row = db.prepare('SELECT * FROM pending_sales WHERE id = ?').get(id);
  auditLog(req, 'Recalled pending sale', 'PendingSale', row.id, {
    cashierSessionId: row.cashier_session_id,
    customerName: row.customer_name,
  });

  return res.json({ pendingSale: serializePendingSale(row), recalled: true });
});

router.patch('/:id/claim', requireCashierOrAbove, (req, res) => {
  const id = Number(req.params.id);
  const terminal = String(req.body?.terminal || '').trim();
  const sessionId = Number(req.body?.cashierSessionId);
  if (!Number.isInteger(id) || id <= 0 || !terminal || !Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: 'A valid transaction, terminal, and cashier session are required.' });
  }
  const session = db.prepare("SELECT id, terminal, status FROM cashier_sessions WHERE id = ?").get(sessionId);
  if (!session || session.status !== 'Open' || session.terminal !== terminal) return res.status(409).json({ error: 'The destination register is not open.' });
  if (!elevated(req) && !sessionActivity(req, sessionId)) return res.status(403).json({ error: 'You are not assigned to the destination register.' });
  const existing = db.prepare('SELECT * FROM pending_sales WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Pending sale not found.' });
  const result = db.prepare(`
    UPDATE pending_sales
    SET status = 'in_progress', recalled_at = datetime('now', 'localtime'), recalled_by_user_id = ?, recalled_by_username = ?, current_session_id = ?, current_terminal = ?, version = version + 1
    WHERE id = ? AND status = 'active' AND destination_terminal = ? AND version = ?
  `).run(req.session.userId, req.session.username, sessionId, terminal, id, terminal, existing.version || 1);
  if (result.changes !== 1) return res.status(409).json({ error: 'This transferred transaction is no longer available.' });
  const row = db.prepare('SELECT * FROM pending_sales WHERE id = ?').get(id);
  auditLog(req, 'Claimed transferred pending sale', 'PendingSale', id, { terminal, cashierSessionId: sessionId });
  return res.json({ pendingSale: serializePendingSale(row), recalled: true });
});

function transitionPendingSale(req, res, nextStatus, message) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Pending sale id is invalid.' });
  const existing = db.prepare('SELECT * FROM pending_sales WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Pending sale not found.' });
  if (!elevated(req) && Number(existing.recalled_by_user_id) !== Number(req.session.userId)) {
    return res.status(403).json({ error: 'Only the cashier who recalled this sale can change it.' });
  }
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

router.patch('/:id/complete', requireCashierOrAbove, (req, res) => transitionPendingSale(req, res, 'completed', 'This pending sale is not in progress.'));
router.patch('/:id/cancel', requireCashierOrAbove, (req, res) => transitionPendingSale(req, res, 'cancelled', 'This pending sale is not in progress.'));

module.exports = router;
