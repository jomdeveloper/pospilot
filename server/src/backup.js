const fs = require('fs');
const path = require('path');
const db = require('./db');

/**
 * Backup / restore helpers for the SQLite database.
 *
 * Backups are full SQLite snapshots captured through the online backup API,
 * so they are consistent even while the app keeps writing to the live DB
 * (WAL mode is handled automatically). Files land in a `backups/` folder next
 * to the live database and old snapshots are pruned to keep a rolling window.
 */

const PREFIX = 'pospilot-';
const NAME_PATTERN = /^pospilot-\d{8}-\d{6}(?:-\d+)?\.db$/;

function backupDir() {
  // 1) Explicit env override (highest priority — operators/scripts).
  if (process.env.POSPILOT_BACKUP_DIR) return process.env.POSPILOT_BACKUP_DIR;
  // 2) Administrator-configured directory from Settings (network share/USB/drive).
  try {
    const configured = require('./db').getAppSetting('backupDir');
    if (typeof configured === 'string' && String(configured).trim()) return String(configured).trim();
  } catch (_error) {
    // Fall through to the default below.
  }
  // 3) Default: next to the live database.
  return path.join(path.dirname(db.dbPath), 'backups');
}

/**
 * Verify a destination is usable as a backup folder: must exist/be creatable
 * and accept write+delete. Used by the Settings "Test & Save" flow and by the
 * scheduled backup so a bad network path fails loudly instead of silently.
 */
function testBackupDir(dir) {
  const target = String(dir || '').trim();
  if (!target) return { ok: false, error: 'A directory path is required.' };
  try {
    fs.mkdirSync(target, { recursive: true });
    const marker = path.join(target, `.pospilot-write-test-${process.pid}`);
    fs.writeFileSync(marker, String(Date.now()), 'utf8');
    fs.unlinkSync(marker);
    return { ok: true, path: target };
  } catch (error) {
    return { ok: false, error: (error && error.message) || 'Directory is not writable.' };
  }
}

function backupsToKeep() {
  const n = Number(process.env.POSPILOT_BACKUP_KEEP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

function ensureBackupDir() {
  fs.mkdirSync(backupDir(), { recursive: true });
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** List backups newest-first. */
function listBackups() {
  ensureBackupDir();
  return fs
    .readdirSync(backupDir())
    .filter((name) => NAME_PATTERN.test(name))
    .map((name) => {
      const filePath = path.join(backupDir(), name);
      const stat = fs.statSync(filePath);
      return {
        filename: name,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
        path: filePath,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Delete old snapshots past the retention window. */
function pruneBackups() {
  const keep = backupsToKeep();
  const old = listBackups().slice(keep);
  old.forEach((backup) => {
    try {
      fs.unlinkSync(backup.path);
    } catch (_error) {
      // File already gone or locked — ignore.
    }
  });
  return old.length;
}

/** Run PRAGMA integrity_check; returns true when the database is healthy. */
function integrityCheck() {
  try {
    const rows = db.pragma('integrity_check');
    return rows.every((row) => row && row.integrity_check === 'ok');
  } catch (_error) {
    return false;
  }
}

/** Force pending WAL frames back into the main database file. */
function checkpoint() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (_error) {
    // Non-fatal — the next checkpoint attempt will retry.
  }
}

/** Reclaim free pages; safe to call while idle (never inside a transaction). */
function vacuum() {
  try {
    db.exec('VACUUM');
  } catch (error) {
    console.warn('Database VACUUM failed:', (error && error.message) || error);
  }
}

function vacuumMarkerFile() {
  return path.join(backupDir(), '.last-vacuum');
}

/** Vacuum at most once a week, and only once the DB has grown past 10 MB. */
function vacuumIfDue() {
  const thresholdBytes = 10 * 1024 * 1024;
  try {
    const stat = fs.statSync(db.dbPath);
    if (stat.size < thresholdBytes) return;
  } catch (_error) {
    return;
  }
  const marker = vacuumMarkerFile();
  let lastTime = 0;
  try {
    lastTime = Number(fs.readFileSync(marker, 'utf8')) || 0;
  } catch (_error) {
    // First run — treat as due.
  }
  if (Date.now() - lastTime < 7 * 24 * 60 * 60 * 1000) return;
  vacuum();
  checkpoint();
  try {
    fs.writeFileSync(marker, String(Date.now()), 'utf8');
  } catch (_error) {
    // Marker write failure is non-fatal.
  }
}

/** Create one consistent snapshot; returns { filename, path, size }. */
async function createBackup() {
  ensureBackupDir();
  const base = `${PREFIX}${timestamp()}`;
  let dest = path.join(backupDir(), `${base}.db`);
  let suffix = 1;
  while (fs.existsSync(dest)) {
    dest = path.join(backupDir(), `${base}-${suffix}.db`);
    suffix += 1;
  }
  await db.backup(dest);
  pruneBackups();
  return { filename: path.basename(dest), path: dest, size: fs.statSync(dest).size };
}

/**
 * Resolve a user-supplied backup filename to an absolute path strictly inside
 * the backup directory (blocks path traversal).
 */
function safeResolve(name) {
  if (!name || typeof name !== 'string' || !NAME_PATTERN.test(name)) return null;
  const root = path.resolve(backupDir());
  const full = path.resolve(root, name);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

let timer = null;

/**
 * Start periodic automatic backups: one shortly after boot (so every start
 * produces a fresh snapshot) then every `intervalMs`. Returns a handle that
 * can be passed to stopBackups() (e.g. on Electron shutdown).
 */
function scheduleBackups({ intervalMs = 6 * 60 * 60 * 1000, startupDelayMs = 5000 } = {}) {
  if (timer) return timer;
  const logger = require('./logger');
  const runOnce = () => {
    createBackup()
      .then((snapshot) => {
        logger.info('backup', 'Automatic backup created', { file: snapshot.filename, size: snapshot.size });
        if (!integrityCheck()) {
          logger.error('backup', 'Database integrity check FAILED — restore from a backup snapshot and investigate.');
        }
        vacuumIfDue();
      })
      .catch((error) => {
        logger.error('backup', 'Automatic database backup failed', { error: (error && error.message) || String(error) });
      });
  };
  const timeout = setTimeout(runOnce, startupDelayMs);
  const interval = setInterval(runOnce, intervalMs);
  // Background maintenance: unref so these never keep the process alive on
  // their own (the HTTP server / Electron lifecycle owns shutdown).
  if (timeout.unref) timeout.unref();
  if (interval.unref) interval.unref();
  timer = { timeout, interval };
  return timer;
}

function stopBackups() {
  if (!timer) return;
  clearTimeout(timer.timeout);
  clearInterval(timer.interval);
  timer = null;
}

module.exports = {
  backupDir,
  createBackup,
  listBackups,
  pruneBackups,
  safeResolve,
  scheduleBackups,
  stopBackups,
  backupsToKeep,
  integrityCheck,
  vacuum,
  checkpoint,
  vacuumIfDue,
  testBackupDir,
};