const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/products?q=paracetamol
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();

  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db
      .prepare(
        `SELECT * FROM medicines
         WHERE name LIKE ? OR generic LIKE ? OR barcode LIKE ?
         ORDER BY name ASC`
      )
      .all(like, like, like);
  } else {
    rows = db.prepare('SELECT * FROM medicines ORDER BY name ASC').all();
  }

  res.json(rows);
});

// GET /api/products/barcode/:barcode
router.get('/barcode/:barcode', (req, res) => {
  const row = db.prepare('SELECT * FROM medicines WHERE barcode = ?').get(req.params.barcode);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(row);
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM medicines WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(row);
});

module.exports = router;
