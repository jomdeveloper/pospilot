const express = require('express');
const db = require('../db');
const { requireRole } = require('./auth');

const router = express.Router();
const requireAuditAccess = requireRole('administrator', 'admin', 'auditor');

function parseDetails(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return { _parseError: true };
  }
}

router.get('/', requireAuditAccess, (req, res) => {
  const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 50));
  const where = [];
  const params = [];
  const add = (clause, ...values) => { where.push(clause); params.push(...values); };

  const beforeId = Number(req.query.beforeId);
  if (Number.isInteger(beforeId) && beforeId > 0) add('id < ?', beforeId);
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  if (from) add('created_at >= ?', `${from} 00:00:00`);
  if (to) add('created_at <= ?', `${to} 23:59:59`);
  const actor = String(req.query.actor || '').trim();
  const action = String(req.query.action || '').trim();
  const category = String(req.query.category || '').trim();
  const entityType = String(req.query.entityType || '').trim();
  const entityId = String(req.query.entityId || '').trim();
  const outcome = String(req.query.outcome || '').trim();
  const query = String(req.query.q || '').trim();
  if (actor) add('(actor_username LIKE ? OR actor_user_id = ?)', `%${actor}%`, Number(actor) || -1);
  if (action) add('action LIKE ?', `%${action}%`);
  if (category) add('category = ?', category);
  if (entityType) add('entity_type = ?', entityType);
  if (entityId) add('entity_id = ?', entityId);
  if (outcome) add('outcome = ?', outcome);
  if (query) add('(actor_username LIKE ? OR action LIKE ? OR entity_type LIKE ? OR entity_id LIKE ? OR details_json LIKE ?)', ...Array(5).fill(`%${query}%`));

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS total FROM audit_logs ${whereSql}`).get(...params).total;
  const rows = db.prepare(`
    SELECT id, actor_user_id, actor_username, actor_role, action, category, entity_type,
           entity_id, details_json, outcome, terminal, request_id, ip_address, user_agent, created_at
    FROM audit_logs ${whereSql} ORDER BY id DESC LIMIT ?
  `).all(...params, limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  res.json({
    logs: page.map(({ details_json: _detailsJson, ...row }) => ({ ...row, details: parseDetails(_detailsJson) })),
    total,
    nextCursor: hasMore ? page[page.length - 1].id : null,
    hasMore,
  });
});

module.exports = router;