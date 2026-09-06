/**
 * PosContext.jsx
 * --------------------------------------------------------------------------
 * React context + provider that exposes the POS state, derived totals and the
 * action dispatcher to the whole tree. Ports the "dispatchAction" switch from
 * the vanilla `app.js` into one place.
 */
import React, { createContext, useContext, useMemo, useReducer } from "react";
import { createInitialState, posReducer } from "./posReducer";
import { formatInvoiceNo, recomputeTotals } from "../utils/calculations";

const PosContext = createContext(null);

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) {
    throw new Error("usePos must be used inside a <PosProvider>");
  }
  return ctx;
}

export function PosProvider({ children, runtime = null, initialSaleNumber = 1 }) {
  const [state, dispatch] = useReducer(posReducer, undefined, () =>
    createInitialState(initialSaleNumber)
  );

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
      recallSale: (index) => dispatch({ type: "RECALL_SALE", index }),
      pressButton: (id) => dispatch({ type: "PRESS_BUTTON", id }),
      clearPress: () => dispatch({ type: "CLEAR_PRESS" }),
      clearFlash: () => dispatch({ type: "CLEAR_FLASH" }),
      setSaleNumber: (number) => dispatch({ type: "SET_SALE_NUMBER", number })
    }),
    []
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
    dispatch({ type: "HOLD_SALE" });
    actions.showToast("Sale held (" + formatInvoiceNo(state.saleNumber) + ")", false, "hold");
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
            qty: line.qty
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