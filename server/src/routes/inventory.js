const express = require('express');
const db = require('../db');
const { requireRole, authenticate } = require('./auth');
const { auditLog } = require('../audit');

const router = express.Router();
const INVENTORY_ROLES = ['administrator', 'admin', 'manager', 'inventory clerk', 'pharmacist'];

function getLocation(id) {
  return db.prepare("SELECT id, name, status FROM inventory_locations WHERE id = ? AND status = 'Active'").get(id);
}

function ensureStockRow(locationId, productId) {
  const existing = db.prepare('SELECT quantity FROM inventory_location_stock WHERE location_id = ? AND product_id = ?').get(locationId, productId);
  if (existing) return existing.quantity;
  const mainLocation = db.prepare("SELECT id FROM inventory_locations WHERE name = 'Main Store'").get();
  const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(productId);
  const quantity = mainLocation?.id === locationId ? Number(product?.stock || 0) : 0;
  db.prepare('INSERT INTO inventory_location_stock (location_id, product_id, quantity) VALUES (?, ?, ?)').run(locationId, productId, quantity);
  return quantity;
}

router.get('/locations', authenticate, (req, res) => {
  res.json(db.prepare("SELECT id, name, status FROM inventory_locations WHERE status = 'Active' ORDER BY name").all());
});

router.post('/locations', requireRole(...INVENTORY_ROLES), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Location name is required' });
  try {
    const result = db.prepare('INSERT INTO inventory_locations (name) VALUES (?)').run(name);
    const location = getLocation(result.lastInsertRowid);
    auditLog(req, 'Created inventory location', 'Inventory Location', location.id, { name });
    return res.status(201).json(location);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Location already exists' });
    return res.status(500).json({ error: 'Unable to create location' });
  }
});

router.get('/stock', authenticate, (req, res) => {
  const locations = db.prepare("SELECT id, name FROM inventory_locations WHERE status = 'Active' ORDER BY name").all();
  const rows = db.prepare(`
    SELECT p.id, p.name, p.sku, p.barcode, p.category, p.stock, p.track_inventory,
      l.id AS location_id, l.name AS location_name,
      COALESCE(ls.quantity, 0) AS quantity
    FROM products p
    CROSS JOIN inventory_locations l
    LEFT JOIN inventory_location_stock ls ON ls.product_id = p.id AND ls.location_id = l.id
    WHERE l.status = 'Active'
    ORDER BY p.name, l.name
  `).all();
  const products = new Map();
  rows.forEach((row) => {
    if (!products.has(row.id)) products.set(row.id, { id: row.id, name: row.name, sku: row.sku, barcode: row.barcode, category: row.category, stock: row.stock, trackInventory: Boolean(row.track_inventory), locations: {} });
    products.get(row.id).locations[row.location_id] = { name: row.location_name, quantity: row.quantity };
  });
  res.json({ locations, products: [...products.values()] });
});

router.get('/movements', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, p.name AS product_name, fl.name AS from_location_name, tl.name AS to_location_name
    FROM inventory_movements m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN inventory_locations fl ON fl.id = m.from_location_id
    LEFT JOIN inventory_locations tl ON tl.id = m.to_location_id
    ORDER BY m.id DESC LIMIT 200
  `).all();
  res.json(rows);
});

router.post('/adjustments', requireRole(...INVENTORY_ROLES), (req, res) => {
  const productId = Number(req.body?.productId);
  const locationId = Number(req.body?.locationId);
  const quantity = Number(req.body?.quantity);
  const direction = String(req.body?.direction || '').toLowerCase();
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isInteger(productId) || !Number.isInteger(locationId) || !Number.isInteger(quantity) || quantity < 1 || !['increase', 'decrease'].includes(direction) || !reason) {
    return res.status(400).json({ error: 'Product, location, quantity, direction, and reason are required' });
  }
  const product = db.prepare('SELECT id, name, stock, track_inventory FROM products WHERE id = ?').get(productId);
  const location = getLocation(locationId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!location) return res.status(404).json({ error: 'Location not found' });
  if (!product.track_inventory) return res.status(400).json({ error: 'This product does not track inventory' });

  const delta = direction === 'increase' ? quantity : -quantity;
  try {
    const result = db.transaction(() => {
      const currentQuantity = ensureStockRow(locationId, productId);
      if (delta < 0 && currentQuantity < quantity) throw new Error(`Insufficient stock at ${location.name} (available: ${currentQuantity}, requested: ${quantity})`);
      const stockUpdate = db.prepare('UPDATE inventory_location_stock SET quantity = quantity + ? WHERE location_id = ? AND product_id = ? AND quantity + ? >= 0').run(delta, locationId, productId, delta);
      if (stockUpdate.changes !== 1) throw new Error('Stock could not be updated');
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock + ? >= 0').run(delta, productId, delta);
      const movement = db.prepare(`INSERT INTO inventory_movements (movement_type, product_id, quantity, to_location_id, reason, actor_user_id, actor_username) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(direction === 'increase' ? 'Adjustment In' : 'Adjustment Out', productId, quantity, locationId, reason, req.session.userId, req.session.username);
      auditLog(req, 'Adjusted inventory', 'Inventory Movement', movement.lastInsertRowid, { productId, locationId, quantity, direction, reason });
      return db.prepare('SELECT quantity FROM inventory_location_stock WHERE location_id = ? AND product_id = ?').get(locationId, productId);
    })();
    return res.status(201).json({ ok: true, productId, locationId, quantity: result.quantity });
  } catch (error) {
    return res.status(error.message.startsWith('Insufficient') ? 409 : 400).json({ error: error.message || 'Unable to adjust inventory' });
  }
});

router.post('/transfers', requireRole(...INVENTORY_ROLES), (req, res) => {
  const productId = Number(req.body?.productId);
  const fromLocationId = Number(req.body?.fromLocationId);
  const toLocationId = Number(req.body?.toLocationId);
  const quantity = Number(req.body?.quantity);
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isInteger(productId) || !Number.isInteger(fromLocationId) || !Number.isInteger(toLocationId) || fromLocationId === toLocationId || !Number.isInteger(quantity) || quantity < 1 || !reason) {
    return res.status(400).json({ error: 'Product, different source and destination locations, quantity, and reason are required' });
  }
  const product = db.prepare('SELECT id, name, track_inventory FROM products WHERE id = ?').get(productId);
  const source = getLocation(fromLocationId);
  const destination = getLocation(toLocationId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!source || !destination) return res.status(404).json({ error: 'Source or destination location not found' });
  if (!product.track_inventory) return res.status(400).json({ error: 'This product does not track inventory' });

  try {
    const result = db.transaction(() => {
      const available = ensureStockRow(fromLocationId, productId);
      ensureStockRow(toLocationId, productId);
      if (available < quantity) throw new Error(`Insufficient stock at ${source.name} (available: ${available}, requested: ${quantity})`);
      const debit = db.prepare('UPDATE inventory_location_stock SET quantity = quantity - ? WHERE location_id = ? AND product_id = ? AND quantity >= ?').run(quantity, fromLocationId, productId, quantity);
      if (debit.changes !== 1) throw new Error('Source stock could not be updated');
      db.prepare('UPDATE inventory_location_stock SET quantity = quantity + ? WHERE location_id = ? AND product_id = ?').run(quantity, toLocationId, productId);
      const movement = db.prepare(`INSERT INTO inventory_movements (movement_type, product_id, quantity, from_location_id, to_location_id, reason, actor_user_id, actor_username) VALUES ('Transfer', ?, ?, ?, ?, ?, ?, ?)`).run(productId, quantity, fromLocationId, toLocationId, reason, req.session.userId, req.session.username);
      auditLog(req, 'Transferred inventory', 'Inventory Movement', movement.lastInsertRowid, { productId, quantity, fromLocationId, toLocationId, reason });
      return movement.lastInsertRowid;
    })();
    return res.status(201).json({ ok: true, movementId: result });
  } catch (error) {
    return res.status(error.message.startsWith('Insufficient') ? 409 : 400).json({ error: error.message || 'Unable to transfer inventory' });
  }
});

module.exports = router;