/**
 * PosContext.jsx
 * --------------------------------------------------------------------------
 * React context + provider that exposes the POS state, derived totals and the
 * action dispatcher to the whole tree. Ports the "dispatchAction" switch from
 * the vanilla `app.js` into one place.
 */
import React, { createContext, useContext, useMemo, useReducer, useEffect, useRef } from "react";
import { createInitialState, posReducer } from "./posReducer";
import { formatInvoiceNo, lineNet, recomputeTotals } from "../utils/calculations";
import { api } from "../../api";

const STORAGE_KEY = "cashierpos-held-sales-v1";

function readPersistedState() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const heldSales = Array.isArray(parsed.heldSales) ? parsed.heldSales : [];
    const saleNumber = Number(parsed.saleNumber);

    return {
      heldSales,
      saleNumber: Number.isFinite(saleNumber) && saleNumber > 0 ? saleNumber : 1,
    };
  } catch (_error) {
    return null;
  }
}

function persistState(state) {
  if (typeof window === "undefined") return;

  try {
    const payload = {
      saleNumber: Number(state.saleNumber) || 1,
      heldSales: Array.isArray(state.heldSales) ? state.heldSales : [],
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_error) {
    // Ignore storage failures so the POS still works in restricted environments.
  }
}

const PosContext = createContext(null);

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) {
    throw new Error("usePos must be used inside a <PosProvider>");
  }
  return ctx;
}

export function PosProvider({ children, runtime = null, initialSaleNumber = 1 }) {
  const persisted = useMemo(() => readPersistedState(), []);
  const [state, dispatch] = useReducer(posReducer, undefined, () => {
    const base = createInitialState(initialSaleNumber);
    if (!persisted) return base;

    return {
      ...base,
      heldSales: Array.isArray(persisted.heldSales) ? persisted.heldSales : [],
      // Invoice numbering is database-owned. Browser storage may retain an
      // old counter after the database is reset, so it must never override the
      // live seed supplied by the server.
      saleNumber: base.saleNumber,
    };
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    persistState(state);
  }, [state.heldSales, state.saleNumber]);

  useEffect(() => {
    if (!runtime?.sessionToken) return undefined;

    let active = true;
    api.getPendingSales(runtime.sessionToken)
      .then((response) => {
        if (!active) return;
        const rows = Array.isArray(response?.pendingSales) ? response.pendingSales : [];
        const activeRows = rows
          .filter((sale) => sale && sale.status !== "recalled" && sale.status !== "completed")
          .map((sale) => ({
            id: sale.id,
            invoiceNo: `PS-${String(sale.id).padStart(6, "0")}`,
            cashier: sale.recalledByUsername || runtime.cashierName || "Cashier",
            lines: Array.isArray(sale.payload?.cart) ? sale.payload.cart.map((line) => ({
              id: line.id || `${sale.id}-${line.productId || line.id || Math.random()}`,
              qty: Number(line.qty) || 1,
              price: Number(line.price) || 0,
              name: line.name || `Item ${line.productId || ""}`,
              sku: line.sku || line.barcode || "",
              barcode: line.barcode || "",
              productId: line.productId || line.id || null,
              customerType: sale.customerType || "walkin",
              customer: sale.customerName || "Walk-in",
              taxType: String(line.taxType || line.tax_type || "VATABLE").toUpperCase(),
              seniorDiscountEligible: Boolean(line.seniorDiscountEligible),
              pwdDiscountEligible: Boolean(line.pwdDiscountEligible),
            })) : [],
            customer: sale.customerName || "Walk-in",
            customerType: sale.customerType || "walkin",
            customerId: sale.memberId || "",
            amountDue: Number(sale.payload?.total || 0),
            heldAt: sale.createdAt || new Date().toISOString(),
          }));

        // The server is authoritative after login. Replace localStorage even
        // when there are no active rows, otherwise recalled/cancelled holds
        // remain visible from the previous browser session.
        dispatch({ type: "LOAD_HELD_SALES", sales: activeRows });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [runtime?.sessionToken, runtime?.cashierName]);

  // Derived money summary — recomputed whenever the cart changes.
  const summary = useMemo(
    () => recomputeTotals({ cart: state.cart, customerType: state.customerType }),
    [state.cart, state.customerType]
  );

  // Stable dispatch wrappers (created once).
  const actions = useMemo(
    () => ({
      selectLine: (index) => dispatch({ type: "SELECT_LINE", index }),
      addProduct: (product, qty) => dispatch({ type: "ADD_PRODUCT", product, qty }),
      changeQty: (lineId, delta) => dispatch({ type: "CHANGE_QTY", lineId, delta }),
      setQty: (lineId, qty) => dispatch({ type: "SET_QTY", lineId, qty }),
      setDiscount: (lineId, percent) => dispatch({ type: "SET_DISCOUNT", lineId, percent }),
      voidLine: (lineId) => dispatch({ type: "VOID_LINE", lineId }),
      clearCart: () => dispatch({ type: "CLEAR_CART" }),
      cancelTransaction: () => {
        const currentPendingSaleId = stateRef.current.pendingSaleId;
        if (runtime?.sessionToken && currentPendingSaleId) {
          api.cancelPendingSale(currentPendingSaleId, runtime.sessionToken).catch(() => {});
        }
        dispatch({
          type: "CANCEL_TRANSACTION",
          openRecall: stateRef.current.heldSales.length > 0
        });
      },
      setSession: (session) => dispatch({ type: "SET_SESSION", session }),
      startTransaction: () => dispatch({ type: "START_TRANSACTION" }),
      pauseTransaction: () => dispatch({ type: "PAUSE_TRANSACTION" }),
      resumeTransaction: () => dispatch({ type: "RESUME_TRANSACTION" }),
      setCustomer: (payload) => dispatch({ type: "SET_CUSTOMER", ...payload }),
      setSearchQuery: (query) => dispatch({ type: "SET_SEARCH_QUERY", query }),
      openDialog: (dialog) => dispatch({ type: "OPEN_DIALOG", dialog }),
      closeDialog: () => dispatch({ type: "CLOSE_DIALOG" }),
      showToast: (message, persist = false, kind = null) =>
        dispatch({ type: "SHOW_TOAST", message, persist, kind }),
      hideToast: () => dispatch({ type: "HIDE_TOAST" }),
      recallSale: (index) => {
        const target = stateRef.current.heldSales[index];
        if (target && runtime?.sessionToken && target.id) {
          api.recallPendingSale(target.id, runtime.sessionToken).catch(() => {
            dispatch({ type: "RESTORE_HELD_SALE", sale: target, index });
          });
        }
        dispatch({ type: "RECALL_SALE", index });
      },
      pressButton: (id) => dispatch({ type: "PRESS_BUTTON", id }),
      clearPress: () => dispatch({ type: "CLEAR_PRESS" }),
      clearFlash: () => dispatch({ type: "CLEAR_FLASH" }),
      setSaleNumber: (number) => dispatch({ type: "SET_SALE_NUMBER", number })
    }),
    [runtime?.sessionToken]
  );

  const currentLine =
    state.selectedIndex === null ? null : state.cart[state.selectedIndex] || null;

  /** Focus + select the product search input. */
  function focusSearchInput() {
    const el = document.getElementById("product-search-input");
    if (el) {
      el.focus();
      el.select();
    }
  }

  /** Guard used by dialogs that act on the current cart line. */
  function ensureLine(actionName) {
    if (!currentLine) {
      actions.showToast("Select an item first (" + actionName + ")", false, "error");
      return null;
    }
    return currentLine;
  }

  function holdSale() {
    if (state.cart.length === 0) {
      actions.showToast("Nothing to hold", false, "hold");
      return;
    }

    const summary = recomputeTotals({ cart: state.cart, customerType: state.customerType });
    const payload = {
      cart: state.cart.map((line) => ({
        id: line.id,
        productId: line.productId || line.id,
        sku: line.sku || "",
        barcode: line.barcode || "",
        name: line.name,
        qty: line.qty,
        price: line.price,
        seniorDiscountEligible: line.seniorDiscountEligible,
        pwdDiscountEligible: line.pwdDiscountEligible,
      })),
      discountPct: summary.discountPct || 0,
      subtotal: summary.subtotal || 0,
      vat: summary.vat || 0,
      total: summary.amountDue || 0,
      customerType: state.customerType || "walkin",
      customerName: state.customer || "Walk-in Customer",
      memberId: state.customerId || null,
    };

    const requestPromise = runtime?.sessionToken
      ? api.createPendingSale({
          cashierSessionId: state.session?.id || null,
          customerName: payload.customerName,
          customerType: payload.customerType,
          memberId: payload.memberId,
          payload,
        }, runtime.sessionToken)
      : Promise.resolve(null);

    requestPromise
      .then((response) => {
        const created = response?.pendingSale;
        if (created) {
          dispatch({
            type: "HOLD_SALE",
            extra: {
              id: created.id,
              customer: created.customerName,
              customerType: created.customerType,
              customerId: created.memberId || "",
              invoiceNo: `PS-${String(created.id).padStart(6, "0")}`,
              cashier: runtime?.cashierName || "Cashier",
              heldAt: created.createdAt || new Date().toLocaleTimeString(),
              amountDue: payload.total,
              pendingSaleId: created.id,
              lines: state.cart.map((line) => ({ ...line })),
            },
          });
        } else {
          dispatch({ type: "HOLD_SALE" });
        }
        actions.showToast("Sale held (" + formatInvoiceNo(state.saleNumber) + ")", false, "hold");
      })
      .catch(() => {
        dispatch({ type: "HOLD_SALE" });
        actions.showToast("Sale held locally", false, "hold");
      });
  }

  /**
   * Central action map — the React equivalent of the vanilla `dispatchAction()`.
   * @param {string} action identifier from src/data/functionButtons.js
   */
  function dispatchAction(action) {
    switch (action) {
      case "search":
        focusSearchInput();
        break;

      case "productSearch":
        actions.openDialog({ type: "productSearch" });
        break;

      case "customer":
        actions.openDialog({ type: "customer" });
        break;

      case "quantity": {
        const line = ensureLine("Quantity");
        if (line) {
          actions.openDialog({
            type: "quantity",
            lineId: line.id,
            name: line.name,
            qty: line.qty
          });
        }
        break;
      }

      case "discount": {
        const line = ensureLine("Discount");
        if (line) {
          actions.openDialog({
            type: "discount",
            lineId: line.id,
            name: line.name,
            discountPct: line.discountPct
          });
        }
        break;
      }

      case "void": {
        const line = ensureLine("Remove Item");
        if (line) {
          actions.openDialog({
            type: "void",
            lineId: line.id,
            name: line.name,
            qty: line.qty,
            price: line.price,
            total: lineNet(line)
          });
        }
        break;
      }

      case "priceCheck":
        actions.openDialog({ type: "priceCheck" });
        break;

      case "hold":
        holdSale();
        break;

      case "pause":
        actions.setSearchQuery("");
        actions.pauseTransaction();
        actions.showToast("Transaction paused", false, "hold");
        break;

      case "recall":
        if (state.heldSales.length === 0) actions.showToast("No held sales", false, "recall");
        else actions.openDialog({ type: "recall" });
        break;

      case "payment":
      case "paymentCash":
        if (state.cart.length === 0) actions.showToast("No items to tender", false, "error");
        else actions.openDialog({ type: "payment", method: "cash" });
        break;

      case "cancelTransaction":
        if (state.cart.length === 0) actions.showToast("No transaction to cancel", false, "cancel");
        else actions.openDialog({ type: "cancelTransaction" });
        break;

      case "paymentCard":
        if (state.cart.length === 0) actions.showToast("No items to tender", false, "error");
        else actions.openDialog({ type: "payment", method: "card" });
        break;

      case "more":
        actions.openDialog({ type: "more" });
        break;

      case "openRegister":
        actions.openDialog({ type: "openRegister" });
        break;

      case "closeRegister":
        if (!state.session) {
          actions.showToast("The register is not open", false, "error");
          return;
        }
        actions.openDialog({ type: "closeRegister" });
        break;

      case "cashIn":
        if (!state.session) {
          actions.showToast("Open the register first", false, "error");
          return;
        }
        actions.openDialog({ type: "cashIn" });
        break;

      case "cashOut":
        if (!state.session) {
          actions.showToast("Open the register first", false, "error");
          return;
        }
        actions.openDialog({ type: "cashOut" });
        break;

      case "cashDrop":
        actions.openDialog({ type: "cashDrop" });
        break;

      case "about":
        actions.openDialog({ type: "about" });
        break;

      case "printerSettings":
        actions.openDialog({ type: "printerSettings" });
        break;

      case "registerActions":
        actions.openDialog({ type: "registerActions" });
        break;

      default:
        actions.showToast("Action: " + action, false, "more");
    }
  }

  const value = useMemo(
    () => ({ state, summary, actions, dispatchAction, runtime }),
    [state, summary, actions, runtime]
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}