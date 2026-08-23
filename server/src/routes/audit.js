const express = require('express');
const db = require('../db');
const { requireAdministrator } = require('./auth');

const router = express.Router();

router.get('/', requireAdministrator, (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit);
  res.json(rows.map((row) => ({
    ...row,
    details: JSON.parse(row.details_json || '{}'),
  })));
});

module.exports = router;