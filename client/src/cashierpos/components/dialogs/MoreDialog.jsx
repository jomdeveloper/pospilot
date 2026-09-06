/**
 * MoreDialog.jsx
 * Port of `actionMore()`. The single overflow menu — opened by the bottom
 * bar's F10 "More" button. Holds the secondary terminal actions that no
 * longer live on the right column or F-key row: New Transaction,
 * Printer Settings, Discount (F4), Keyboard Shortcuts, About / Help and
 * Cancel Transaction.
 * Arrow Up / Down move the selection (and work even if the focus is
 * elsewhere), Enter activates the highlighted item.
 */
import React, { useEffect, useState } from "react";
import { usePos } from "../../context/PosContext";
import Dialog from "./Dialog.jsx";

export default function MoreDialog() {
  const { actions, dispatchAction } = usePos();
  const close = () => actions.closeDialog();

  const ITEMS = [
    {
      label: "New Transaction",
      desc: "Clear all items",
      run: () => {
        actions.clearCart();       // clears + goes to standby
        actions.startTransaction(); // immediately opens a fresh active sale
        close();
        actions.showToast("New transaction started", false, "success");
      }
    },
    {
      label: "Customer",
      desc: "Set the customer for this transaction",
      run: () => actions.openDialog({ type: "customer" })
    },
    {
      label: "Cash In",
      desc: "Add cash to the drawer (extra change, deposit)",
      run: () => dispatchAction("cashIn")
    },
    {
      label: "Cash Out",
      desc: "Remove cash from the drawer (petty cash, payout)",
      run: () => dispatchAction("cashOut")
    },
    {
      label: "Cash Drop / Safe Drop",
      desc: "Manager only — move cash to the safe",
      run: () => dispatchAction("cashDrop")
    },
    {
      label: "Close Register",
      desc: "Count the drawer and close this cashier session",
      run: () => dispatchAction("closeRegister")
    },
    {
      label: "Void Transaction",
      desc: "Reverse a completed sale (manager approval required)",
      danger: true,
      run: () => actions.openDialog({ type: "transactionActions", mode: "void" })
    },
    {
      label: "Refund / Return",
      desc: "Return items from a completed sale",
      run: () => actions.openDialog({ type: "transactionActions", mode: "refund" })
    },
    {
      label: "Printer Settings",
      desc: "Configure the receipt printer",
      run: () => actions.openDialog({ type: "printerSettings" })
    },
    {
      label: "Discount",
      desc: "Apply a discount to the selected item",
      run: () => dispatchAction("discount")
    },
    {
      label: "Keyboard Shortcuts",
      desc: "Focus the search bar and list the key map",
      run: () => {
        close();
        const el = document.getElementById("product-search-input");
        if (el) {
          el.focus();
          el.select();
        }
        actions.showToast(
          "Keyboard shortcuts: F1\u2013F10 \u2022 Enter \u2022 Esc \u2022 \u2191/\u2193 \u2022 Del",
          false,
          "help"
        );
      }
    },
    {
      label: "About / Help",
      desc: "App info and keyboard shortcuts",
      run: () => dispatchAction("about")
    },
    {
      label: "Cancel Transaction",
      desc: "Clear the transaction after confirmation",
      danger: true,
      run: () => dispatchAction("cancelTransaction")
    }
  ];

  const [activeIndex, setActiveIndex] = useState(0);

  const activate = (i) => {
    const item = ITEMS[i];
    if (item) item.run();
  };

  // Handle Up/Down/Enter at the document level so they work no matter what has
  // focus (even after clicking outside the dialog). Always re-focus the active
  // item so the selection border stays visible.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => (i + 1) % ITEMS.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => (i - 1 + ITEMS.length) % ITEMS.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        activate(activeIndex);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <Dialog
      title="More Actions"
      onClose={close}
      footer={
        <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close}>
          Close
        </button>
      }
    >
      <p className="dialog__hint">
        Additional terminal functions. Use ↑/↓ to choose, Enter to select.
      </p>
      <ul className="held-list">
        {ITEMS.map((item, i) => (
          <li
            key={item.label}
            className={
              "held-list__item" +
              (i === activeIndex ? " is-active" : "") +
              (item.danger ? " is-danger" : "")
            }
            onClick={() => activate(i)}
            onMouseEnter={() => setActiveIndex(i)}
          >
            <span>
              <strong>{item.label}</strong>
              <span className="held-list__meta">{item.desc}</span>
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}