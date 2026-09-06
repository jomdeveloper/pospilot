const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { hashPassword } = require('./security');

// Allow tests (or operators) to point the DB at a different location.
const defaultDataDir = path.join(__dirname, '..', 'data');
const dbPath = process.env.POSPILOT_DB_PATH || path.join(defaultDataDir, 'pospilot.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
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
    description TEXT,
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
    loyalty_eligible INTEGER NOT NULL DEFAULT 1
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
    storage_condition TEXT,
    warranty_period REAL,
    attributes_json TEXT NOT NULL DEFAULT '{}',
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
    transaction_ref TEXT,
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

  CREATE TABLE IF NOT EXISTS sale_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    refund_amount REAL NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    actor_user_id INTEGER,
    actor_username TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'Cashier',
    status TEXT NOT NULL DEFAULT 'Active',
    password_hash TEXT NOT NULL DEFAULT '',
    must_change_password INTEGER NOT NULL DEFAULT 0,
    last_login TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS login_failures (
    username TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0,
    window_started_at TEXT NOT NULL,
    locked_until TEXT
  );

  CREATE TABLE IF NOT EXISTS password_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
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

  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
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

  /* ------------------------------------------------------------------ */
  /*  Cash Float / Opening Cash — per cashier register sessions.         */
  /*  The opening cash float is STARTING DRAWER CASH, never revenue.     */
  /*  Every session is a single continuous shift on one register with    */
  /*  exactly ONE active (Open) session per terminal at any time.        */
  /* ------------------------------------------------------------------ */
  CREATE TABLE IF NOT EXISTS cashier_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_ref TEXT NOT NULL UNIQUE,
    store TEXT NOT NULL DEFAULT '',
    branch TEXT NOT NULL DEFAULT '',
    terminal TEXT NOT NULL DEFAULT 'POS-02',
    cashier_user_id INTEGER NOT NULL REFERENCES users(id),
    cashier_username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
    opening_float REAL NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
    opening_denominations_json TEXT,
    -- Snapshot of the running drawer math (refreshed on every movement) so
    -- reports and the closing screen never have to re-derive history.
    cash_sales REAL NOT NULL DEFAULT 0,
    cash_refunds REAL NOT NULL DEFAULT 0,
    cash_paid_in REAL NOT NULL DEFAULT 0,
    cash_paid_out REAL NOT NULL DEFAULT 0,
    cash_drops REAL NOT NULL DEFAULT 0,
    adjustment_in REAL NOT NULL DEFAULT 0,
    adjustment_out REAL NOT NULL DEFAULT 0,
    expected_cash REAL NOT NULL DEFAULT 0,
    -- Closing figures (null until the session is closed).
    actual_cash REAL,
    cash_difference REAL,
    difference_status TEXT CHECK (difference_status IN ('EXACT', 'OVER', 'SHORT') OR difference_status IS NULL),
    closing_denominations_json TEXT,
    opened_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    closed_at TEXT,
    closed_by_user_id INTEGER,
    closed_by_username TEXT,
    notes TEXT
  );

  -- One open session per terminal: the register gate prevents a second
  -- cashier from opening the same drawer while another shift is live.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_cashier_sessions_terminal_open
    ON cashier_sessions(terminal) WHERE status = 'Open';
  CREATE INDEX IF NOT EXISTS idx_cashier_sessions_terminal
    ON cashier_sessions(terminal, status);
  CREATE INDEX IF NOT EXISTS idx_cashier_sessions_opened_at
    ON cashier_sessions(opened_at);

  /* Immutable, append-only cash-movement ledger. Reversals must be posted   */
  /* as a NEW (adjustment) transaction — historical rows are never edited.  */
  CREATE TABLE IF NOT EXISTS cash_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_ref TEXT NOT NULL UNIQUE,
    cashier_session_id INTEGER NOT NULL REFERENCES cashier_sessions(id),
    store TEXT NOT NULL DEFAULT '',
    branch TEXT NOT NULL DEFAULT '',
    terminal TEXT NOT NULL DEFAULT 'POS-02',
    cashier_user_id INTEGER NOT NULL,
    cashier_username TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
      'opening_float', 'cash_in', 'cash_out', 'cash_drop', 'adjustment_in', 'adjustment_out', 'actual_cash'
    )),
    amount REAL NOT NULL CHECK (amount >= 0),
    reason TEXT,
    notes TEXT,
    reference TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_cash_transactions_session
    ON cash_transactions(cashier_session_id);
  CREATE INDEX IF NOT EXISTS idx_cash_transactions_created
    ON cash_transactions(created_at);
`);

const salesColumns = new Set(db.prepare('PRAGMA table_info(sales)').all().map((column) => column.name));
if (!salesColumns.has('transaction_ref')) db.exec('ALTER TABLE sales ADD COLUMN transaction_ref TEXT');
// Cash-drawer integration: every sale can be attributed to an open cashier
// session and carries the exact portion of the tender that physically lands
// in the drawer (0 for card/e-wallet/bank; the cash leg only for split tenders).
if (!salesColumns.has('cashier_session_id')) db.exec('ALTER TABLE sales ADD COLUMN cashier_session_id INTEGER REFERENCES cashier_sessions(id)');
if (!salesColumns.has('cash_amount')) db.exec("ALTER TABLE sales ADD COLUMN cash_amount REAL NOT NULL DEFAULT 0");
if (!salesColumns.has('split_payments_json')) db.exec('ALTER TABLE sales ADD COLUMN split_payments_json TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_sales_cashier_session ON sales(cashier_session_id)');

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS inventory_location_stock (
    location_id INTEGER NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    PRIMARY KEY (location_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movement_type TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    from_location_id INTEGER REFERENCES inventory_locations(id),
    to_location_id INTEGER REFERENCES inventory_locations(id),
    reason TEXT NOT NULL,
    reference TEXT,
    actor_user_id INTEGER,
    actor_username TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

// The POS may sell down past zero (cashier sells what is physically present,
// then staff reconcile via Stock Adjustment). Remove the old
// CHECK (quantity >= 0) on inventory_location_stock so location stock can go
// negative. SQLite requires recreating the table to drop a CHECK.
const locationStockSchema = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inventory_location_stock'")
  .get();
if (locationStockSchema && /CHECK\s*\(\s*quantity\s*>=\s*0\s*\)/i.test(locationStockSchema.sql || '')) {
  db.transaction(() => {
    db.exec(`
      ALTER TABLE inventory_location_stock RENAME TO inventory_location_stock_old;
      CREATE TABLE inventory_location_stock (
        location_id INTEGER NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (location_id, product_id)
      );
      INSERT INTO inventory_location_stock (location_id, product_id, quantity)
        SELECT location_id, product_id, quantity FROM inventory_location_stock_old;
      DROP TABLE inventory_location_stock_old;
    `);
  })();
}

const mainLocation = db.prepare("INSERT OR IGNORE INTO inventory_locations (name) VALUES ('Main Store')").run();
const mainLocationId = db.prepare("SELECT id FROM inventory_locations WHERE name = 'Main Store'").get().id;
db.prepare(`
  INSERT OR IGNORE INTO inventory_location_stock (location_id, product_id, quantity)
  SELECT ?, id, stock FROM products
`).run(mainLocationId);

const productColumns = new Set(db.prepare('PRAGMA table_info(products)').all().map((column) => column.name));
[
  ['description', 'TEXT'],
].forEach(([column, definition]) => {
  if (!productColumns.has(column)) db.exec(`ALTER TABLE products ADD COLUMN ${column} ${definition}`);
});
const saleItemColumns = new Set(db.prepare('PRAGMA table_info(sale_items)').all().map((column) => column.name));
if (!saleItemColumns.has('returned_qty')) db.exec('ALTER TABLE sale_items ADD COLUMN returned_qty INTEGER NOT NULL DEFAULT 0');
const batchColumns = new Set(db.prepare('PRAGMA table_info(inventory_batches)').all().map((column) => column.name));
[
  ['storage_condition', 'TEXT'],
  ['warranty_period', 'REAL'],
  ['attributes_json', "TEXT NOT NULL DEFAULT '{}'"],
].forEach(([column, definition]) => {
  if (!batchColumns.has(column)) db.exec(`ALTER TABLE inventory_batches ADD COLUMN ${column} ${definition}`);
});
const purchaseItemColumns = new Set(db.prepare('PRAGMA table_info(purchase_order_items)').all().map((column) => column.name));
if (!purchaseItemColumns.has('received_qty')) db.exec('ALTER TABLE purchase_order_items ADD COLUMN received_qty INTEGER NOT NULL DEFAULT 0');
['is_rx', 'is_controlled', 'ra6675_compliant', 'requires_prescription'].forEach((column) => {
  if (productColumns.has(column)) db.exec(`ALTER TABLE products DROP COLUMN ${column}`);
});

// Force a one-time password change for accounts that still use the seeded
// default credentials. New columns default to 0; the accounts created below
// during bootstrap are explicitly marked 1, and any pre-existing database that
// still carries the default hash gets upgraded here so old installs are just as
// strict as fresh ones.
const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
if (!userColumns.has('must_change_password')) {
  db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
}
db.prepare(
  "UPDATE users SET must_change_password = 1 WHERE username = 'admin' AND password_hash = ? AND must_change_password = 0"
).run(hashPassword('admin123', 'admin'));
db.prepare(
  "UPDATE users SET must_change_password = 1 WHERE username = 'cashier' AND password_hash = ? AND must_change_password = 0"
).run(hashPassword('cashier123', 'cashier'));

// Enforce unique transaction references (POS invoice numbers). Older builds let the
// invoice counter reset on restart, which could mint duplicate SI-###### refs —
// backfill any duplicates with a `-<id>` suffix, then lock the column with a partial
// UNIQUE index so duplicate invoice numbers can never be recorded again.
if (db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name = 'idx_sales_transaction_ref'").get().c === 0) {
  db.transaction(() => {
    const duplicates = db.prepare(`
      SELECT transaction_ref, COUNT(*) AS c, MIN(id) AS keep_id
      FROM sales
      WHERE transaction_ref IS NOT NULL AND transaction_ref != ''
      GROUP BY transaction_ref HAVING COUNT(*) > 1
    `).all();
    const dedupe = db.prepare("UPDATE sales SET transaction_ref = ? WHERE id = ?");
    duplicates.forEach((dup) => {
      const extras = db.prepare(
        "SELECT id FROM sales WHERE transaction_ref = ? AND id != ? ORDER BY id"
      ).all(dup.transaction_ref, dup.keep_id);
      extras.forEach((row) => dedupe.run(`${dup.transaction_ref}-${row.id}`, row.id));
    });
  })();
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_transaction_ref ON sales(transaction_ref) WHERE transaction_ref IS NOT NULL AND transaction_ref != ''"
  );
}

if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (name, username, email, role, status, password_hash, must_change_password)
    VALUES (?, ?, ?, ?, 'Active', ?, 1)
  `);
  insertUser.run('Admin', 'admin', 'admin@stisidores.ph', 'Administrator', hashPassword('admin123', 'admin'));
  insertUser.run('Cashier', 'cashier', null, 'Cashier', hashPassword('cashier123', 'cashier'));
}

module.exports = db;
// Path of the database file — used by the backup module so snapshots always
// land next to the live database regardless of where it lives.
module.exports.dbPath = dbPath;

/**
 * Read one persisted application setting from the app_settings row
 * (independent of the /api/settings route so modules like backup can use it
 * without importing routes). Returns undefined when absent.
 */
module.exports.getAppSetting = function getAppSetting(key) {
  if (!key) return undefined;
  try {
    const row = db.prepare('SELECT data_json FROM app_settings WHERE id = 1').get();
    if (!row) return undefined;
    const parsed = JSON.parse(row.data_json || '{}');
    return parsed && typeof parsed === 'object' ? parsed[key] : undefined;
  } catch (_error) {
    return undefined;
  }
};

/** Persist one application setting into the app_settings row (merge semantics). */
module.exports.setAppSetting = function setAppSetting(key, value) {
  let current = {};
  try {
    const row = db.prepare('SELECT data_json FROM app_settings WHERE id = 1').get();
    const parsed = JSON.parse(row?.data_json || '{}');
    if (parsed && typeof parsed === 'object') current = parsed;
  } catch (_error) {
    current = {};
  }
  current[key] = value;
  db.prepare(
    `INSERT INTO app_settings (id, data_json, updated_at)
     VALUES (1, ?, datetime('now', 'localtime'))
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`
  ).run(JSON.stringify(current));
};
