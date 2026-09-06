const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('./auth');
const { auditLog } = require('../audit');

const router = express.Router();
const managerOrAbove = requireRole('administrator', 'admin', 'manager');

function serializeApproval(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    reason: row.reason,
    details: row.details_json ? JSON.parse(row.details_json || '{}') : {},
    status: row.status,
    requestedByUserId: row.requested_by_user_id,
    requestedByUsername: row.requested_by_username,
    entityId: row.entity_id,
    requestRef: row.request_ref,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedByUsername: row.reviewed_by_username,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

router.get('/', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM approval_requests
    ORDER BY created_at DESC, id DESC
    LIMIT 200
  `).all();

  return res.json({ requests: rows.map(serializeApproval) });
});

router.post('/', authenticate, (req, res) => {
  const type = String(req.body?.type || '').trim();
  const title = String(req.body?.title || '').trim();
  const reason = String(req.body?.reason || '').trim();
  const details = req.body?.details && typeof req.body.details === 'object' ? req.body.details : {};

  if (!type || !title || !reason) {
    return res.status(400).json({ error: 'Type, title, and reason are required.' });
  }

  const requestRef = `APR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const result = db.prepare(`
    INSERT INTO approval_requests (
      type, title, reason, details_json, status, requested_by_user_id,
      requested_by_username, entity_id, request_ref
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(
    type,
    title,
    reason,
    JSON.stringify(details),
    req.session.userId,
    req.session.username,
    String(req.body?.entityId || '').trim() || null,
    requestRef
  );

  const row = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(result.lastInsertRowid);
  auditLog(req, 'Submitted approval request', 'ApprovalRequest', row.id, { type, title, requestRef });

  return res.status(201).json({ request: serializeApproval(row) });
});

router.patch('/:id', managerOrAbove, (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '').trim().toLowerCase();
  const reviewNote = String(req.body?.reviewNote || '').trim();

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Approval request id is invalid.' });
  }

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected.' });
  }

  const row = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Approval request not found.' });
  if (row.status !== 'pending') return res.status(409).json({ error: 'This request has already been reviewed.' });

  db.prepare(`
    UPDATE approval_requests
    SET status = ?, reviewed_by_user_id = ?, reviewed_by_username = ?, review_note = ?, reviewed_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(status, req.session.userId, req.session.username, reviewNote || null, id);

  const updated = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id);
  auditLog(req, `Approval request ${status}`, 'ApprovalRequest', updated.id, {
    requestRef: updated.request_ref,
    title: updated.title,
    reviewNote,
  });

  return res.json({ request: serializeApproval(updated) });
});

module.exports = router;
