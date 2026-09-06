#!/usr/bin/env node
/**
 * Restore the PosPilot database from a backup snapshot.
 *
 * Usage:
 *   node server/scripts/restore-backup.js list
 *   node server/scripts/restore-backup.js <filename>   (defaults to the newest)
 *   node server/scripts/restore-backup.js <filename> --yes   (skip confirmation)
 *
 * Security: the application must be CLOSED while restoring. The live database
 * is first copied to a `pre-restore` safety file next to itself, then replaced
 * by the chosen snapshot. If the server is running, replacing the file will
 * fail on most platforms — close the app and run again.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'pospilot.db');
const NAME_PATTERN = /^pospilot-\d{8}-\d{6}(?:-\d+)?\.db$/;

function flagValue(flag) {
  const prefix = flag + '=';
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const dbPath = flagValue('--db') || process.env.POSPILOT_DB_PATH || DEFAULT_DB;

/**
 * Read the backup destination the operator chose in Settings → Backups, so
 * the restore script finds snapshots in the same place the server writes them.
 * Best-effort: if the live DB is unreadable (or better-sqlite3 is built for
 * the Electron ABI), we fall back to the default "next to the database".
 */
function readConfiguredBackupDir(targetDbPath) {
  try {
    if (!fs.existsSync(targetDbPath)) return undefined;
    const Database = require('better-sqlite3');
    const db = new Database(targetDbPath, { readonly: true });
    try {
      const row = db.prepare('SELECT data_json FROM app_settings WHERE id = 1').get();
      if (!row) return undefined;
      const parsed = JSON.parse(row.data_json || '{}');
      const dir = parsed && parsed.backupDir;
      return typeof dir === 'string' && String(dir).trim() ? String(dir).trim() : undefined;
    } finally {
      db.close();
    }
  } catch (_error) {
    return undefined;
  }
}

let backupDir =
  flagValue('--backup-dir') ||
  process.env.POSPILOT_BACKUP_DIR ||
  readConfiguredBackupDir(dbPath) ||
  path.join(path.dirname(dbPath), 'backups');

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((name) => NAME_PATTERN.test(name))
    .sort()
    .reverse();
}

function fail(message) {
  console.error(`[restore] ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const skipConfirm = args.includes('--yes');
const command = args.find((arg) => arg !== '--yes') || 'latest';

if (command === 'list') {
  const backups = listBackups();
  if (backups.length === 0) {
    console.log('No backup snapshots found in:', backupDir);
  } else {
    console.log('Backup snapshots in', backupDir);
    backups.forEach((name, index) => console.log(`  ${index === 0 ? '→ (newest) ' : '           '}${name}`));
  }
  process.exit(0);
}

const backups = listBackups();
let filename = command;
if (filename === 'latest') {
  filename = backups[0];
  if (!filename) fail(`No backups found in ${backupDir}. Nothing to restore.`);
} else if (!backups.includes(filename)) {
  fail(`Backup "${filename}" not found in ${backupDir}. Run "list" to see available snapshots.`);
}

const source = path.join(backupDir, filename);

if (!fs.existsSync(source)) fail(`Backup file is missing: ${source}`);
if (!fs.existsSync(dbPath)) fail(`Live database not found at ${dbPath}.`);

const safetyFile = `${dbPath}.pre-restore-${Date.now()}`;
console.log(`[restore] Will replace: ${dbPath}`);
console.log(`[restore] With snapshot:  ${source}`);

if (!skipConfirm) {
  console.log('[restore] Make sure the PosPilot app is CLOSED before continuing.');
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Type RESTORE to continue: ', (answer) => {
    rl.close();
    if (String(answer).trim() !== 'RESTORE') fail('Aborted — nothing was changed.');
    performRestore(source, safetyFile);
  });
} else {
  performRestore(source, safetyFile);
}

function performRestore(source, safetyFile) {
  // Safety copy of the current database before touching anything.
  fs.copyFileSync(dbPath, safetyFile);
  console.log(`[restore] Safety copy saved: ${safetyFile}`);

  try {
    fs.copyFileSync(source, dbPath);
  } catch (error) {
    console.error(`[restore] Could not replace the database:\n  ${(error && error.message) || error}`);
    console.error('[restore] The PosPilot app is probably still running. Close it and try again.');
    process.exit(1);
  }

  // Drop stale WAL/SHM files — a leftover WAL could shadow the restored file.
  for (const suffix of ['-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbPath}${suffix}`);
    } catch (_error) {
      // Nothing to clean.
    }
  }

  console.log(`[restore] Done. Database restored from ${filename}.`);
  console.log('[restore] Start PosPilot normally; the database will be migrated if needed.');
}