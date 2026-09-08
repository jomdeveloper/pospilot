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
import { CASHIER, COUNTER, PHARMACY } from "../data/storeConfig";

const TAX_LABELS = { VATABLE: "V", EXEMPT: "E", ZERO_RATED: "Z", NON_VAT: "N" };

let invoiceSeq = 0;

/** Date → "MM/DD/YYYY  hh:mm AM/PM" line. */
function dateLineOf(date) {
  if (!date) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date(date);
  let hh = d.getHours();
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12 || 12;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${hh}:${pad(d.getMinutes())} ${ampm}`;
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
  return "SI-" + String(invoiceSeq).padStart(11, "0");
}

/** Build the plain-text ESC/POS lines for a receipt `data` object.
 *
 * The caller passes the SERVER-AUTHORITATIVE totals (subtotal, itemDiscount,
 * seniorDiscount, vat, vatable, grandTotal) so every number printed here is
 * exactly what was recorded in the database — the VAT split and the 20% base
 * are identical on both sides.
 */
export function buildReceiptLines(data, configuredWidth = 42) {
  const W = Math.max(16, Number(configuredWidth) || 42);
  const {
    subtotal = 0,
    seniorDiscount = 0,
    vat = 0,
    vatable = 0,
    vatableSales = vatable,
    vatExemptSales = 0,
    zeroRatedSales = 0,
    grandTotal = 0,
    method = "cash",
    tendered = 0,
    date,
    customer = null,
    customerType = "walkin",
    customerId = "",
    cashier = CASHIER,
    gcashReference = "",
    invoiceNo
  } = data;

  const normalizedCustomerType = String(customerType || "walkin").trim().toLowerCase();
  const isCash = String(method || "cash").trim().toLowerCase() === "cash";
  // Senior Citizen & PWD sales both get the statutory 20% discount.
  const isDiscountCustomer = normalizedCustomerType === "senior" || normalizedCustomerType === "pwd";
  const discountLabel = normalizedCustomerType === "senior" ? "Senior Citizen Discount" : "PWD Discount";
  const customerLabel = normalizedCustomerType === "senior" ? "Senior Citizen" : "PWD";
  const customerIdLabel = normalizedCustomerType === "senior" ? "SC ID No." : "PWD ID No.";
  const paymentMethodLabel = {
    cash: "Cash",
    gcash: "GCash",
    maya: "Maya",
    card: "Card",
    bank: "Bank",
    credit: "Credit",
    other: "Other"
  }[String(method || "cash").trim().toLowerCase()] || String(method || "Cash");
  const receiptInvoiceNo = `SI# ${String(invoiceNo || "").replace(/\D/g, "").padStart(11, "0")}`;
  const storeTin = String(PHARMACY.tin || "").replace(/^TIN\s*:\s*/i, "");
  const itemCount = (data.lines || []).reduce((total, item) => total + (Number(item.qty) || 0), 0);

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
  out.push(center(PHARMACY.name, true));
  if (PHARMACY.address) out.push(center(PHARMACY.address));
  if (storeTin) out.push(center(`VAT Reg. TIN: ${storeTin}`));
  out.push(center("SALES INVOICE", true));
  out.push(center(receiptInvoiceNo));
  out.push(center(`POS-${COUNTER} : ${dateLineOf(date)}`));
  out.push(center(`Cashier: ${cashier}`));
  out.push(dash());
  out.push(row("ITEM", "AMOUNT", true));
  out.push(dash());
  for (const it of data.lines || []) {
    const taxCode = TAX_LABELS[String(it.taxType || it.tax_type || "VATABLE").toUpperCase()] || "V";
    out.push(line(`${String(it.name).slice(0, Math.max(1, W - 4))} (${taxCode})`));
    out.push(row(`  ${it.qty} x ${formatPeso(it.price).replace(/^₱/, "")}`, formatPeso(it.net).replace(/^₱/, "")));
  }
  out.push(dash());
  out.push(line(`Total Items: ${itemCount}`));
  out.push(line(""));
  out.push(row("Gross Sales", formatPeso(subtotal).replace(/^₱/, ""), true));
  out.push(row("VATable Sales", formatPeso(vatableSales).replace(/^₱/, "")));
  out.push(row("VAT (12%)", formatPeso(vat).replace(/^₱/, "")));
  out.push(row("VAT-Exempt Sales", formatPeso(vatExemptSales).replace(/^₱/, "")));
  out.push(row("Zero-Rated Sales", formatPeso(zeroRatedSales).replace(/^₱/, "")));
  if (isDiscountCustomer && seniorDiscount > 0) {
    out.push(line(""));
    out.push(row(`${discountLabel} (20%)`, formatPeso(seniorDiscount).replace(/^₱/, "")));
  }
  out.push(line(""));
  out.push(row("TOTAL DUE", formatPeso(amountDue), true));
  out.push(dash());
  out.push(line(`Payment Method: ${paymentMethodLabel}`));
  if (String(method || "").trim().toLowerCase() === "gcash") {
    out.push(line(`Gcash Reference #: ${gcashReference || "____________________________"}`));
  }
  if (isCash && tendered > 0) {
    out.push(row("Amount Tendered", formatPeso(tendered), true));
    out.push(row("Change", formatPeso(cashChange), true));
  }
  out.push(dash());
  if (isDiscountCustomer) {
    out.push(line(customerLabel));
    out.push(line(`${customerIdLabel}: ${customerId || "________________"}`));
    out.push(line(`Name: ${customer || "_______________________________"}`));
    out.push(line("Address: ______________________________"));
    out.push(line("TIN: _________________________________"));
    out.push(dash());
    out.push(line(""));
    out.push(center("Thank you!", true));
    return out;
  }
  out.push(line(""));
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
    let width = 42;
    if (typeof broker.getPrinterConfig === "function") {
      try {
        const config = await broker.getPrinterConfig();
        width = Number(config && config.effective && config.effective.width) || width;
      } catch (e) { /* use the standard Font B width */ }
    }
    const res = await broker.printReceipt({
      lines: buildReceiptLines(data, width),
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