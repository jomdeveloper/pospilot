/**
 * PaymentDialog.jsx
 * --------------------------------------------------------------------------
 * Two-phase payment flow:
 *
 *  PHASE 1 — Tender: pick a method + tender (cash shows amount input + change).
 *  PHASE 2 — Confirm: a confirmation dialog showing Amount Due, Cash (if cash)
 *            / Method, and Change, with:
 *              • "Return to Payment" (back)
 *              • "Process Transaction" (next)
 *    On process: a brief "Processing…" loader, then a success screen with a big
 *    checkmark and buttons: [ Reprint ] [ New Transaction ].
 *
 * This prevents a cashier hitting Enter and skipping straight to printing —
 * a confirmation gate appears first.
 */
import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../../context/PosContext";
import { api } from "../../../api";
import { formatPeso, lineNet, roundMoney } from "../../utils/calculations";
import { nextInvoiceNo, printReceipt } from "../../utils/receiptPrint";
import Dialog from "./Dialog.jsx";

const METHODS = [
  { id: "cash", label: "Cash", sub: "Note/coin", icon: "coin" },
  { id: "gcash", label: "GCash", sub: "E-wallet" },
  { id: "maya", label: "Maya", sub: "E-wallet" },
  { id: "card", label: "Card", sub: "Terminal", icon: "card" }
];

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

export default function PaymentDialog({ dialog }) {
  const { state, summary, actions, runtime } = usePos();
  const due = summary.amountDue;
  const close = () => actions.closeDialog();

  const [method, setMethod] = useState(dialog.method === "cash" ? "cash" : dialog.method || "cash");
  const [tendered, setTendered] = useState("");
  const [navRow, setNavRow] = useState(0);
  const [navCol, setNavCol] = useState(0);
  const [stage, setStage] = useState("tender"); // tender|confirm|processing|success|reprint
  const [successAction, setSuccessAction] = useState(2);
  const [receipt, setReceipt] = useState(null);
  const cashInputRef = useRef(null);
  const successButtonRefs = useRef([]);

  const tenderedNum = parseFloat(tendered) || 0;
  const isCash = method === "cash";
  const change = isCash && tenderedNum >= due ? Math.max(0, roundMoney(tenderedNum - due)) : 0;
  const shortfall = isCash && tenderedNum < due ? roundMoney(due - tenderedNum) : 0;

  // Go from tender -> confirmation (gate before any sale completes).
  const confirmTransaction = () => {
    if (isCash && tenderedNum < due) {
      actions.showToast("Amount tendered is less than the amount due", false, "error");
      if (cashInputRef.current) cashInputRef.current.focus();
      return;
    }
    setStage("confirm");
  };

  // Build receipt data from the SERVER's sale response so the printed VAT /
  // discount breakdown is exactly what was recorded in the database. The line
  // `net` column shows the amount BEFORE the senior/PWD 20% (the server line
  // total already includes it, so we un-do it here) — the discount is printed
  // as its own deduction line, avoiding any double-count.
  const buildReceiptData = (sale, invoiceNo) => {
    const fromSale = (camelKey, snakeKey, fallback) => {
      if (!sale || sale.duplicate) return fallback;
      const value = sale[camelKey] ?? sale[snakeKey];
      return value == null || value === "" ? fallback : value;
    };
    const sourceLines =
      (sale && sale.items) ||
      state.cart.map((l) => ({ ...l, unitPrice: l.price, lineTotal: lineNet(l), customerDiscount: 0 }));
    return {
      lines: sourceLines.map((s) => ({
        sku: s.sku || (s.product && s.product.sku) || "",
        name: s.name || (s.product && s.product.name) || "",
        taxType: s.taxType || s.tax_type || (s.product && (s.product.taxType || s.product.tax_type)) || "VATABLE",
        price: Number(s.unitPrice ?? s.price) || 0,
        qty: Number(s.qty) || 1,
        net: roundMoney(Number(s.lineTotal) + Number(s.customerDiscount || 0))
      })),
      subtotal: Number(fromSale("subtotal", "subtotal", summary.subtotal)) || 0,
      itemDiscount: Number(fromSale("itemDiscountTotal", "item_discount_total", summary.discount)) || 0,
      seniorDiscount: Number(fromSale("seniorPwdDiscountTotal", "senior_pwd_discount_total", summary.seniorDiscount)) || 0,
      vat: Number(fromSale("vat", "vat", summary.vat)) || 0,
      vatable: Number(fromSale("vatable", "vatable_sales", summary.vatable)) || 0,
      vatableSales: Number(fromSale("vatableSales", "vatable_sales", summary.vatableSales)) || 0,
      vatExemptSales: Number(fromSale("vatExemptSales", "vat_exempt_sales", summary.vatExemptSales)) || 0,
      zeroRatedSales: Number(fromSale("zeroRatedSales", "zero_rated_sales", summary.zeroRatedSales)) || 0,
      nonVatSales: Number(fromSale("nonVatSales", "non_vat_sales", summary.nonVatSales)) || 0,
      grandTotal: Number(fromSale("grandTotal", "grand_total", summary.amountDue)) || 0,
      method: isCash ? "cash" : method,
      tendered: isCash ? tenderedNum : 0,
      change: isCash ? Number((sale && !sale.duplicate && sale.changeDue) || change) : 0,
      customer: (sale && sale.customer) || state.customer,
      customerType: (sale && (sale.customerType || sale.customer_type)) || state.customerType || "walkin",
      customerId: (sale && (sale.customerId || sale.customer_id || sale.memberId || sale.member_id)) || state.customerId || "",
      date: (sale && (sale.createdAt || sale.created_at)) || new Date(),
      invoiceNo: invoiceNo || ""
    };
  };

  const processTransaction = async () => {
    // Reserve the invoice number up-front so the printed receipt uses the SAME
    // number that is sent to the server (and stored as the sale's reference).
    const invoiceNo = nextInvoiceNo();
    setStage("processing");

    // Persist the sale to the PosPilot backend first. Only when the server
    // confirms the sale do we clear the cart, print the receipt and show
    // the success screen. On failure the cart is preserved so nothing is lost.
    let sale;
    try {
      sale = await api.createSale(
        {
          items: state.cart.map((l) => ({
            productId: l.productId != null ? l.productId : l.sku,
            qty: l.qty,
            discPct: l.discountPct || 0,
            unitPrice: l.price
          })),
          customer: (state.customer || "").trim() || "Walk-in Customer",
          customerType: state.customerType || "walkin",
          memberId: state.customerType === "member" ? (state.customerId || "").trim() || null : null,
          customerId: state.customerId || null,
          cashReceived: isCash ? tenderedNum : due,
          paymentType: isCash ? "cash" : method,
          transactionId: invoiceNo,
          // Attribute the sale to the open cashier session so the drawer
          // totals (cash sales / expected cash) stay in sync server-side.
          cashierSessionId: state.session ? state.session.id : undefined,
          pendingSaleId: state.pendingSaleId || undefined
        },
        runtime && runtime.sessionToken ? runtime.sessionToken : undefined
      );
    } catch (err) {
      console.error("[pos] sale save failed:", (err && err.message) || err);
      actions.showToast("Unable to save the sale: " + ((err && err.message) || "server unreachable"), true, "error");
      setStage("confirm");
      return;
    }

    if (state.pendingSaleId && runtime?.sessionToken) {
      try {
        await api.completePendingSale(state.pendingSaleId, runtime.sessionToken);
      } catch (err) {
        console.error("[pos] pending sale completion update failed:", (err && err.message) || err);
      }
    }

    // Build the receipt from the SERVER-AUTHORITATIVE numbers so the printed
    // VAT / discount breakdown matches the database exactly.
    const savedInvoiceNo = sale && (sale.transactionId || sale.transaction_ref) || invoiceNo;
    const data = buildReceiptData(sale, savedInvoiceNo);
    setReceipt(data);

    // Refresh the session snapshot (cash sales / expected cash moved).
    if (state.session && runtime && runtime.sessionToken) {
      api
        .getCurrentCashierSession((runtime.terminal) || "POS-02", runtime.sessionToken)
        .then((res) => {
          if (res && res.session) actions.setSession(res.session);
        })
        .catch(() => {});
    }

    // A short processing beat, then auto-print the receipt and show success.
    setTimeout(() => {
      actions.clearCart();
      setStage("success");
      void printReceipt(data); // auto-print after the sale is complete
    }, 600);
  };

  const reprint = () => {
    if (receipt) void printReceipt(receipt); // print directly, no dialog
  };
  // Done with the completed sale: switch straight into a NEW ACTIVE transaction
  // (not just closing the dialog, which would dump the cashier back on the
  // Ready screen and force them to tap "New Transaction" again).
  const newTransaction = () => {
    actions.closeDialog();
    actions.startTransaction();
  };

  const pickAmount = (val) => {
    setTendered(val === "exact" ? String(due) : String(val));
    if (cashInputRef.current) cashInputRef.current.focus();
  };

  const applyNavSelection = (row, col) => {
    if (row === 0) {
      const m = METHODS[col];
      if (m) setMethod(m.id);
    } else if (isCash) {
      if (col < QUICK_AMOUNTS.length) pickAmount(QUICK_AMOUNTS[col]);
      else if (col === QUICK_AMOUNTS.length) pickAmount("exact");
    }
  };

  // Re-focus the cash input (tender stage). Also re-grab focus if the cashier
  // clicks outside the dialog or the input — so arrows/typing keep working.
  const focusTenderInput = () => {
    if (stage === "tender" && isCash && cashInputRef.current) cashInputRef.current.focus();
  };
  useEffect(focusTenderInput, [method, isCash, stage]);

  useEffect(() => {
    if (stage !== "success") return;
    const button = successButtonRefs.current[successAction];
    if (button) button.focus();
  }, [stage, successAction]);

  const handleSuccessKeyDown = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      const direction = e.key === "ArrowRight" ? 1 : -1;
      setSuccessAction((index) => (index + direction + 3) % 3);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const button = successButtonRefs.current[successAction];
      if (button) button.click();
    }
  };

  useEffect(() => {
    function onKey(e) {
      if (stage !== "tender") return;
      const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

      // Typed cash entry: even if the cashier clicked outside and lost focus,
      // digits/period/backspace still update the amount AND re-grab focus.
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        confirmTransaction();
        return;
      }
      if (!arrows.includes(e.key)) {
        if (isCash) {
          // Handle editing directly so no keystroke is lost while unfocused.
          if (/^[0-9]$/.test(e.key) || e.key === "." || e.key === "Backspace") {
            e.preventDefault();
            e.stopPropagation();
            setTendered((cur) => {
              if (e.key === "Backspace") return cur.slice(0, -1);
              if (e.key === "." ) return cur.includes(".") ? cur : cur + ".";
              return cur === "0" ? e.key : cur + e.key;
            });
          }
          if (cashInputRef.current) cashInputRef.current.focus();
          return;
        }
        return; // other keys ignored
      }

      // Arrow navigation
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const count = navRow === 0 ? METHODS.length : isCash ? QUICK_AMOUNTS.length + 1 : 0;
        if (!count) return;
        const col = (navCol + dir + count) % count;
        setNavCol(col);
        applyNavSelection(navRow, col);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!isCash) return;
        const row = navRow === 0 ? 1 : 0;
        const count = row === 0 ? METHODS.length : QUICK_AMOUNTS.length + 1;
        setNavRow(row);
        const col = Math.min(navCol, count - 1);
        setNavCol(col);
        applyNavSelection(row, col);
      }
      // Always return focus to the cash input (tender stage).
      if (isCash && cashInputRef.current) cashInputRef.current.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (stage === "confirm") {
    return (
      <Dialog wide title="Confirm Payment" onClose={() => setStage("tender")} footer={
        <>
          <button type="button" className="dialog-btn dialog-btn--ghost" onClick={() => setStage("tender")}>Return to Payment</button>
          <button type="button" className="dialog-btn dialog-btn--primary" onClick={processTransaction}>Process Transaction</button>
        </>
      }>
        <div className="pconf">
          <div className="pconf__method">{method.toUpperCase()}</div>
          <div className="pconf__row"><span>Amount Due</span><strong className="pconf__amount">{formatPeso(due)}</strong></div>
          {isCash ? (
            <>
              <div className="pconf__row"><span>Cash Tendered</span><span>{formatPeso(tenderedNum)}</span></div>
              <div className="pconf__row"><span>Change</span><strong className="pconf__change">{formatPeso(change)}</strong></div>
            </>
          ) : (
            <div className="pconf__row"><span>Charge to</span><span>{method.toUpperCase()}</span></div>
          )}
          <p className="dialog__hint pconf__hint">Confirm this transaction before it is processed.</p>
        </div>
      </Dialog>
    );
  }

  if (stage === "processing") {
    return (
      <Dialog wide title="Processing" hideClose onClose={close}>
        <div className="proc">
          <div className="proc__spinner" aria-hidden="true"><span /></div>
          <div className="proc__title">Processing transaction…</div>
          <div className="proc__sub">Please wait</div>
        </div>
      </Dialog>
    );
  }

  if (stage === "success") {
    return (
      <Dialog wide title="Transaction Complete" hideClose onClose={close} footer={
        <div className="dialog__actions" onKeyDown={handleSuccessKeyDown}>
          <button
            type="button"
            ref={(button) => (successButtonRefs.current[0] = button)}
            className={"dialog-btn dialog-btn--ghost" + (successAction === 0 ? " dialog-btn--selected" : "")}
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="button"
            ref={(button) => (successButtonRefs.current[1] = button)}
            className={"dialog-btn dialog-btn--ghost dialog-btn--reprint" + (successAction === 1 ? " dialog-btn--selected" : "")}
            onClick={reprint}
          >
            Reprint
          </button>
          <button
            type="button"
            ref={(button) => (successButtonRefs.current[2] = button)}
            className={"dialog-btn dialog-btn--primary dialog-btn--new-transaction" + (successAction === 2 ? " dialog-btn--selected" : "")}
            onClick={newTransaction}
          >
            New Transaction
          </button>
        </div>
      }>
        <div className="ok">
          <div className="ok__check" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
          </div>
          <div className="ok__title">Sale Complete</div>
          <div className="ok__sub">{isCash ? "Change " + formatPeso(change) : "Payment received"}</div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      wide
      hideClose
      title="Payment"
      header={
        <div className="payment__header">
          <div className="payment__header-text">
            <span className="payment__header-label">Payment</span>
            <span className="payment__header-subtitle">Select a payment method</span>
          </div>
          <div className="payment__header-due">
            <span className="payment__due-label">Amount Due</span>
            <span className="payment__due-amount">{formatPeso(due)}</span>
          </div>
        </div>
      }
      onClose={close}
      footer={
        <>
          <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close}>Cancel</button>
          <button type="button" className="dialog-btn dialog-btn--primary" onClick={confirmTransaction}>Complete Transaction</button>
        </>
      }
    >
      <div className="payment__methods" role="tablist" aria-label="Payment method">
        {METHODS.map((m, i) => {
          const selected = m.id === method;
          const arrowFocused = navRow === 0 && navCol === i;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={"payment__method" + (selected ? " is-active" : "") + (arrowFocused ? " is-arrow" : "")}
              onMouseEnter={() => { setNavRow(0); setNavCol(i); }}
              onClick={() => setMethod(m.id)}
            >
              <span className="payment__method-icon">
                {m.icon === "coin" ? (
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></svg>
                ) : m.icon === "card" ? (
                  <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></svg>
                ) : (
                  <span className="payment__method-monogram">{m.label.charAt(0)}</span>
                )}
              </span>
              <span className="payment__method-label">{m.label}</span>
              <span className="payment__method-sub">{m.sub}</span>
            </button>
          );
        })}
      </div>

      {isCash ? (
        <div className="payment__cash">
          <label className="payment__label" htmlFor="dlg-tendered">Cash Tendered</label>
          <input
            id="dlg-tendered"
            ref={cashInputRef}
            data-focus
            className="payment__cash-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={tendered}
            onChange={(e) => setTendered(e.target.value)}
          />
          <div className="payment__quick" role="group" aria-label="Quick tender amounts">
            {QUICK_AMOUNTS.map((amt, i) => (
              <button
                key={amt}
                type="button"
                className={"payment__quick-btn" + (navRow === 1 && navCol === i ? " is-arrow" : "")}
                onMouseEnter={() => { setNavRow(1); setNavCol(i); }}
                onClick={() => pickAmount(amt)}
              >{formatPeso(amt)}</button>
            ))}
            <button
              type="button"
              className={"payment__quick-btn payment__quick-btn--exact" + (navRow === 1 && navCol === QUICK_AMOUNTS.length ? " is-arrow" : "") + (tenderedNum === due ? " is-active" : "")}
              onMouseEnter={() => { setNavRow(1); setNavCol(QUICK_AMOUNTS.length); }}
              onClick={() => pickAmount("exact")}
            >Exact</button>
          </div>
          <div className="payment__change">
            <span className="payment__change-label">{tenderedNum > 0 && tenderedNum < due ? "Still due" : "Change"}</span>
            <span className={"payment__change-amount" + (tenderedNum > 0 && tenderedNum < due ? " payment__change-amount--short" : "")}>
              {formatPeso(tenderedNum > 0 && tenderedNum < due ? shortfall : change)}
            </span>
          </div>
        </div>
      ) : (
        <div className="payment__noncash">
          <div className="payment__noncash-amount">
            <span className="payment__noncash-label">Amount to charge</span>
            <span className="payment__noncash-value">{formatPeso(due)}</span>
          </div>
          <p className="dialog__hint">
            Complete to charge this transaction to <strong>{method.toUpperCase()}</strong>.
          </p>
        </div>
      )}
    </Dialog>
  );
}
