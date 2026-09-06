/**
 * TransactionSummary.jsx
 * --------------------------------------------------------------------------
 * Live transaction summary shown in the right-hand sidebar: Items (+subtotal),
 * Discount and Total Due — in the design's stacked rows with a dashed divider
 * before the big Total Due line.
 */
import React from "react";
import { usePos } from "../context/PosContext";
import { formatPeso } from "../utils/calculations";

/** Colored chip that mirrors the customer badge design (Senior orange, PWD purple). */
const DISCOUNT_BADGE = {
  senior: {
    background: "linear-gradient(180deg,#e8934a,#c96f2e)",
    borderColor: "#9c541f"
  },
  pwd: {
    background: "linear-gradient(180deg,#9a7fe6,#7050c4)",
    borderColor: "#563a9c"
  }
};

export default function TransactionSummary() {
  const { state, summary } = usePos();
  const isSeniorOrPwd =
    state.customerType === "senior" || state.customerType === "pwd";

  return (
    <div className="side-summary">
      <div className="side-summary__row">
        <span className="side-summary__label">Items ({summary.itemCount})</span>
        <span className="side-summary__value">{formatPeso(summary.subtotal)}</span>
      </div>

      {summary.discount > 0 && (
        <div className="side-summary__row">
          <span className="side-summary__label">Discount</span>
          <span className="side-summary__value side-summary__value--discount">
            -{formatPeso(summary.discount)}
          </span>
        </div>
      )}

      {isSeniorOrPwd && summary.seniorDiscount > 0 && (
        <div className="side-summary__row">
          <span className="side-summary__label">
            Discount{" "}
            <span
              className="cust-type-badge"
              style={DISCOUNT_BADGE[state.customerType] || DISCOUNT_BADGE.senior}
            >
              {state.customerType === "pwd" ? "PWD 20%" : "SENIOR 20%"}
            </span>
          </span>
          <span className="side-summary__value side-summary__value--discount">
            -{formatPeso(summary.seniorDiscount)}
          </span>
        </div>
      )}

      {summary.discount === 0 && summary.seniorDiscount === 0 && (
        <div className="side-summary__row">
          <span className="side-summary__label">Discount</span>
          <span className="side-summary__value">{formatPeso(0)}</span>
        </div>
      )}

      <div className="side-summary__divider" />
      <div className="side-summary__total">
        <span>Total Due</span>
        <span>{formatPeso(summary.amountDue)}</span>
      </div>
    </div>
  );
}