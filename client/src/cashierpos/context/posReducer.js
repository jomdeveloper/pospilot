/**
 * posReducer.js
 * --------------------------------------------------------------------------
 * Central application state for the POS, ported from the vanilla `state.js` +
 * the mutation helpers in `app.js` into a single React reducer.
 *
 * Everything that mutates the app is an action here; derived money values
 * (subtotal, discount, amountDue...) are NOT stored — they are recomputed by
 * `recomputeTotals` in the provider via `useMemo` (see PosContext.jsx).
 */
import { CASHIER } from "../data/storeConfig";
import { formatInvoiceNo, invoiceNoToNumber, recomputeTotals } from "../utils/calculations";

/* Unique sequence for toast ids — each toast gets its own id so the Toast
   component can key its hide timer by it (guarantees auto-hide even when the
   same message is shown repeatedly). */
let toastSeq = 0;

export function createInitialState(initialSaleNumber = 1) {
  const start =
    Number(initialSaleNumber) && Number(initialSaleNumber) > 0
      ? Math.floor(Number(initialSaleNumber))
      : 1;
  return {
    // App boots into Ready Mode — no active transaction. The cashier taps
    // "New Transaction" to begin a sale (the old seeded cart is gone).
    cart: [],
    selectedIndex: null,
    customer: null,
    /** Customer type: "walkin" (default) | "member" | "senior" | "pwd". */
    customerType: "walkin",
    /** Discount id (Senior / PWD / Member) — blank for walk-in. */
    customerId: "",
    nextLineId: 1,
    /** Sequential sale number shown in the footer (SI-000001, ...) — seeded
        from the last sale in the database. */
    saleNumber: start,
    /** True = ready (no transaction in progress). */
    standby: true,
    /** True = a transaction exists but is paused (cart is preserved). */
    paused: false,
    /** Active CashierSession record for this register (null when no open
        session — the register gate blocks selling until one is opened). */
    session: null,
    searchQuery: "",
    heldSales: [],
    pendingSaleId: null,
    dialog: null,
    toast: null,
    /** line id currently animating the `.is-flash` highlight */
    flashLineId: null,
    /** unique id of the button currently showing the `.is-pressed` flash */
    pressedButton: null
  };
}

export function posReducer(state, action) {
  switch (action.type) {
    case "SELECT_LINE":
      return { ...state, selectedIndex: action.index };

    case "SET_SALE_NUMBER":
      return {
        ...state,
        saleNumber: Math.max(1, Math.floor(Number(action.number)) || 1),
      };

    case "LOAD_HELD_SALES":
      return {
        ...state,
        heldSales: Array.isArray(action.sales) ? action.sales : [],
      };

    case "SET_SESSION":
      return { ...state, session: action.session }; // null = register closed

    case "START_TRANSACTION":
      // Leave Ready Mode → an active, blank transaction begins.
      return { ...state, standby: false, paused: false };

    case "PAUSE_TRANSACTION":
      // Pause the current transaction — everything stays (cart, customer,
      // totals); the workspace just switches to the Resume view.
      return { ...state, paused: true };

    case "RESUME_TRANSACTION":
      // Pick the paused transaction back up exactly where it left off.
      return { ...state, paused: false };

    case "ADD_PRODUCT": {
      const product = action.product;
      const qty = action.qty || 1;
      if (!product) return state;

      const existing = state.cart.find((l) => l.sku === product.sku);
      if (existing) {
        return {
          ...state,
          cart: state.cart.map((l) =>
            l.sku === product.sku ? { ...l, qty: l.qty + qty } : l
          ),
          selectedIndex: state.cart.indexOf(existing),
          flashLineId: existing.id
        };
      }

      const line = {
        id: state.nextLineId,
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        price: product.price,
        qty,
        discountPct: 0,
        productId: product.productId || product.id || null,
        generic: product.generic || "",
        category: product.category || "",
        seniorDiscountEligible: Boolean(product.seniorDiscountEligible),
        pwdDiscountEligible: Boolean(product.pwdDiscountEligible)
      };
      return {
        ...state,
        cart: [line, ...state.cart], // newest on top
        nextLineId: state.nextLineId + 1,
        selectedIndex: 0, // highlight the newest row
        flashLineId: line.id
      };
    }

    case "CHANGE_QTY": {
      return {
        ...state,
        cart: state.cart.map((l) =>
          l.id === action.lineId
            ? { ...l, qty: Math.max(1, (l.qty || 1) + action.delta) }
            : l
        )
      };
    }

    case "SET_QTY": {
      const n = Math.max(1, parseInt(action.qty, 10) || 1);
      return {
        ...state,
        cart: state.cart.map((l) =>
          l.id === action.lineId ? { ...l, qty: n } : l
        )
      };
    }

    case "SET_DISCOUNT": {
      const pct = Math.max(0, Math.min(100, Number(action.percent) || 0));
      return {
        ...state,
        cart: state.cart.map((l) =>
          l.id === action.lineId ? { ...l, discountPct: pct } : l
        )
      };
    }

    case "VOID_LINE": {
      const idx = state.cart.findIndex((l) => l.id === action.lineId);
      if (idx === -1) return state;
      const cart = state.cart.filter((l) => l.id !== action.lineId);

      let selectedIndex = state.selectedIndex;
      if (cart.length === 0) {
        selectedIndex = null;
      } else if (selectedIndex !== null && selectedIndex >= cart.length) {
        selectedIndex = cart.length - 1;
      } else if (selectedIndex !== null && idx < selectedIndex) {
        selectedIndex -= 1;
      }

      return { ...state, cart, selectedIndex };
    }

    case "CLEAR_CART":
      // Clearing the cart (sale completed / cancelled) leaves no transaction
      // in progress → back to Ready Mode. The counter advances so the next
      // transaction gets the next SI-###### id.
      return {
        ...state,
        cart: [],
        selectedIndex: null,
        customer: null,
        customerType: "walkin",
        customerId: "",
        pendingSaleId: null,
        saleNumber: state.saleNumber + 1,
        standby: true,
        paused: false
      };

    case "CANCEL_TRANSACTION": {
      return {
        ...state,
        cart: [],
        selectedIndex: null,
        customer: null,
        customerType: "walkin",
        customerId: "",
        pendingSaleId: null,
        nextLineId: 1,
        searchQuery: "",
        standby: true,
        paused: false,
        dialog: action.openRecall ? { type: "recall" } : null,
        flashLineId: null,
        pressedButton: null
      };
    }

    case "SET_CUSTOMER": {
      // action.name = customer name, action.customerType = walkin|member|senior|pwd,
      // action.customerId = Senior / PWD / Member id (ignored for walk-in).
      const needsId =
        action.customerType === "senior" ||
        action.customerType === "pwd" ||
        action.customerType === "member";
      return {
        ...state,
        customer: action.name || null,
        customerType: action.customerType || "walkin",
        customerId: needsId ? (action.customerId || "") : ""
      };
    }

    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.query };

    case "OPEN_DIALOG":
      return { ...state, dialog: action.dialog };

    case "CLOSE_DIALOG":
      return { ...state, dialog: null };

    case "SHOW_TOAST":
      return {
        ...state,
        toast: {
          id: ++toastSeq,
          message: action.message,
          persist: !!action.persist,
          kind: action.kind || null
        }
      };

    case "HIDE_TOAST":
      return { ...state, toast: null };

    case "HOLD_SALE": {
      if (state.cart.length === 0) return state;
      // Recompute against a throwaway object (never mutate React state).
      const summary = recomputeTotals({ cart: state.cart, customerType: state.customerType });
      // Park the transaction under its OWN invoice number (captured from the
      // current counter), then advance the counter so the fresh register and
      // any later held sale each get a unique SI-###### id.
      const invoiceNo = action?.extra?.invoiceNo || formatInvoiceNo(state.saleNumber);
      const sale = {
        id: action?.extra?.id || Date.now(),
        invoiceNo,
        cashier: action?.extra?.cashier || CASHIER,
        lines: action?.extra?.lines || state.cart.map((l) => ({ ...l })),
        customer: action?.extra?.customer || state.customer,
        customerType: action?.extra?.customerType || state.customerType,
        customerId: action?.extra?.customerId || state.customerId,
        amountDue: action?.extra?.amountDue ?? summary.amountDue,
        heldAt: action?.extra?.heldAt || new Date().toLocaleTimeString()
      };
      return {
        ...state,
        heldSales: [...state.heldSales, sale],
        pendingSaleId: null,
        saleNumber: state.saleNumber + 1,
        cart: [],
        selectedIndex: null
      };
    }

    case "RECALL_SALE": {
      const sale = state.heldSales[action.index];
      if (!sale) return state;
      // Restore the counter to the recalled sale's OWN invoice number so the
      // footer shows "Transaction #SI-000003" after recalling SI-000003 (not
      // the advanced counter that was minted when it was held).
      const recalledNumber = invoiceNoToNumber(sale.invoiceNo);
      return {
        ...state,
        cart: sale.lines.map((l) => ({ ...l })),
        selectedIndex: sale.lines.length - 1,
        customer: sale.customer || state.customer,
        customerType: sale.customerType || state.customerType || "walkin",
        customerId: sale.customerId || "",
        pendingSaleId: sale.id || null,
        heldSales: state.heldSales.filter((_, i) => i !== action.index),
        saleNumber: recalledNumber || state.saleNumber
      };
    }

    case "RESTORE_HELD_SALE": {
      if (!action.sale || state.heldSales.some((sale) => sale.id === action.sale.id)) return state;
      return {
        ...state,
        heldSales: [...state.heldSales, action.sale]
      };
    }

    case "PRESS_BUTTON":
      return { ...state, pressedButton: action.id };

    case "CLEAR_PRESS":
      return { ...state, pressedButton: null };

    case "CLEAR_FLASH":
      return { ...state, flashLineId: null };

    default:
      return state;
  }
}