/**
 * RecallDialog.jsx
 * Port of `actionRecall()`. Lists held sales (most recent auto-selected and
 * highlighted). ArrowUp / ArrowDown move the selection, Enter recalls the
 * highlighted sale, and clicking a row still works.
 */
import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../../context/PosContext";
import { formatInvoiceNo, formatPeso } from "../../utils/calculations";
import { customerTypeLabel } from "../../data/customerTypes";
import Dialog from "./Dialog.jsx";

export default function RecallDialog() {
  const { state, actions } = usePos();
  const close = () => actions.closeDialog();

  const sales = state.heldSales;
  // Always auto-select the FIRST-added held sale when the list re-opens
  // (held sales are appended, so index 0 is the oldest / first one).
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef([]);

  const recall = (index) => {
    actions.recallSale(index);
    close();
    actions.showToast("Sale recalled", false, "recall");
  };

  // Keep the highlighted item focused/visible (arrow navigation).
  useEffect(() => {
    const el = itemRefs.current[activeIndex];
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const move = (delta) => {
    if (sales.length === 0) return;
    setActiveIndex((i) => (i + delta + sales.length) % sales.length);
  };

  // Handle Up/Down/Enter at the document level so they work no matter what has
  // focus inside the dialog (e.g. the Close button or a list row). The app's
  // global shortcuts are already suspended while a dialog is open.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        move(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        move(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        recall(activeIndex);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function handleListKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
      // Handled at the document level above — just stop it bubbling to anything
      // that could scroll or submit.
      e.preventDefault();
      e.stopPropagation();
    }
  }

  return (
    <Dialog
      title="Recall Held Sale"
      onClose={close}
      footer={
        <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close}>
          Close
        </button>
      }
    >
      <p className="dialog__hint">
        {sales.length > 0
          ? "Use \u2191/\u2193 to choose, Enter to recall."
          : "No held sales."}
      </p>
      <ul
        className="held-list"
        role="listbox"
        aria-label="Held sales"
        onKeyDown={handleListKeyDown}
      >
        {sales.map((sale, i) => (
          <li
            key={sale.id}
            ref={(el) => (itemRefs.current[i] = el)}
            role="option"
            aria-selected={i === activeIndex}
            tabIndex={-1}
            className={
              "held-list__item" + (i === activeIndex ? " is-active" : "")
            }
            onMouseEnter={() => setActiveIndex(i)}
            onClick={() => recall(i)}
          >
            <div>
              <div>
                {/* Show the held sale's real invoice/transaction no. (SI-######).
                    Falls back to a sequential id if the record predates
                    invoicing. */}
                <strong>{sale.invoiceNo || formatInvoiceNo(i + 1)}</strong>{" \u00b7 "}
                {sale.customer || "Walk-in"}
                {sale.customerType && sale.customerType !== "walkin" ? (
                  <em className="held-list__type"> {customerTypeLabel(sale.customerType)}</em>
                ) : null}
              </div>
              <div className="held-list__meta">
                Cashier: {sale.cashier || "JUAN DELA CRUZ"}
                {" \u00b7 "}
                {sale.lines.length} item(s){" \u00b7 "}
                held {sale.heldAt}
              </div>
            </div>
            <div className="held-list__amount">{formatPeso(sale.amountDue)}</div>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}