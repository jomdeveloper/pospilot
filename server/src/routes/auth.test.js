const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Isolated temp DB so tests never touch real data.
const testDb = path.join(os.tmpdir(), `pospilot-auth-${process.pid}-${Date.now()}.db`);
process.env.POSPILOT_DB_PATH = testDb;

const { start } = require('../index');

let server;
let baseUrl;
let adminToken;

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

test.before(async () => {
  server = await start(0);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  assert.equal(login.status, 200);
  adminToken = login.data.token;

  // Seeded defaults must be changed before adminToken can access gated routes.
  const changed = await req('POST', '/auth/change-password', { currentPassword: 'admin123', newPassword: 'North#R1dge' }, adminToken);
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

test('seed accounts must change their default password before using the app', async () => {
  // The login response advertises the requirement…
  const login = await req('POST', '/auth/login', { username: 'cashier', password: 'cashier123' });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.mustChangePassword, true);

  // …and gated endpoints refuse until the password is changed.
  const gated = await req('GET', '/sales', null, login.data.token);
  assert.equal(gated.status, 403);
  assert.equal(gated.data.code, 'PASSWORD_CHANGE_REQUIRED');

  // The change-password endpoint itself is still allowed.
  const changed = await req('POST', '/auth/change-password', {
    currentPassword: 'cashier123',
    newPassword: 'South#R1dge',
  }, login.data.token);
  assert.equal(changed.status, 200);

  // After change, the gate is lifted for the same session.
  const allowed = await req('GET', '/sales', null, login.data.token);
  assert.equal(allowed.status, 200);
});

test('change-password validates its input', async () => {
  // Short new password is rejected.
  const short = await req('POST', '/auth/change-password', { currentPassword: 'North#R1dge', newPassword: 'abc123' }, adminToken);
  assert.equal(short.status, 400);

  // Wrong current password is rejected.
  const wrong = await req('POST', '/auth/change-password', { currentPassword: 'nope', newPassword: 'BrandNew#123' }, adminToken);
  assert.equal(wrong.status, 403);

  // Same-as-current is rejected.
  const same = await req('POST', '/auth/change-password', { currentPassword: 'North#R1dge', newPassword: 'North#R1dge' }, adminToken);
  assert.equal(same.status, 400);
});

test('catalog metadata and categories are protected by authentication', async () => {
  const anonMeta = await req('GET', '/products/metadata');
  assert.equal(anonMeta.status, 401);
  const anonCategories = await req('GET', '/categories');
  assert.equal(anonCategories.status, 401);

  const meta = await req('GET', '/products/metadata', null, adminToken);
  assert.equal(meta.status, 200);
  assert.ok(Array.isArray(meta.data.productTypes));

  const categories = await req('GET', '/categories', null, adminToken);
  assert.equal(categories.status, 200);
});

test('approval requests can be raised and reviewed through the manager queue', async () => {
  const created = await req('POST', '/approvals', {
    type: 'override',
    title: 'Manual price override',
    reason: 'Customer service request for urgent sale',
    details: { saleId: 42, requestedDiscount: 15 },
  }, adminToken);
  assert.equal(created.status, 201);
  assert.equal(created.data.request.status, 'pending');

  const list = await req('GET', '/approvals', null, adminToken);
  assert.equal(list.status, 200);
  assert.ok(list.data.requests.some((request) => request.id === created.data.request.id));

  const reviewed = await req('PATCH', `/approvals/${created.data.request.id}`, {
    status: 'approved',
    reviewNote: 'Approved under manager authority',
  }, adminToken);
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.data.request.status, 'approved');
  assert.equal(reviewed.data.request.reviewedByUsername, 'admin');
  assert.equal(reviewed.data.request.reviewNote, 'Approved under manager authority');
});

test('pending sales can be created and recalled across a cashier session', async () => {
  const openSession = await req('POST', '/cashier-sessions', {
    terminal: 'POS-RESTORE',
    openingFloat: 1000,
  }, adminToken);
  assert.equal(openSession.status, 201);

  const created = await req('POST', '/pending-sales', {
    cashierSessionId: openSession.data.session.id,
    customerName: 'Maria Santos',
    customerType: 'senior',
    memberId: 'MS-001',
    payload: {
      cart: [{ id: 1, sku: 'A100', qty: 2, price: 150 }],
      discountPct: 10,
      customerType: 'senior',
    },
  }, adminToken);
  assert.equal(created.status, 201);
  assert.equal(created.data.pendingSale.customerName, 'Maria Santos');

  const list = await req('GET', '/pending-sales', null, adminToken);
  assert.equal(list.status, 200);
  assert.ok(list.data.pendingSales.some((sale) => sale.id === created.data.pendingSale.id));

  const recalled = await req('PATCH', `/pending-sales/${created.data.pendingSale.id}/recall`, null, adminToken);
  assert.equal(recalled.status, 200);
  assert.equal(recalled.data.pendingSale.status, 'in_progress');

  const completed = await req('PATCH', `/pending-sales/${created.data.pendingSale.id}/complete`, null, adminToken);
  assert.equal(completed.status, 200);
  assert.equal(completed.data.pendingSale.status, 'completed');

  const afterRecall = await req('GET', '/pending-sales', null, adminToken);
  assert.equal(afterRecall.status, 200);
  assert.equal(afterRecall.data.pendingSales.some((sale) => sale.id === created.data.pendingSale.id), false);

  const second = await req('POST', '/pending-sales', {
    cashierSessionId: openSession.data.session.id,
    customerName: 'Cancelled Hold',
    payload: { cart: [{ id: 1, qty: 1, price: 10 }] },
  }, adminToken);
  assert.equal(second.status, 201);
  const secondRecall = await req('PATCH', `/pending-sales/${second.data.pendingSale.id}/recall`, null, adminToken);
  assert.equal(secondRecall.status, 200);
  const cancelled = await req('PATCH', `/pending-sales/${second.data.pendingSale.id}/cancel`, null, adminToken);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.pendingSale.status, 'cancelled');
});

test('security headers are present on API responses', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(/default-src 'self'/.test(res.headers.get('content-security-policy') || ''));
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});