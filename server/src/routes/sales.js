const express = require('express');
const db = require('../db');

const router = express.Router();

// POST /api/sales
// body: { customer, memberId, cashReceived, paymentType, items: [{ productId, qty }] }
router.post('/', (req, res) => {
  // Sale creation is disabled temporarily.
  return res.status(410).json({ error: 'Sale creation disabled' });
});

// GET /api/sales — recent sales, newest first
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM sales ORDER BY id DESC LIMIT 50').all();
  res.json(rows);
});

// GET /api/sales/:id — a sale with its line items
router.get('/:id', (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(req.params.id);
  res.json({ ...sale, items });
});

module.exports = router;
