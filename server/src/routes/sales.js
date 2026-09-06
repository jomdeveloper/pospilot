const express = require('express');
const db = require('../db');
const { authenticate } = require('./auth');
const { auditLog } = require('../audit');
const { roundMoney } = require('../security');
const { getSettings } = require('./settings');

const router = express.Router();

const SENIOR_PWD_DISCOUNT_RATE = 0.2; // 20% per R.A. 9994 / Magna Carta for PWDs
const VAT_RATE = 0.12; // 12% output VAT (R.A. 8424 as amended) — shelf prices are VAT-inclusive

/** Split a VAT-inclusive amount into its VAT and VAT-exclusive parts. */
function splitVat(inclusive) {
  const vat = roundMoney((inclusive * VAT_RATE) / (1 + VAT_RATE));
  return { vat, vatable: roundMoney(inclusive - vat) };
}

/**
 * Server-authoritative checkout:
 *  - validates every line against the products table,
 *  - recomputes subtotal / discounts / grand total from the database prices
 *    (accepting an optional per-line price override for the POS override key),
 *  - applies the 20% senior/PWD discount only to lines whose product is flagged
 *    as eligible, and only after the line discount,
 *  - decrements stock and consumes inventory batches FIFO by expiry, all inside
 *    a single transaction so the sale can never be partially recorded.
 */
router.post('/', authenticate, (req, res) => {
  const body = req.body || {};
  const rawItems = Array.isArray(body.items) ? body.items : [];

  if (rawItems.length === 0) return res.status(400).json({ error: 'Cart cannot be empty' });
  if (rawItems.length > 200) return res.status(400).json({ error: 'Cart has too many line items' });

  const customerType = String(body.customerType || 'Walk-in').trim().toLowerCase();
  const isSeniorOrPwd = customerType === 'senior' || customerType === 'pwd';

  // Cashier price overrides are capped: a line may only be sold within N percent
  // above its catalog price (configured in Settings). 0 fully disables overrides.
  let priceOverrideMaxPct = Number(getSettings().priceOverrideMaxPct);
  if (!Number.isFinite(priceOverrideMaxPct) || priceOverrideMaxPct < 0) priceOverrideMaxPct = 50;

  // Normalize + validate each line.
  const lines = [];
  const productIds = new Set();
  for (const raw of rawItems) {
    const productId = Number(raw.productId ?? raw.product_id ?? raw.id);
    const qty = Number(raw.qty ?? raw.quantity);
    const discPct = Number(raw.discPct ?? raw.discountPct ?? raw.percentDiscount ?? 0);

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 100000) {
      return res.status(400).json({ error: 'Each item needs a valid product id and quantity' });
    }
    if (productIds.has(productId)) {
      return res.status(400).json({ error: 'Each product may appear only once in the cart' });
    }
    productIds.add(productId);
    if (!Number.isFinite(discPct) || discPct < 0 || discPct > 90) {
      return res.status(400).json({ error: 'Each item discount must be between 0 and 90 percent' });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) return res.status(400).json({ error: `Product ${productId} not found` });

    const wantsPriceOverride = raw.unitPrice !== undefined && raw.unitPrice !== null && raw.unitPrice !== '';
    const unitPrice = wantsPriceOverride ? Number(raw.unitPrice) : Number(product.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return res.status(400).json({ error: 'Each item must have a valid price' });
    }
    if (wantsPriceOverride && priceOverrideMaxPct > 0) {
      const originalPrice = Number(product.price);
      const pctAbove = originalPrice > 0 ? ((unitPrice - originalPrice) / originalPrice) * 100 : 0;
      if (pctAbove > priceOverrideMaxPct) {
        return res.status(403).json({
          error: `Unit price exceeds the allowed override of ${priceOverrideMaxPct}% above the catalog price for ${product.name}`,
        });
      }
    }

    const lineSubtotal = roundMoney(qty * unitPrice);
    const lineDiscount = roundMoney(lineSubtotal * (discPct / 100));
    const discountedInclusive = roundMoney(lineSubtotal - lineDiscount);
    const { vat: lineVat, vatable: lineVatable } = splitVat(discountedInclusive);
    const eligible =
      isSeniorOrPwd &&
      (customerType === 'senior' ? Boolean(product.senior_discount_eligible) : Boolean(product.pwd_discount_eligible));
    // The statutory 20% is computed on the VAT-EXCLUSIVE amount, exactly like
    // the printed receipt ("TOTAL − VAT = VATABLE, 20% of VATABLE"). This keeps
    // the recorded grand_total and the printed AMOUNT DUE identical.
    const customerDiscount = eligible ? roundMoney(lineVatable * SENIOR_PWD_DISCOUNT_RATE) : 0;
    const lineTotal = roundMoney(discountedInclusive - customerDiscount);

    // Stock is NOT a hard gate on the POS. The cashier scans/visually verifies
    // the physical product, so a sale is allowed to go ahead even when the
    // ledger shows low or zero stock — products.stock (and the per-location
    // ledger) may go negative. Staff reconcile via the Inventory >> Stock
    // Adjustment screen when the physical counts are corrected. Serial numbers
    // are a secondary, possibly-incomplete ledger and never block a sale.

    lines.push({ stream: { product, qty, unitPrice, originalUnitPrice: Number(product.price), lineSubtotal, lineDiscount, lineVat, discPct, customerDiscount, lineTotal } });
  }

  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.stream.lineSubtotal, 0));
  const itemDiscountTotal = roundMoney(lines.reduce((sum, line) => sum + line.stream.lineDiscount, 0));
  const seniorPwdDiscountTotal = roundMoney(lines.reduce((sum, line) => sum + line.stream.customerDiscount, 0));
  const discountTotal = roundMoney(itemDiscountTotal + seniorPwdDiscountTotal);
  // Record VAT instead of zeroing it so the database matches the receipt's
  // "Less: VAT" / "VATABLE SALES" breakdown. Vatable = subtotal − item
  // discounts − VAT (the discounted selling amount net of VAT).
  const vat = roundMoney(lines.reduce((sum, line) => sum + line.stream.lineVat, 0));
  const vatable = roundMoney(subtotal - itemDiscountTotal - vat);
  const grandTotal = roundMoney(Math.max(subtotal - discountTotal, 0));

  const paymentType = String(body.paymentType || body.method || 'cash').trim() || 'cash';
  const paymentTypes = ['cash', 'card', 'gcash', 'maya', 'bank', 'credit', 'other'];
  if (!paymentTypes.includes(paymentType.toLowerCase())) {
    return res.status(400).json({ error: 'Unsupported payment type' });
  }

  // Cashier-session link: every sale posted from a register must stay attached
  // to the drawer that received its cash. A sale may never be posted against a
  // session that is already closed.
  const rawSessionId = body.cashierSessionId !== undefined && body.cashierSessionId !== null && body.cashierSessionId !== ''
    ? Number(body.cashierSessionId)
    : null;
  if (rawSessionId !== null && (!Number.isInteger(rawSessionId) || rawSessionId <= 0)) {
    return res.status(400).json({ error: 'Invalid cashier session' });
  }
  let cashierSessionId = rawSessionId;
  if (cashierSessionId !== null) {
    const sessionRow = db.prepare('SELECT id, status, session_ref FROM cashier_sessions WHERE id = ?').get(cashierSessionId);
    if (!sessionRow) return res.status(400).json({ error: 'Cashier session not found' });
    if (sessionRow.status !== 'Open') {
      return res.status(400).json({ error: 'Cashier session is already closed — cannot post sales to it' });
    }
  }

  // Cash portion that physically lands in the drawer. Non-cash tenders do NOT
  // affect the drawer, so they contribute ₱0. Split tenders only count the
  // cash leg. `cashAmount` is the net cash deposited after change.
  const isCashPayment = paymentType.toLowerCase() === 'cash';
  const requestedCash = Number(body.cashReceived);
  let cashReceived;
  let changeDue;
  let cashAmount = 0;
  let splitJson = null;

  const splitPayments = Array.isArray(body.payments) && body.payments.length > 0
    ? body.payments
    : Array.isArray(body.splitPayments) && body.splitPayments.length > 0
      ? body.splitPayments
      : null;

  if (splitPayments && splitPayments.length > 0) {
    // Mixed / split tender: every leg must be a supported method; the cash
    // drawer only sees the sum of cash-method legs (minus any change paid out).
    const legs = [];
    let tenderedTotal = 0;
    let cashPortion = 0;
    for (const leg of splitPayments) {
      const method = String(leg.method || leg.paymentType || '').trim().toLowerCase();
      const legAmount = roundMoney(Number(leg.amount));
      if (!paymentTypes.includes(method)) return res.status(400).json({ error: 'Unsupported split payment method' });
      if (!Number.isFinite(legAmount) || legAmount < 0) return res.status(400).json({ error: 'Split payment amounts cannot be negative' });
      tenderedTotal = roundMoney(tenderedTotal + legAmount);
      if (method === 'cash') cashPortion = roundMoney(cashPortion + legAmount);
      legs.push({ method, amount: legAmount });
    }
    if (Math.abs(tenderedTotal - grandTotal) > 0.009) {
      return res.status(400).json({ error: 'Split payment total does not match the amount due' });
    }
    cashReceived = tenderedTotal;
    // Change is paid out of the drawer regardless of which leg overpaid, but
    // only the cash leg can be over-tendered; leftover cash goes back as change.
    changeDue = roundMoney(Math.max(cashPortion - grandTotal, 0));
    cashAmount = roundMoney(Math.min(cashPortion, grandTotal));
    splitJson = JSON.stringify(legs);
  } else if (isCashPayment) {
    cashReceived = Number.isNaN(requestedCash) ? grandTotal : roundMoney(requestedCash);
    if (requestedCash < 0) return res.status(400).json({ error: 'Cash received cannot be negative' });
    if (cashReceived < grandTotal) return res.status(400).json({ error: 'Cash received is less than the sale total' });
    changeDue = roundMoney(Math.max(cashReceived - grandTotal, 0));
    cashAmount = roundMoney(cashReceived - changeDue); // net cash deposited = grand total
  } else {
    cashReceived = grandTotal;
    changeDue = 0;
    cashAmount = 0;
  }

  const customerName = String(body.customer || 'Walk-in Customer').trim() || 'Walk-in Customer';
  const memberId = String(body.memberId || '').trim() || null;
  const transactionId = String(body.transactionId || '').trim() || `TX-SALE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Idempotent replay: if the same invoice number / transaction ref was already
  // recorded (e.g. the server committed but the response was lost and the cashier
  // retried), return the existing sale WITHOUT decrementing stock again. The
  // money math and stock are ONLY applied on the first (successful) commit.
  const existingByRef = db.prepare('SELECT id FROM sales WHERE transaction_ref = ?').get(transactionId);
  if (existingByRef) {
    return res.status(200).json({ ok: true, id: existingByRef.id, duplicate: true });
  }

  const recordSale = db.transaction(() => {
    // Re-verify the session is still open inside the transaction so a sale can
    // never race a session close.
    if (cashierSessionId !== null) {
      const liveSession = db.prepare("SELECT status FROM cashier_sessions WHERE id = ? AND status = 'Open'").get(cashierSessionId);
      if (!liveSession) throw new Error('Cashier session is already closed — cannot post sales to it');
    }
    const result = db
      .prepare(
          `INSERT INTO sales (transaction_ref, customer, member_id, subtotal, discount_total, vat, grand_total, cash_received, change_due, payment_type, cashier_session_id, cash_amount, split_payments_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .run(transactionId, customerName, memberId, subtotal, discountTotal, vat, grandTotal, cashReceived, changeDue, paymentType.toLowerCase(), cashierSessionId, cashAmount, splitJson);
    const saleId = result.lastInsertRowid;
    if (cashierSessionId !== null) {
      require('../cashDrawer').refreshSessionTotals(cashierSessionId);
    }

    const insertItem = db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, name, qty, price, disc_pct, discount, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const decrementStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    const getBatches = db.prepare(
      `SELECT id, quantity FROM inventory_batches
       WHERE product_id = ? AND quantity > 0
       ORDER BY (expiry_date IS NULL OR expiry_date = '') ASC, expiry_date ASC, id ASC`
    );
    const consumeBatch = db.prepare('UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?');
    const consumeSerials = db.prepare("UPDATE inventory_serial_numbers SET status = 'Sold' WHERE id IN (SELECT id FROM inventory_serial_numbers WHERE product_id = ? AND status = 'In Stock' ORDER BY id LIMIT ?)");
    const mainLocationId = db.prepare("SELECT id FROM inventory_locations WHERE name = 'Main Store'").get()?.id;
    const ensureMainStock = db.prepare('INSERT OR IGNORE INTO inventory_location_stock (location_id, product_id, quantity) SELECT ?, id, stock FROM products WHERE id = ?');
    const decrementMainStock = db.prepare('UPDATE inventory_location_stock SET quantity = quantity - ? WHERE location_id = ? AND product_id = ?');
    const insertMovement = db.prepare(`INSERT INTO inventory_movements (movement_type, product_id, quantity, from_location_id, reason, reference, actor_user_id, actor_username) VALUES ('Sale', ?, ?, ?, 'Point of Sale transaction', ?, ?, ?)`);

    lines.forEach(({ stream: line }) => {
      const { product, qty, unitPrice, lineDiscount, discPct, customerDiscount, lineTotal } = line;
      insertItem.run(saleId, product.id, product.name, qty, unitPrice, discPct, lineDiscount + customerDiscount, lineTotal);

      if (product.track_inventory) {
        ensureMainStock.run(mainLocationId, product.id);
        const stockUpdate = decrementStock.run(qty, product.id);
        if (stockUpdate.changes !== 1) {
          throw new Error(`Product ${product.id} could not be updated`);
        }
        const locationStockUpdate = decrementMainStock.run(qty, mainLocationId, product.id);
        if (locationStockUpdate.changes !== 1) throw new Error(`Product ${product.id} location stock could not be updated`);
        insertMovement.run(product.id, qty, mainLocationId, saleId, req.session.userId, req.session.username);
        if (product.track_expiry) {
          // `products.stock` (validated above) is the authoritative availability.
          // Batches are a secondary ledger that may be incomplete (e.g. stock
          // entered without per-batch records). Consume from whatever batches
          // exist so the ledger stays roughly in sync, but never block a sale
          // that has stock just because batch records fall short.
          let remaining = qty;
          for (const batch of getBatches.all(product.id)) {
            if (remaining <= 0) break;
            const consumed = Math.min(remaining, batch.quantity);
            if (consumed <= 0) continue;
            consumeBatch.run(consumed, batch.id);
            remaining -= consumed;
          }
        }
        if (product.track_serial) consumeSerials.run(product.id, qty);
      }
    });

    auditLog(req, 'Created sale', 'Sale', saleId, {
      customer: customerName,
      customerType,
      paymentType: paymentType.toLowerCase(),
      cashierSessionId,
      cashAmount,
      splitPayments: splitJson ? JSON.parse(splitJson) : null,
      subtotal,
      discountTotal,
      grandTotal,
      itemCount: lines.length,
      priceOverrides: lines
        .filter(({ stream: line }) => line.unitPrice !== line.originalUnitPrice)
        .map(({ stream: line }) => ({ productId: line.product.id, originalPrice: line.originalUnitPrice, overridePrice: line.unitPrice })),
    });

    return {
      id: saleId,
      transactionId,
      customer: customerName,
      memberId,
      subtotal,
      itemDiscountTotal,
      seniorPwdDiscountTotal,
      discountTotal,
      vat,
      vatable,
      grandTotal,
      cashReceived,
      changeDue,
      cashAmount,
      cashierSessionId,
      paymentType: paymentType.toLowerCase(),
    };
  });

  try {
    const sale = recordSale();
    res.status(201).json({ ok: true, ...sale, items: lines.map((line) => line.stream) });
  } catch (error) {
    if (error.message && (error.message.startsWith('Insufficient stock') || error.message.startsWith('Insufficient batch stock'))) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Unable to create sale' });
  }
});

// GET /api/sales — recent sales, newest first
router.get('/', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, COALESCE(SUM(si.qty), 0) AS item_count,
      COALESCE(SUM(si.qty - COALESCE(si.returned_qty, 0)), 0) AS returnable_count
    FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
    GROUP BY s.id ORDER BY s.id DESC LIMIT 100
  `).all();
  res.json(rows);
});

// GET /api/sales/counter — the next sequential transaction number (SI-######)
// derived from the most recent SI-prefixed sale in the database. Kept above
// /:id so the literal path is matched before the parameter route.
// Only SI-###### refs from the POS are counted; admin/back-office sales use
// TX-SALE-<timestamp> and must NOT shift the POS counter.
router.get('/counter', authenticate, (req, res) => {
  const row = db
    .prepare(
      `SELECT transaction_ref FROM sales
       WHERE transaction_ref IS NOT NULL AND transaction_ref != ''
       AND (transaction_ref LIKE 'SI-%' OR transaction_ref LIKE 'TX-SI-%')
       ORDER BY id DESC LIMIT 1`
    )
    .get();
  let last = 0;
  if (row && row.transaction_ref) {
    const match = String(row.transaction_ref).match(/^(?:TX-)?SI-(\d+)\s*$/i);
    if (match) last = Number(match[1]) || 0;
  }
  res.json({ next: last + 1, last });
});

// GET /api/sales/:id — a sale with its line items
router.get('/:id', authenticate, (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  const items = db.prepare('SELECT *, qty - COALESCE(returned_qty, 0) AS returnable_qty FROM sale_items WHERE sale_id = ?').all(req.params.id);
  res.json({ ...sale, items });
});

router.post('/:id/return', authenticate, (req, res) => {
  const saleId = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim();
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!Number.isInteger(saleId) || !reason || rawItems.length === 0) return res.status(400).json({ error: 'Sale, return reason, and at least one item are required' });
  const sale = db.prepare('SELECT id FROM sales WHERE id = ?').get(saleId);
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  const items = rawItems.map((item) => ({ itemId: Number(item.itemId), quantity: Number(item.quantity) }));
  if (items.some((item) => !Number.isInteger(item.itemId) || !Number.isInteger(item.quantity) || item.quantity < 1)) return res.status(400).json({ error: 'Each return item needs a valid quantity' });
  const itemIds = new Set();
  for (const item of items) {
    if (itemIds.has(item.itemId)) return res.status(400).json({ error: 'Each sale item may appear only once' });
    itemIds.add(item.itemId);
  }

  try {
    const result = db.transaction(() => {
      const mainLocationId = db.prepare("SELECT id FROM inventory_locations WHERE name = 'Main Store'").get()?.id;
      const getItem = db.prepare('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?');
      const updateItem = db.prepare('UPDATE sale_items SET returned_qty = COALESCE(returned_qty, 0) + ? WHERE id = ? AND returned_qty + ? <= qty');
      const updateProduct = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      const ensureLocation = db.prepare('INSERT OR IGNORE INTO inventory_location_stock (location_id, product_id, quantity) SELECT ?, id, stock FROM products WHERE id = ?');
      const updateLocation = db.prepare('UPDATE inventory_location_stock SET quantity = quantity + ? WHERE location_id = ? AND product_id = ?');
      const insertMovement = db.prepare(`INSERT INTO inventory_movements (movement_type, product_id, quantity, to_location_id, reason, reference, actor_user_id, actor_username) VALUES ('Return', ?, ?, ?, ?, ?, ?, ?)`);
      const insertReturn = db.prepare('INSERT INTO sale_returns (sale_id, product_id, quantity, refund_amount, reason, actor_user_id, actor_username) VALUES (?, ?, ?, ?, ?, ?, ?)');
      let refundTotal = 0;
      items.forEach(({ itemId, quantity }) => {
        const item = getItem.get(itemId, saleId);
        if (!item) throw new Error('Sale item not found');
        const returnable = item.qty - Number(item.returned_qty || 0);
        if (quantity > returnable) throw new Error(`Only ${returnable} unit(s) of ${item.name} can still be returned`);
        const update = updateItem.run(quantity, itemId, quantity);
        if (update.changes !== 1) throw new Error('Sale item could not be updated');
        const refundAmount = roundMoney((Number(item.total) / item.qty) * quantity);
        refundTotal = roundMoney(refundTotal + refundAmount);
        const product = item.product_id ? db.prepare('SELECT track_inventory FROM products WHERE id = ?').get(item.product_id) : null;
        if (product?.track_inventory) {
          ensureLocation.run(mainLocationId, item.product_id);
          updateProduct.run(quantity, item.product_id);
          updateLocation.run(quantity, mainLocationId, item.product_id);
          insertMovement.run(item.product_id, quantity, mainLocationId, reason, `Sale #${saleId}`, req.session.userId, req.session.username);
        }
        insertReturn.run(saleId, item.product_id, quantity, refundAmount, reason, req.session.userId, req.session.username);
      });
      auditLog(req, 'Returned sale items', 'Sale', saleId, { reason, refundTotal, itemCount: items.length });
      // If the refunded sale took physical cash from a cashier drawer,
      // refresh that session's totals so cash_refunds / expected cash move.
      const sessionLink = db.prepare('SELECT cashier_session_id FROM sales WHERE id = ?').get(saleId);
      if (sessionLink && sessionLink.cashier_session_id) {
        require('../cashDrawer').refreshSessionTotals(sessionLink.cashier_session_id);
      }
      return { refundTotal };
    })();
    return res.status(201).json({ ok: true, saleId, ...result });
  } catch (error) {
    return res.status(error.message.startsWith('Only') ? 409 : 400).json({ error: error.message || 'Unable to process return' });
  }
});

module.exports = router;
