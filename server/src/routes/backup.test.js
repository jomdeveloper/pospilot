const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Isolated temp DB so tests never touch real data.
const testDb = path.join(os.tmpdir(), `pospilot-backup-${process.pid}-${Date.now()}.db`);
process.env.POSPILOT_DB_PATH = testDb;

const { start } = require('../index');
const { backupDir } = require('../backup');

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
  // Seeded defaults must be changed before other calls succeed.
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

test('backups require authentication and administrator access', async () => {
  const anon = await req('GET', '/backups');
  assert.equal(anon.status, 401);

  const cashier = await req('POST', '/auth/login', { username: 'cashier', password: 'cashier123' });
  const denied = await req('GET', '/backups', null, cashier.data.token);
  assert.equal(denied.status, 403);
});

test('an administrator can create, list, and download a backup', async () => {
  const created = await req('POST', '/backups', null, adminToken);
  assert.equal(created.status, 201);
  assert.ok(created.data.backup.filename);
  assert.ok(created.data.backup.size > 0);

  const listed = await req('GET', '/backups', null, adminToken);
  assert.equal(listed.status, 200);
  assert.ok(listed.data.backups.some((b) => b.filename === created.data.backup.filename));

  // The file physically exists inside the backups directory.
  const filePath = path.join(backupDir(), created.data.backup.filename);
  assert.ok(fs.existsSync(filePath));

  // Download returns the snapshot bytes.
  const res = await fetch(`${baseUrl}/api/backups/${encodeURIComponent(created.data.backup.filename)}/download`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.ok(bytes.length > 0);
  assert.ok(bytes.includes(Buffer.from('SQLite format 3')));
});

test('path traversal in backup downloads is rejected', async () => {
  // Unauthenticated traversal attempt is rejected before any file access.
  const anon = await req('GET', '/backups/..%2F..%2Fsecret.db/download');
  assert.equal(anon.status, 401);

  // Authenticated traversal attempt fails to resolve to any file → 404.
  const authed = await fetch(`${baseUrl}/api/backups/..%2F..%2Fsecret.db/download`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(authed.status, 404);
});