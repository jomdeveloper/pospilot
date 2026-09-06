/**
 * CloseRegisterDialog.jsx
 * --------------------------------------------------------------------------
 * Cashier-session closing / reconciliation screen. Displays the full drawer
 * summary (opening float, cash sales, refunds, paid in/out, drops, expected
 * cash) then asks for the ACTUAL cash counted — either typed directly or
 * counted denomination-by-denomination. Over/Short is computed live against
 * the expected amount. The session only closes after the cashier confirms.
 */
import React, { useEffect, useMemo, useState } from "react";
import { usePos } from "../../context/PosContext";
import { api } from "../../../api";
import { formatPeso, roundMoney } from "../../utils/calculations";
import { emptyDenominationCounts, denominationBreakdown, denominationSubtotals } from "../../data/denominations";
import DenominationCounter from "./DenominationCounter.jsx";
import Dialog from "./Dialog.jsx";

function SummaryRow({ label, value, tone, bold }) {
  return (
    <div className={"close-register__row" + (bold ? " is-bold" : "")} style={tone ? { color: tone } : undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function CloseRegisterDialog() {
  const { state, actions, runtime } = usePos();
  const close = () => actions.closeDialog();
  const session = state.session;

  const summary = useMemo(() => (session ? session.summary : null), [session]);

  const [mode, setMode] = useState("count"); // count | amount
  const [actual, setActual] = useState("");
  const [counts, setCounts] = useState(emptyDenominationCounts());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => { setCounts(emptyDenominationCounts()); }, [state.session && state.session.id]);

  if (!session || session.status !== "Open" || !summary) {
    return (
      <Dialog title="Close Register" onClose={close}>
        <p className="dialog__hint">The register is not open.</p>
      </Dialog>
    );
  }

  const countTotals = mode === "count" ? denominationSubtotals(counts) : null;
  const actualCash =
    mode === "count" ? (countTotals ? countTotals.total : 0) : roundMoney(Number(actual) || 0);
  const expected = summary.expectedCash;
  const difference = roundMoney(actualCash - expected);
  const differenceStatus = Math.abs(difference) < 0.005 ? "EXACT" : difference > 0 ? "OVER" : "SHORT";

  const confirm = async () => {
    setError("");
    if (!Number.isFinite(actualCash) || actualCash < 0) {
      setError("Actual cash counted cannot be negative.");
      return;
    }
    if (mode === "count" && !Object.values(counts).some((v) => Number(v) > 0)) {
      setError("Enter at least one denomination quantity, or switch to 'Enter Total Amount'.");
      return;
    }
    if (mode === "amount" && actual.trim() === "") {
      setError("Enter the actual cash counted.");
      return;
    }
    setSaving(true);
    try {
      const token = runtime && runtime.sessionToken;
      const result = await api.closeCashierSession(
        session.id,
        {
          actualCash: mode === "amount" ? actualCash : undefined,
          denominationCounts: mode === "count" ? counts : null,
          notes: notes.trim() || undefined,
        },
        token
      );
      actions.setSession(null); // register gate reappears
      setDone(result);
    } catch (err) {
      setError((err && err.message) || "Unable to close the register.");
      setSaving(false);
    }
  };

  if (done) {
    const diff = roundMoney(done.difference || 0);
    const status = done.differenceStatus;
    return (
      <Dialog wide title="Register Closed" onClose={close} hideClose className="close-register">
        <div className="close-register__result">
          <div className={"close-register__status " + (status === "EXACT" ? "is-exact" : status === "OVER" ? "is-over" : "is-short")}>
            {status === "EXACT" ? "EXACT — Cash balanced" : status === "OVER" ? "OVER " + formatPeso(Math.abs(diff)) : "SHORT " + formatPeso(Math.abs(diff))}
          </div>
          <div className="close-register__result-grid">
            <span>Expected Cash</span><strong>{formatPeso(done.expectedCash)}</strong>
            <span>Actual Cash Counted</span><strong>{formatPeso(done.actualCash)}</strong>
            <span>Cash Difference</span>
            <strong style={{ color: status === "EXACT" ? "#15803d" : status === "OVER" ? "#b45309" : "#b91c1c" }}>
              {diff >= 0 ? "+" : "−"}{formatPeso(Math.abs(diff))}
            </strong>
          </div>
          {done.session && done.session.sessionRef && (
            <p className="dialog__hint">Session {done.session.sessionRef} · closed {done.session.closedAt}</p>
          )}
          <button type="button" className="dialog-btn dialog-btn--primary" onClick={close}>
            Done
          </button>
        </div>
      </Dialog>
    );
  }
return (
    <Dialog wide title="Close Register — Cash Reconciliation" onClose={close} className="close-register">
      <p className="dialog__hint">
        Review the drawer, count the actual cash, and confirm. The session is closed only after the
        reconciliation is completed.
      </p>

      <div className="close-register__summary">
        <SummaryRow label="OPENING CASH" value={formatPeso(summary.openingFloat)} />
        <SummaryRow label="CASH SALES" value={formatPeso(summary.cashSales)} />
        <SummaryRow label="CASH REFUNDS" value={"-" + formatPeso(summary.cashRefunds)} tone="#b91c1c" />
        <SummaryRow label="CASH PAID IN" value={formatPeso(summary.cashPaidIn)} />
        <SummaryRow label="CASH PAID OUT" value={"-" + formatPeso(summary.cashPaidOut)} tone="#b91c1c" />
        {summary.cashDrops > 0 && (
          <SummaryRow label="CASH DROPS" value={"-" + formatPeso(summary.cashDrops)} tone="#b45309" />
        )}
        {summary.adjustmentsIn + summary.adjustmentsOut > 0 && (
          <SummaryRow
            label="CASH ADJUSTMENTS (AUTHORIZED)"
            value={formatPeso(summary.adjustmentsIn - summary.adjustmentsOut)}
            tone="#7c3aed"
          />
        )}
        <div className="close-register__expected">
          <SummaryRow label="EXPECTED CASH" value={formatPeso(expected)} bold />
        </div>
      </div>

      <div className="open-register__tabs" role="group" aria-label="Actual cash entry mode">
        <button
          type="button"
          className={"open-register__tab" + (mode === "count" ? " is-active" : "")}
          onClick={() => setMode("count")}
        >
          Count Cash by Denomination
        </button>
        <button
          type="button"
          className={"open-register__tab" + (mode === "amount" ? " is-active" : "")}
          onClick={() => setMode("amount")}
        >
          Enter Total Amount
        </button>
      </div>

      {error && <div className="dialog__error">{error}</div>}

      {mode === "count" ? (
        <DenominationCounter counts={counts} onChange={setCounts} />
      ) : (
        <div className="open-register__amount">
          <label className="payment__label" htmlFor="actual-cash-input">Actual Cash Counted</label>
          <input
            id="actual-cash-input"
            data-focus
            className="payment__cash-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={actual}
            onChange={(e) => setActual(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>
      )}

      <label className="payment__label" htmlFor="close-register-notes">Notes (optional)</label>
      <input
        id="close-register-notes"
        className="dialog__text-input"
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional closing note"
        maxLength={200}
      />

      <div className="close-register__compare">
        <div>
          <span>Total Cash Counted</span>
          <strong>{formatPeso(actualCash)}</strong>
        </div>
        <div className={differenceStatus === "EXACT" ? "is-exact" : differenceStatus === "OVER" ? "is-over" : "is-short"}>
          <span>{differenceStatus === "EXACT" ? "Difference" : differenceStatus === "OVER" ? "Cash Over" : "Cash Short"}</span>
          <strong>
            {differenceStatus === "EXACT"
              ? "₱0.00"
              : (difference > 0 ? "+" : "−") + formatPeso(Math.abs(difference))}
          </strong>
        </div>
      </div>

      <div className="dialog__footer-actions">
        <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close} disabled={saving}>
          Back
        </button>
        <button type="button" className="dialog-btn dialog-btn--primary" onClick={confirm} disabled={saving}>
          {saving ? "Closing…" : "Confirm & Close Session"}
        </button>
      </div>
    </Dialog>
  );
}