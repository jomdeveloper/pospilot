import { useEffect, useState } from "react";
// Central default logo — used whenever no custom store logo has been uploaded.
import defaultStoreLogo from "../cashierpos/assets/logo.png";

export const SETTINGS_STORAGE_KEY = "pospilot.settings";

/**
 * Single source of truth for store information.
 * Every screen (login, splash, cashier POS, receipts, StockPilot sidebar, …)
 * reads from here — no separate hard-coded store names/addresses/TINs/logo.
 */
export const DEFAULT_STORE_SETTINGS = {
  storeName: "St. Isidore's Pharmacy",
  logoUrl: "",
  address: "",
  phone: "",
  email: "",
  tinNumber: "",
  ownerName: "",
  businessName: "",
  branchName: "",
  branchCode: "",
  businessRegNumber: "",
  dtiSecRegNumber: "",
  birRegNumber: "",
  website: "",
  facebook: "",
  tagline: "",
  authorizedRep: "",
  cashierManagerContact: "",
  receiptFooter: "Thank you for shopping with us.",
  taxRate: "0",
  defaultLocation: "Main Store",
  lowStockThreshold: "10",
  terminalName: "POS-02",
  priceOverrideMaxPct: "50",
  backupDir: "",
  idleTimeoutMinutes: "0",
  launchOnStartup: "false",
};

/** Back-compat alias so existing importers keep working unchanged. */
export const DEFAULT_SETTINGS = DEFAULT_STORE_SETTINGS;

/** The system default logo when no custom logo is uploaded. */
export const STORE_DEFAULT_LOGO = defaultStoreLogo;

/** Resolve the active store logo (custom → default fallback). */
export function getStoreLogo(settings) {
  const candidate = settings && settings.logoUrl;
  return candidate && String(candidate).trim() ? String(candidate).trim() : STORE_DEFAULT_LOGO;
}

export function readStoreSettings() {
  if (typeof window === "undefined") return { ...DEFAULT_STORE_SETTINGS };
  try {
    return { ...DEFAULT_STORE_SETTINGS, ...JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}") };
  } catch (_error) {
    return { ...DEFAULT_STORE_SETTINGS };
  }
}

export function saveStoreSettings(settings) {
  const merged = { ...DEFAULT_STORE_SETTINGS, ...(settings || {}) };
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new Event("pospilot-settings-changed"));
  return merged;
}

/**
 * Reactive store-settings hook. Re-renders whenever settings are saved
 * (localStorage write, "storage" event from another tab, or server sync).
 */
export function useStoreSettings() {
  const [settings, setSettings] = useState(readStoreSettings);
  useEffect(() => {
    const refresh = () => setSettings(readStoreSettings());
    window.addEventListener("pospilot-settings-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("pospilot-settings-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return settings;
}
