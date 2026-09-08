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
export const TAX_TYPES = ["VATABLE", "EXEMPT", "ZERO_RATED", "NON_VAT"];

/** Split a VAT-inclusive amount into its VAT and VAT-exclusive parts. */
export function splitVat(inclusive) {
  const vat = roundMoney((inclusive * VAT_RATE) / (1 + VAT_RATE));
  return { vat, vatable: roundMoney(inclusive - vat) };
}

export function calculateTaxLine(grossAmount, taxType, customerType = "walkin", memberDiscountPct = 0, otherDiscountPct = 0, seniorOrPwdEligible = false) {
  const normalizedType = TAX_TYPES.includes(String(taxType || "").toUpperCase()) ? String(taxType).toUpperCase() : "VATABLE";
  const normalizedCustomerType = String(customerType || "walkin").toLowerCase();
  const gross = roundMoney(grossAmount);
  const seniorDiscountApplies = seniorOrPwdEligible && (normalizedType === "VATABLE" || normalizedType === "EXEMPT");
  let customerDiscount = 0;
  let discountedAmount = gross;
  if (seniorDiscountApplies) {
    const base = normalizedType === "VATABLE" ? splitVat(gross).vatable : gross;
    customerDiscount = roundMoney(base * 0.2);
    discountedAmount = roundMoney(base - customerDiscount);
  } else if (normalizedCustomerType === "member" && Number(memberDiscountPct) > 0) {
    customerDiscount = roundMoney(gross * (Number(memberDiscountPct) / 100));
    discountedAmount = roundMoney(gross - customerDiscount);
  } else if (normalizedCustomerType !== "member" && Number(otherDiscountPct) > 0) {
    customerDiscount = roundMoney(gross * (Number(otherDiscountPct) / 100));
    discountedAmount = roundMoney(gross - customerDiscount);
  }
  const base = normalizedType === "VATABLE" ? splitVat(discountedAmount).vatable : discountedAmount;
  return {
    taxType: normalizedType,
    discountType: seniorDiscountApplies
      ? (normalizedCustomerType === "pwd" ? "PWD" : "SENIOR_CITIZEN")
      : normalizedCustomerType === "member" && Number(memberDiscountPct) > 0
        ? "MEMBER"
        : normalizedCustomerType !== "member" && Number(otherDiscountPct) > 0
          ? "OTHER"
          : "NONE",
    vat: normalizedType === "VATABLE" && !seniorDiscountApplies ? splitVat(discountedAmount).vat : 0,
    vatableSales: normalizedType === "VATABLE" && !seniorDiscountApplies ? base : 0,
    vatExemptSales: normalizedType === "EXEMPT" || seniorDiscountApplies ? discountedAmount : 0,
    zeroRatedSales: normalizedType === "ZERO_RATED" ? discountedAmount : 0,
    nonVatSales: normalizedType === "NON_VAT" ? discountedAmount : 0,
    customerDiscount,
    lineTotal: discountedAmount,
  };
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
  let vatableSales = 0;
  let vatExemptSales = 0;
  let zeroRatedSales = 0;
  let nonVatSales = 0;
  let amountDue = 0;
  let itemCount = 0;

  state.cart.forEach((line) => {
    const gross = lineGross(line);
    const eligible =
      isSeniorOrPwd &&
      (customerType === "senior"
        ? Boolean(line.seniorDiscountEligible)
        : Boolean(line.pwdDiscountEligible));
    const taxLine = calculateTaxLine(
      gross,
      line.taxType || line.tax_type,
      customerType,
      customerType === "member" ? (line.memberDiscountPct || line.discountPct || 0) : 0,
      customerType !== "member" ? (line.discountPct || 0) : 0,
      eligible
    );

    subtotal += gross;
    if (taxLine.discountType === "SENIOR_CITIZEN" || taxLine.discountType === "PWD") {
      seniorDiscount += taxLine.customerDiscount;
    } else {
      discount += taxLine.customerDiscount;
    }
    vat += taxLine.vat;
    vatableSales += taxLine.vatableSales;
    vatExemptSales += taxLine.vatExemptSales;
    zeroRatedSales += taxLine.zeroRatedSales;
    nonVatSales += taxLine.nonVatSales;
    itemCount += Number(line.qty) || 0;
  });

  subtotal = roundMoney(subtotal);
  discount = roundMoney(discount);
  seniorDiscount = roundMoney(seniorDiscount);
  vat = roundMoney(vat);
  vatableSales = roundMoney(vatableSales);
  vatExemptSales = roundMoney(vatExemptSales);
  zeroRatedSales = roundMoney(zeroRatedSales);
  nonVatSales = roundMoney(nonVatSales);
  amountDue = roundMoney(state.cart.reduce((sum, line) => {
    const gross = lineGross(line);
    const eligible = isSeniorOrPwd && (customerType === "senior" ? Boolean(line.seniorDiscountEligible) : Boolean(line.pwdDiscountEligible));
    return sum + calculateTaxLine(
      gross,
      line.taxType || line.tax_type,
      customerType,
      customerType === "member" ? (line.memberDiscountPct || line.discountPct || 0) : 0,
      customerType !== "member" ? (line.discountPct || 0) : 0,
      eligible
    ).lineTotal;
  }, 0));

  state.subtotal = subtotal;
  state.discount = discount;
  state.seniorDiscount = seniorDiscount;
  state.saved = roundMoney(discount + seniorDiscount);
  state.vat = vat;
  state.vatable = vatableSales;
  state.vatableSales = vatableSales;
  state.vatExemptSales = vatExemptSales;
  state.zeroRatedSales = zeroRatedSales;
  state.nonVatSales = nonVatSales;
  state.amountDue = amountDue;
  state.itemCount = itemCount;

  return { subtotal, discount, saved: state.saved, seniorDiscount, vat, vatable: vatableSales, vatableSales, vatExemptSales, zeroRatedSales, nonVatSales, amountDue, itemCount };
}

/**
 * Format a transaction number as an invoice id (SI-00000000001, SI-00000000002, …).
 * @param {number} n sequential sale number
 * @returns {string}
 */
export function formatInvoiceNo(n) {
  return "SI-" + String(Math.max(1, Number(n) || 1)).padStart(11, "0");
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