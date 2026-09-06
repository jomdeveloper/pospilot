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

test('security headers are present on API responses', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(/default-src 'self'/.test(res.headers.get('content-security-policy') || ''));
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});