/**
 * BarcodeSearch.jsx
 * --------------------------------------------------------------------------
 * "Scan barcode" field (F1 / Ctrl+K). This input does NOT search the catalog
 * live — it is a pure scanner. Pressing Enter performs an exact barcode / SKU
 * lookup; on a hit it adds the item to the cart at qty 1; on a miss it opens
 * a soft "Item Not Found" dialog (OK-only) so the cashier knows the scanned
 * item was not added. Escape clears the input.
 */
import React, { useEffect, useRef } from "react";
import { usePos } from "../context/PosContext";
import { findProductByCode } from "../data/products";
import barcodeScan from "../assets/barcode-scan.png";

const MAX_SCAN_ADD_QTY = 100000;

export default function BarcodeSearch() {
  const { state, actions } = usePos();
  const inputRef = useRef(null);
  const query = state.searchQuery;
  const dialogOpen = Boolean(state.dialog);
  const lastScanRef = useRef({ barcode: "", product: null });
  const processingRef = useRef(false);
  const pendingRepeatRef = useRef(null);
  const dialogScanLockRef = useRef(false);

  useEffect(() => {
    if (!dialogOpen) dialogScanLockRef.current = false;
    if (dialogOpen && query) actions.setSearchQuery("");
  }, [dialogOpen, query, actions]);

  const commit = async () => {
    if (dialogOpen || dialogScanLockRef.current) return;
    const q = query.trim();
    if (!q) return;
    if (processingRef.current) {
      const previous = lastScanRef.current;
      if (previous.barcode === q && previous.product) {
        pendingRepeatRef.current = q;
      }
      actions.setSearchQuery("");
      return;
    }
    processingRef.current = true;
    try {
      const hit = await findProductByCode(q);
      if (hit) {
        const previous = lastScanRef.current;
        const existing = state.cart.find((line) =>
          line.productId === hit.productId || line.sku === hit.sku
        );
        const isConsecutive =
          previous.barcode === q &&
          previous.product?.productId === hit.productId;

        actions.setSearchQuery("");

        if (isConsecutive) {
          dialogScanLockRef.current = true;
          actions.openDialog({
            type: "repeatedBarcode",
            product: hit,
            barcode: q,
            currentQty: Number(existing?.qty) || 1,
            maxQty: MAX_SCAN_ADD_QTY,
          });
        } else {
          actions.addProduct(hit, 1);
          // Record only scans that successfully resolved and were added.
          lastScanRef.current = { barcode: q, product: hit };
          if (inputRef.current) inputRef.current.focus();
          actions.showToast("Added: " + hit.name + " x1", false, "added");
        }
        return;
      }
      actions.setSearchQuery("");
      actions.openDialog({ type: "notFound", code: q });
    } finally {
      processingRef.current = false;
      const pending = pendingRepeatRef.current;
      pendingRepeatRef.current = null;
      if (pending && !state.dialog) {
        const existing = state.cart.find((line) =>
          line.productId === lastScanRef.current.product?.productId ||
          line.sku === lastScanRef.current.product?.sku
        );
        if (existing || lastScanRef.current.product) {
          dialogScanLockRef.current = true;
          actions.openDialog({
            type: "repeatedBarcode",
            product: lastScanRef.current.product,
            barcode: pending,
            currentQty: Number(existing?.qty) || 1,
            maxQty: MAX_SCAN_ADD_QTY,
          });
        }
      }
    }
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
          disabled={dialogOpen}
          value={query}
          onChange={(e) => {
            if (!dialogOpen) actions.setSearchQuery(e.target.value);
          }}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (dialogOpen) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
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