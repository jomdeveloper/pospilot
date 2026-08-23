const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function hashPassword(password, username) {
  return crypto.scryptSync(String(password), String(username).toLowerCase(), 64).toString('hex');
}

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'pospilot.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    generic TEXT,
    brand TEXT,
    barcode TEXT UNIQUE,
    product_type TEXT NOT NULL DEFAULT 'General Merchandise',
    category TEXT NOT NULL DEFAULT 'General',
    subcategory TEXT,
    unit_of_measure TEXT NOT NULL DEFAULT 'unit',
    pack_size TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    image_url TEXT,
    price REAL NOT NULL,
    cost_price REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    track_inventory INTEGER NOT NULL DEFAULT 1,
    reorder_level INTEGER NOT NULL DEFAULT 0,
    maximum_stock INTEGER,
    preferred_supplier_id INTEGER,
    track_batch INTEGER NOT NULL DEFAULT 0,
    track_expiry INTEGER NOT NULL DEFAULT 0,
    track_serial INTEGER NOT NULL DEFAULT 0,
    senior_discount_eligible INTEGER NOT NULL DEFAULT 0,
    pwd_discount_eligible INTEGER NOT NULL DEFAULT 0,
    promo_eligible INTEGER NOT NULL DEFAULT 1,
    loyalty_eligible INTEGER NOT NULL DEFAULT 1,
    is_rx INTEGER NOT NULL DEFAULT 0,
    is_controlled INTEGER NOT NULL DEFAULT 0,
    ra6675_compliant INTEGER NOT NULL DEFAULT 0,
    requires_prescription INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS product_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category_name TEXT NOT NULL DEFAULT 'General Merchandise',
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS product_attribute_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_type_id INTEGER NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    data_type TEXT NOT NULL DEFAULT 'text',
    required INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    options_json TEXT,
    validation_json TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(product_type_id, name)
  );

  CREATE TABLE IF NOT EXISTS product_attribute_values (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attribute_definition_id INTEGER NOT NULL REFERENCES product_attribute_definitions(id) ON DELETE CASCADE,
    value_text TEXT,
    PRIMARY KEY(product_id, attribute_definition_id)
  );

  CREATE TABLE IF NOT EXISTS product_tracking_config (
    product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    track_batch INTEGER NOT NULL DEFAULT 0,
    track_expiry INTEGER NOT NULL DEFAULT 0,
    track_serial INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS product_discount_config (
    product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    senior_eligible INTEGER NOT NULL DEFAULT 0,
    pwd_eligible INTEGER NOT NULL DEFAULT 0,
    promo_eligible INTEGER NOT NULL DEFAULT 1,
    loyalty_eligible INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS inventory_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_number TEXT,
    expiry_date TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS inventory_serial_numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    serial_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'In Stock',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    customer TEXT NOT NULL DEFAULT 'Walk-in Customer',
    member_id TEXT,
    subtotal REAL NOT NULL,
    discount_total REAL NOT NULL,
    vat REAL NOT NULL,
    grand_total REAL NOT NULL,
    cash_received REAL NOT NULL,
    change_due REAL NOT NULL,
    payment_type TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price REAL NOT NULL,
    disc_pct REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'Cashier',
    status TEXT NOT NULL DEFAULT 'Active',
    password_hash TEXT NOT NULL DEFAULT '',
    last_login TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL UNIQUE,
    supplier TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    ordered_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    received_at TEXT,
    total REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    unit_cost REAL NOT NULL,
    total REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    contact TEXT,
    phone TEXT,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    customer_type TEXT NOT NULL DEFAULT 'Walk-in',
    member_id TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER,
    actor_username TEXT NOT NULL DEFAULT 'system',
    actor_role TEXT NOT NULL DEFAULT 'System',
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    outcome TEXT NOT NULL DEFAULT 'Success',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

const productTypes = [
  ['Prescription', 'Medicine', 'Prescription medicines'], ['OTC', 'Medicine', 'Over-the-counter medicines'], ['Medicine Other', 'Medicine', 'Other medicines'],
  ['Vitamin', 'Health & Wellness', 'Vitamin products'], ['Supplement', 'Health & Wellness', 'Supplements'], ['Herbal', 'Health & Wellness', 'Herbal products'], ['Wellness Other', 'Health & Wellness', 'Other health products'],
  ['Medical Device', 'Medical Products', 'Medical devices'], ['First Aid', 'Medical Products', 'First-aid products'], ['Wound Care', 'Medical Products', 'Wound care products'], ['Medical Products Other', 'Medical Products', 'Other medical products'],
  ['Hair Care', 'Personal Care', 'Hair care products'], ['Oral Care', 'Personal Care', 'Oral care products'], ['Body Care', 'Personal Care', 'Body care products'], ['Hygiene', 'Personal Care', 'Hygiene products'], ['Personal Care Other', 'Personal Care', 'Other personal care products'],
  ['Beauty', 'Beauty & Baby', 'Beauty products'], ['Skincare', 'Beauty & Baby', 'Skin care products'], ['Baby Care', 'Beauty & Baby', 'Baby products'], ['Beauty & Baby Other', 'Beauty & Baby', 'Other beauty and baby products'],
  ['Food', 'Food & Beverage', 'Food products'], ['Beverage', 'Food & Beverage', 'Beverages'], ['Infant Nutrition', 'Food & Beverage', 'Infant nutrition'], ['Food & Beverage Other', 'Food & Beverage', 'Other food and beverage products'],
  ['Household', 'General Merchandise', 'Household products'], ['Accessory', 'General Merchandise', 'Accessories'], ['Electronics', 'General Merchandise', 'Electronics'], ['Stationery', 'General Merchandise', 'Stationery'], ['General Merchandise Other', 'General Merchandise', 'Other merchandise'],
  ['Service', 'Services', 'Services'], ['Fee', 'Services', 'Fees'], ['Services Other', 'Services', 'Other services'],
];

const insertType = db.prepare('INSERT OR IGNORE INTO product_types (name, category_name, description) VALUES (?, ?, ?)');
const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
productTypes.forEach((type) => insertType.run(...type));
[...new Set(productTypes.map((type) => type[1]))].forEach((category) => insertCategory.run(category));

const attributes = {
  Prescription: [['Generic Name', 'text'], ['Brand', 'text'], ['Dosage Form', 'text'], ['Strength', 'text'], ['Route', 'text'], ['Prescription Required', 'boolean']],
  OTC: [['Generic Name', 'text'], ['Brand', 'text'], ['Dosage Form', 'text'], ['Strength', 'text']],
  Vitamin: [['Form', 'text'], ['Strength', 'text'], ['Serving Size', 'text'], ['Variant', 'text']],
  Supplement: [['Form', 'text'], ['Serving Size', 'text'], ['Variant', 'text']],
  Herbal: [['Form', 'text'], ['Variant', 'text']],
  'Medical Device': [['Model', 'text'], ['Device Type', 'text'], ['Size', 'text'], ['Warranty Period', 'number'], ['Registration Reference', 'text']],
  'Hair Care': [['Product Form', 'text'], ['Volume', 'text'], ['Scent', 'text'], ['Variant', 'text']],
  'Oral Care': [['Product Form', 'text'], ['Size', 'text'], ['Flavor', 'text']],
  'Body Care': [['Product Form', 'text'], ['Size', 'text'], ['Volume', 'text'], ['Scent', 'text']],
  Hygiene: [['Product Form', 'text'], ['Size', 'text'], ['Variant', 'text']],
  Beauty: [['Variant', 'text'], ['Size', 'text'], ['Color', 'text']],
  Skincare: [['Variant', 'text'], ['Size', 'text'], ['Scent', 'text']],
  'Baby Care': [['Product Form', 'text'], ['Size', 'text'], ['Age Range', 'text']],
  Food: [['Flavor', 'text'], ['Weight', 'text'], ['Pack Size', 'text'], ['Storage Condition', 'text'], ['Variant', 'text']],
  Beverage: [['Flavor', 'text'], ['Volume', 'text'], ['Pack Size', 'text'], ['Storage Condition', 'text']],
  'Infant Nutrition': [['Flavor', 'text'], ['Weight', 'text'], ['Pack Size', 'text'], ['Storage Condition', 'text']],
  Electronics: [['Model', 'text'], ['Variant', 'text'], ['Warranty', 'text']],
  Household: [['Size', 'text'], ['Variant', 'text']],
  Accessory: [['Color', 'text'], ['Size', 'text'], ['Variant', 'text']],
};

const insertAttribute = db.prepare(`
  INSERT OR IGNORE INTO product_attribute_definitions (product_type_id, name, data_type, display_order)
  SELECT id, ?, ?, ? FROM product_types WHERE name = ?
`);
Object.entries(attributes).forEach(([typeName, typeAttributes]) => {
  typeAttributes.forEach(([name, dataType], index) => insertAttribute.run(name, dataType, index, typeName));
});

if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (name, username, email, role, status, password_hash)
    VALUES (?, ?, ?, ?, 'Active', ?)
  `);
  insertUser.run('Admin', 'admin', 'admin@stisidores.ph', 'Administrator', hashPassword('admin123', 'admin'));
  insertUser.run('Cashier', 'cashier', null, 'Cashier', hashPassword('cashier123', 'cashier'));
}

module.exports = db;
