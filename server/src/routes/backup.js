const path = require('path');
const fs = require('fs');
const express = require('express');
const { requireAdministrator } = require('./auth');
const { auditLog } = require('../audit');
const { createBackup, listBackups, restoreBackup, safeResolve, testBackupDir } = require('../backup');

const router = express.Router();

// POST /api/backups/test-dir — verify a candidate backup destination (admin
// only). Used by Settings before persisting the folder.
router.post('/test-dir', requireAdministrator, (req, res) => {
  const result = testBackupDir(req.body && req.body.dir);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// GET /api/backups — list available snapshots (newest first)
router.get('/', requireAdministrator, (req, res) => {
  res.json({ backups: listBackups() });
});

// POST /api/backups — create a snapshot right now
router.post('/', requireAdministrator, async (req, res) => {
  try {
    const backup = await createBackup();
    auditLog(req, 'Created database backup', 'Backup', backup.filename, { size: backup.size });
    res.status(201).json({ ok: true, backup });
  } catch (error) {
    res.status(500).json({ error: (error && error.message) || 'Unable to create backup' });
  }
});

// GET /api/backups/:name/download — download a snapshot (admin only)
router.get('/:name/download', requireAdministrator, (req, res) => {
  const filePath = safeResolve(req.params.name);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup not found' });
  }
  res.download(filePath, path.basename(filePath));
});

// POST /api/backups/:name/restore — restore a database snapshot (admin only)
router.post('/:name/restore', requireAdministrator, (req, res) => {
  try {
    const result = restoreBackup(req.params.name);
    auditLog(req, 'Restored database backup', 'Backup', result.filename, {
      source: result.path,
      safetyFile: result.safetyFile,
      restoredAt: result.restoredAt,
    });
    res.json({ ok: true, backup: { filename: result.filename, path: result.path, restoredAt: result.restoredAt } });
  } catch (error) {
    const message = (error && error.message) || 'Unable to restore backup';
    const status = /Close PosPilot|Could not restore|not found/i.test(message) ? 409 : 500;
    res.status(status).json({ error: message });
  }
});

module.exports = router;