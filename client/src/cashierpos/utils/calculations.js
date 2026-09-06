/**
 * calculations.js
 * --------------------------------------------------------------------------
 * Pure calculation + formatting helpers. No DOM access here so this logic can
 * be unit-tested and ported directly into a React + Vite app (util/ folder).
 *
 * Currency: PHP (₱) formatted with two decimals + thousands separators.
 */

/**
 * Round a money value to two decimal places (avoid float drift).
 * @param {number} n
 * @returns {number}
 */
export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export const VAT_RATE = 0.12; // Philippine output VAT — shelf prices are VAT-inclusive

/** Split a VAT-inclusive amount into its VAT and VAT-exclusive parts. */
export function splitVat(inclusive) {
  const vat = roundMoney((inclusive * VAT_RATE) / (1 + VAT_RATE));
  return { vat, vatable: roundMoney(inclusive - vat) };
}

/**
 * Total for a line BEFORE any discount: price * qty.
 * @param {object} line { price, qty }
 * @returns {number}
 */
export function lineGross(line) {
  return roundMoney(line.price * line.qty);
}

/**
 * Discount amount for a line in pesos (price * qty * disc% / 100).
 * @returns {number}
 */
export function lineDiscount(line) {
  return roundMoney((line.price * line.qty * (line.discountPct || 0)) / 100);
}

/**
 * Final line total after discount (gross minus discount amount).
 * @returns {number}
 */
export function lineNet(line) {
  return roundMoney(lineGross(line) - lineDiscount(line));
}

/**
 * Recompute every derived summary value for the cart and write it into
 * posState. Returns a fresh summary object (idempotent, testable).
 * @param {object} state - posState-like object
 * @returns {{subtotal:number, discount:number, saved:number, amountDue:number, itemCount:number}}
 */
export function recomputeTotals(state) {
  const customerType = String(state.customerType || "walkin").toLowerCase();
  const isSeniorOrPwd = customerType === "senior" || customerType === "pwd";

  let subtotal = 0;
  let discount = 0;
  let seniorDiscount = 0;
  let vat = 0;
  let amountDue = 0;
  let itemCount = 0;

  state.cart.forEach((line) => {
    const gross = lineGross(line);
    const disc = lineDiscount(line);
    const discountedInclusive = roundMoney(gross - disc);
    const { vat: lineVat, vatable } = splitVat(discountedInclusive);

    const eligible =
      isSeniorOrPwd &&
      (customerType === "senior"
        ? Boolean(line.seniorDiscountEligible)
        : Boolean(line.pwdDiscountEligible));
    // Statutory 20% on the VAT-EXCLUSIVE amount — mirrors the server and the
    // printed receipt so the till, DB and receipt always agree.
    const senior = eligible ? roundMoney(vatable * 0.2) : 0;

    subtotal += gross;
    discount += disc;
    seniorDiscount += senior;
    vat += lineVat;
    itemCount += Number(line.qty) || 0;
  });

  subtotal = roundMoney(subtotal);
  discount = roundMoney(discount);
  seniorDiscount = roundMoney(seniorDiscount);
  vat = roundMoney(vat);
  const vatable = roundMoney(subtotal - discount - vat);
  amountDue = roundMoney(subtotal - discount - seniorDiscount);

  state.subtotal = subtotal;
  state.discount = discount;
  state.seniorDiscount = seniorDiscount;
  state.saved = discount; // "Saved" mirrors the item-level discount applied
  state.vat = vat;
  state.vatable = vatable;
  state.amountDue = amountDue;
  state.itemCount = itemCount;

  return { subtotal, discount, saved: discount, seniorDiscount, vat, vatable, amountDue, itemCount };
}

/**
 * Format a transaction number as an invoice id (SI-000001, SI-000002, …).
 * @param {number} n sequential sale number
 * @returns {string}
 */
export function formatInvoiceNo(n) {
  return "SI-" + String(Math.max(1, Number(n) || 1)).padStart(6, "0");
}

/** Extract the numeric transaction counter from an invoice like "SI-000003" → 3. */
export function invoiceNoToNumber(invoiceNo) {
  const match = String(invoiceNo || "").match(/(\d+)\s*$/);
  return match ? Math.max(1, Number(match[1])) : null;
}

/**
 * Format a number as Philippine Peso currency.
 * @param {number} value
 * @returns {string} e.g. "₱1,250.00"
 */
export function formatPeso(value) {
  const fixed = (Number(value) || 0).toFixed(2);
  return "\u20B1" + Number(fixed).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}