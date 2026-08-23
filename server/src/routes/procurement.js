const express = require('express');
const db = require('../db');
const { auditLog } = require('../audit');

const router = express.Router();

function getPurchaseOrderNumber(date = new Date()) {
  const datePart = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('');
  const prefix = `PO${datePart}`;
  const existingNumbers = db.prepare('SELECT po_number FROM purchase_orders WHERE po_number LIKE ?').all(`${prefix}%`);
  const highestSequence = existingNumbers.reduce((highest, row) => {
    const match = String(row.po_number).match(new RegExp(`^${prefix}(\\d{4})$`));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  if (highestSequence >= 9999) throw new Error(`Purchase order limit reached for ${datePart}`);
  return `${prefix}${String(highestSequence + 1).padStart(4, '0')}`;
}

function getPurchase(id) {
  const purchase = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
  if (!purchase) return null;
  return {
    ...purchase,
    items: db.prepare(`SELECT i.*, p.track_expiry, COALESCE(c.track_expiry, 0) AS configured_track_expiry
      FROM purchase_order_items i JOIN products p ON p.id = i.product_id
      LEFT JOIN product_tracking_config c ON c.product_id = p.id
      WHERE i.purchase_id = ? ORDER BY i.id`).all(id).map((item) => ({ ...item, track_expiry: Boolean(item.track_expiry || item.configured_track_expiry) })),
  };
}

router.get('/purchases', (req, res) => {
  const purchases = db.prepare('SELECT * FROM purchase_orders ORDER BY id DESC').all();
  res.json(purchases);
});

router.get('/purchases/:id', (req, res) => {
  const purchase = getPurchase(Number(req.params.id));
  if (!purchase) return res.status(404).json({ error: 'Purchase order not found' });
  res.json(purchase);
});

router.post('/purchases', (req, res) => {
  const supplier = String(req.body.supplier || '').trim();
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!supplier || items.length === 0) return res.status(400).json({ error: 'Supplier and at least one item are required' });

  const normalizedItems = items.map((item) => ({
    productId: Number(item.productId),
    qty: Number(item.qty),
    unitCost: Number(item.unitCost),
  }));

  if (normalizedItems.some((item) => !Number.isInteger(item.productId) || !Number.isInteger(item.qty) || item.qty < 1 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) {
    return res.status(400).json({ error: 'Each item needs a valid quantity and unit cost' });
  }

  const details = normalizedItems.map((item) => {
    const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(item.productId);
    if (!product) throw new Error(`Product ${item.productId} not found`);
    return { ...item, name: product.name, total: item.qty * item.unitCost };
  });

  const total = details.reduce((sum, item) => sum + item.total, 0);
  const createPurchase = db.transaction(() => {
    const result = db.prepare('INSERT INTO purchase_orders (po_number, supplier, status, total) VALUES (?, ?, ?, ?)').run(getPurchaseOrderNumber(), supplier, 'Pending', total);
    const insertItem = db.prepare('INSERT INTO purchase_order_items (purchase_id, product_id, name, qty, unit_cost, total) VALUES (?, ?, ?, ?, ?, ?)');
    details.forEach((item) => insertItem.run(result.lastInsertRowid, item.productId, item.name, item.qty, item.unitCost, item.total));
    auditLog(req, 'Created purchase order', 'Purchase Order', result.lastInsertRowid, { poNumber: getPurchase(result.lastInsertRowid).po_number, supplier, total, itemCount: details.length });
    return getPurchase(result.lastInsertRowid);
  });

  try {
    res.status(201).json(createPurchase());
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to create purchase' });
  }
});

router.get('/receiving', (req, res) => {
  const rows = db.prepare("SELECT * FROM purchase_orders WHERE status = 'Pending' ORDER BY id DESC").all();
  res.json(rows.map((row) => getPurchase(row.id)));
});

router.post('/receiving/:id/receive', (req, res) => {
  const purchase = getPurchase(req.params.id);
  if (!purchase) return res.status(404).json({ error: 'Purchase order not found' });
  if (purchase.status !== 'Pending') return res.status(409).json({ error: 'Purchase order is already received' });

  const receivedAt = String(req.body?.receivedAt || '').trim();
  if (!receivedAt || Number.isNaN(new Date(receivedAt).getTime())) return res.status(400).json({ error: 'A valid received date is required' });
  const expiryByProduct = new Map((Array.isArray(req.body?.items) ? req.body.items : []).map((item) => [Number(item.productId), String(item.expiryDate || '').trim()]));
  const receivePurchase = db.transaction(() => {
    const updateStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    const insertBatch = db.prepare('INSERT INTO inventory_batches (product_id, batch_number, expiry_date, quantity, created_at) VALUES (?, ?, ?, ?, ?)');
    purchase.items.forEach((item) => updateStock.run(item.qty, item.product_id));
    purchase.items.forEach((item) => {
      const datePart = receivedAt.slice(0, 10).replace(/-/g, '');
      const batchNumber = `BATCH${datePart}${String(item.product_id).padStart(4, '0')}${String(item.id).padStart(4, '0')}`;
      insertBatch.run(item.product_id, batchNumber, expiryByProduct.get(item.product_id) || null, item.qty, receivedAt);
    });
    db.prepare("UPDATE purchase_orders SET status = 'Received', received_at = ? WHERE id = ?").run(receivedAt, purchase.id);
    auditLog(req, 'Received purchase order', 'Purchase Order', purchase.id, { poNumber: purchase.po_number, itemCount: purchase.items.length });
    return getPurchase(purchase.id);
  });

  res.json(receivePurchase());
});

router.patch('/purchases/:id/cancel', (req, res) => {
  const purchase = getPurchase(Number(req.params.id));
  if (!purchase) return res.status(404).json({ error: 'Purchase order not found' });
  if (purchase.status !== 'Pending') return res.status(409).json({ error: 'Only pending purchase orders can be cancelled' });
  db.prepare("UPDATE purchase_orders SET status = 'Cancelled' WHERE id = ?").run(purchase.id);
  auditLog(req, 'Cancelled purchase order', 'Purchase Order', purchase.id, { poNumber: purchase.po_number });
  res.json(getPurchase(purchase.id));
});

module.exports = router;
module.exports.getPurchaseOrderNumber = getPurchaseOrderNumber;