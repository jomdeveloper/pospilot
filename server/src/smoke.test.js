const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

const testDb = path.join(os.tmpdir(), `pospilot-smoke-${process.pid}-${Date.now()}.db`);
process.env.POSPILOT_DB_PATH = testDb;

const { start } = require('./index');

let server;
let baseUrl;
let adminToken;
let cashierToken;

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
  } catch (_error) {
    // Some endpoints return no JSON body.
  }
  return { status: res.status, data };
}

test.before(async () => {
  server = await start(0);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  const adminLogin = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  assert.equal(adminLogin.status, 200);
  adminToken = adminLogin.data.token;

  const adminPasswordChanged = await req('POST', '/auth/change-password', {
    currentPassword: 'admin123',
    newPassword: 'North#R1dge',
  }, adminToken);
  assert.equal(adminPasswordChanged.status, 200);

  const cashierLogin = await req('POST', '/auth/login', { username: 'cashier', password: 'cashier123' });
  assert.equal(cashierLogin.status, 200);
  assert.equal(cashierLogin.data.user.mustChangePassword, true);
  cashierToken = cashierLogin.data.token;

  const cashierPasswordChanged = await req('POST', '/auth/change-password', {
    currentPassword: 'cashier123',
    newPassword: 'South#R1dge',
  }, cashierToken);
  assert.equal(cashierPasswordChanged.status, 200);
});

test.after(() => {
  server?.close();
  try {
    fs.unlinkSync(testDb);
  } catch (_error) {
    // already gone
  }
});

test('smoke: cashier to admin full workflow works from register open to approval review', async () => {
  const createProduct = await req('POST', '/products', {
    name: 'Smoke Vitamin',
    brand: 'Smoke Labs',
    sku: 'SMOKE-001',
    barcode: 'SMOKE-001',
    productType: 'General Merchandise',
    category: 'General',
    price: 150,
    costPrice: 80,
    stock: 20,
    seniorDiscountEligible: true,
    pwdDiscountEligible: true,
  }, adminToken);
  assert.equal(createProduct.status, 201);
  const productId = createProduct.data.id;

  const registerOpen = await req('POST', '/cashier-sessions', {
    terminal: 'POS-SMOKE',
    openingFloat: 1000,
  }, cashierToken);
  assert.equal(registerOpen.status, 201);
  const sessionId = registerOpen.data.session.id;

  const sale = await req('POST', '/sales', {
    items: [{ productId, qty: 2, discPct: 0, unitPrice: 150 }],
    customer: 'Guest Shopper',
    customerType: 'walkin',
    paymentType: 'cash',
    cashReceived: 400,
    cashierSessionId: sessionId,
  }, cashierToken);
  assert.equal(sale.status, 201);
  assert.ok(sale.data.id);

  const held = await req('POST', '/pending-sales', {
    cashierSessionId: sessionId,
    customerName: 'Held Customer',
    customerType: 'walkin',
    payload: {
      cart: [{ id: productId, name: 'Smoke Vitamin', qty: 1, price: 150 }],
      total: 150,
      discountPct: 0,
    },
  }, cashierToken);
  assert.equal(held.status, 201);
  const heldId = held.data.pendingSale.id;

  const recalled = await req('PATCH', `/pending-sales/${heldId}/recall`, null, cashierToken);
  assert.equal(recalled.status, 200);
  assert.equal(recalled.data.pendingSale.status, 'in_progress');

  const approval = await req('POST', '/approvals', {
    type: 'override',
    title: 'Smoke approval request',
    reason: 'Manager review check',
    details: { saleId: sale.data.id, requestedDiscount: 10 },
  }, cashierToken);
  assert.equal(approval.status, 201);

  const listApprovals = await req('GET', '/approvals', null, adminToken);
  assert.equal(listApprovals.status, 200);
  assert.ok(listApprovals.data.requests.some((request) => request.id === approval.data.request.id));

  const review = await req('PATCH', `/approvals/${approval.data.request.id}`, {
    status: 'approved',
    reviewNote: 'Approved in smoke test',
  }, adminToken);
  assert.equal(review.status, 200);
  assert.equal(review.data.request.status, 'approved');
  assert.equal(review.data.request.reviewNote, 'Approved in smoke test');

  const backup = await req('POST', '/backups', null, adminToken);
  assert.equal(backup.status, 201);
  assert.ok(backup.data.backup.filename);

  const close = await req('POST', `/cashier-sessions/${sessionId}/close`, {
    actualCash: 1000,
  }, cashierToken);
  assert.equal(close.status, 200);
  assert.equal(close.data.session.status, 'Closed');
});
