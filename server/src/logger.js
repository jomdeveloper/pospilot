const fs = require('fs');
const path = require('path');

/**
 * Minimal rotating file logger for production support.
 *
 * Writes one file per day (`server-YYYY-MM-DD.log`) into a logs directory,
 * derived from the live database location so it works in both dev
 * (`server/data/logs`) and packaged Electron (`userData/data/logs`). The
 * directory can be overridden with POSPILOT_LOG_DIR. Logging is best-effort:
 * a failed write never crashes the app.
 */
let logDir = null;

function resolveLogDir() {
  if (logDir) return logDir;
  if (process.env.POSPILOT_LOG_DIR) {
    logDir = process.env.POSPILOT_LOG_DIR;
    return logDir;
  }
  try {
    // Lazy require — the logger is imported early by several callers and db
    // itself is not always initialized yet.
    const { dbPath } = require('./db');
    logDir = path.join(path.dirname(dbPath), 'logs');
  } catch (_error) {
    logDir = path.join(process.cwd(), 'logs');
  }
  return logDir;
}

/** Explicitly point the logger at a directory (used by Electron main). */
function initLogger(dir) {
  if (dir) logDir = String(dir);
  return logDir;
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function write(level, scope, message, meta) {
  const line = `[${stamp()}] ${level} ${scope ? '[' + scope + '] ' : ''}${message}${meta !== undefined ? ' ' + JSON.stringify(meta) : ''}`;
  try {
    const dir = resolveLogDir();
    fs.mkdirSync(dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    fs.appendFileSync(path.join(dir, `server-${day}.log`), line + '\n', 'utf8');
  } catch (_error) {
    // Logging must never take the app down.
  }
  const fn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  try { fn(line); } catch (_error) { /* ignore */ }
}

module.exports = {
  initLogger,
  logDir: resolveLogDir,
  info: (scope, message, meta) => write('INFO', scope, message, meta),
  warn: (scope, message, meta) => write('WARN', scope, message, meta),
  error: (scope, message, meta) => write('ERROR', scope, message, meta),
};