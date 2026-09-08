/**
 * TransactionTable.jsx
 * --------------------------------------------------------------------------
 * Current-transaction line table in the design's column set:
 * Item / Qty / Price / Disc / Disc Amt / Subtotal.
 * Removing an item is still possible via the DEL key or the Quick Actions
 * "Remove Item" tile. Keeps the selected-row tracking, the added-item flash
 * and the arrow-key scroll-into-view behaviour.
 */
import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../context/PosContext";
import { formatPeso, lineDiscount, lineNet } from "../utils/calculations";

export default function TransactionTable() {
  const { state, actions } = usePos();
  const scrollRef = useRef(null);

  // Measured vertical-scrollbar width (0 when the rows fit). The fixed header
  // reserves EXACTLY this much on its right so the header and the body rows
  // stay aligned whether or not the scrollbar is showing — no white gap.
  const [gutter, setGutter] = useState(0);

  // Keep the currently selected row visible inside the scroll area.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const rows = scroller.querySelectorAll(".tx-row");
    const target = rows[state.selectedIndex];
    if (!target) return;

    if (state.selectedIndex === 0) {
      scroller.scrollTop = 0;
    } else if (state.selectedIndex === rows.length - 1) {
      scroller.scrollTop = scroller.scrollHeight;
    } else if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [state.selectedIndex, state.cart.length]);

  // Measure the real scrollbar width whenever the cart or container size
  // changes (offsetWidth - clientWidth = vertical scrollbar width, 0 if none).
  // ResizeObserver keeps it in sync as the scrollbar appears/disappears.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const update = () =>
      setGutter(Math.max(0, scroller.offsetWidth - scroller.clientWidth));
    update();
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(update);
      ro.observe(scroller);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [state.cart.length]);

  return (
    <section className="transaction-table" aria-label="Current transaction">
      {/* Header row lives OUTSIDE the scroll area so the vertical scrollbar
          only ever sits beside the body rows — never across the header. */}
      <div
        className="transaction-table__head"
        style={gutter > 0 ? { paddingRight: gutter + "px" } : undefined}
      >
        <table>
          <thead>
            <tr>
              <th className="col-item">Item</th>
              <th className="col-qty">Qty</th>
              <th className="col-price">Price</th>
              <th className="col-disc-pct">Disc</th>
              <th className="col-disc-amt">Disc Amt</th>
              <th className="col-total">Subtotal</th>
            </tr>
          </thead>
        </table>
      </div>

      <div className="transaction-table__scroll" ref={scrollRef}>
        <table>
          <tbody>
            {state.cart.map((line, index) => {
              const discAmt = lineDiscount(line);
              const discountCustomer = state.customerType === "senior" || state.customerType === "pwd";
              const discountLabel = state.customerType === "senior" ? "Senior discount" : "PWD discount";
              const discountEligible = state.customerType === "senior"
                ? Boolean(line.seniorDiscountEligible)
                : Boolean(line.pwdDiscountEligible);
              const rowClass =
                "tx-row" +
                (state.selectedIndex === index ? " is-selected" : "") +
                (line.discountPct > 0 ? " tx-row--discount" : "");
              return (
                <tr key={line.id} className={rowClass} onClick={() => actions.selectLine(index)}>
                  <td className="tx-row__item">
                    <span className="tx-row__name">{line.name}</span>
                    <span className="tx-row__sku">{line.sku}</span>
                    {discountCustomer && (
                      <span className={"tx-row__eligibility " + (discountEligible ? "is-eligible" : "is-ineligible")}>
                        {discountLabel} {discountEligible ? "eligible" : "not eligible"}
                      </span>
                    )}
                  </td>
                  <td className="tx-row__qty-cell">
                    <span className="qty-val">{line.qty}</span>
                  </td>
                  <td className="tx-row__price">{formatPeso(line.price)}</td>
                  <td className="tx-row__disc-pct">
                    <span className={"disc-badge" + (line.discountPct > 0 ? "" : " disc-badge--none")}>
                      {line.discountPct > 0 ? line.discountPct + "%" : "\u2014"}
                    </span>
                  </td>
                  <td className="tx-row__disc-amt">
                    {discAmt > 0 ? "-" + formatPeso(discAmt) : "\u2014"}
                  </td>
                  <td className="tx-row__total">{formatPeso(lineNet(line))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {state.cart.length === 0 && (
          <div className="transaction-table__empty">
            <p className="transaction-table__empty-title">No items yet</p>
            <p className="transaction-table__empty-hint">
              Scan a barcode or search a product to begin.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}