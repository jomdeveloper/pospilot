const path = require('path');
const fs = require('fs');
const os = require('os');
const dbPath = path.join(os.tmpdir(), `pospilot-smoke-${process.pid}-${Date.now()}.db`);
process.env.POSPILOT_DB_PATH = dbPath;
const { start } = require('../src/index');

(async () => {
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function req(method, route, body, token) {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    console.log(method, route, res.status, JSON.stringify(data ?? text));
    return { status: res.status, data };
  }

  try {
    const adminLogin = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    const adminToken = adminLogin.data.token;
    await req('POST', '/auth/change-password', { currentPassword: 'admin123', newPassword: 'North#R1dge' }, adminToken);

    const product = await req('POST', '/products', {
      name: 'Smoke Vitamin',
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

    const productId = product.data?.product?.id ?? product.data?.id;
    console.log('productId', productId);

    const cashierLogin = await req('POST', '/auth/login', { username: 'cashier', password: 'cashier123' });
    const cashierToken = cashierLogin.data.token;
    await req('POST', '/auth/change-password', { currentPassword: 'cashier123', newPassword: 'South#R1dge' }, cashierToken);

    const session = await req('POST', '/cashier-sessions', { terminal: 'POS-SMOKE', openingFloat: 1000 }, cashierToken);
    const sessionId = session.data?.session?.id;

    const sale = await req('POST', '/sales', {
      items: [{ productId, qty: 2, discPct: 0, unitPrice: 150 }],
      customer: 'Guest Shopper',
      customerType: 'walkin',
      paymentType: 'cash',
      cashReceived: 400,
      cashierSessionId: sessionId,
    }, cashierToken);
  } finally {
    server.close();
    try { fs.unlinkSync(dbPath); } catch (_) {}
  }
})();
