const express = require('express');
const db = require('../db');
const { requireAdministrator, requireCategoryManager } = require('./auth');
const { auditLog } = require('../audit');

const router = express.Router();

router.get('/', (req, res) => {
  const query = String(req.query.q || '').trim();
  const suppliers = query
    ? db.prepare("SELECT * FROM suppliers WHERE name LIKE ? OR COALESCE(contact, '') LIKE ? OR COALESCE(phone, '') LIKE ? OR COALESCE(email, '') LIKE ? ORDER BY name ASC").all(...Array(4).fill(`%${query}%`))
    : db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all();
  res.json(suppliers);
});

router.post('/', requireCategoryManager, (req, res) => {
  const name = String(req.body.name || '').trim();
  const contact = String(req.body.contact || '').trim() || null;
  const phone = String(req.body.phone || '').trim() || null;
  const email = String(req.body.email || '').trim() || null;
  if (!name) return res.status(400).json({ error: 'Supplier name is required' });

  try {
    const result = db.prepare('INSERT INTO suppliers (name, contact, phone, email) VALUES (?, ?, ?, ?)').run(name, contact, phone, email);
    auditLog(req, 'Created supplier', 'Supplier', result.lastInsertRowid, { name });
    res.status(201).json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid));
  } catch (error) {
    res.status(String(error.message).includes('UNIQUE') ? 409 : 500).json({ error: 'Supplier already exists or could not be created' });
  }
});

router.patch('/:id', requireCategoryManager, (req, res) => {
  const supplierId = Number(req.params.id);
  const name = String(req.body.name || '').trim();
  const contact = String(req.body.contact || '').trim() || null;
  const phone = String(req.body.phone || '').trim() || null;
  const email = String(req.body.email || '').trim() || null;
  if (!Number.isInteger(supplierId) || !name) return res.status(400).json({ error: 'Supplier name is required' });
  try {
    const result = db.prepare('UPDATE suppliers SET name = ?, contact = ?, phone = ?, email = ? WHERE id = ?').run(name, contact, phone, email, supplierId);
    if (!result.changes) return res.status(404).json({ error: 'Supplier not found' });
    auditLog(req, 'Updated supplier', 'Supplier', supplierId, { name, contact, phone, email });
    res.json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId));
  } catch (error) {
    res.status(String(error.message).includes('UNIQUE') ? 409 : 500).json({ error: 'Supplier already exists or could not be updated' });
  }
});

router.delete('/:id', requireAdministrator, (req, res) => {
  const supplierId = Number(req.params.id);
  const supplier = db.prepare('SELECT id, name FROM suppliers WHERE id = ?').get(supplierId);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
  const productCount = db.prepare('SELECT COUNT(*) AS count FROM products WHERE preferred_supplier_id = ?').get(supplierId).count;
  if (productCount > 0) return res.status(409).json({ error: 'Supplier cannot be deleted while assigned to products' });
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(supplierId);
  auditLog(req, 'Deleted supplier', 'Supplier', supplierId, { name: supplier.name });
  res.status(204).send();
});

module.exports = router;
