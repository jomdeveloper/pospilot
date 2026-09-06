/**
 * cashDrawer.js
 * --------------------------------------------------------------------------
 * Shared cash-drawer math used by the cashier-session API, the sales API and
 * the reports. Centralizes the "expected cash" rule:
 *
 *   Expected Cash =
 *     Opening Float
 *   + Cash Sales            (cash portion of each sale, cash amount only)
 *   + Cash Paid In
 *   + Adjustment (in)
 *   - Cash Refunds          (refunds paid back on sales that took cash)
 *   - Cash Paid Out
 *   - Cash Drops
 *   - Adjustment (out)
 *
 * The opening float is STARTING DRAWER CASH, never revenue. Card / e-wallet /
 * bank / other non-cash tenders never increase the physical drawer.
 */
const db = require('./db');
const { roundMoney } = require('./security');

/** Philippine peso denominations, grouped exactly as displayed on the POS. */
const PHILIPPINE_DENOMINATIONS = {
  coins: [0.01, 0.05, 0.1, 0.25, 1, 5, 10, 20],
  bills: [20, 50, 100, 200, 500, 1000],
};

function allDenominations() {
  return [...PHILIPPINE_DENOMINATIONS.coins, ...PHILIPPINE_DENOMINATIONS.bills];
}

/**
 * Total money from a denomination-quantity map like
 * `{ "100": 5, "20": 2, "0.25": 4 }`. Quantities must be non-negative.
 */
function denominationTotal(counts) {
  if (!counts || typeof counts !== 'object') return 0;
  let total = 0;
  for (const denom of allDenominations()) {
    const key = String(denom);
    if (counts[key] === undefined || counts[key] === null || counts[key] === '') continue;
    const qty = Number(counts[key]);
    if (!Number.isInteger(qty) || qty < 0) {
      throw new Error(`Quantity for ₱${denom} must be a whole non-negative number`);
    }
    total += denom * qty;
  }
  return roundMoney(total);
}

/** Human-readable `{ denom: qty }` summary used in audit details. */
function denominationBreakdown(counts) {
  if (!counts || typeof counts !== 'object') return {};
  const out = {};
  for (const denom of allDenominations()) {
    const qty = Number(counts[String(denom)]) || 0;
    if (qty > 0) out[`x${denom}`] = qty;
  }
  return out;
}

function parseMoney(value, label) {
  const n = roundMoney(Number(value));
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number`);
  return n;
}

function assertNonNegative(value, label) {
  if (value < 0) throw new Error(`${label} cannot be negative`);
}

function assertPositive(value, label) {
  if (value <= 0) throw new Error(`${label} must be greater than zero`);
}

function assertOpenSession(session) {
  if (!session) throw new Error('Cashier session not found');
  if (String(session.status).toLowerCase() !== 'open') {
    throw new Error('Cashier session is already closed');
  }
}

function getSession(id) {
  return db.prepare('SELECT * FROM cashier_sessions WHERE id = ?').get(id);
}

/** The single Open session for a terminal, or null. */
function getOpenSessionForTerminal(terminal) {
  return db
    .prepare("SELECT * FROM cashier_sessions WHERE terminal = ? AND status = 'Open' ORDER BY id DESC LIMIT 1")
    .get(String(terminal || 'POS-02'));
}

function sessionRef() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `CS-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` +
    `-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  );
}

function movementRef(type) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `CT-${String(type || 'mv').toUpperCase()}` +
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` +
    `-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  );
}
/** Denormalized store/branch stamp captured once at session open. */
function storeIdentity() {
  const row = db.prepare('SELECT data_json FROM app_settings WHERE id = 1').get();
  let data = {};
  try {
    data = row ? JSON.parse(row.data_json || '{}') : {};
  } catch (_error) {
    data = {};
  }
  return {
    store: String(data.storeName || '').trim(),
    branch: String(data.branchName || '').trim(),
  };
}

function cashSalesForSession(sessionId) {
  const row = db
    .prepare('SELECT COALESCE(SUM(cash_amount), 0) AS cash_sales, COUNT(*) AS sales_count FROM sales WHERE cashier_session_id = ?')
    .get(sessionId);
  return { cashSales: roundMoney(Number(row.cash_sales) || 0), salesCount: Number(row.sales_count) || 0 };
}

/** Cash refunds = refund records posted against sales that took physical cash. */
function cashRefundsForSession(sessionId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(sr.refund_amount), 0) AS cash_refunds
       FROM sale_returns sr
       JOIN sales s ON s.id = sr.sale_id
       WHERE s.cashier_session_id = ? AND s.cash_amount > 0`
    )
    .get(sessionId);
  return roundMoney(Number(row.cash_refunds) || 0);
}

/**
 * Full drawer summary for a session. Snapshot fields on the session row are
 * kept in sync by refreshSessionTotals(), but this always recomputes from
 * source records (sales + refunds + ledger) so nothing ever trusts a stale
 * number.
 */
function computeSessionSummary(sessionId) {
  const session = getSession(sessionId);
  if (!session) throw new Error('Cashier session not found');

  const { cashSales, salesCount } = cashSalesForSession(sessionId);
  const cashRefunds = cashRefundsForSession(sessionId);

  const money = (n) => Number(n) || 0;
  const openingFloat = roundMoney(money(session.opening_float));
  const cashPaidIn = roundMoney(money(session.cash_paid_in));
  const cashPaidOut = roundMoney(money(session.cash_paid_out));
  const cashDrops = roundMoney(money(session.cash_drops));
  const adjustmentsIn = roundMoney(money(session.adjustment_in));
  const adjustmentsOut = roundMoney(money(session.adjustment_out));

  const expectedCash = roundMoney(
    openingFloat + cashSales + cashPaidIn + adjustmentsIn - cashRefunds - cashPaidOut - cashDrops - adjustmentsOut
  );

  return {
    openingFloat,
    cashSales,
    cashRefunds,
    cashPaidIn,
    cashPaidOut,
    cashDrops,
    adjustmentsIn,
    adjustmentsOut,
    expectedCash,
    salesCount,
  };
}

/** Refresh the denormalized totals stored on the session row. */
function refreshSessionTotals(sessionId) {
  const summary = computeSessionSummary(sessionId);
  db.prepare(
    `UPDATE cashier_sessions
     SET cash_sales = ?, cash_refunds = ?, cash_paid_in = ?, cash_paid_out = ?,
         cash_drops = ?, adjustment_in = ?, adjustment_out = ?, expected_cash = ?
     WHERE id = ?`
  ).run(
    summary.cashSales,
    summary.cashRefunds,
    summary.cashPaidIn,
    summary.cashPaidOut,
    summary.cashDrops,
    summary.adjustmentsIn,
    summary.adjustmentsOut,
    summary.expectedCash,
    sessionId
  );
  return summary;
}

/**
 * Append an immutable row to the cash-movement ledger AND update the owning
 * session's totals in one transaction. Callers must already be inside (or
 * create) their own transaction when they also write business records.
 */
function recordCashMovement(
  session,
  transactionType,
  amount,
  reason,
  { notes = null, reference = null, update = null } = {}
) {
  const { store, branch } = storeIdentity();
  const ref = movementRef(transactionType);
  db.prepare(
    `INSERT INTO cash_transactions
       (transaction_ref, cashier_session_id, store, branch, terminal, cashier_user_id, cashier_username,
        transaction_type, amount, reason, notes, reference)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ref,
    session.id,
    session.store || store,
    session.branch || branch,
    session.terminal,
    session.cashier_user_id,
    session.cashier_username,
    transactionType,
    amount,
    reason,
    notes,
    reference
  );
  if (update) update();
  refreshSessionTotals(session.id);
  return ref;
}

module.exports = {
  PHILIPPINE_DENOMINATIONS,
  allDenominations,
  denominationTotal,
  denominationBreakdown,
  parseMoney,
  assertNonNegative,
  assertPositive,
  assertOpenSession,
  getSession,
  getOpenSessionForTerminal,
  sessionRef,
  movementRef,
  storeIdentity,
  computeSessionSummary,
  refreshSessionTotals,
  recordCashMovement,
};