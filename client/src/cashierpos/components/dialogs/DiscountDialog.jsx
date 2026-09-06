/**
 * DiscountDialog.jsx
 * Port of `actionDiscount()`. Applies or clears a % discount on a cart line.
 */
import React, { useState } from "react";
import { usePos } from "../../context/PosContext";
import Dialog from "./Dialog.jsx";

export default function DiscountDialog({ dialog }) {
  const { actions } = usePos();
  const [value, setValue] = useState(String(dialog.discountPct || 0));
  const close = () => actions.closeDialog();

  const clearDiscount = () => {
    actions.setDiscount(dialog.lineId, 0);
    close();
  };

  const apply = () => {
    const pct = Math.max(0, Math.min(100, parseFloat(value) || 0));
    actions.setDiscount(dialog.lineId, pct);
    close();
    actions.showToast("Discount applied: " + pct + "%", false, "percent");
  };

  return (
    <Dialog
      title="Apply Discount (%)"
      onClose={close}
      footer={
        <>
          <button type="button" className="dialog-btn dialog-btn--ghost" onClick={clearDiscount}>
            Clear discount
          </button>
          <button type="button" className="dialog-btn dialog-btn--primary" onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <p className="dialog__hint">
        Enter a discount percentage for <strong>{dialog.name}</strong>.
      </p>
      <div className="form-row">
        <label htmlFor="dlg-disc">Discount %</label>
        <input
          id="dlg-disc"
          data-focus
          type="number"
          min="0"
          max="100"
          step="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
        />
      </div>
    </Dialog>
  );
}