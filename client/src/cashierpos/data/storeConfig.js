/**
 * storeConfig.js
 * --------------------------------------------------------------------------
 * Cashier-POS view of the centrally-stored store information. This is NOT a
 * separate hard-coded store identity anymore — it reads/writes the SAME source
 * of truth used everywhere (login, splash, StockPilot, receipts): the Store
 * Information settings in `stockpilot/settings.js`.
 */
import { DEFAULT_STORE_SETTINGS, STORE_DEFAULT_LOGO, readStoreSettings } from "../../stockpilot/settings";

/** Live store identity, kept in sync with the centralized store settings. */
export const PHARMACY = {
  name: "",
  businessName: "",
  branchName: "",
  branchCode: "",
  address: "",
  phone: "",
  email: "",
  tin: "",
  ownerName: "",
  authorizedRep: "",
  businessRegNumber: "",
  dtiSecRegNumber: "",
  birRegNumber: "",
  tagline: "",
  receiptFooter: "",
  website: "",
  facebook: "",
  logoUrl: ""
};

/** Cashier name shown on receipts and held-sale records. */
export let CASHIER = "JUAN DELA CRUZ";

/** Override the cashier name with the signed-in PosPilot user. */
export function setCashierName(name) {
  const n = String(name || '').trim();
  if (n) CASHIER = n;
}

/** Format a raw TIN into a receipt-friendly line (avoid a doubled "TIN:" prefix). */
function formatTin(raw) {
  const tin = String(raw || '').trim();
  if (!tin) return '';
  return tin.toUpperCase().startsWith("TIN") ? tin.toUpperCase() : "TIN: " + tin;
}

/** Sync the pharmacy identity from the centralized store settings. */
export function setStoreIdentity(settings = {}) {
  const s = { ...DEFAULT_STORE_SETTINGS, ...(settings || {}) };
  PHARMACY.name = String(s.storeName || DEFAULT_STORE_SETTINGS.storeName).trim().toUpperCase() || PHARMACY.name;
  PHARMACY.businessName = String(s.businessName || "").trim();
  PHARMACY.branchName = String(s.branchName || "").trim();
  PHARMACY.branchCode = String(s.branchCode || "").trim();
  PHARMACY.address = String(s.address || "").trim();
  PHARMACY.phone = String(s.phone || "").trim();
  PHARMACY.email = String(s.email || "").trim();
  PHARMACY.tin = formatTin(s.tinNumber);
  PHARMACY.ownerName = String(s.ownerName || "").trim();
  PHARMACY.authorizedRep = String(s.authorizedRep || "").trim();
  PHARMACY.businessRegNumber = String(s.businessRegNumber || "").trim();
  PHARMACY.dtiSecRegNumber = String(s.dtiSecRegNumber || "").trim();
  PHARMACY.birRegNumber = String(s.birRegNumber || "").trim();
  PHARMACY.tagline = String(s.tagline || "").trim();
  PHARMACY.receiptFooter = String(s.receiptFooter || "").trim();
  PHARMACY.website = String(s.website || "").trim();
  PHARMACY.facebook = String(s.facebook || "").trim();
  PHARMACY.logoUrl = String(s.logoUrl || "").trim();
}

/** Resolve the current store logo (custom → default fallback). */
export function getStoreLogo() {
  return PHARMACY.logoUrl || STORE_DEFAULT_LOGO;
}

/** The system default logo asset. */
export const STORE_LOGO = STORE_DEFAULT_LOGO;

/** Retrieve a snapshot of the live store identity. */
export function getStoreIdentity() {
  return { ...PHARMACY };
}

// Apply any already-saved settings immediately so the POS boots branded.
setStoreIdentity(readStoreSettings());

/** Counter number shown in the header; matches the design's "Counter 2". */
export const COUNTER = "2";

export const VAT_RATE = 0.12;