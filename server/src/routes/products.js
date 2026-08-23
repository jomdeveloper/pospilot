const express = require('express');
const db = require('../db');
const { requireAdministrator } = require('./auth');
const { auditLog } = require('../audit');
const {
  buildProductSearchQuery,
  filterByExpiration,
  paginateRows,
} = require('../productSearch');

const router = express.Router();

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

function resolveProductImageUrl(productLike) {
  const source = productLike || {};
  const uploaded = typeof source.imageUrl === 'string' ? source.imageUrl.trim() : '';
  const uploadedAlt = typeof source.image_url === 'string' ? source.image_url.trim() : '';
  return uploaded || uploadedAlt || null;
}

function generateSku() {
  let sku;
  do {
    sku = `SKU-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  } while (db.prepare('SELECT 1 FROM products WHERE sku = ?').get(sku));
  return sku;
}

router.post('/', (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const barcode = String(body.barcode || '').trim() || null;
  const price = Number(body.price);
  const stock = Number(body.stock || 0);
  const sku = generateSku();
  const category = String(body.category || '').trim();
  const productType = String(body.productType || '').trim();
  const imageUrl = resolveProductImageUrl(body);
  const typeMatchesCategory = Boolean(db.prepare('SELECT 1 FROM product_types WHERE name = ? AND category_name = ? AND active = 1').get(productType, category));

  if (!name || !category || !productType || !typeMatchesCategory || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'Name, valid price, and non-negative stock are required' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO products (name, generic, barcode, price, stock, sku, category, brand, product_type, subcategory, unit_of_measure, pack_size, status, image_url, cost_price, track_inventory, reorder_level, maximum_stock, preferred_supplier_id, track_batch, track_expiry, track_serial, senior_discount_eligible, pwd_discount_eligible, promo_eligible, loyalty_eligible)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      String(body.generic || '').trim() || null,
      barcode,
      price,
      stock,
      sku,
      category,
      String(body.brand || '').trim() || null,
      productType,
      String(body.subcategory || '').trim() || null,
      String(body.unitOfMeasure || 'unit').trim() || 'unit',
      String(body.packSize || '').trim() || null,
      String(body.status || 'Active').trim() || 'Active',
      imageUrl,
      Number(body.costPrice || 0),
      category === 'Services' ? 0 : (body.trackInventory === false ? 0 : 1),
      Number(body.reorderLevel || 0),
      body.maximumStock === '' || body.maximumStock == null ? null : Number(body.maximumStock),
      body.preferredSupplierId ? Number(body.preferredSupplierId) : null,
      category === 'Services' ? 0 : (body.trackBatch ? 1 : 0),
      category === 'Services' ? 0 : (body.trackExpiry ? 1 : 0),
      category === 'Services' ? 0 : (body.trackSerial ? 1 : 0),
      body.seniorDiscountEligible ? 1 : 0,
      body.pwdDiscountEligible ? 1 : 0,
      body.promoEligible === false ? 0 : 1,
      body.loyaltyEligible === false ? 0 : 1
    );
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    db.prepare('INSERT INTO product_tracking_config (product_id, track_batch, track_expiry, track_serial) VALUES (?, ?, ?, ?)').run(row.id, body.trackBatch ? 1 : 0, body.trackExpiry ? 1 : 0, body.trackSerial ? 1 : 0);
    db.prepare('INSERT INTO product_discount_config (product_id, senior_eligible, pwd_eligible, promo_eligible, loyalty_eligible) VALUES (?, ?, ?, ?, ?)').run(row.id, body.seniorDiscountEligible ? 1 : 0, body.pwdDiscountEligible ? 1 : 0, body.promoEligible === false ? 0 : 1, body.loyaltyEligible === false ? 0 : 1);
    if (body.attributes && typeof body.attributes === 'object') {
      const definitions = db.prepare(`
        SELECT d.id, d.name FROM product_attribute_definitions d
        JOIN product_types t ON t.id = d.product_type_id
        WHERE t.name = ? AND d.active = 1
      `).all(body.productType || 'General Merchandise');
      const definitionIds = new Map(definitions.map((definition) => [definition.name, definition.id]));
      const insertValue = db.prepare('INSERT OR REPLACE INTO product_attribute_values (product_id, attribute_definition_id, value_text) VALUES (?, ?, ?)');
      Object.entries(body.attributes).forEach(([name, value]) => {
        const definitionId = definitionIds.get(name);
        if (definitionId && value !== '' && value !== null && value !== undefined) insertValue.run(row.id, definitionId, JSON.stringify(value));
      });
    }
    auditLog(req, 'Created product', 'Product', row.id, { name: row.name, category: row.category, price: row.price });
    return res.status(201).json(normalizeProduct(row));
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Barcode already exists' });
    return res.status(500).json({ error: 'Product could not be created' });
  }
});

router.patch('/:id', requireAdministrator, (req, res) => {
  const body = req.body || {};
  const productId = Number(req.params.id);
  const name = String(body.name || '').trim();
  const category = String(body.category || '').trim();
  const productType = String(body.productType || body.product_type || '').trim();
  const price = Number(body.price);
  const costPrice = Number(body.costPrice ?? body.cost_price);
  const stock = Number(body.stock);
  const typeMatchesCategory = db.prepare('SELECT 1 FROM product_types WHERE name = ? AND category_name = ? AND active = 1').get(productType, category);

  if (!Number.isInteger(productId) || !name || !category || !productType || !typeMatchesCategory || !Number.isFinite(price) || price < 0 || !Number.isFinite(costPrice) || costPrice < 0 || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'Name, category, product type, valid prices, and non-negative stock are required' });
  }

  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const imageUrl = resolveProductImageUrl(body);

  try {
    db.prepare(`
      UPDATE products SET name = ?, generic = ?, barcode = ?, price = ?, stock = ?, category = ?, brand = ?, product_type = ?, subcategory = ?, unit_of_measure = ?, pack_size = ?, image_url = ?, cost_price = ?, track_inventory = ?, reorder_level = ?, maximum_stock = ?, track_batch = ?, track_expiry = ?, track_serial = ?, senior_discount_eligible = ?, pwd_discount_eligible = ?, promo_eligible = ?, loyalty_eligible = ?
      WHERE id = ?
    `).run(
      name,
      String(body.generic || '').trim() || null,
      String(body.barcode || '').trim() || null,
      price,
      stock,
      category,
      String(body.brand || '').trim() || null,
      productType,
      String(body.subcategory || '').trim() || null,
      String(body.unitOfMeasure || body.unit_of_measure || 'unit').trim() || 'unit',
      String(body.packSize || body.pack_size || '').trim() || null,
      imageUrl,
      costPrice,
      category === 'Services' ? 0 : (body.trackInventory === false ? 0 : 1),
      Number(body.reorderLevel ?? body.reorder_level ?? 0),
      body.maximumStock === '' || body.maximumStock == null ? null : Number(body.maximumStock),
      category === 'Services' ? 0 : (body.trackBatch ? 1 : 0),
      category === 'Services' ? 0 : (body.trackExpiry ? 1 : 0),
      category === 'Services' ? 0 : (body.trackSerial ? 1 : 0),
      body.seniorDiscountEligible ? 1 : 0,
      body.pwdDiscountEligible ? 1 : 0,
      body.promoEligible === false ? 0 : 1,
      body.loyaltyEligible === false ? 0 : 1,
      productId
    );

    auditLog(req, 'Updated product', 'Product', productId, { name, category, price, stock });

    return res.json(normalizeProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(productId)));
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Barcode already exists' });
    return res.status(500).json({ error: 'Product could not be updated' });
  }
});

router.delete('/:id', requireAdministrator, (req, res) => {
  const productId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const purchaseReference = db.prepare('SELECT COUNT(*) AS count FROM purchase_order_items WHERE product_id = ?').get(productId).count;
  const salesReference = db.prepare('SELECT COUNT(*) AS count FROM sale_items WHERE product_id = ?').get(productId).count;
  if (purchaseReference > 0 || salesReference > 0) {
    return res.status(409).json({ error: 'Product cannot be deleted because it is referenced by purchase or sales history' });
  }

  try {
    db.transaction(() => {
      db.prepare('DELETE FROM products WHERE id = ?').run(productId);
      auditLog(req, 'Deleted product', 'Product', productId, { name: existing.name, sku: existing.sku });
    })();
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Product could not be deleted' });
  }
});

router.get('/metadata', (req, res) => {
  const types = db.prepare('SELECT * FROM product_types WHERE active = 1 ORDER BY name').all();
  const definitions = db.prepare('SELECT * FROM product_attribute_definitions WHERE active = 1 ORDER BY display_order, name').all();
  const categories = db.prepare('SELECT DISTINCT category_name AS name FROM product_types WHERE active = 1 ORDER BY category_name').all();
  res.json({
    categories,
    productTypes: types.map((type) => ({
      ...type,
      attributes: definitions
        .filter((definition) => definition.product_type_id === type.id)
        .map((definition) => ({ ...definition, options: definition.options_json ? JSON.parse(definition.options_json) : [] })),
    })),
  });
});

function normalizeProduct(row) {
  const productType = (
    row.product_type ||
    row.productType ||
    row.type ||
    (row.is_rx || row.is_controlled || row.requires_prescription ? (row.is_controlled ? 'Controlled' : 'Rx') : 'OTC')
  ) || 'OTC';

  const normalizedProductType = String(productType).trim();
  const isRx = Boolean(
    row.is_rx ||
    row.isRx ||
    row.requires_prescription ||
    row.requiresPrescription ||
    normalizedProductType === 'Rx' ||
    normalizedProductType === 'Prescription' ||
    normalizedProductType === 'Controlled'
  );
  const isControlled = Boolean(
    row.is_controlled ||
    row.isControlled ||
    normalizedProductType === 'Controlled'
  );

  const ra6675 = Boolean(
    row.ra6675_compliant === true ||
    row.ra6675Compliant === true ||
    row.ra6675_compliant === 1 ||
    row.ra6675Compliant === 1
  );

  return {
    ...row,
    brand: row.brand || row.generic || null,
    sku: row.sku || row.barcode || null,
    category: row.category || 'General',
    image_url: row.image_url || null,
    imageUrl: row.image_url || null,
    product_type: normalizedProductType,
    productType: normalizedProductType,
    is_rx: isRx,
    isRx: isRx,
    is_controlled: isControlled,
    isControlled: isControlled,
    requires_prescription: isRx || isControlled,
    requiresPrescription: isRx || isControlled,
    ra6675_compliant: ra6675,
    ra6675Compliant: ra6675,
  };
}

function searchProducts(params) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.limit, 10) || DEFAULT_LIMIT));
  const { expBefore } = buildProductSearchQuery(params);

  let rows;

  const { where, bindings } = buildProductSearchQuery(params);
  rows = db
    .prepare(`SELECT * FROM products ${where} ORDER BY name ASC`)
    .all(...bindings)
    .map(normalizeProduct);

  if (expBefore) rows = filterByExpiration(rows, expBefore);

  const result = paginateRows(rows, page, limit);
  return {
    ...result,
    items: result.items,
  };
}

// GET /api/products/filters — distinct values for filter dropdowns
router.get('/filters', (req, res) => {
  const categories = db
    .prepare(
      `SELECT DISTINCT COALESCE(NULLIF(category, ''), 'General') AS value
       FROM products ORDER BY value ASC`
    )
    .all()
    .map((row) => row.value);

  const brands = db
    .prepare(
      `SELECT DISTINCT COALESCE(NULLIF(brand, ''), generic) AS value
       FROM products
       WHERE COALESCE(NULLIF(brand, ''), generic) IS NOT NULL
       ORDER BY value ASC`
    )
    .all()
    .map((row) => row.value);

  res.json({ categories, brands });
});

// GET /api/products/barcode/:barcode
router.get('/barcode/:barcode', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE barcode = ?').get(req.params.barcode);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(normalizeProduct(row));
});

// GET /api/products — search with pagination and filters
router.get('/', (req, res) => {
  const hasPagination =
    req.query.page !== undefined ||
    req.query.limit !== undefined ||
    req.query.category !== undefined ||
    req.query.brand !== undefined ||
    req.query.minPrice !== undefined ||
    req.query.maxPrice !== undefined ||
    req.query.stockStatus !== undefined ||
    req.query.expBefore !== undefined;

  if (hasPagination || req.query.q !== undefined) {
    const result = searchProducts(req.query);
    return res.json(result);
  }

  // Legacy: return all products (used by health check on startup).
  const rows = db.prepare('SELECT * FROM products ORDER BY name ASC').all().map(normalizeProduct);
  res.json(rows);
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(normalizeProduct(row));
});

module.exports = router;
module.exports.resolveProductImageUrl = resolveProductImageUrl;
