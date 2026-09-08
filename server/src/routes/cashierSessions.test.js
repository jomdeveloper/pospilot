const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Isolated temp DB so tests never touch real data.
const testDb = path.join(os.tmpdir(), `pospilot-cash-${process.pid}-${Date.now()}.db`);
process.env.POSPILOT_DB_PATH = testDb;

const { start } = require('../index');

let server;
let baseUrl;
let adminToken;
let cashierToken;
let db;

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
    // non-JSON body
  }
  return { status: res.status, data };
}

async function openSession(token, openingFloat = 1000, extra = {}) {
  return req('POST', '/cashier-sessions', { openingFloat, terminal: 'POS-02', ...extra }, token);
}

async function closeSession(token, id, actualCash = 1000) {
  return req('POST', `/cashier-sessions/${id}/close`, { actualCash }, token);
}

async function createProduct(token, name, price = 100, stock = 50) {
  const sampleType = db.prepare('SELECT name, category_name FROM product_types WHERE active = 1 LIMIT 1').get();
  const res = await req('POST', '/products', {
    name,
    brand: 'Test',
    category: sampleType.category_name,
    productType: sampleType.name,
    price,
    stock,
  }, token);
  assert.equal(res.status, 201);
  return res.data.id;
}

test.before(async () => {
  server = await start(0);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  db = require('../db');
  if (!db.prepare('SELECT 1 FROM categories LIMIT 1').get()) {
    db.prepare("INSERT INTO categories (name, status) VALUES ('Test Category', 'Active')").run();
  }
  if (!db.prepare('SELECT 1 FROM product_types LIMIT 1').get()) {
    db.prepare("INSERT INTO product_types (name, category_name) VALUES ('Test Type', 'Test Category')").run();
  }

  const adminLogin = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  adminToken = adminLogin.data.token;
  const cashierLogin = await req('POST', '/auth/login', { username: 'cashier', password: 'cashier123' });
  cashierToken = cashierLogin.data.token;

  // Seeded accounts must change their default passwords on first login.
  await req('POST', '/auth/change-password', { currentPassword: 'admin123', newPassword: 'North#R1dge' }, adminToken);
  await req('POST', '/auth/change-password', { currentPassword: 'cashier123', newPassword: 'South#R1dge' }, cashierToken);
});

test.after(() => {
  server?.close();
  try {
    fs.unlinkSync(testDb);
  } catch (_error) {
    // already gone
  }
});

test('opening a session requires authentication', async () => {
  const denied = await req('POST', '/cashier-sessions', { openingFloat: 1000 });
  assert.equal(denied.status, 401);
});

test('cashier opens a register with an opening float and a duplicate open is rejected', async () => {
  const opened = await openSession(cashierToken, 1000);
  assert.equal(opened.status, 201);
  assert.equal(opened.data.session.openingFloat, 1000);
  assert.equal(opened.data.session.status, 'Open');
  assert.match(opened.data.session.sessionRef, /^CS-\d{8}-\d{6}-[A-Z0-9]{4}$/);
  assert.equal(opened.data.session.summary.expectedCash, 1000);

  const dup = await openSession(cashierToken, 500);
  assert.equal(dup.status, 409);

  // Opening with a different terminal is allowed (multiple registers).
  const other = await req('POST', '/cashier-sessions', { openingFloat: 500, terminal: 'POS-01' }, cashierToken);
  assert.equal(other.status, 201);

  // Negative opening float is rejected.
  const bad = await req('POST', '/cashier-sessions', { openingFloat: -5, terminal: 'POS-03' }, cashierToken);
  assert.equal(bad.status, 400);

  // Housekeeping: close the POS-02 session so later tests can reuse the default
  // terminal (one open session per terminal).
  const closed = await closeSession(cashierToken, opened.data.session.id, 1000);
  assert.equal(closed.status, 200);
});

test('opening float can be entered by denomination count (must match total)', async () => {
  const counts = { 1000: 0, 500: 2, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0, 0.25: 0, 0.1: 0, 0.05: 0, 0.01: 0 };
  const matching = await req('POST', '/cashier-sessions', { openingFloat: 1000, terminal: 'POS-10', denominationCounts: counts }, cashierToken);
  assert.equal(matching.status, 201);

  const mismatch = await req('POST', '/cashier-sessions', {
    openingFloat: 1000,
    terminal: 'POS-11',
    denominationCounts: { 500: 1, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0, 0.25: 0, 0.1: 0, 0.05: 0, 0.01: 0 },
  }, cashierToken);
  assert.equal(mismatch.status, 400);
});

test('cashier handover keeps the register session and records each active cashier', async () => {
  const opened = await openSession(cashierToken, 1000, { terminal: 'POS-HANDOVER' });
  assert.equal(opened.status, 201);
  const id = opened.data.session.id;

  const cashierCurrent = await req('GET', '/cashier-sessions/current?terminal=POS-HANDOVER', null, cashierToken);
  assert.equal(cashierCurrent.status, 200);
  assert.equal(cashierCurrent.data.session.id, id);

  const managerCurrent = await req('GET', '/cashier-sessions/current?terminal=POS-HANDOVER', null, adminToken);
  assert.equal(managerCurrent.status, 200);
  assert.equal(managerCurrent.data.session.id, id);

  const paidIn = await req('POST', `/cashier-sessions/${id}/cash-in`, { amount: 50, reason: 'Handover change', }, adminToken);
  assert.equal(paidIn.status, 200);

  const detail = await req('GET', `/cashier-sessions/${id}`, null, adminToken);
  assert.deepEqual(detail.data.activities.map((activity) => activity.username), ['cashier', 'admin']);
  assert.equal(detail.data.movements.at(-1).actorUsername, 'admin');
  assert.equal(detail.data.session.cashierUsername, 'cashier');

  const closed = await closeSession(adminToken, id, 1050);
  assert.equal(closed.status, 200);
  const afterClose = await req('GET', `/cashier-sessions/${id}`, null, adminToken);
  assert.ok(afterClose.data.activities.every((activity) => activity.status === 'Ended'));
});

test('cash in / cash out post to the ledger, update expected cash, and require a reason', async () => {
  const session = await openSession(cashierToken, 1000, { terminal: 'POS-T04' });
  const id = session.data.session.id;

  const noReason = await req('POST', `/cashier-sessions/${id}/cash-in`, { amount: 100 }, cashierToken);
  assert.equal(noReason.status, 400);

  const paidIn = await req('POST', `/cashier-sessions/${id}/cash-in`, { amount: 500, reason: 'Additional change money' }, cashierToken);
  assert.equal(paidIn.status, 200);
  assert.equal(paidIn.data.session.summary.cashPaidIn, 500);
  assert.equal(paidIn.data.session.summary.expectedCash, 1500);

  const neg = await req('POST', `/cashier-sessions/${id}/cash-out`, { amount: -10, reason: 'oops' }, cashierToken);
  assert.equal(neg.status, 400);

  const paidOut = await req('POST', `/cashier-sessions/${id}/cash-out`, { amount: 200, reason: 'Petty cash expense' }, cashierToken);
  assert.equal(paidOut.status, 200);
  assert.equal(paidOut.data.session.summary.cashPaidOut, 200);
  assert.equal(paidOut.data.session.summary.expectedCash, 1300);

  const excessiveCashOut = await req('POST', `/cashier-sessions/${id}/cash-out`, { amount: 1300.01, reason: 'Too much cash out' }, cashierToken);
  assert.equal(excessiveCashOut.status, 400);
  assert.match(excessiveCashOut.data.error, /cannot exceed the expected drawer cash/i);

  const detail = await req('GET', `/cashier-sessions/${id}`, null, cashierToken);
  assert.equal(detail.status, 200);
  const ledger = detail.data.movements.map((m) => m.transactionType);
  assert.deepEqual(ledger, ['opening_float', 'cash_in', 'cash_out']);
});
test('cash drop requires a manager/administrator — cashier is denied', async () => {
  const session = await openSession(cashierToken, 1000, { terminal: 'POS-T05' });
  const id = session.data.session.id;

  const asCashier = await req('POST', `/cashier-sessions/${id}/cash-drop`, { amount: 300, reason: 'Safe drop' }, cashierToken);
  assert.equal(asCashier.status, 403);

  const asAdmin = await req('POST', `/cashier-sessions/${id}/cash-drop`, { amount: 300, reason: 'Safe drop' }, adminToken);
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.data.session.summary.cashDrops, 300);
  assert.equal(asAdmin.data.session.summary.expectedCash, 700);
});

test('authorized adjustment posts a separate immutable ledger row', async () => {
  const session = await openSession(cashierToken, 1000, { terminal: 'POS-T06' });
  const id = session.data.session.id;

  const forbidden = await req('POST', `/cashier-sessions/${id}/adjust`, { amount: 50, direction: 'in', reason: 'correction' }, cashierToken);
  assert.equal(forbidden.status, 403);

  const adjust = await req('POST', `/cashier-sessions/${id}/adjust`, { amount: 50, direction: 'in', reason: 'Float correction' }, adminToken);
  assert.equal(adjust.status, 200);
  assert.equal(adjust.data.session.summary.adjustmentsIn, 50);
  assert.equal(adjust.data.session.summary.expectedCash, 1050);

  const detail = await req('GET', `/cashier-sessions/${id}`, null, cashierToken);
  assert.ok(detail.data.movements.some((m) => m.transactionType === 'adjustment_in'));
});

test('expected cash follows the drawer rule from the spec', async () => {
  const session = await openSession(cashierToken, 1000, { terminal: 'POS-T07' });
  const id = session.data.session.id;
  const productId = await createProduct(adminToken, 'Cash Drawer Med', 100, 100);

  // Cash sale of 85 units × ₱100 = ₱8,500 (tendered ₱10,000 → ₱1,500 change).
  const sale = await req('POST', '/sales', {
    items: [{ productId, qty: 85, unitPrice: 100 }],
    transactionId: 'SI-CASH-0001',
    cashReceived: 10000,
    paymentType: 'cash',
    cashierSessionId: id,
  }, cashierToken);
  assert.equal(sale.status, 201);
  assert.equal(sale.data.cashAmount, 8500);

  const paidOut = await req('POST', `/cashier-sessions/${id}/cash-out`, { amount: 100, reason: 'Petty cash' }, cashierToken);
  assert.equal(paidOut.status, 200);
  assert.equal(paidOut.data.session.summary.cashSales, 8500);
  assert.equal(paidOut.data.session.summary.cashPaidOut, 100);
  assert.equal(paidOut.data.session.summary.expectedCash, 9400); // 1,000 + 8,500 - 100

  const closed = await req('POST', `/cashier-sessions/${id}/close`, { actualCash: 9150 }, cashierToken);
  assert.equal(closed.status, 200);
  assert.equal(closed.data.differenceStatus, 'SHORT');
  assert.equal(closed.data.difference, -250);
  assert.equal(closed.data.session.status, 'Closed');
});

test('cash refunds reduce expected cash only for sales that took cash', async () => {
  const session = await openSession(cashierToken, 1000, { terminal: 'POS-T08' });
  const id = session.data.session.id;
  const productId = await createProduct(adminToken, 'Refundable Med', 100, 100);

  const sale = await req('POST', '/sales', {
    items: [{ productId, qty: 2, unitPrice: 100 }],
    transactionId: 'SI-RETURN-0001',
    cashReceived: 200,
    paymentType: 'cash',
    cashierSessionId: id,
  }, cashierToken);
  assert.equal(sale.status, 201);

  const saleItem = db.prepare('SELECT id FROM sale_items WHERE sale_id = ? LIMIT 1').get(sale.data.id);
  const refund = await req('POST', `/sales/${sale.data.id}/return`, {
    reason: 'Damaged goods',
    items: [{ itemId: saleItem.id, quantity: 1 }],
  }, cashierToken);
  assert.equal(refund.status, 201);
  assert.equal(refund.data.refundTotal, 100);

  const summary = await req('GET', `/cashier-sessions/${id}`, null, cashierToken);
  assert.equal(summary.data.session.summary.cashRefunds, 100);
  assert.equal(summary.data.session.summary.expectedCash, 1100); // 1,000 + 200 - 100 refund
});

test('non-cash and split payments only affect the drawer by their cash portion', async () => {
  const session = await openSession(cashierToken, 1000, { terminal: 'POS-T09' });
  const id = session.data.session.id;
  const productId = await createProduct(adminToken, 'Split Pay Med', 100, 100);

  // E-wallet (gcash) sale → 0 cash into the drawer.
  const gcash = await req('POST', '/sales', {
    items: [{ productId, qty: 1, unitPrice: 100 }],
    transactionId: 'SI-GCASH-0001',
    paymentType: 'gcash',
    cashierSessionId: id,
  }, cashierToken);
  assert.equal(gcash.status, 201);
  assert.equal(gcash.data.cashAmount, 0);

  // Split: 40 cash + 60 gcash → cashAmount = 40.
  const split = await req('POST', '/sales', {
    items: [{ productId, qty: 1, unitPrice: 100 }],
    transactionId: 'SI-SPLIT-0001',
    paymentType: 'cash',
    cashierSessionId: id,
    payments: [
      { method: 'cash', amount: 40 },
      { method: 'gcash', amount: 60 },
    ],
  }, cashierToken);
  assert.equal(split.status, 201);
  assert.equal(split.data.cashAmount, 40);

  // Split total mismatch is rejected.
  const bad = await req('POST', '/sales', {
    items: [{ productId, qty: 1, unitPrice: 100 }],
    transactionId: 'SI-SPLIT-BAD',
    paymentType: 'cash',
    cashierSessionId: id,
    payments: [
      { method: 'cash', amount: 40 },
      { method: 'gcash', amount: 50 },
    ],
  }, cashierToken);
  assert.equal(bad.status, 400);

  const current = await req('GET', '/cashier-sessions/current?terminal=POS-T09', null, cashierToken);
  assert.equal(current.data.session.summary.cashSales, 40); // only the cash leg
  assert.equal(current.data.session.summary.expectedCash, 1040);
});
test('a sale cannot be posted against a closed session', async () => {
  const session = await openSession(cashierToken, 500, { terminal: 'POS-T10' });
  const id = session.data.session.id;
  const productId = await createProduct(adminToken, 'Closed Session Med', 100, 10);

  await req('POST', `/cashier-sessions/${id}/close`, { actualCash: 500 }, cashierToken);

  const sale = await req('POST', '/sales', {
    items: [{ productId, qty: 1, unitPrice: 100 }],
    transactionId: 'SI-CLOSED-0001',
    paymentType: 'cash',
    cashierSessionId: id,
  }, cashierToken);
  assert.equal(sale.status, 400);
});

test('closing is idempotent-guarded and over/short are computed precisely', async () => {
  const session = await openSession(cashierToken, 2000);
  const id = session.data.session.id;

  const exact = await req('POST', `/cashier-sessions/${id}/close`, { actualCash: 2000 }, cashierToken);
  assert.equal(exact.data.differenceStatus, 'EXACT');
  assert.equal(exact.data.difference, 0);

  // Second close of the same session → 400 (already closed).
  const again = await req('POST', `/cashier-sessions/${id}/close`, { actualCash: 2000 }, cashierToken);
  assert.equal(again.status, 400);

  const over = await openSession(cashierToken, 1000);
  const overClose = await req('POST', `/cashier-sessions/${over.data.session.id}/close`, { actualCash: 1250 }, cashierToken);
  assert.equal(overClose.data.differenceStatus, 'OVER');
  assert.equal(overClose.data.difference, 250);

  // Closing by denomination count.
  const countSession = await openSession(cashierToken, 1000);
  const counts = { 500: 2, 100: 2, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0, 0.25: 0, 0.1: 0, 0.05: 0, 0.01: 0 }; // = 1,200
  const counted = await req('POST', `/cashier-sessions/${countSession.data.session.id}/close`, { denominationCounts: counts }, cashierToken);
  assert.equal(counted.status, 200);
  assert.equal(counted.data.actualCash, 1200);
  assert.equal(counted.data.difference, 200);
  assert.equal(counted.data.differenceStatus, 'OVER');
});

test('list and daily summary endpoints expose reconciliation figures', async () => {
  const list = await req('GET', '/cashier-sessions', null, adminToken);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.data));
  assert.ok(list.data.some((s) => s.openingFloat !== undefined));

  const today = new Date().toISOString().slice(0, 10);
  const summary = await req('GET', `/cashier-sessions/summary?date=${today}`, null, adminToken);
  assert.equal(summary.status, 200);
  assert.equal(summary.data.date, today);
  assert.ok(summary.data.totals.sessionCount >= 1);
  assert.ok(summary.data.totals.openingFloat >= 0);

  const badDetail = await req('GET', '/cashier-sessions/999999', null, adminToken);
  assert.equal(badDetail.status, 404);
});