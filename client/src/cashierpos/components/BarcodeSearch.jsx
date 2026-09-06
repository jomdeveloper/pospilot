/**
 * BarcodeSearch.jsx
 * --------------------------------------------------------------------------
 * "Scan barcode" field (F1 / Ctrl+K). This input does NOT search the catalog
 * live — it is a pure scanner. Pressing Enter performs an exact barcode / SKU
 * lookup; on a hit it adds the item to the cart at qty 1; on a miss it opens
 * a soft "Item Not Found" dialog (OK-only) so the cashier knows the scanned
 * item was not added. Escape clears the input.
 */
import React, { useRef } from "react";
import { usePos } from "../context/PosContext";
import { findProductByCode } from "../data/products";
import barcodeScan from "../assets/barcode-scan.png";

export default function BarcodeSearch() {
  const { state, actions } = usePos();
  const inputRef = useRef(null);
  const query = state.searchQuery;

  const commit = async () => {
    const q = query.trim();
    if (!q) return;
    const hit = await findProductByCode(q);
    if (hit) {
      // A scanned barcode is an EXACT lookup → add directly to the cart at
      // qty 1 with no confirmation dialog (cashiers scan items in rapid
      // succession; a modal per item would kill the flow). The product-search
      // dialog still asks for quantity when it's used to pick an item.
      actions.addProduct(hit, 1);
      actions.setSearchQuery("");
      if (inputRef.current) inputRef.current.focus();
      actions.showToast("Added: " + hit.name + " x1", false, "added");
      return;
    }
    // No match → show a clear popup (not a fleeting toast) so the cashier
    // knows the scanned item did NOT go into the cart. The dialog's OK button
    // is auto-focused; closing it hands focus back to the scan field.
    actions.setSearchQuery("");
    actions.openDialog({ type: "notFound", code: q });
  };

  return (
    <div className="barcode-search" aria-label="Scan barcode">
      <div className="barcode-search__field">
        {/* Barcode icon — absolutely positioned so it NEVER contributes to the
            field height; text gets left padding to clear it. */}
        <img
          className="barcode-search__icon"
          src={barcodeScan}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <input
          id="product-search-input"
          ref={inputRef}
          className="barcode-search__input"
          type="text"
          placeholder="Scan barcode…  (F1 to focus)"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          enterKeyHint="enter"
          aria-label="Scan barcode"
          value={query}
          onChange={(e) => actions.setSearchQuery(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              actions.setSearchQuery("");
            }
          }}
          autoFocus
        />
      </div>
    </div>
  );
}