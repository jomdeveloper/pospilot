const db = require('./db');

function auditLog(req, action, entityType, entityId, details = {}, outcome = 'Success') {
  const session = req?.session;
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, actor_username, actor_role, action, entity_type, entity_id, details_json, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session?.userId || null,
    session?.username || 'system',
    session?.role || 'System',
    action,
    entityType,
    entityId == null ? null : String(entityId),
    JSON.stringify(details),
    outcome,
  );
}

module.exports = { auditLog };
