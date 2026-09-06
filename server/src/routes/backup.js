const path = require('path');
const fs = require('fs');
const express = require('express');
const { requireAdministrator } = require('./auth');
const { auditLog } = require('../audit');
const { createBackup, listBackups, safeResolve, testBackupDir } = require('../backup');

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

module.exports = router;