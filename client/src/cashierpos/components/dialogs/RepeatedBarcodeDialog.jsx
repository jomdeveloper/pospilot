import React, { useEffect, useState } from "react";
import { usePos } from "../../context/PosContext";
import Dialog from "./Dialog.jsx";
import Icon from "../Icon.jsx";

const MAX_SCAN_ADD_QTY = 100000;

export default function RepeatedBarcodeDialog({ dialog }) {
  const { actions } = usePos();
  const [value, setValue] = useState("1");
  const [error, setError] = useState("");
  const product = dialog.product;
  const currentQty = Number(dialog.currentQty) || 1;
  const maxQty = Number(dialog.maxQty) || MAX_SCAN_ADD_QTY;

  const close = () => {
    actions.closeDialog();
    window.setTimeout(() => {
      const input = document.getElementById("product-search-input");
      if (input) {
        input.focus();
        input.select();
      }
    }, 200);
  };

  useEffect(() => {
    const input = document.getElementById("repeated-barcode-qty");
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const apply = () => {
    const trimmed = String(value).trim();
    const quantity = Number(trimmed);
    if (!/^\d+$/.test(trimmed) || !Number.isInteger(quantity) || quantity < 1) {
      setError("Enter a whole number greater than zero.");
      return;
    }
    if (quantity > maxQty || currentQty + quantity > maxQty) {
      setError(`Quantity cannot exceed ${maxQty.toLocaleString()}.`);
      return;
    }
    actions.addProduct(product, quantity);
    actions.closeDialog();
    actions.showToast("Added: " + product.name + " x" + quantity, false, "added");
    window.setTimeout(() => {
      const input = document.getElementById("product-search-input");
      if (input) {
        input.focus();
        input.select();
      }
    }, 200);
  };

  return (
    <Dialog
      header={
        <span className="repeated-barcode-dialog__header">
          <span className="repeated-barcode-dialog__header-icon"><Icon name="warning" /></span>
          <span>Consecutive scan detected</span>
        </span>
      }
      onClose={close}
      className="dialog--repeated-barcode"
      footer={
        <>
          <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close}>
            Cancel
          </button>
          <button type="button" className="dialog-btn dialog-btn--primary" onClick={apply}>
            Add
          </button>
        </>
      }
    >
      <div className="repeated-barcode-dialog">
        <h3 className="repeated-barcode-dialog__product">{product.name}</h3>
        <div className="repeated-barcode-dialog__barcode">
          <span>Barcode</span>
          <strong>{dialog.barcode}</strong>
        </div>
        <div className="repeated-barcode-dialog__current">
          <span>Current cart quantity</span>
          <strong>{currentQty}</strong>
        </div>
      </div>
      <div className="repeated-barcode-dialog__quantity form-row">
        <label htmlFor="repeated-barcode-qty">Quantity to add</label>
        <input
          id="repeated-barcode-qty"
          data-focus
          type="number"
          min="1"
          max={maxQty}
          step="1"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        />
        {error && <span className="repeated-barcode-dialog__error" role="alert">{error}</span>}
      </div>
    </Dialog>
  );
}