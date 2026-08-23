const express = require('express');
const db = require('../db');
const { requireAdministrator, requireCategoryManager } = require('./auth');
const { auditLog } = require('../audit');

const router = express.Router();

function parseProductTypeDefinitions(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          const name = String(item).trim();
          return name ? { name, description: '', attributes: [] } : null;
        }

        if (!item || typeof item !== 'object') return null;

        const name = String(item.name || item.productType || item.type || '').trim();
        if (!name) return null;

        const attributes = Array.isArray(item.attributes)
          ? item.attributes
              .map((attribute) => {
                if (!attribute || typeof attribute !== 'object') return null;
                const attributeName = String(attribute.name || attribute.label || '').trim();
                if (!attributeName) return null;
                return {
                  name: attributeName,
                  dataType: String(attribute.dataType || attribute.type || 'text').trim() || 'text',
                  required: Boolean(attribute.required),
                  options: Array.isArray(attribute.options) ? attribute.options : [],
                  validation: attribute.validation && typeof attribute.validation === 'object' ? attribute.validation : null,
                };
              })
              .filter(Boolean)
          : [];

        return {
          name,
          description: String(item.description || '').trim(),
          attributes,
        };
      })
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseProductTypeDefinitions(parsed);
      } catch (error) {
        // Fall through to comma-delimited parsing below.
      }
    }

    const names = trimmed
      .split(',')
      .map((item) => String(item).trim())
      .filter(Boolean);

    return names.map((name) => ({ name, description: '', attributes: [] }));
  }

  return [];
}

router.get('/', (req, res) => {
  const products = db.prepare('SELECT category, stock FROM products').all();
  const counts = new Map();
  products.forEach((product) => {
    const name = product.category || 'General';
    const current = counts.get(name) || { productCount: 0, stockTotal: 0 };
    current.productCount += 1;
    current.stockTotal += Number(product.stock) || 0;
    counts.set(name, current);
  });

  const savedCategories = db.prepare('SELECT name, description, status FROM categories ORDER BY name ASC').all();

  savedCategories.forEach((category) => {
    if (!counts.has(category.name)) counts.set(category.name, { productCount: 0, stockTotal: 0 });
    counts.get(category.name).description = category.description || '';
    counts.get(category.name).status = category.status || 'Active';
    const types = db.prepare('SELECT id, name, description FROM product_types WHERE category_name = ? AND active = 1 ORDER BY name').all(category.name);
    counts.get(category.name).productTypes = types.map((row) => row.name);
    counts.get(category.name).productTypeDefinitions = types.map((type) => ({
      name: type.name,
      description: type.description || '',
      attributes: db.prepare('SELECT name, data_type AS dataType, required FROM product_attribute_definitions WHERE product_type_id = ? AND active = 1 ORDER BY display_order, name').all(type.id).map((attribute) => ({ ...attribute, required: Boolean(attribute.required) })),
    }));
  });

  res.json([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, stats]) => ({ name, ...stats })));
});

router.post('/', requireCategoryManager, (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim() || null;
  const status = req.body.status === 'Inactive' ? 'Inactive' : 'Active';
  const productTypes = parseProductTypeDefinitions(req.body.productTypes);
  const normalizedProductTypes = productTypes.length > 0 ? productTypes : [{ name: 'Other', description: '', attributes: [] }];

  if (!name) return res.status(400).json({ error: 'Category name is required' });

  try {
    db.prepare('INSERT INTO categories (name, description, status) VALUES (?, ?, ?)').run(name, description, status);

    const insertType = db.prepare('INSERT OR IGNORE INTO product_types (name, category_name, description) VALUES (?, ?, ?)');
    const insertDefinition = db.prepare(`
      INSERT OR IGNORE INTO product_attribute_definitions
      (product_type_id, name, data_type, required, display_order, options_json, validation_json, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);

    normalizedProductTypes.forEach((type) => {
      const typeName = String(type.name || '').trim();
      if (!typeName) return;

      insertType.run(typeName, name, String(type.description || '').trim() || `${typeName} products`);
      const productType = db.prepare('SELECT id FROM product_types WHERE name = ?').get(typeName);
      if (!productType) return;

      (Array.isArray(type.attributes) ? type.attributes : []).forEach((attribute, index) => {
        const attributeName = String(attribute.name || '').trim();
        if (!attributeName) return;

        const optionsJson = Array.isArray(attribute.options) && attribute.options.length > 0 ? JSON.stringify(attribute.options) : null;
        const validationJson = attribute.validation && typeof attribute.validation === 'object' ? JSON.stringify(attribute.validation) : null;

        insertDefinition.run(
          productType.id,
          attributeName,
          String(attribute.dataType || attribute.type || 'text').trim() || 'text',
          Boolean(attribute.required) ? 1 : 0,
          index,
          optionsJson,
          validationJson
        );
      });
    });

    res.status(201).json({
      name,
      description: description || '',
      status,
      productCount: 0,
      stockTotal: 0,
      productTypes: normalizedProductTypes.map((type) => String(type.name).trim()).filter(Boolean),
    });
    auditLog(req, 'Created category', 'Category', name, { productTypes: normalizedProductTypes });
  } catch (error) {
    res.status(String(error.message).includes('UNIQUE') ? 409 : 500).json({ error: 'Category already exists or could not be created' });
  }
});

router.patch('/:categoryName', requireCategoryManager, (req, res) => {
  const existingName = decodeURIComponent(req.params.categoryName).trim();
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim() || null;
  const status = req.body.status === 'Inactive' ? 'Inactive' : 'Active';
  const productTypes = parseProductTypeDefinitions(req.body.productTypes);
  const normalizedProductTypes = productTypes.length > 0 ? productTypes : [{ name: 'Other', description: '', attributes: [] }];
  const existing = db.prepare('SELECT name FROM categories WHERE name = ?').get(existingName);
  if (!existing) return res.status(404).json({ error: 'Category not found' });
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  try {
    const update = db.transaction(() => {
      db.prepare('UPDATE categories SET name = ?, description = ?, status = ? WHERE name = ?').run(name, description, status, existingName);
      db.prepare('UPDATE products SET category = ? WHERE category = ?').run(name, existingName);
      db.prepare('UPDATE product_types SET category_name = ? WHERE category_name = ?').run(name, existingName);
      const insertType = db.prepare('INSERT OR IGNORE INTO product_types (name, category_name, description) VALUES (?, ?, ?)');
      const insertDefinition = db.prepare('INSERT OR IGNORE INTO product_attribute_definitions (product_type_id, name, data_type, required, display_order, active) VALUES (?, ?, ?, ?, ?, 1)');
      normalizedProductTypes.forEach((type) => {
        const typeName = String(type.name || '').trim();
        if (!typeName) return;
        insertType.run(typeName, name, String(type.description || '').trim() || `${typeName} products`);
        const productType = db.prepare('SELECT id FROM product_types WHERE name = ?').get(typeName);
        (type.attributes || []).forEach((attribute, index) => {
          const attributeName = String(attribute.name || '').trim();
          if (attributeName) insertDefinition.run(productType.id, attributeName, String(attribute.dataType || 'text').trim() || 'text', attribute.required ? 1 : 0, index);
        });
      });
    });
    update();
    auditLog(req, 'Updated category', 'Category', name, { previousName: existingName, productTypes: normalizedProductTypes });
    res.json({ name, description: description || '', status, productTypes: normalizedProductTypes.map((type) => type.name).filter(Boolean) });
  } catch (error) {
    res.status(String(error.message).includes('UNIQUE') ? 409 : 500).json({ error: 'Category already exists or could not be updated' });
  }
});

router.delete('/:categoryName', requireAdministrator, (req, res) => {
  const categoryName = decodeURIComponent(req.params.categoryName).trim();
  const category = db.prepare('SELECT name FROM categories WHERE name = ?').get(categoryName);
  const productType = db.prepare('SELECT 1 FROM product_types WHERE category_name = ? LIMIT 1').get(categoryName);
  const productCount = db.prepare('SELECT COUNT(*) AS count FROM products WHERE category = ?').get(categoryName).count;
  if (!category && !productType) return res.status(404).json({ error: 'Category not found' });
  if (productCount > 0) return res.status(409).json({ error: 'Category cannot be deleted while it contains products' });

  try {
    db.transaction(() => {
      db.prepare('DELETE FROM product_types WHERE category_name = ?').run(categoryName);
      db.prepare('DELETE FROM categories WHERE name = ?').run(categoryName);
    })();
    auditLog(req, 'Deleted category', 'Category', categoryName, {});
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Category could not be deleted' });
  }
});

module.exports = router;
module.exports.parseProductTypeDefinitions = parseProductTypeDefinitions;