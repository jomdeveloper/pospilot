/**
 * ItemNotFoundDialog.jsx
 * --------------------------------------------------------------------------
 * Shown when a scanned/typed barcode or SKU has no match in the catalog.
 * A calm, soft-amber popup (not an alarm-red toast) tells the cashier the
 * item was NOT added to the cart. It is dismissed only with the OK button
 * (click or Enter); focus then returns to the scan field for the next scan.
 */
import React from "react";
import { usePos } from "../../context/PosContext";
import Dialog from "./Dialog.jsx";

export default function ItemNotFoundDialog({ dialog }) {
  const { actions } = usePos();
  const code = String((dialog && dialog.code) || "").trim();

  const close = () => {
    actions.closeDialog();
    // Return focus to the scan field so the next barcode can be scanned
    // immediately (and select any stale text so it can be typed over).
    const input = document.getElementById("product-search-input");
    if (input) {
      input.focus();
      input.select();
    }
  };

  return (
    <Dialog
      title="Item Not Found"
      onClose={close}
      className="dialog--notfound"
      footer={
        <button
          type="button"
          className="dialog-btn dialog-btn--primary dialog-btn--block"
          data-focus
          onClick={close}
        >
          OK
        </button>
      }
    >
      <div className="notfound__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
          <path d="M11 7v4" />
          <path d="M11 15h.01" />
        </svg>
      </div>

      <p className="dialog__hint notfound__text">
        No product found for&nbsp;
        <strong>{code}</strong>.
      </p>
    </Dialog>
  );
}