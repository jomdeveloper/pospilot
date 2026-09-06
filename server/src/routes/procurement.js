const express = require('express');
const db = require('../db');
const { auditLog } = require('../audit');
const { roundMoney } = require('../security');
const { requireCategoryManager, requireAdministrator } = require('./auth');

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
    items: db.prepare(`SELECT i.*, p.product_type, p.track_batch, p.track_expiry, p.track_serial, COALESCE(c.track_batch, 0) AS configured_track_batch, COALESCE(c.track_expiry, 0) AS configured_track_expiry, COALESCE(c.track_serial, 0) AS configured_track_serial
      FROM purchase_order_items i JOIN products p ON p.id = i.product_id
      LEFT JOIN product_tracking_config c ON c.product_id = p.id
      WHERE i.purchase_id = ? ORDER BY i.id`).all(id).map((item) => ({
        ...item,
        track_batch: Boolean(item.track_batch || item.configured_track_batch),
        track_expiry: Boolean(item.track_expiry || item.configured_track_expiry),
        track_serial: Boolean(item.track_serial || item.configured_track_serial),
        productFields: db.prepare('SELECT d.name, d.data_type AS dataType, d.required FROM product_attribute_definitions d JOIN product_types t ON t.id = d.product_type_id WHERE t.name = ? AND d.active = 1 ORDER BY d.display_order, d.name').all(item.product_type),
      })),
  };
}

router.get('/purchases', requireCategoryManager, (req, res) => {
  const purchases = db.prepare('SELECT * FROM purchase_orders ORDER BY id DESC').all();
  res.json(purchases.map((purchase) => getPurchase(purchase.id)));
});

router.get('/purchases/:id', requireCategoryManager, (req, res) => {
  const purchase = getPurchase(Number(req.params.id));
  if (!purchase) return res.status(404).json({ error: 'Purchase order not found' });
  res.json(purchase);
});

router.post('/purchases', requireCategoryManager, (req, res) => {
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
    return { ...item, name: product.name, total: roundMoney(item.qty * item.unitCost) };
  });

  const total = roundMoney(details.reduce((sum, item) => sum + item.total, 0));
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

router.get('/receiving', requireCategoryManager, (req, res) => {
  const rows = db.prepare("SELECT * FROM purchase_orders WHERE status IN ('Pending', 'Partially Received') ORDER BY id DESC").all();
  res.json(rows.map((row) => getPurchase(row.id)));
});

router.post('/receiving/:id/receive', requireCategoryManager, (req, res) => {
  const purchaseId = Number(req.params.id);
  const purchase = getPurchase(purchaseId);
  if (!purchase) return res.status(404).json({ error: 'Purchase order not found' });
  if (purchase.status !== 'Pending') return res.status(409).json({ error: 'Purchase order is already received' });

  const receivedAt = String(req.body?.receivedAt || '').trim();
  if (!receivedAt || Number.isNaN(new Date(receivedAt).getTime())) return res.status(400).json({ error: 'A valid received date is required' });
  const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const receivedItems = new Map();
  for (const rawItem of requestedItems) {
    const productId = Number(rawItem?.productId);
    const quantity = Number(rawItem?.quantity ?? rawItem?.receivedQty ?? 0);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ error: 'Each receiving line needs a valid product and non-negative quantity' });
    if (receivedItems.has(productId)) return res.status(400).json({ error: 'Each product may appear only once in receiving' });
    receivedItems.set(productId, { ...rawItem, quantity });
  }
  if (![...receivedItems.values()].some((item) => item.quantity > 0)) return res.status(400).json({ error: 'Receive at least one unit' });
  const receivePurchase = db.transaction(() => {
    const updateStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    const mainLocationId = db.prepare("SELECT id FROM inventory_locations WHERE name = 'Main Store'").get()?.id;
    const ensureMainStock = db.prepare('INSERT OR IGNORE INTO inventory_location_stock (location_id, product_id, quantity) SELECT ?, id, stock FROM products WHERE id = ?');
    const updateMainStock = db.prepare('UPDATE inventory_location_stock SET quantity = quantity + ? WHERE location_id = ? AND product_id = ?');
    const insertMovement = db.prepare(`INSERT INTO inventory_movements (movement_type, product_id, quantity, to_location_id, reason, reference, actor_user_id, actor_username) VALUES ('Receiving', ?, ?, ?, 'Purchase order received', ?, ?, ?)`);
    const insertBatch = db.prepare('INSERT INTO inventory_batches (product_id, batch_number, expiry_date, storage_condition, warranty_period, attributes_json, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertSerial = db.prepare("INSERT INTO inventory_serial_numbers (product_id, serial_number, status) VALUES (?, ?, 'In Stock')");
    for (const item of purchase.items) {
      const received = receivedItems.get(item.product_id) || {};
      const outstanding = item.qty - Number(item.received_qty || 0);
      if (received.quantity > outstanding) throw new Error(`${item.name}: cannot receive more than the outstanding quantity (${outstanding})`);
      if (item.track_expiry && received.expiryDate && Number.isNaN(new Date(received.expiryDate).getTime())) throw new Error(`${item.name}: expiry date is invalid`);
      if (received.quantity > 0 && item.track_batch && !String(received.batchNumber || '').trim()) throw new Error(`${item.name}: batch or lot number is required`);
      if (received.quantity > 0 && item.track_expiry && !String(received.expiryDate || '').trim()) throw new Error(`${item.name}: expiry date is required`);
      if (item.track_serial) {
        const serials = Array.isArray(received.serialNumbers) ? received.serialNumbers.map((serial) => String(serial).trim()).filter(Boolean) : [];
        // Serials are OPTIONAL on receiving: leave the field blank and the
        // system auto-generates one per unit. Only when the cashier DOES enter
        // them do we require the exact received quantity + uniqueness.
        if (serials.length > 0) {
          if (received.quantity > 0 && serials.length !== received.quantity) throw new Error(`${item.name}: enter exactly ${received.quantity} serial number(s)`);
          if (new Set(serials).size !== serials.length) throw new Error(`${item.name}: serial numbers must be unique`);
        }
      }
    }
    purchase.items.forEach((item) => {
      const received = receivedItems.get(item.product_id) || {};
      if (!received.quantity) return;
      ensureMainStock.run(mainLocationId, item.product_id);
      const result = updateStock.run(received.quantity, item.product_id);
      if (result.changes !== 1) throw new Error(`Product ${item.product_id} could not be updated`);
      updateMainStock.run(received.quantity, mainLocationId, item.product_id);
      db.prepare('UPDATE purchase_order_items SET received_qty = received_qty + ? WHERE id = ?').run(received.quantity, item.id);
      insertMovement.run(item.product_id, received.quantity, mainLocationId, purchase.id, req.session.userId, req.session.username);
    });
    purchase.items.forEach((item) => {
      const received = receivedItems.get(item.product_id) || {};
      if (!received.quantity) return;
      const datePart = receivedAt.slice(0, 10).replace(/-/g, '');
      const batchNumber = item.track_batch ? String(received.batchNumber).trim() : `RECEIPT${datePart}${String(item.product_id).padStart(4, '0')}${String(item.id).padStart(4, '0')}`;
      if ((item.track_expiry && received.expiryDate) || (item.track_batch && received.batchNumber) || received.storageCondition || received.warrantyPeriod || Object.keys(received.attributes || {}).length > 0) {
        insertBatch.run(item.product_id, batchNumber, received.expiryDate || null, String(received.storageCondition || '').trim() || null, received.warrantyPeriod === '' || received.warrantyPeriod == null ? null : Number(received.warrantyPeriod), JSON.stringify(received.attributes || {}), received.quantity, receivedAt);
      }
      if (item.track_serial && received.quantity > 0) {
        let serials = Array.isArray(received.serialNumbers)
          ? received.serialNumbers.map((serial) => String(serial).trim()).filter(Boolean)
          : [];
        if (serials.length === 0) {
          // Auto-generate one unique serial per unit (blank field = optional).
          // Prefix ensures uniqueness across receives of the same product.
          const existing = db.prepare('SELECT COUNT(*) AS c FROM inventory_serial_numbers WHERE product_id = ?').get(item.product_id).c;
          for (let i = 0; i < received.quantity; i++) {
            serials.push(
              'SN-' +
                String(item.product_id).padStart(4, '0') +
                '-' +
                String(existing + i + 1).padStart(4, '0')
            );
          }
        }
        (serials || []).forEach((serial) => insertSerial.run(item.product_id, serial));
      }
    });
    const remaining = db.prepare('SELECT COALESCE(SUM(qty - received_qty), 0) AS quantity FROM purchase_order_items WHERE purchase_id = ?').get(purchase.id).quantity;
    const status = remaining === 0 ? 'Received' : 'Partially Received';
    const statusUpdate = db.prepare("UPDATE purchase_orders SET status = ?, received_at = ? WHERE id = ? AND status IN ('Pending', 'Partially Received')").run(status, receivedAt, purchase.id);
    if (statusUpdate.changes !== 1) throw new Error('Purchase order is already received');
    auditLog(req, 'Received purchase order', 'Purchase Order', purchase.id, { poNumber: purchase.po_number, itemCount: purchase.items.length });
    return getPurchase(purchase.id);
  });

  try {
    res.json(receivePurchase());
  } catch (error) {
    res.status(error.message === 'Purchase order is already received' ? 409 : 400).json({ error: error.message || 'Unable to receive purchase order' });
  }
});

router.patch('/purchases/:id/cancel', requireAdministrator, (req, res) => {
  const purchase = getPurchase(Number(req.params.id));
  if (!purchase) return res.status(404).json({ error: 'Purchase order not found' });
  if (!['Pending', 'Partially Received'].includes(purchase.status)) return res.status(409).json({ error: 'Only open purchase orders can be cancelled' });
  db.prepare("UPDATE purchase_orders SET status = 'Cancelled' WHERE id = ?").run(purchase.id);
  auditLog(req, 'Cancelled purchase order', 'Purchase Order', purchase.id, { poNumber: purchase.po_number });
  res.json(getPurchase(purchase.id));
});

module.exports = router;
module.exports.getPurchaseOrderNumber = getPurchaseOrderNumber;