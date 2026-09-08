/**
 * App.jsx
 * --------------------------------------------------------------------------
 * Root component. Composes the cashier screen frame — header bar, workspace
 * (search + transaction table) and right-side panel (customer, quick actions,
 * summary, pay) — mounts the global keyboard shortcut handler, and renders the
 * overlay surfaces (Toast + Dialog host).
 */
import React, { useEffect, useRef, useState } from "react";
import { PosProvider, usePos } from "./context/PosContext";
import { BOTTOM_FUNCTION_BUTTONS } from "./data/functionButtons";
import { formatInvoiceNo } from "./utils/calculations";
import { setInvoiceCounter } from "./utils/receiptPrint";
import PosHeader from "./components/PosHeader.jsx";
import PosWorkspace from "./components/PosWorkspace.jsx";
import SidePanels from "./components/SidePanels.jsx";
import Toast from "./components/Toast.jsx";
import DialogHost from "./components/dialogs/DialogHost.jsx";
import RegisterGate from "./components/RegisterGate.jsx";
import { setStoreIdentity, setCashierName } from "./data/storeConfig";
import { DEFAULT_SETTINGS, readStoreSettings, saveStoreSettings } from "../stockpilot/settings";
import { api } from "../api";
import "./styles.css";

/* ------------------------------------------------------------------ */
/*  Keyboard shortcuts — ported from the vanilla handleGlobalKeydown() */
/* ------------------------------------------------------------------ */

const KEY_ACTIONS = {
  F1: "search",
  F2: "productSearch",
  F3: "quantity",
  F4: "customer",
  F5: "discount",
  F6: "hold",
  F7: "recall",
  F10: "more"               // F10 More
};

// Every button instance gets a unique id. The Quick Actions tiles (and the
// Pay button) use the `bottom` panel prefix so keyboard shortcuts flash the
// matching tile — `bottom-<key>` = `bottom-F2`, `bottom-DEL`, `bottom-pay`, …
function flashIdFor(def) {
  return `bottom-${def.key}`;
}

function findFlashIdForAction(action) {
  // The Quick Actions grid is the visible button surface; several actions also
  // exist in the More pop-dialog but the flash lands on the tile the cashier
  // watches.
  const def = BOTTOM_FUNCTION_BUTTONS.find((d) => d.action === action);
  return def ? flashIdFor(def) : null;
}

function useKeyboardShortcuts() {
  // Keep a live ref so the single listener always sees fresh state/actions.
  const { state, actions, dispatchAction } = usePos();
  const ref = useRef({ state, actions, dispatchAction });
  ref.current = { state, actions, dispatchAction };

  useEffect(() => {
    function handle(e) {
      const { state, actions, dispatchAction } = ref.current;

      // Ctrl+Q (or Cmd+Q) → quit the app. The frameless window has no close
      // button, so this (or Alt+F4) is the way out. Checked before the dialog
      // guard so it always works.
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "q" || e.key === "Q") &&
        typeof window.desktop?.quit === "function"
      ) {
        e.preventDefault();
        window.desktop.quit();
        return;
      }

      // While a dialog is open, global function-key shortcuts are disabled —
      // the open dialog owns the keyboard (Escape/Enter are handled by the
      // Dialog component itself). This stops e.g. F3 (Quantity) or F8 (Pay)
      // from firing/replacing the current dialog mid-interaction.
      if (state.dialog) return;

      // F11 starts a new transaction only from Ready mode. Never replace or
      // interrupt an active or paused transaction with a new one.
      const isF11 = e.key === "F11" || e.code === "F11";
      if (isF11) {
        e.preventDefault();
        if (state.standby && !state.paused) {
          actions.startTransaction();
          actions.showToast("New transaction started", false, "success");
        }
        return;
      }

      // F12 is a direct pause/resume toggle. Check both values because the
      // browser and Electron can expose function keys through either field.
      const isF12 = e.key === "F12" || e.code === "F12";
      if (isF12) {
        e.preventDefault();
        if (state.paused) {
          actions.resumeTransaction();
          actions.showToast("Transaction resumed", false, "success");
        } else if (!state.standby) {
          dispatchAction("pause");
        }
        return;
      }

      // Ready / Paused Mode: no active transaction to act on, so all transaction
      // shortcuts (F1..F10, Delete, arrows) are inert. The New Transaction /
      // Resume Transaction button in the workspace is the only action surface.
      if (state.standby || state.paused) return;

      const isSearchActive =
        e.target && e.target.id === "product-search-input";
      const isDialogInput =
        e.target && e.target.tagName === "INPUT" && !!e.target.closest(".dialog");

      // Ctrl+K → focus the search input (same as the More dialog's
      // Keyboard Shortcuts entry).
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        const el = document.getElementById("product-search-input");
        if (el) {
          el.focus();
          el.select();
        }
        return;
      }

      // Ctrl+H → open About/Help.
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        (e.key === "h" || e.key === "H")
      ) {
        e.preventDefault();
        const id = findFlashIdForAction("about");
        if (id) actions.pressButton(id);
        dispatchAction("about");
        return;
      }

      // Ctrl+Alt+C → open Cancel Transaction confirmation.
      if (
        (e.ctrlKey || e.metaKey) &&
        e.altKey &&
        (e.key === "c" || e.key === "C")
      ) {
        e.preventDefault();
        const id = findFlashIdForAction("cancelTransaction");
        if (id) actions.pressButton(id);
        dispatchAction("cancelTransaction");
        return;
      }

      // Trigger Function buttons by key cap (F1..F7, F10).
      if (KEY_ACTIONS[e.key]) {
        e.preventDefault();
        const action = KEY_ACTIONS[e.key];
        const id = findFlashIdForAction(action);
        if (id) actions.pressButton(id);
        dispatchAction(action);
        return;
      }

      // F9 → Cancel Transaction (the Cancel button in the sidebar).
      if (e.key === "F9") {
        e.preventDefault();
        actions.pressButton("cancel");
        dispatchAction("cancelTransaction");
        return;
      }

      // F8 → Pay Amount Due (the Pay button in the sidebar).
      if (e.key === "F8") {
        e.preventDefault();
        actions.pressButton("pay");
        dispatchAction("payment");
        return;
      }

      // Delete key → Remove Item (void the selected cart line). Works even
      // while the search box is focused, since that box is auto-focused at
      // startup and is normally empty — this is the cashier's expected path.
      if (!isDialogInput && e.key === "Delete") {
        e.preventDefault();
        dispatchAction("void");
        return;
      }

      // 'D' key → Remove Item, but only when not typing (a letter used in text).
      if (!isSearchActive && !isDialogInput && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        dispatchAction("void");
        return;
      }

      // Arrow up/down navigates the cart (also while the search box has focus).
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (state.cart.length === 0) return;
        if (isDialogInput) return; // number inputs keep default arrow behaviour

        let idx;
        if (state.selectedIndex === null) {
          idx = 0;
        } else if (e.key === "ArrowDown") {
          idx = state.selectedIndex + 1;
          if (idx >= state.cart.length) idx = 0;
        } else {
          idx = state.selectedIndex - 1;
          if (idx < 0) idx = state.cart.length - 1;
        }
        actions.selectLine(idx);
        e.preventDefault();
      }
    }

    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);
}

/* ------------------------- Barcode capture hook -------------------------- */

// Barcode scanners type very fast (each key < ~40ms apart) then press Enter.
// This hook watches EVERY keydown in the capture phase and detects that burst,
// regardless of which element currently has focus — so a scan while the cashier
// is looking at a button, the cart table, or even a Quantity dialog input never
// "types into" the wrong control. It only swallows once a burst is CONFIDENTLY
// a scan (>= SCANNER_MIN_CHARS fast), so single human keystrokes ("1", "2",
// "d" for void…) still work normally at typical typing speed.
const SCANNER_KEY_MAX_GAP_MS = 40;
const SCANNER_MIN_CHARS = 3;

function useBarcodeCapture() {
  const { state, actions } = usePos();
  const ref = useRef({ state, actions });
  ref.current = { state, actions };

  useEffect(() => {
    let buffer = "";
    let lastTs = 0;
    let timer = null;

    const commit = () => {
      const q = buffer.trim();
      buffer = "";
      if (timer) { clearTimeout(timer); timer = null; }
      if (!q) return;

      // Route the scan into the barcode field path: set the value, then
      // trigger the same Enter-handler flow that resolves barcode/SKU.
      const input = document.getElementById("product-search-input");
      if (input) input.focus();
      ref.current.actions.setSearchQuery(q);
      // Give the controlled input a beat to adopt the value, then commit.
      setTimeout(() => {
        const el = document.getElementById("product-search-input");
        if (el) {
          el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        }
      }, 0);
    };

    const reset = () => {
      buffer = "";
      if (timer) { clearTimeout(timer); timer = null; }
    };

    const handle = (e) => {
      // Dialogs own the keyboard. Do not capture scanner keystrokes or close
      // the dialog when a cashier scans while a modal is open.
      if (ref.current.state.dialog) { reset(); return; }

      // Never capture while a modifier combo is held (Ctrl/Alt) — those are
      // app shortcuts (Ctrl+K focus, Ctrl+Alt+C cancel, Ctrl+Q quit, …).
      if (e.ctrlKey || e.metaKey || e.altKey) { reset(); return; }

      // The barcode field itself handles its own typing — never double-fire.
      if (e.target && e.target.id === "product-search-input") { reset(); return; }

      const isPrint = e.key && e.key.length === 1;

      if (e.key === "Enter") {
        // A scanner burst ends with Enter → commit it as a scan.
        if (buffer.length >= SCANNER_MIN_CHARS) {
          e.preventDefault();
          e.stopPropagation();
          commit();
        }
        // Otherwise Enter passes through (buttons, qty dialogs, etc.).
        return;
      }

      if (e.key === "Escape") { reset(); return; }
      if (!isPrint) { reset(); return; }

      const now = Date.now();
      // If this printable key isn't part of a fast burst, restart tracking.
      if (!buffer || now - lastTs > SCANNER_KEY_MAX_GAP_MS) {
        buffer = "";
      }
      buffer += e.key;
      lastTs = now;

      // Only once the burst is CONFIDENTLY a scan (>= SCANNER_MIN_CHARS fast
      // chars) do we swallow the keystrokes. Single/gradual keys still pass
      // through untouched, so "d" (void), "1" (qty), etc. keep working.
      if (buffer.length >= SCANNER_MIN_CHARS) {
        // Swallow chars that were already about to be typed into the focused
        // control (e.g. a Quantity input) BEFORE they pollute it.
        e.preventDefault();
        e.stopPropagation();
      }

      // Wrap the burst after a short pause so a lone fragment doesn't hang.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { buffer = ""; }, SCANNER_KEY_MAX_GAP_MS * 6);
    };

    document.addEventListener("keydown", handle, true); // capture phase
    return () => {
      document.removeEventListener("keydown", handle, true);
      if (timer) clearTimeout(timer);
    };
  }, []);
}

function PosApp() {
  useKeyboardShortcuts();
  useBarcodeCapture();
  const { state, dispatchAction } = usePos();
  const localOnly = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const networkStatus = localOnly ? "Offline · Local only" : "Lan connected";
  // The footer's transaction number follows the ACTIVE transaction. After a
  // recalled sale, `saleNumber` was restored to the held sale's own invoice
  // number by the reducer — so this shows SI-000003, not the advanced counter.
  const saleNo = formatInvoiceNo(state.saleNumber || 1);

  // Register gate: until a cashier opens a session with an opening float, the
  // terminal is locked — no selling, no payment, nothing behind the gate.
  if (!state.session || state.session.status !== "Open") {
    return (
      <div className="pos-shell">
        <div className="pos-frame pos-frame--gate">
          <PosHeader />
          <RegisterGate />
          <footer className="pos-footer pos-footer--gate">
            <span className={localOnly ? "pos-footer__offline" : "pos-footer__online"}>
              {networkStatus}
            </span>
            <span>Register Locked</span>
          </footer>
        </div>
        <Toast />
        <DialogHost />
      </div>
    );
  }

  return (
    <>
      <div className="pos-shell">
        <div className="pos-frame">
          <PosHeader />

          <div className="pos-main">
            <PosWorkspace />
            <SidePanels />
          </div>

          <footer className="pos-footer">
            <span>
              Terminal: {state.session.terminal || "POS-02"} ·{" "}
              {state.session.status === "Open" ? (
                <span className="pos-footer__open">Session {state.session.sessionRef}</span>
              ) : (
                "Register Closed"
              )}
              <span className={localOnly ? "pos-footer__offline" : "pos-footer__online"}>
                {" · " + networkStatus}
              </span>
            </span>
            <span>
              {state.standby
                ? "Transaction: Ready"
                : state.paused
                  ? "Transaction: Paused"
                  : "Transaction #" + saleNo}
            </span>
          </footer>
        </div>

        {/* Overlay surfaces */}
        <Toast />
        <DialogHost />
      </div>
    </>
  );
}

export default function CashierPOS({ loggedInUser, loggedInRole, sessionToken, onLogout }) {
  const local = readStoreSettings();
  const terminal = String(local.terminalName || "POS-02").trim() || "POS-02";
  const runtime = { sessionToken, cashierName: loggedInUser, onLogout, terminal, role: loggedInRole };
  const [saleNumber, setSaleNumber] = useState(1);

  // Sync the pharmacy / cashier identity used by receipts and the header with
  // the signed-in PosPilot session and store settings.
  useEffect(() => {
    document.body.classList.add("cashierpos-body");
    return () => document.body.classList.remove("cashierpos-body");
  }, []);

  // Boot the till from the LIVE database:
  //   1. store settings (name/address/TIN/footer) → receipts + header,
  //   2. last sale in the DB → the next transaction / invoice number.
  useEffect(() => {
    setCashierName(loggedInUser);
    let active = true;
    const local = readStoreSettings();
    if (sessionToken) {
      api
        .getSettings(sessionToken)
        .then((dbSettings) => {
          if (!active) return;
          setStoreIdentity(dbSettings || {});
          saveStoreSettings({ ...DEFAULT_SETTINGS, ...(dbSettings || {}) });
        })
        .catch(() => {
          if (active) setStoreIdentity(local);
        });
      api
        .getSalesNextNumber(sessionToken)
        .then((res) => {
            if (active && res && Number(res.next) > 0) {
            setSaleNumber(Number(res.next));
            setInvoiceCounter(Number(res.next));
          }
        })
        .catch(() => {});
    } else {
      setStoreIdentity(local);
    }

    return () => {
      active = false;
    };
  }, [sessionToken, loggedInUser]);

  // Keep applying store settings when the Settings page updates them.
  useEffect(() => {
    const refresh = () => {
      const db = readStoreSettings();
      setStoreIdentity(db);
    };
    window.addEventListener("pospilot-settings-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("pospilot-settings-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Push the DB-derived counter into the reducer even after the provider has
  // already mounted. The lazy initializer only runs on first mount, so this
  // dispatch is what actually applies the fetched number to the live state.
  function SaleNumberSeeder() {
    const { actions } = usePos();
    useEffect(() => {
      if (Number(saleNumber) > 0) actions.setSaleNumber(saleNumber);
    }, [saleNumber]);
    return null;
  }

  // Load the active (Open) cashier session for this terminal. If the register
  // is already open (e.g. the app was restarted mid-shift), selling resumes.
  function CashierSessionSeeder() {
    const { actions } = usePos();
    useEffect(() => {
      if (!sessionToken) return undefined;
      let active = true;
      api
        .getCurrentCashierSession(terminal, sessionToken)
        .then((res) => {
          if (active && res && res.session) actions.setSession(res.session);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [sessionToken, terminal]);
    return null;
  }

  return (
    <PosProvider runtime={runtime} initialSaleNumber={saleNumber}>
      <SaleNumberSeeder />
      <CashierSessionSeeder />
      <PosApp />
    </PosProvider>
  );
}