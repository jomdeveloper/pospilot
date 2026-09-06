/**
 * denominations.js
 * --------------------------------------------------------------------------
 * Philippine peso currency breakdown used by the opening-cash and closing
 * cash-count interfaces. Mirrors the server's denomination list in
 * `server/src/cashDrawer.js` — keep both in sync.
 */
export const PHILIPPINE_DENOMINATIONS = {
  coins: [0.01, 0.05, 0.1, 0.25, 1, 5, 10, 20],
  bills: [20, 50, 100, 200, 500, 1000],
};

export function allDenominations() {
  return [...PHILIPPINE_DENOMINATIONS.coins, ...PHILIPPINE_DENOMINATIONS.bills];
}

export function emptyDenominationCounts() {
  const out = {};
  for (const denom of allDenominations()) out[String(denom)] = "";
  return out;
}

/** Denomination × quantity for every entry. */
export function denominationSubtotals(counts) {
  const subtotals = {};
  let total = 0;
  for (const denom of allDenominations()) {
    const qty = Number(counts[String(denom)]) || 0;
    const sub = qty > 0 ? denom * qty : 0;
    subtotals[String(denom)] = Math.round(sub * 100) / 100;
    total += sub;
  }
  return { subtotals, total: Math.round(total * 100) / 100 };
}

/** Compact { "x1000": 2, "x500": 1, ... } audit summary (matching the server). */
export function denominationBreakdown(counts) {
  const out = {};
  for (const denom of allDenominations()) {
    const qty = Number(counts[String(denom)]) || 0;
    if (qty > 0) out[`x${denom}`] = qty;
  }
  return out;
}