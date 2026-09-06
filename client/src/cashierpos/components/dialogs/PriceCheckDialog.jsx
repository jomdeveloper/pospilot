/**
 * PriceCheckDialog.jsx
 * --------------------------------------------------------------------------
 * Price Check by barcode or SKU. The cashier scansa barcode or typesa SKU/
 * barcode,andthe matching product's information is shown with the price
 * highlighted. A barcode icon sits inside the search field.
 *
 * Rapid-scan workflow: after a successful check the input is cleared and focus
 * STAYS on it (so the next barcode can be typed immediately), a green "Add
 * Item" button appears,and pressing Enter again(empty input) adds the
 * displayed product to the cart — all without ever leaving the dialog.
 */
import React, { useRef, useState } from "react";
import { usePos } from "../../context/PosContext";
import { findProductByCode } from "../../data/products";
import { formatPeso } from "../../utils/calculations";
import Dialog from "./Dialog.jsx";

export default function PriceCheckDialog() {
  const { actions } = usePos();
  const close = () => actions.closeDialog();

  const [code, setCode] = useState("");
  const [product, setProduct] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef(null);

  /** Run a lookup. On success: clear input, keep focus, show the result. */
  const doCheck = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const c = code.trim();
    if (!c) return;
    const hit = await findProductByCode(c);
    if (hit) {
      setProduct(hit);
      setNotFound(false);
      setCode(""); // clear so the cashier can scan the next item
    } else {
      setProduct(null);
      setNotFound(true);
    }
    // Keep the barcode input focused for the next scan.

    if (inputRef.current) inputRef.current.focus();
  };

  /** Add the currently-shown product, then reset for the next scan. */
  const addItem = () => {
    if (!product) return;
    actions.addProduct(product, 1);
    actions.showToast("Added: " + product.name, false, "added");
    setProduct(null);
    setCode("");
    setNotFound(false);
    if (inputRef.current) inputRef.current.focus();
  };

  const onChange = (value) => {
    setCode(value);
    // Fresh input clears any stale result until they check again.


    setProduct(null);
    setNotFound(false);
    if (inputRef.current) inputRef.current.focus();
  };

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation(); // keep Dialog primary-button Enter from also firing
      if (code.trim()) {
        doCheck(e);
      } else if (product) {
        // Empty input after a successful check -> add the shown item.


        addItem();
      }
    }
  }

  return (
    <Dialog
      title="Price Check"
      onClose={close}
      footer={
        <>
          {product && (
            <button
              type="button"
              className="dialog-btn dialog-btn--add"
              onClick={addItem}
            >
              Add Item
            </button>
          )}
          <button
            type="button"
            className="dialog-btn dialog-btn--ghost"
            onClick={close}
          >
            Close
          </button>
        </>
      }
    >
      <p className="dialog__hint">Scan a barcode or enter a SKU to see the price.</p>

      <form className="form-row price-check__form" onSubmit={doCheck}>
        <label htmlFor="dlg-pricecheck">Barcode / SKU</label>
        <div className="price-check__search">
          <span className="price-check__barcode-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 6v12M8 6v12M12 6v3M12 15v3M16 6v12M4 6v12h16v-2" />
            </svg>
          </span>
          <input
            id="dlg-pricecheck"
            ref={inputRef}
            data-focus
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck="false"
            placeholder="Scan barcode or type SKU…"
            value={code}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button type="submit" className="price-check__btn">
            Check
          </button>
        </div>
      </form>

      {notFound && (
        <p className="dialog__hint price-check__notfound">
          No product found for &quot;{code.trim()}&quot;.
        </p>
      )}

      {product && (
        <div className="price-check__info">
          <div className="price-check__main">
            <span className="price-check__sku">{product.sku}</span>
            <span className="price-check__name">{product.name}</span>
            <span className="price-check__cat">{product.category}</span>
          </div>
          <div className="price-check__price" aria-label="Price">
            {formatPeso(product.price)}
          </div>
          <div className="price-check__barcode">{product.barcode}</div>
        </div>
      )}
    </Dialog>
  );
}