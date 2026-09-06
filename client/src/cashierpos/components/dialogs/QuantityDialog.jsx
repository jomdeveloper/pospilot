/**
 * QuantityDialog.jsx
 * Port of `actionQuantity()`. Sets the quantity for the selected cart line.
 */
import React, { useState } from "react";
import { usePos } from "../../context/PosContext";
import Dialog from "./Dialog.jsx";

export default function QuantityDialog({ dialog }) {
  const { actions } = usePos();
  const [value, setValue] = useState(String(dialog.qty));
  const close = () => actions.closeDialog();

  const apply = () => {
    const n = Math.max(1, parseInt(value, 10) || 1);
    actions.setQty(dialog.lineId, n);
    close();
    actions.showToast(dialog.name + " x" + n, false, "qty");
  };

  return (
    <Dialog
      title={"Set Quantity \u2014 " + dialog.name}
      onClose={close}
      footer={
        <>
          <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close}>
            Cancel
          </button>
          <button type="button" className="dialog-btn dialog-btn--primary" onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <p className="dialog__hint">
        Current quantity: <strong>{dialog.qty}</strong>
      </p>
      <div className="form-row">
        <label htmlFor="dlg-qty">Quantity</label>
        <input
          id="dlg-qty"
          data-focus
          type="number"
          min="1"
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