/**
 * DenominationCounter.jsx
 * --------------------------------------------------------------------------
 * Reusable coin/bill count grid used by BOTH the opening-float screen and the
 * closing cash-count screen. The cashier types a quantity next to each
 * denomination; the component shows Denomination × Quantity = Subtotal and
 * the running TOTAL. Pure presentational component — the parent owns the
 * `counts` state so the same grid can seed either an opening or closing screen.
 */
import React from "react";
import {
  PHILIPPINE_DENOMINATIONS,
  denominationSubtotals,
  emptyDenominationCounts,
} from "../../data/denominations";

function formatDenom(value) {
  return "₱" + Number(value).toLocaleString("en-PH", {
    minimumFractionDigits: value < 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

export default function DenominationCounter({ counts = emptyDenominationCounts(), onChange, compact = false }) {
  const { subtotals, total } = denominationSubtotals(counts);

  const setQty = (denom, value) => {
    const sanitized = value.replace(/[^0-9]/g, "");
    onChange({ ...counts, [String(denom)]: sanitized });
  };

  const renderRow = (denom) => (
    <div className={"denom-grid__row" + (compact ? " is-compact" : "")} key={String(denom)}>
      <span className="denom-grid__name">
        {denom >= 20 ? "Bill" : "Coin"}
        <strong>{formatDenom(denom)}</strong>
      </span>
      <span className="denom-grid__qty-wrap">
        <input
          type="text"
          inputMode="numeric"
          className="denom-grid__qty"
          value={counts[String(denom)] || ""}
          onChange={(e) => setQty(denom, e.target.value)}
          placeholder="0"
          aria-label={`Quantity of ${formatDenom(denom)}`}
        />
        <span className="denom-grid__times">×</span>
        <span className="denom-grid__denom">₱{denom}</span>
      </span>
      <span className="denom-grid__subtotal">{formatPeso(subtotals[String(denom)] || 0)}</span>
    </div>
  );

  return (
    <div className="denom-count">
      <div className="denom-grid">
        <div className="denom-grid__header">
          <span>Denomination</span>
          <span>Quantity</span>
          <span>Subtotal</span>
        </div>
        <div className="denom-grid__group">
          <div className="denom-grid__group-title">Coins</div>
          {PHILIPPINE_DENOMINATIONS.coins.map(renderRow)}
        </div>
        <div className="denom-grid__group">
          <div className="denom-grid__group-title">Bills</div>
          {PHILIPPINE_DENOMINATIONS.bills.map(renderRow)}
        </div>
      </div>
      <div className="denom-count__total">
        <span>Total Cash Counted</span>
        <strong>{formatPeso(total)}</strong>
      </div>
    </div>
  );
}

function formatPeso(value) {
  return "₱" + Number(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}