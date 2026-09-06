const express = require('express');
const db = require('../db');
const { authenticate, requireAdministrator, requireCategoryManager } = require('./auth');
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

/**
 * Attach the earliest expiring batch (and its batch number) to each product row
 * so the price-check/filter features can actually show expiry data. Reads from
 * inventory_batches — products themselves have no `exp` column.
 */
function attachBatchInfo(products) {
  if (!products || products.length === 0) return products;
  const ids = products.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(',');
  const batches = db
    .prepare(
      `SELECT product_id, batch_number, MIN(expiry_date) AS first_expiry
       FROM inventory_batches
       WHERE product_id IN (${placeholders}) AND expiry_date IS NOT NULL AND expiry_date != ''
       GROUP BY product_id`
    )
    .all(...ids);
  const byId = new Map(batches.map((batch) => [batch.product_id, batch]));
  products.forEach((row) => {
    const batch = byId.get(row.id);
    if (batch) {
      row.exp = batch.first_expiry;
      row.batch = row.batch || batch.batch_number;
    }
  });
  return products;
}

function generateSku() {
  let sku;
  do {
    sku = `SKU-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  } while (db.prepare('SELECT 1 FROM products WHERE sku = ?').get(sku));
  return sku;
}

function getMissingRequiredAttribute(productType, attributes) {
  const deliveryFields = new Set(['Expiry date', 'Storage condition', 'Batch/lot number', 'Serial number', 'Warranty period']);
  const definitions = db.prepare(`
    SELECT d.name, d.data_type FROM product_attribute_definitions d
    JOIN product_types t ON t.id = d.product_type_id
    WHERE t.name = ? AND d.active = 1 AND d.required = 1
  `).all(productType);
  return definitions.find((definition) => {
    if (deliveryFields.has(definition.name)) return false;
    const value = attributes?.[definition.name];
    return definition.data_type === 'boolean' ? value !== true : !String(value ?? '').trim();
  });
}

router.post('/', requireCategoryManager, (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const brand = String(body.brand || '').trim();
  const barcode = String(body.barcode || '').trim() || null;
  const price = Number(body.price);
  const stock = Number(body.stock || 0);
  const costPrice = Number(body.costPrice || 0);
    const reorderLevel = Number(body.reorderLevel || 0);
  const packSize = body.packSize === '' || body.packSize == null ? null : Number(body.packSize);
  const maximumStock = body.maximumStock === '' || body.maximumStock == null ? null : Number(body.maximumStock);
  const sku = generateSku();
  const category = String(body.category || '').trim();
  const productType = String(body.productType || '').trim();
  const imageUrl = resolveProductImageUrl(body);
  const typeMatchesCategory = Boolean(db.prepare('SELECT 1 FROM product_types WHERE name = ? AND category_name = ? AND active = 1').get(productType, category));
  const missingAttribute = getMissingRequiredAttribute(productType, body.attributes);

  if (!name || !brand || !category || !productType || !typeMatchesCategory || missingAttribute || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0 || !Number.isFinite(costPrice) || costPrice < 0 || !Number.isInteger(reorderLevel) || reorderLevel < 0 || (maximumStock !== null && (!Number.isInteger(maximumStock) || maximumStock < 0)) || (packSize !== null && (!Number.isInteger(packSize) || packSize < 0))) {
    if (missingAttribute) return res.status(400).json({ error: `${missingAttribute.name} is required` });
    return res.status(400).json({ error: 'Name, valid price, and non-negative stock are required' });
  }

  try {
    const createProduct = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO products (name, generic, barcode, price, stock, sku, category, brand, product_type, subcategory, description, unit_of_measure, pack_size, status, image_url, cost_price, track_inventory, reorder_level, maximum_stock, preferred_supplier_id, track_batch, track_expiry, track_serial, senior_discount_eligible, pwd_discount_eligible, promo_eligible, loyalty_eligible)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      String(body.generic || '').trim() || null,
      barcode,
      price,
      stock,
      sku,
      category,
      brand,
      productType,
      String(body.subcategory || '').trim() || null,
      String(body.description || '').trim() || null,
      String(body.unitOfMeasure || 'unit').trim() || 'unit',
      packSize,
      String(body.status || 'Active').trim() || 'Active',
      imageUrl,
      costPrice,
      category === 'Services' ? 0 : (body.trackInventory === false ? 0 : 1),
      reorderLevel,
      maximumStock,
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
    const mainLocation = db.prepare("SELECT id FROM inventory_locations WHERE name = 'Main Store' AND status = 'Active'").get();
    if (mainLocation) db.prepare('INSERT OR REPLACE INTO inventory_location_stock (location_id, product_id, quantity) VALUES (?, ?, ?)').run(mainLocation.id, row.id, stock);
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
    if (stock > 0 && body.trackInventory !== false && (body.trackBatch || body.trackExpiry)) {
      db.prepare('INSERT INTO inventory_batches (product_id, batch_number, expiry_date, quantity) VALUES (?, ?, ?, ?)').run(row.id, `OPENING-${row.id}`, String(body.expiryDate || '').trim() || null, stock);
    }
    return row;
    });
    const createdRow = createProduct();
    auditLog(req, 'Created product', 'Product', createdRow.id, { name: createdRow.name, category: createdRow.category, price: createdRow.price });
    return res.status(201).json(normalizeProduct(createdRow));
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Barcode already exists' });
    return res.status(500).json({ error: 'Product could not be created' });
  }
});

router.patch('/:id', requireAdministrator, (req, res) => {
  const body = req.body || {};
  const productId = Number(req.params.id);
  const name = String(body.name || '').trim();
  const brand = String(body.brand || '').trim();
  const category = String(body.category || '').trim();
  const productType = String(body.productType || body.product_type || '').trim();
  const price = Number(body.price);
  const costPrice = Number(body.costPrice ?? body.cost_price);
  const packSize = body.packSize === '' || body.packSize == null ? null : Number(body.packSize);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const typeMatchesCategory = db.prepare('SELECT 1 FROM product_types WHERE name = ? AND category_name = ? AND active = 1').get(productType, category);
  const missingAttribute = getMissingRequiredAttribute(productType, body.attributes);

  if (!Number.isInteger(productId) || !name || !brand || !category || !productType || !typeMatchesCategory || missingAttribute || !Number.isFinite(price) || price < 0 || !Number.isFinite(costPrice) || costPrice < 0 || (packSize !== null && (!Number.isInteger(packSize) || packSize < 0))) {
    if (missingAttribute) return res.status(400).json({ error: `${missingAttribute.name} is required` });
    return res.status(400).json({ error: 'Name, category, product type, valid prices, and non-negative stock are required' });
  }
  const imageUrl = resolveProductImageUrl(body);

  try {
    db.prepare(`
      UPDATE products SET name = ?, generic = ?, barcode = ?, price = ?, category = ?, brand = ?, product_type = ?, subcategory = ?, description = ?, unit_of_measure = ?, pack_size = ?, image_url = ?, cost_price = ?, track_inventory = ?, reorder_level = ?, maximum_stock = ?, track_batch = ?, track_expiry = ?, track_serial = ?, senior_discount_eligible = ?, pwd_discount_eligible = ?, promo_eligible = ?, loyalty_eligible = ?
      WHERE id = ?
    `).run(
      name,
      String(body.generic || '').trim() || null,
      String(body.barcode || '').trim() || null,
      price,
      category,
      brand,
      productType,
      String(body.subcategory || '').trim() || null,
      String(body.description || '').trim() || null,
      String(body.unitOfMeasure || body.unit_of_measure || 'unit').trim() || 'unit',
      packSize,
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

    // Keep the per-product tracking/discount configuration in sync so the
    // source of truth used by procurement/sales never drifts from `products`.
    db.prepare(`
      INSERT INTO product_tracking_config (product_id, track_batch, track_expiry, track_serial)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(product_id) DO UPDATE SET
        track_batch = excluded.track_batch,
        track_expiry = excluded.track_expiry,
        track_serial = excluded.track_serial
    `).run(
      productId,
      category === 'Services' ? 0 : (body.trackBatch ? 1 : 0),
      category === 'Services' ? 0 : (body.trackExpiry ? 1 : 0),
      category === 'Services' ? 0 : (body.trackSerial ? 1 : 0)
    );
    db.prepare(`
      INSERT INTO product_discount_config (product_id, senior_eligible, pwd_eligible, promo_eligible, loyalty_eligible)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(product_id) DO UPDATE SET
        senior_eligible = excluded.senior_eligible,
        pwd_eligible = excluded.pwd_eligible,
        promo_eligible = excluded.promo_eligible,
        loyalty_eligible = excluded.loyalty_eligible
    `).run(
      productId,
      body.seniorDiscountEligible ? 1 : 0,
      body.pwdDiscountEligible ? 1 : 0,
      body.promoEligible === false ? 0 : 1,
      body.loyaltyEligible === false ? 0 : 1
    );
    if (body.attributes && typeof body.attributes === 'object') {
      const definitions = db.prepare(`
        SELECT d.id, d.name FROM product_attribute_definitions d
        JOIN product_types t ON t.id = d.product_type_id
        WHERE t.name = ? AND d.active = 1
      `).all(productType);
      const definitionIds = new Map(definitions.map((definition) => [definition.name, definition.id]));
      const insertValue = db.prepare('INSERT OR REPLACE INTO product_attribute_values (product_id, attribute_definition_id, value_text) VALUES (?, ?, ?)');
      Object.entries(body.attributes).forEach(([attributeName, value]) => {
        const definitionId = definitionIds.get(attributeName);
        if (definitionId && value !== '' && value !== null && value !== undefined) insertValue.run(productId, definitionId, JSON.stringify(value));
      });
    }

    auditLog(req, 'Updated product', 'Product', productId, { name, category, price, stockUnchanged: true });

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

router.get('/metadata', authenticate, (req, res) => {
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
  const productType = row.product_type || row.productType || row.type || 'OTC';

  const normalizedProductType = String(productType).trim();

  const attributes = row.id
    ? db.prepare(`
        SELECT d.name, d.data_type AS dataType, v.value_text AS value
        FROM product_attribute_definitions d
        JOIN product_types t ON t.id = d.product_type_id AND t.name = ?
        LEFT JOIN product_attribute_values v ON v.attribute_definition_id = d.id AND v.product_id = ?
        WHERE d.active = 1
        ORDER BY d.display_order, d.name
      `).all(normalizedProductType, row.id).reduce((result, attribute) => {
        if (attribute.value !== null && attribute.value !== undefined) {
          try {
            result[attribute.name] = JSON.parse(attribute.value);
          } catch (_error) {
            result[attribute.name] = attribute.value;
          }
        }
        return result;
      }, {})
    : {};

  return {
    ...row,
    attributes,
    brand: row.brand || row.generic || null,
    sku: row.sku || row.barcode || null,
    category: row.category || 'General',
    image_url: row.image_url || null,
    imageUrl: row.image_url || null,
    product_type: normalizedProductType,
    productType: normalizedProductType,
    senior_discount_eligible: Boolean(row.senior_discount_eligible),
    pwd_discount_eligible: Boolean(row.pwd_discount_eligible),
    seniorDiscountEligible: Boolean(row.senior_discount_eligible),
    pwdDiscountEligible: Boolean(row.pwd_discount_eligible),
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
  attachBatchInfo(rows);

  if (expBefore) rows = filterByExpiration(rows, expBefore);

  const result = paginateRows(rows, page, limit);
  return {
    ...result,
    items: result.items,
  };
}

// GET /api/products/filters — distinct values for filter dropdowns
router.get('/filters', authenticate, (req, res) => {
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
router.get('/barcode/:barcode', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE barcode = ?').get(req.params.barcode);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(attachBatchInfo([normalizeProduct(row)])[0]);
});

// GET /api/products — search with pagination and filters
router.get('/', authenticate, (req, res) => {
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
  const rows = attachBatchInfo(db.prepare('SELECT * FROM products ORDER BY name ASC').all().map(normalizeProduct));
  res.json(rows);
});

// GET /api/products/:id
router.get('/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(attachBatchInfo([normalizeProduct(row)])[0]);
});

module.exports = router;
module.exports.resolveProductImageUrl = resolveProductImageUrl;
