const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Use an isolated temp DB so tests never touch real data.
const testDb = path.join(os.tmpdir(), `pospilot-test-${process.pid}-${Date.now()}.db`);
process.env.POSPILOT_DB_PATH = testDb;

const { start } = require('../index');

let server;
let baseUrl;
let authToken;

async function req(method, route, body, token) {
  const res = await fetch(`${baseUrl}/api${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body
  }
  return { status: res.status, data };
}

test.before(async () => {
  server = await start(0);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  // Seed a category + product type so the product-dependent tests can run against
  // a fresh temp DB (the production bootstrap seeds users but not catalog types).
  const db = require('../db');
  if (!db.prepare('SELECT 1 FROM categories LIMIT 1').get()) {
    db.prepare("INSERT INTO categories (name, status) VALUES ('Test Category', 'Active')").run();
  }
  if (!db.prepare('SELECT 1 FROM product_types LIMIT 1').get()) {
    db.prepare("INSERT INTO product_types (name, category_name) VALUES ('Test Type', 'Test Category')").run();
  }

  const login = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  assert.equal(login.status, 200);
  authToken = login.data.token;

  // Seeded accounts must change their default password on first login — do that
  // here so the rest of the suite exercises the normal documented flow.
  const changed = await req('POST', '/auth/change-password', { currentPassword: 'admin123', newPassword: 'North#R1dge' }, authToken);
  assert.equal(changed.status, 200);
});

test.after(() => {
  server?.close();
  try {
    fs.unlinkSync(testDb);
  } catch (_error) {
    // already gone
  }
});

test('health endpoint responds', async () => {
  const res = await req('GET', '/health');
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.db, 'ok');
});

test('sale creation is authenticated', async () => {
  const res = await req('POST', '/sales', { items: [{ productId: 1, qty: 1 }] });
  assert.equal(res.status, 401);
});

test('catalog writes and sales history require authentication', async () => {
  const sampleType = require('../db').prepare(
    'SELECT name, category_name FROM product_types WHERE active = 1 LIMIT 1'
  ).get();
  const product = await req('POST', '/products', {
    name: 'Unauthenticated Product',
    brand: 'Test',
    category: sampleType.category_name,
    productType: sampleType.name,
    price: 10,
    stock: 1,
  });
  assert.equal(product.status, 401);

  const sales = await req('GET', '/sales');
  assert.equal(sales.status, 401);
});

test('creates a product with an admin token', async () => {
  const sampleType = require('../db').prepare(
    'SELECT name, category_name FROM product_types WHERE active = 1 LIMIT 1'
  ).get();
  const res = await req(
    'POST',
    '/products',
    { name: 'Integration Med', brand: 'Test', category: sampleType.category_name, productType: sampleType.name, price: 100, stock: 50 },
    authToken
  );
  assert.equal(res.status, 201);
  assert.equal(typeof res.data.id, 'number');
});

test('records a sale, decrements stock, and returns server-computed totals', async () => {
  const db = require('../db');
  const sampleType = db.prepare('SELECT name, category_name FROM product_types WHERE active = 1 LIMIT 1').get();
  const created = await req(
    'POST',
    '/products',
    { name: 'Sale Item', brand: 'Test', category: sampleType.category_name, productType: sampleType.name, price: 100, stock: 50 },
    authToken
  );
  const productId = created.data.id;

  const sale = await req(
    'POST',
    '/sales',
    {
      customer: 'Walk-in Customer',
      customerType: 'walkin',
      paymentType: 'cash',
      cashReceived: 500,
      items: [{ productId, qty: 3, discPct: 0, unitPrice: 100 }],
    },
    authToken
  );
  assert.equal(sale.status, 201);
  assert.equal(sale.data.grandTotal, 300);
  assert.equal(sale.data.changeDue, 200);

  const after = db.prepare('SELECT stock FROM products WHERE id = ?').get(productId);
  assert.equal(after.stock, 47);
});

test('automatic approval is created when a sale crosses a policy threshold', async () => {
  const db = require('../db');
  const sampleType = db.prepare('SELECT name, category_name FROM product_types WHERE active = 1 LIMIT 1').get();
  const product = await req(
    'POST',
    '/products',
    { name: 'Threshold Item', brand: 'Test', category: sampleType.category_name, productType: sampleType.name, price: 100, stock: 10 },
    authToken
  );

  db.prepare(
    `INSERT INTO app_settings (id, data_json, updated_at)
     VALUES (1, ?, datetime('now', 'localtime'))
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`
  ).run(JSON.stringify({
    storeName: 'St. Isidore\'s Pharmacy',
    logoUrl: '',
    address: '',
    phone: '',
    email: '',
    tinNumber: '',
    ownerName: '',
    businessName: '',
    branchName: '',
    branchCode: '',
    businessRegNumber: '',
    dtiSecRegNumber: '',
    birRegNumber: '',
    website: '',
    facebook: '',
    tagline: '',
    authorizedRep: '',
    cashierManagerContact: '',
    receiptFooter: 'Thank you for shopping with us.',
    taxRate: '0',
    defaultLocation: 'Main Store',
    lowStockThreshold: '10',
    terminalName: 'POS-02',
    priceOverrideMaxPct: '50',
    priceOverrideApprovalPct: '10',
    discountApprovalPct: '10',
    cashApprovalThreshold: '500',
    backupDir: '',
    idleTimeoutMinutes: '0',
    launchOnStartup: 'false',
  }));

  const sale = await req(
    'POST',
    '/sales',
    {
      customer: 'Walk-in Customer',
      customerType: 'walkin',
      paymentType: 'cash',
      cashReceived: 240,
      items: [{ productId: product.data.id, qty: 1, discPct: 12, unitPrice: 120 }],
    },
    authToken
  );

  assert.equal(sale.status, 201);
  const approvals = await req('GET', '/approvals', null, authToken);
  assert.equal(approvals.status, 200);
  assert.ok(approvals.data.requests.some((request) => request.type === 'price_override' || request.type === 'discount_override'));
});

test('rejects duplicate product lines and insufficient payment', async () => {
  const db = require('../db');
  const sampleType = db.prepare('SELECT name, category_name FROM product_types WHERE active = 1 LIMIT 1').get();
  const created = await req('POST', '/products', {
    name: 'Duplicate Line Item',
    brand: 'Test',
    category: sampleType.category_name,
    productType: sampleType.name,
    price: 100,
    stock: 2,
  }, authToken);
  const productId = created.data.id;

  const duplicate = await req('POST', '/sales', {
    cashReceived: 200,
    items: [{ productId, qty: 1 }, { productId, qty: 1 }],
  }, authToken);
  assert.equal(duplicate.status, 400);

  const insufficient = await req('POST', '/sales', {
    cashReceived: 99,
    items: [{ productId, qty: 1 }],
  }, authToken);
  assert.equal(insufficient.status, 400);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id = ?').get(productId).stock, 2);
});

test('senior discount applies only to eligible products and after line discount', async () => {
  const db = require('../db');
  const sampleType = db.prepare('SELECT name, category_name FROM product_types WHERE active = 1 LIMIT 1').get();
  const eligible = await req(
    'POST',
    '/products',
    { name: 'Senior Item', brand: 'Test', category: sampleType.category_name, productType: sampleType.name, price: 100, stock: 10, seniorDiscountEligible: true },
    authToken
  );
  const ineligible = await req(
    'POST',
    '/products',
    { name: 'Not Eligible', brand: 'Test', category: sampleType.category_name, productType: sampleType.name, price: 100, stock: 10 },
    authToken
  );

  const sale = await req(
    'POST',
    '/sales',
    {
      customer: 'Senior Customer',
      customerType: 'senior',
      paymentType: 'cash',
      items: [
        { productId: eligible.data.id, qty: 1, unitPrice: 100 },
        { productId: ineligible.data.id, qty: 1, unitPrice: 100 },
      ],
    },
    authToken
  );
  assert.equal(sale.status, 201);
  // The 20% is computed on the VAT-EXCLUSIVE amount: each eligible ₱100 line
  // carries VAT = 100 × 12/112 = 10.71, so VATABLE = 89.29 and 20% = 17.86.
  // The ineligible line contributes VAT but no senior discount.
  assert.equal(sale.data.vat, 21.42); // 2 lines × 10.71
  assert.equal(sale.data.vatable, 178.58); // 200 − 21.42
  assert.equal(sale.data.seniorPwdDiscountTotal, 17.86);
  assert.equal(sale.data.grandTotal, 182.14);
});

test('POS invoice counter advances and duplicate refs replay idempotently', async () => {
  const db = require('../db');
  const sampleType = db.prepare('SELECT name, category_name FROM product_types WHERE active = 1 LIMIT 1').get();
  const created = await req(
    'POST',
    '/products',
    { name: 'Counter Item', brand: 'Test', category: sampleType.category_name, productType: sampleType.name, price: 50, stock: 10 },
    authToken
  );
  assert.equal(created.status, 201);
  const productId = created.data.id;

  // A POS sale records its invoice number as the transaction ref (not "TX-" prefixed).
  const first = await req('POST', '/sales', {
    items: [{ productId, qty: 1, unitPrice: 50 }],
    transactionId: 'SI-000001',
    cashReceived: 50,
  }, authToken);
  assert.equal(first.status, 201);
  assert.equal(first.data.transactionId, 'SI-000001');

  // The /sales/counter endpoint reads both SI- and legacy TX-SI- refs.
  const counter = await req('GET', '/sales/counter', null, authToken);
  assert.equal(counter.status, 200);
  assert.equal(counter.data.next, 2);

  // Replaying the same invoice number returns the existing sale WITHOUT
  // double-decrementing stock.
  const dup = await req('POST', '/sales', {
    items: [{ productId, qty: 1, unitPrice: 50 }],
    transactionId: 'SI-000001',
    cashReceived: 50,
  }, authToken);
  assert.equal(dup.status, 200);
  assert.equal(dup.data.duplicate, true);
  assert.equal(dup.data.id, first.data.id);

  const after = db.prepare('SELECT stock FROM products WHERE id = ?').get(productId).stock;
  assert.equal(after, 9); // only ONE decrement, from the first commit
});

test('expiry filtering no longer crashes the products endpoint', async () => {
  const res = await req('GET', '/products?expBefore=' + encodeURIComponent('2026-03'), null, authToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.items));
});

test('a cashier cannot deactivate another user', async () => {
  const cashier = await req('POST', '/auth/login', { username: 'cashier', password: 'cashier123' });
  assert.equal(cashier.status, 200);
  const cashierToken = cashier.data.token;

  const admin = require('../db').prepare("SELECT id FROM users WHERE username = 'admin'").get();
  const res = await req('PATCH', `/users/${admin.id}/status`, { status: 'Inactive' }, cashierToken);
  assert.equal(res.status, 403);
});

test('voiding a completed sale restores inventory and cannot be repeated', async () => {
  const db = require('../db');
  const sampleType = db.prepare('SELECT name, category_name FROM product_types WHERE active = 1 LIMIT 1').get();
  const product = await req('POST', '/products', {
    name: 'Void Lifecycle Item', brand: 'Test', category: sampleType.category_name,
    productType: sampleType.name, price: 80, stock: 10,
  }, authToken);
  const sale = await req('POST', '/sales', {
    items: [{ productId: product.data.id, qty: 2, unitPrice: 80 }],
    cashReceived: 160,
  }, authToken);
  assert.equal(sale.status, 201);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id = ?').get(product.data.id).stock, 8);

  const voided = await req('POST', `/sales/${sale.data.id}/void`, { reason: 'Wrong quantity' }, authToken);
  assert.equal(voided.status, 200);
  assert.equal(voided.data.status, 'VOIDED');
  assert.equal(db.prepare('SELECT stock FROM products WHERE id = ?').get(product.data.id).stock, 10);
  assert.equal(db.prepare('SELECT status FROM sales WHERE id = ?').get(sale.data.id).status, 'VOIDED');

  const duplicate = await req('POST', `/sales/${sale.data.id}/void`, { reason: 'Wrong quantity' }, authToken);
  assert.equal(duplicate.status, 409);
});

test('returns advance sale status and prevent returning beyond purchased quantity', async () => {
  const db = require('../db');
  const sampleType = db.prepare('SELECT name, category_name FROM product_types WHERE active = 1 LIMIT 1').get();
  const product = await req('POST', '/products', {
    name: 'Refund Lifecycle Item', brand: 'Test', category: sampleType.category_name,
    productType: sampleType.name, price: 60, stock: 10,
  }, authToken);
  const sale = await req('POST', '/sales', {
    items: [{ productId: product.data.id, qty: 2, unitPrice: 60 }],
    cashReceived: 120,
  }, authToken);
  const detail = await req('GET', `/sales/${sale.data.id}`, null, authToken);
  const itemId = detail.data.items[0].id;

  const partial = await req('POST', `/sales/${sale.data.id}/return`, {
    items: [{ itemId, quantity: 1 }], reason: 'Customer return', refundMethod: 'cash',
  }, authToken);
  assert.equal(partial.status, 201);
  assert.equal(partial.data.status, 'PARTIALLY_REFUNDED');

  const full = await req('POST', `/sales/${sale.data.id}/return`, {
    items: [{ itemId, quantity: 1 }], reason: 'Customer return', refundMethod: 'cash',
  }, authToken);
  assert.equal(full.status, 201);
  assert.equal(full.data.status, 'FULLY_REFUNDED');
  assert.equal(db.prepare('SELECT status FROM sales WHERE id = ?').get(sale.data.id).status, 'FULLY_REFUNDED');

  const duplicate = await req('POST', `/sales/${sale.data.id}/return`, {
    items: [{ itemId, quantity: 1 }], reason: 'Duplicate return', refundMethod: 'cash',
  }, authToken);
  assert.equal(duplicate.status, 409);
});

test('logging out invalidates the session token', async () => {
  // Log in with a fresh throwaway account so we can verify invalidation.
  const sellTokenUser = await req('POST', '/auth/login', { username: 'admin', password: 'North#R1dge' });
  const token = sellTokenUser.data.token;
  const logout = await req('POST', '/auth/logout', {}, token);
  assert.equal(logout.status, 200);

  const denied = await req('POST', '/sales', { items: [{ productId: 1, qty: 1 }] }, token);
  assert.equal(denied.status, 401);
});