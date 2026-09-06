/**
 * receiptPrint.js
 * --------------------------------------------------------------------------
 * Shared receipt text-building + silent printing, used both for auto-printing
 * a completed transaction and for Reprint — without showing a dialog.
 *
 * Mirrors the on-screen receipt content so raw ESC/POS and raster print the
 * same thing.
 */
import { formatPeso, roundMoney } from "./calculations";
import { CASHIER, PHARMACY } from "../data/storeConfig";
import { customerTypeLabel } from "../data/customerTypes";

const W = 32; // chars per line (58mm receipt)

let invoiceSeq = 0;

/** Date → "MM/DD/YYYY  hh:mm AM/PM" line. */
function dateLineOf(date) {
  if (!date) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date(date);
  let hh = d.getHours();
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12 || 12;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}  ${hh}:${pad(d.getMinutes())} ${ampm}`;
}

/**
 * Seed the session's invoice counter from the database's last sale so the
 * next printed receipt continues where the real transactions ended.
 * @param {number} nextNumber - the next SI number to issue.
 */
export function setInvoiceCounter(nextNumber) {
  const n = Math.max(1, Number(nextNumber) || 1);
  invoiceSeq = n - 1;
}

/** Return the next invoice number for this session. */
export function nextInvoiceNo() {
  invoiceSeq += 1;
  return "SI-" + String(invoiceSeq).padStart(6, "0");
}

/** Build the plain-text ESC/POS lines for a receipt `data` object.
 *
 * The caller passes the SERVER-AUTHORITATIVE totals (subtotal, itemDiscount,
 * seniorDiscount, vat, vatable, grandTotal) so every number printed here is
 * exactly what was recorded in the database — the VAT split and the 20% base
 * are identical on both sides.
 */
export function buildReceiptLines(data) {
  const {
    subtotal = 0,
    itemDiscount = 0,
    seniorDiscount = 0,
    vat = 0,
    vatable = 0,
    grandTotal = 0,
    method = "cash",
    tendered = 0,
    date,
    customer = null,
    customerType = "walkin",
    customerId = "",
    invoiceNo
  } = data;

  const isCash = method === "cash";
  // Senior Citizen & PWD sales both get the statutory 20% discount.
  const isDiscountCustomer = customerType === "senior" || customerType === "pwd";
  const discountLabel =
    customerType === "senior" ? "Senior Citizen Discount" : "PWD Discount";
  const custIdLabel = customerType === "senior" ? "SC ID No." : "PWD ID No.";

  // The authoritative change for cash comes from grandTotal, exactly like the
  // server: CHANGE = tendered − AMOUNT DUE.
  const amountDue = grandTotal;
  const cashChange = isCash ? roundMoney(tendered - amountDue) : 0;

  const line = (text, opts = {}) => Object.assign({ text: String(text) }, opts);
  const center = (text, bold) => line(text, { align: "center", bold });
  const dash = () => line("-".repeat(W));
  const row = (label, value, bold) => {
    const v = String(value == null ? "" : value);
    const maxLabel = Math.max(1, W - v.length);
    const lbl = String(label).length > maxLabel ? String(label).slice(0, maxLabel) : String(label);
    const pad = Math.max(1, W - lbl.length - v.length);
    return line(lbl + " ".repeat(pad) + v, { bold });
  };

  const out = [];
  // Header — ALWAYS from store settings (never hard-coded). The store name is
  // the primary line; any tagline / phone / website / footer add branding.
  out.push(center(PHARMACY.name, true));
  if (PHARMACY.tagline) out.push(center(PHARMACY.tagline));
  if (PHARMACY.branchName) out.push(center(`${PHARMACY.branchName}${PHARMACY.branchCode ? " \u00b7 " + PHARMACY.branchCode : ""}`));
  if (PHARMACY.address) out.push(center(PHARMACY.address));
  const contactBits = [PHARMACY.phone, PHARMACY.email].filter(Boolean);
  if (contactBits.length) out.push(center(contactBits.join(" \u00b7 ")));
  if (PHARMACY.tin) out.push(center(PHARMACY.tin));
  out.push(center("SALES INVOICE", true));
  out.push(dash());
  out.push(line(`Transaction No.: ${invoiceNo || ""}`));
  out.push(line(dateLineOf(date)));
  out.push(line(`Cashier: ${CASHIER}`));
  out.push(line(`Customer: ${customer || "Walk-in"}${customerType !== "walkin" ? ` (${customerTypeLabel(customerType)})` : ""}`));
  out.push(dash());
  out.push(row("ITEM", "AMT", true));
  for (const it of data.lines || []) {
    out.push(line(String(it.name).slice(0, W)));
    out.push(row(`${it.qty} x ${formatPeso(it.price)}`, formatPeso(it.net)));
  }
  out.push(dash());
  out.push(row("TOTAL SALES (VAT INC.)", formatPeso(subtotal)));
  if (itemDiscount > 0) out.push(row("Less: Discount", `(${formatPeso(itemDiscount)})`));
  out.push(row("Less: VAT", `(${formatPeso(vat)})`));
  out.push(row("VATABLE SALES", formatPeso(vatable)));
  if (isDiscountCustomer && seniorDiscount > 0) {
    out.push(line(discountLabel, { bold: true }));
    out.push(row("Amount", `(${formatPeso(seniorDiscount)})`));
  }
  out.push(dash());
  out.push(row("AMOUNT DUE", formatPeso(amountDue), true));
  if (isCash && tendered > 0) {
    out.push(row("Cash", formatPeso(tendered)));
    out.push(row("CHANGE", formatPeso(cashChange), true));
  }
  out.push(dash());
  out.push(row("VATABLE SALES", formatPeso(vatable)));
  out.push(row("VAT EXEMPT SALES", "0.00"));
  out.push(row("ZERO-RATED SALES", "0.00"));
  out.push(row("VAT", formatPeso(vat)));
  if (isDiscountCustomer) {
    out.push(dash());
    out.push(line(`${discountLabel.split(" Discount")[0]} Name: ${customer}`));
    out.push(line(`${custIdLabel} ${customerId}`));
  }
  out.push(dash());
  // Footer message from store settings (default thanks message).
  out.push(center(PHARMACY.receiptFooter || "Thank you!", true));
  return out;
}

/**
 * Silently print a receipt via the desktop bridge (raw ESC/POS / driver).
 * Returns the broker result without opening any dialog.
 */
export async function printReceipt(data) {
  const broker = typeof window.desktop?.printReceipt === "function" ? window.desktop : null;
  if (!broker) {
    try { window.print(); } catch (e) { /* ignore */ }
    return null;
  }
  try {
    const res = await broker.printReceipt({
      lines: buildReceiptLines(data),
      heightMicrons: 200000 // reasonable default; raw ESC/POS ignores page size
    });
    const which = res && res.mode === "espos" ? "ESC/POS" : res && res.mode === "raster" ? "raster/webContents" : "?";
    const where = (res && (res.printer || res.deviceName)) || "";
    console.info(`[receipt] auto-printed via ${which} → ${where}`);
    return res;
  } catch (e) {
    console.error("[receipt] print failed:", (e && e.message) || e);
    return null;
  }
}