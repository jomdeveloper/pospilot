/**
 * CancelTransactionDialog.jsx
 * --------------------------------------------------------------------------
 * Confirmation shown when "Cancel Transaction" (Ctrl+Alt+C) is pressed. Presents
 * two clear choices — Cancel Transaction (destructive) or Continue Transaction
 * (keep working) — so a misclick can't wipe the current cart.
 */
import React from "react";
import { usePos } from "../../context/PosContext";
import Dialog from "./Dialog.jsx";

export default function CancelTransactionDialog() {
  const { state, actions } = usePos();
  const close = () => actions.closeDialog();

  const confirmCancel = () => {
    actions.cancelTransaction();
    if (state.heldSales.length === 0) close();
    actions.showToast(
      state.heldSales.length > 0 ? "Transaction cancelled; select a held sale" : "Transaction cancelled",
      true,
      state.heldSales.length > 0 ? "recall" : "cancel"
    );
  };

  return (
    <Dialog
      wide
      title="Cancel Transaction?"
      onClose={close}
      footer={
        <>
          <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close}>
            Continue Transaction
          </button>
          <button type="button" className="dialog-btn dialog-btn--primary dialog-btn--danger" onClick={confirmCancel}>
            Cancel Transaction
          </button>
        </>
      }
    >
      <div className="cancel">
        <div className="cancel__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg>
        </div>
        <div className="cancel__title">Are you sure?</div>
        <p className="dialog__hint cancel__desc">
          This will remove all items from the current transaction. No sale will be recorded.
        </p>
      </div>
    </Dialog>
  );
}