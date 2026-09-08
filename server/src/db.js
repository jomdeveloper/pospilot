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
    tax_type TEXT NOT NULL DEFAULT 'VATABLE' CHECK (tax_type IN ('VATABLE', 'VAT_EXEMPT', 'EXEMPT', 'ZERO_RATED', 'NON_VAT')),
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
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    customer TEXT NOT NULL DEFAULT 'Walk-in Customer',
    customer_type TEXT NOT NULL DEFAULT 'walkin',
    member_id TEXT,
    discount_type TEXT NOT NULL DEFAULT 'NONE' CHECK (discount_type IN ('NONE', 'MEMBER', 'SENIOR_CITIZEN', 'PWD', 'OTHER')),
    subtotal REAL NOT NULL,
    discount_total REAL NOT NULL,
    vat REAL NOT NULL,
    vatable_sales REAL NOT NULL DEFAULT 0,
    vat_exempt_sales REAL NOT NULL DEFAULT 0,
    zero_rated_sales REAL NOT NULL DEFAULT 0,
    non_vat_sales REAL NOT NULL DEFAULT 0,
    grand_total REAL NOT NULL,
    cash_received REAL NOT NULL,
    change_due REAL NOT NULL,
    payment_type TEXT NOT NULL,
    cashier_session_id INTEGER REFERENCES cashier_sessions(id),
    cashier_user_id INTEGER REFERENCES users(id),
    cashier_username TEXT,
    cash_amount REAL NOT NULL DEFAULT 0,
    split_payments_json TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_transaction_ref
    ON sales(transaction_ref) WHERE transaction_ref IS NOT NULL AND transaction_ref != '';

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price REAL NOT NULL,
    disc_pct REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    tax_type TEXT NOT NULL DEFAULT 'VATABLE',
    discount_type TEXT NOT NULL DEFAULT 'NONE' CHECK (discount_type IN ('NONE', 'MEMBER', 'SENIOR_CITIZEN', 'PWD', 'OTHER')),
    vat REAL NOT NULL DEFAULT 0,
    vatable_sales REAL NOT NULL DEFAULT 0,
    vat_exempt_sales REAL NOT NULL DEFAULT 0,
    zero_rated_sales REAL NOT NULL DEFAULT 0,
    non_vat_sales REAL NOT NULL DEFAULT 0,
    customer_discount REAL NOT NULL DEFAULT 0,
    returned_qty INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sale_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    refund_amount REAL NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    refund_method TEXT NOT NULL DEFAULT 'cash',
    actor_user_id INTEGER,
    actor_username TEXT,
    approved_by_user_id INTEGER,
    approved_by_username TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS sale_voids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL UNIQUE REFERENCES sales(id),
    reason TEXT NOT NULL,
    description TEXT,
    voided_by_user_id INTEGER,
    voided_by_username TEXT,
    approved_by_user_id INTEGER,
    approved_by_username TEXT,
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
    total REAL NOT NULL,
    received_qty INTEGER NOT NULL DEFAULT 0
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
    category TEXT NOT NULL DEFAULT 'System',
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    outcome TEXT NOT NULL DEFAULT 'Success',
    terminal TEXT,
    request_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);

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
    actor_user_id INTEGER,
    actor_username TEXT,
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

  CREATE TABLE IF NOT EXISTS register_cashier_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cashier_session_id INTEGER NOT NULL REFERENCES cashier_sessions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    username TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Ended'))
  );

  CREATE INDEX IF NOT EXISTS idx_register_activity_session
    ON register_cashier_activity(cashier_session_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_register_activity_user
    ON register_cashier_activity(user_id, status);
`);

// Additive audit migrations for databases created before structured audit
// metadata was introduced.
const auditColumns = new Set(db.prepare('PRAGMA table_info(audit_logs)').all().map((column) => column.name));
const addAuditColumn = (name, definition) => {
  if (!auditColumns.has(name)) db.exec(`ALTER TABLE audit_logs ADD COLUMN ${name} ${definition}`);
};
addAuditColumn('category', "TEXT NOT NULL DEFAULT 'System'");
addAuditColumn('terminal', 'TEXT');
addAuditColumn('request_id', 'TEXT');
addAuditColumn('ip_address', 'TEXT');
addAuditColumn('user_agent', 'TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC, id DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC)');

// Additive migrations for databases created before cashier attribution was
// introduced. SQLite has no IF NOT EXISTS form for ALTER TABLE ADD COLUMN.
const columns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
const addColumn = (table, name, definition) => {
  if (!columns(table).has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
};
addColumn('sales', 'cashier_user_id', 'INTEGER REFERENCES users(id)');
addColumn('sales', 'cashier_username', 'TEXT');
addColumn('cash_transactions', 'actor_user_id', 'INTEGER');
addColumn('cash_transactions', 'actor_username', 'TEXT');

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
    quantity INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS approval_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    reason TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
    requested_by_username TEXT NOT NULL,
    entity_id TEXT,
    request_ref TEXT,
    reviewed_by_user_id INTEGER,
    reviewed_by_username TEXT,
    review_note TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS pending_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cashier_session_id INTEGER REFERENCES cashier_sessions(id),
    customer_name TEXT NOT NULL DEFAULT 'Walk-in Customer',
    customer_type TEXT NOT NULL DEFAULT 'walkin',
    member_id TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'in_progress', 'recalled', 'completed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    recalled_at TEXT,
    recalled_by_user_id INTEGER,
    recalled_by_username TEXT
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_pending_sales_status ON pending_sales(status, created_at DESC)');

db.prepare("INSERT OR IGNORE INTO inventory_locations (name) VALUES ('Main Store')").run();
const mainLocationId = db.prepare("SELECT id FROM inventory_locations WHERE name = 'Main Store'").get().id;
db.prepare(`
  INSERT OR IGNORE INTO inventory_location_stock (location_id, product_id, quantity)
  SELECT ?, id, stock FROM products
`).run(mainLocationId);

const defaultCategories = [
  { name: 'General', description: 'Core retail items', status: 'Active' },
  { name: 'Services', description: 'Service offerings and labor', status: 'Active' },
];
defaultCategories.forEach(({ name, description, status }) => {
  db.prepare('INSERT OR IGNORE INTO categories (name, description, status) VALUES (?, ?, ?)').run(name, description, status);
});

db.prepare('INSERT OR IGNORE INTO product_types (name, category_name, description) VALUES (?, ?, ?)').run(
  'General Merchandise',
  'General',
  'Standard retail inventory'
);
db.prepare('INSERT OR IGNORE INTO product_types (name, category_name, description) VALUES (?, ?, ?)').run(
  'Services',
  'Services',
  'Service offerings and labor'
);

// Force a one-time password change for accounts that still use the seeded
// default credentials. New columns default to 0; the accounts created below
// during bootstrap are explicitly marked 1, and any pre-existing database that
// still carries the default hash gets upgraded here so old installs are just as
// strict as fresh ones.
db.prepare(
  "UPDATE users SET must_change_password = 1 WHERE username = 'admin' AND password_hash = ? AND must_change_password = 0"
).run(hashPassword('admin123', 'admin'));
db.prepare(
  "UPDATE users SET must_change_password = 1 WHERE username = 'cashier' AND password_hash = ? AND must_change_password = 0"
).run(hashPassword('cashier123', 'cashier'));

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
