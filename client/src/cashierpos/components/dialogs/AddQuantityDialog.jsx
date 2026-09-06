/**
 * AddQuantityDialog.jsx
 * --------------------------------------------------------------------------
 * Shown whenever an item is picked from the product search (barcode scan,
 * exact SKU, or a dropdown match). Asks for the quantity — defaulting to 1 (the
 * input value is pre-selected so typing a number replaces it) — BEFORE the
 * item reaches the cart.
 */
import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../../context/PosContext";
import { formatPeso } from "../../utils/calculations";
import Dialog from "./Dialog.jsx";

export default function AddQuantityDialog({ dialog }) {
  const { actions } = usePos();
  const product = dialog.product;
  const [value, setValue] = useState("1"); // default = 1
  const inputRef = useRef(null);
  const close = () => actions.closeDialog();

  const qty = Math.max(1, parseInt(value, 10) || 1);

  // Auto-highlight the current value so typing replaces "1" immediately.
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const apply = () => {
    actions.addProduct(product, qty);
    // The add always starts from the search box — clear it so the next
    // scan/type begins fresh.
    actions.setSearchQuery("");
    close();
    actions.showToast("Added: " + product.name + " x" + qty, false, "added");
  };

  return (
    <Dialog
      title="Add Item"
      onClose={close}
      footer={
        <>
          <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close}>
            Cancel
          </button>
          <button type="button" className="dialog-btn dialog-btn--primary" onClick={apply}>
            Add to Cart
          </button>
        </>
      }
    >
      {/* Product summary */}
      <div className="price-check__info">
        <div className="price-check__main">
          <span className="price-check__sku">{product.sku}</span>
          <span className="price-check__name">{product.name}</span>
          <span className="price-check__cat">{product.category}</span>
        </div>
        <div className="price-check__price" aria-label="Unit price">
          {formatPeso(product.price)}
        </div>
      </div>

      <p className="dialog__hint">
        Enter the quantity for <strong>{product.name}</strong>.
      </p>

      <div className="form-row">
        <label htmlFor="dlg-addqty">Quantity</label>
        <input
          id="dlg-addqty"
          ref={inputRef}
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