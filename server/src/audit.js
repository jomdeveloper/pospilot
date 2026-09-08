const db = require('./db');
const logger = require('./logger');

const SENSITIVE_KEY = /password|token|secret|authorization|cookie|credential|api.?key/i;

function sanitize(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 1000 ? `${value.slice(0, 1000)}...[truncated]` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitize(item, depth + 1),
    ]));
  }
  return String(value);
}

function categoryFor(action, entityType) {
  const text = `${action || ''} ${entityType || ''}`.toLowerCase();
  if (/login|password|session|logout|user/.test(text)) return 'Authentication';
  if (/cashier|register|cash|drawer/.test(text)) return 'Register';
  if (/sale|refund|void|pending/.test(text)) return 'Sales';
  if (/inventory|stock|transfer/.test(text)) return 'Inventory';
  if (/backup|restore|setting|scanner|barcode/.test(text)) return 'System';
  if (/approval/.test(text)) return 'Approvals';
  return 'Master Data';
}

function terminalFor(req, details) {
  return String(details?.terminal || req?.body?.terminal || req?.query?.terminal || '').trim() || null;
}

function auditLog(req, action, entityType, entityId, details = {}, outcome = 'Success') {
  const session = req?.session;
  const safeDetails = sanitize(details && typeof details === 'object' ? details : {});
  const requestId = String(req?.headers?.['x-request-id'] || req?.requestId || '').trim() || null;
  const userAgent = String(req?.headers?.['user-agent'] || '').trim() || null;
  db.prepare(`
    INSERT INTO audit_logs (
      actor_user_id, actor_username, actor_role, action, category, entity_type, entity_id,
      details_json, outcome, terminal, request_id, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session?.userId || null,
    session?.username || 'system',
    session?.role || 'System',
    action,
    categoryFor(action, entityType),
    entityType,
    entityId == null ? null : String(entityId),
    JSON.stringify(safeDetails),
    outcome,
    terminalFor(req, safeDetails),
    requestId,
    req?.ip || req?.socket?.remoteAddress || null,
    userAgent,
  );
}

function auditSystemEvent(req, action, entityType, details = {}, outcome = 'Failed') {
  try {
    auditLog(req, action, entityType, details.requestId || null, details, outcome);
    return true;
  } catch (error) {
    logger.warn('audit', 'Unable to persist system audit event', { error: error?.message || String(error) });
    return false;
  }
}

module.exports = { auditLog, auditSystemEvent, sanitize };
