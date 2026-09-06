/**
 * cashierSessions.js
 * --------------------------------------------------------------------------
 * Cash Float / Opening Cash API.
 *
 * A cashier session is one register shift: it opens with a cash float entered
 * by the cashier (optionally derived from a denomination count), absorbs cash
 * in / out / drop / authorized-adjustment movements, is linked to every sale
 * posted while it is open, and closes through a reconciliation screen that
 * records the actual cash counted (again optionally counted by denomination).
 *
 * The opening float is STARTING DRAWER CASH — it is NEVER part of sales
 * revenue, VAT or profit. All cash rows in `cash_transactions` are immutable;
 * corrections are posted as new adjustment rows + audit log entries.
 */
const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('./auth');
const { auditLog } = require('../audit');
const { roundMoney } = require('../security');
const cashDrawer = require('../cashDrawer');

const router = express.Router();

// Cashiers (and above) run the register. Cash Drops and authorized
// adjustments additionally require a manager/administrator.
const requireCashierOrAbove = requireRole('administrator', 'admin', 'manager', 'cashier');
const requireManagerOrAbove = requireRole('administrator', 'admin', 'manager');

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch (_error) {
    return null;
  }
}

/** Serializable session row (camel-cased + parsed JSON columns + live summary). */
function serializeSession(row) {
  const summary = cashDrawer.computeSessionSummary(row.id);
  return {
    id: row.id,
    sessionRef: row.session_ref,
    store: row.store,
    branch: row.branch,
    terminal: row.terminal,
    cashierUserId: row.cashier_user_id,
    cashierUsername: row.cashier_username,
    status: row.status,
    openingFloat: Number(row.opening_float),
    openingDenominations: parseJson(row.opening_denominations_json),
    cashSales: Number(row.cash_sales),
    cashRefunds: Number(row.cash_refunds),
    cashPaidIn: Number(row.cash_paid_in),
    cashPaidOut: Number(row.cash_paid_out),
    cashDrops: Number(row.cash_drops),
    adjustmentsIn: Number(row.adjustment_in),
    adjustmentsOut: Number(row.adjustment_out),
    expectedCash: Number(row.expected_cash),
    actualCash: row.actual_cash == null ? null : Number(row.actual_cash),
    cashDifference: row.cash_difference == null ? null : Number(row.cash_difference),
    differenceStatus: row.difference_status,
    closingDenominations: parseJson(row.closing_denominations_json),
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    closedByUserId: row.closed_by_user_id,
    closedByUsername: row.closed_by_username,
    notes: row.notes,
    summary,
  };
}

function errorResponse(res, error, fallback) {
  const message = String((error && error.message) || fallback);
  if (/already open|UNIQUE constraint/.test(message)) {
    return res.status(409).json({ error: message });
  }
  if (/closed|not found|negative|greater than|less than|reason|match|required|whole|cannot/i.test(message)) {
    return res.status(400).json({ error: message });
  }
  return res.status(500).json({ error: message || fallback });
}
/* ------------------------------------------------------------------ */
/*  Open a register (enters the opening cash float)                    */
/* ------------------------------------------------------------------ */

router.post('/', requireCashierOrAbove, (req, res) => {
  try {
    const openingFloat = roundMoney(Number(req.body.openingFloat));
    if (!Number.isFinite(openingFloat) || openingFloat < 0) {
      return res.status(400).json({ error: 'Opening float cannot be negative' });
    }

    const terminal = String(req.body.terminal || 'POS-02').trim().slice(0, 40) || 'POS-02';
    const counts = req.body.denominationCounts && typeof req.body.denominationCounts === 'object' ? req.body.denominationCounts : null;
    if (counts) {
      const counted = cashDrawer.denominationTotal(counts);
      if (Math.abs(counted - openingFloat) > 0.009) {
        return res.status(400).json({ error: 'Denomination count does not match the opening float total' });
      }
    }

    const existing = cashDrawer.getOpenSessionForTerminal(terminal);
    if (existing) {
      return res.status(409).json({ error: `Terminal ${terminal} already has an open cashier session` });
    }

    const { store, branch } = cashDrawer.storeIdentity();
    const sessionRef = cashDrawer.sessionRef();

    const sessionId = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO cashier_sessions
             (session_ref, store, branch, terminal, cashier_user_id, cashier_username,
              status, opening_float, opening_denominations_json, expected_cash)
           VALUES (?, ?, ?, ?, ?, ?, 'Open', ?, ?, ?)`
        )
        .run(
          sessionRef,
          store,
          branch,
          terminal,
          req.session.userId,
          req.session.username,
          openingFloat,
          counts ? JSON.stringify(counts) : null,
          openingFloat
        );
      const id = result.lastInsertRowid;
      const session = db.prepare('SELECT * FROM cashier_sessions WHERE id = ?').get(id);
      cashDrawer.recordCashMovement(session, 'opening_float', openingFloat, 'Opening cash float', {
        reference: sessionRef,
        notes: req.body.notes || null,
      });
      return id;
    })();

    auditLog(req, 'Opened cashier session', 'CashierSession', sessionId, {
      sessionRef,
      terminal,
      openingFloat,
      denominations: counts ? cashDrawer.denominationBreakdown(counts) : null,
    });

    const full = db.prepare('SELECT * FROM cashier_sessions WHERE id = ?').get(sessionId);
    return res.status(201).json({ ok: true, session: serializeSession(full) });
  } catch (error) {
    return errorResponse(res, error, 'Unable to open cashier session');
  }
});

/* ------------------------------------------------------------------ */
/*  Current open session for a terminal                                */
/* ------------------------------------------------------------------ */

// Registered BEFORE /:id so the literal path wins.
router.get('/current', authenticate, (req, res) => {
  const terminal = String(req.query.terminal || 'POS-02').trim().slice(0, 40) || 'POS-02';
  const session = cashDrawer.getOpenSessionForTerminal(terminal);
  if (!session) return res.json({ session: null });
  return res.json({ session: serializeSession(session) });
});

/* ------------------------------------------------------------------ */
/*  List + daily summary (reports)                                     */
/* ------------------------------------------------------------------ */

router.get('/summary', authenticate, (req, res) => {
  const date = String(req.query.date || '').trim();
  const where = date ? 'WHERE date(opened_at) = ?' : '';
  const params = date ? [date] : [];
  const sessions = db
    .prepare(`SELECT * FROM cashier_sessions ${where} ORDER BY opened_at DESC, id DESC`)
    .all(...params);

  const sum = (fn) => roundMoney(sessions.reduce((acc, s) => acc + (Number(fn(s)) || 0), 0));
  const totals = {
    sessionCount: sessions.length,
    openCount: sessions.filter((s) => s.status === 'Open').length,
    openingFloat: sum((s) => s.opening_float),
    cashSales: sum((s) => s.cash_sales),
    cashRefunds: sum((s) => s.cash_refunds),
    cashPaidIn: sum((s) => s.cash_paid_in),
    cashPaidOut: sum((s) => s.cash_paid_out),
    cashDrops: sum((s) => s.cash_drops),
    expectedCash: sum((s) => s.expected_cash),
    actualCash: sum((s) => (s.actual_cash == null ? 0 : s.actual_cash)),
    cashDifference: sum((s) => (s.cash_difference == null ? 0 : s.cash_difference)),
  };

  return res.json({ date: date || null, sessions: sessions.map(serializeSession), totals });
});

router.get('/', authenticate, (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const terminal = String(req.query.terminal || '').trim();
  const status = String(req.query.status || '').trim().toLowerCase();
  const where = [];
  const params = [];
  if (terminal) {
    where.push('terminal = ?');
    params.push(terminal);
  }
  if (status === 'open' || status === 'closed') {
    where.push('status = ?');
    params.push(status === 'open' ? 'Open' : 'Closed');
  }
  const sql = `SELECT * FROM cashier_sessions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit);
  return res.json(rows.map(serializeSession));
});
/* ------------------------------------------------------------------ */
/*  Cash movements: Cash In / Cash Out / Cash Drop                     */
/* ------------------------------------------------------------------ */

function movementRoute(transactionType, column, actionLabel, requireManager = false) {
  const guard = requireManager ? requireManagerOrAbove : requireCashierOrAbove;
  const handler = (req, res) => {
    try {
      const sessionId = Number(req.params.id);
      const session = cashDrawer.getSession(sessionId);
      cashDrawer.assertOpenSession(session);

      const amount = roundMoney(Number(req.body.amount));
      if (!Number.isFinite(amount)) return res.status(400).json({ error: 'Amount must be a number' });
      cashDrawer.assertPositive(amount, 'Amount');

      const reason = String(req.body.reason || '').trim();
      if (!reason) return res.status(400).json({ error: 'A reason is required' });
      const notes = String(req.body.notes || '').trim() || null;

      db.transaction(() => {
        cashDrawer.recordCashMovement(session, transactionType, amount, reason, {
          notes,
          reference: String(req.body.reference || '').trim() || null,
          update: () => {
            db.prepare(`UPDATE cashier_sessions SET ${column} = ${column} + ? WHERE id = ?`).run(amount, session.id);
          },
        });
      })();

      auditLog(req, actionLabel, 'CashierSession', session.id, {
        sessionRef: session.session_ref,
        amount,
        reason,
        notes,
      });

      const full = cashDrawer.getSession(session.id);
      return res.json({ ok: true, session: serializeSession(full) });
    } catch (error) {
      return errorResponse(res, error, 'Unable to post cash movement');
    }
  };
  return [guard, handler];
}

router.post('/:id/cash-in', ...movementRoute('cash_in', 'cash_paid_in', 'Cash paid in'));
router.post('/:id/cash-out', ...movementRoute('cash_out', 'cash_paid_out', 'Cash paid out'));
router.post('/:id/cash-drop', ...movementRoute('cash_drop', 'cash_drops', 'Cash drop to safe', true));

/* ------------------------------------------------------------------ */
/*  Authorized adjustment (opening-float / drawer corrections)         */
/* ------------------------------------------------------------------ */

router.post('/:id/adjust', requireManagerOrAbove, (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = cashDrawer.getSession(sessionId);
    cashDrawer.assertOpenSession(session);

    const amount = roundMoney(Number(req.body.amount));
    if (!Number.isFinite(amount)) return res.status(400).json({ error: 'Amount must be a number' });
    cashDrawer.assertPositive(amount, 'Adjustment amount');

    const direction = String(req.body.direction || 'out').trim().toLowerCase();
    if (direction !== 'in' && direction !== 'out') {
      return res.status(400).json({ error: "Adjustment direction must be 'in' or 'out'" });
    }
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A reason is required' });
    const notes = String(req.body.notes || '').trim() || null;

    const type = direction === 'in' ? 'adjustment_in' : 'adjustment_out';
    const column = direction === 'in' ? 'adjustment_in' : 'adjustment_out';

    db.transaction(() => {
      cashDrawer.recordCashMovement(session, type, amount, reason, {
        notes,
        reference: String(req.body.reference || '').trim() || null,
        update: () => {
          db.prepare(`UPDATE cashier_sessions SET ${column} = ${column} + ? WHERE id = ?`).run(amount, session.id);
        },
      });
    })();

    auditLog(req, 'Cash adjustment', 'CashierSession', session.id, {
      sessionRef: session.session_ref,
      direction,
      amount,
      reason,
      notes,
    });

    const full = cashDrawer.getSession(session.id);
    return res.json({ ok: true, session: serializeSession(full) });
  } catch (error) {
    return errorResponse(res, error, 'Unable to post cash adjustment');
  }
});
/* ------------------------------------------------------------------ */
/*  Close register — reconciliation + actual cash counted              */
/* ------------------------------------------------------------------ */

router.post('/:id/close', requireCashierOrAbove, (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = cashDrawer.getSession(sessionId);
    cashDrawer.assertOpenSession(session);

    // Actual cash comes from either a direct entry or a denomination count.
    let actualCash = null;
    let counts = null;
    const hasDirect =
      req.body.actualCash !== undefined && req.body.actualCash !== null && req.body.actualCash !== '';
    const hasCounts = req.body.denominationCounts && typeof req.body.denominationCounts === 'object';

    if (hasDirect) {
      actualCash = roundMoney(Number(req.body.actualCash));
      if (!Number.isFinite(actualCash)) return res.status(400).json({ error: 'Actual cash counted must be a number' });
      cashDrawer.assertNonNegative(actualCash, 'Actual cash counted');
    } else if (hasCounts) {
      actualCash = cashDrawer.denominationTotal(req.body.denominationCounts);
      counts = req.body.denominationCounts;
    } else {
      return res.status(400).json({ error: 'Actual cash counted is required' });
    }

    const summary = cashDrawer.computeSessionSummary(session.id);
    const expected = summary.expectedCash;
    const difference = roundMoney(actualCash - expected);
    const differenceStatus = Math.abs(difference) < 0.005 ? 'EXACT' : difference > 0 ? 'OVER' : 'SHORT';
    const notes = String(req.body.notes || '').trim() || null;

    db.transaction(() => {
      const updated = db
        .prepare(
          `UPDATE cashier_sessions
           SET actual_cash = ?, cash_difference = ?, difference_status = ?,
               closing_denominations_json = ?, status = 'Closed',
               closed_at = datetime('now', 'localtime'),
               closed_by_user_id = ?, closed_by_username = ?, notes = ?
           WHERE id = ? AND status = 'Open'`
        )
        .run(
          actualCash,
          difference,
          differenceStatus,
          counts ? JSON.stringify(counts) : null,
          req.session.userId,
          req.session.username,
          notes,
          session.id
        );
      if (updated.changes !== 1) throw new Error('Cashier session is already closed');

      cashDrawer.recordCashMovement(session, 'actual_cash', actualCash, 'Actual cash counted at closing', {
        notes,
        reference: session.session_ref,
      });
    })();

    auditLog(req, 'Closed cashier session', 'CashierSession', session.id, {
      sessionRef: session.session_ref,
      expectedCash: expected,
      actualCash,
      difference,
      differenceStatus,
      denominations: counts ? cashDrawer.denominationBreakdown(counts) : null,
    });

    const full = cashDrawer.getSession(session.id);
    return res.json({
      ok: true,
      session: serializeSession(full),
      expectedCash: expected,
      actualCash,
      difference,
      differenceStatus,
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to close cashier session');
  }
});

/* ------------------------------------------------------------------ */
/*  Session detail + its cash-movement ledger                          */
/* ------------------------------------------------------------------ */

router.get('/:id', authenticate, (req, res) => {
  const id = Number(req.params.id);
  const session = cashDrawer.getSession(id);
  if (!session) return res.status(404).json({ error: 'Cashier session not found' });

  const movements = db
    .prepare('SELECT * FROM cash_transactions WHERE cashier_session_id = ? ORDER BY id ASC')
    .all(id);

  return res.json({
    session: serializeSession(session),
    movements: movements.map((row) => ({
      id: row.id,
      transactionRef: row.transaction_ref,
      transactionType: row.transaction_type,
      amount: Number(row.amount),
      reason: row.reason,
      notes: row.notes,
      reference: row.reference,
      cashierUsername: row.cashier_username,
      createdAt: row.created_at,
    })),
  });
});

module.exports = router;