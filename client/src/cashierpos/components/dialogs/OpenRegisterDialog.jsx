/**
 * OpenRegisterDialog.jsx
 * --------------------------------------------------------------------------
 * The register gate shown whenever this terminal has NO open cashier session.
 * The cashier cannot sell until they open the register with an opening cash
 * float (the starting drawer cash — NOT revenue). The float can be entered as
 * a plain amount or counted denomination-by-denomination; the denomination
 * mode auto-calculates the total.
 */
import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../../context/PosContext";
import { api } from "../../../api";
import { formatPeso, roundMoney } from "../../utils/calculations";
import { emptyDenominationCounts, denominationBreakdown, denominationSubtotals } from "../../data/denominations";
import DenominationCounter from "./DenominationCounter.jsx";
import Dialog from "./Dialog.jsx";

const QUICK_AMOUNTS = [0, 500, 1000, 2000, 5000];

export default function OpenRegisterDialog({ terminal }) {
  const { state, actions, runtime } = usePos();
  const close = () => actions.closeDialog();

  const [mode, setMode] = useState("amount"); // amount | denominations
  const [amount, setAmount] = useState("1000");
  const [counts, setCounts] = useState(emptyDenominationCounts());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const amountRef = useRef(null);

  // All hooks before any conditional return (Rules of Hooks).
  const primary = () => amountRef.current && amountRef.current.focus();
  useEffect(() => { setTimeout(primary, 30); }, [mode]);

  // If a session is already open when this dialog renders (e.g. the app
  // restarted mid-shift and the server fetched it while the gate was shown),
  // let the cashier keep the live session instead of opening a duplicate.
  if (state.session && state.session.status === "Open") {
    return (
      <Dialog wide title="Register Already Open" onClose={close}>
        <div className="open-register__preview" style={{ margin: 0 }}>
          <span>Active session</span>
          <strong>{state.session.sessionRef}</strong>
        </div>
        <p className="dialog__hint">
          Terminal {terminal} already has an open cashier session
          (opening float {formatPeso(state.session.openingFloat)}). You can continue selling.
        </p>
        <div className="dialog__footer-actions">
          <button type="button" className="dialog-btn dialog-btn--primary" onClick={close}>
            Continue Selling
          </button>
        </div>
      </Dialog>
    );
  }

  const denomTotals = mode === "denominations" ? denominationSubtotals(counts) : null;
  const effectiveTotal = mode === "denominations" ? (denomTotals ? denomTotals.total : 0) : roundMoney(Number(amount) || 0);

  const confirm = async () => {
    setError("");
    if (effectiveTotal < 0 || !Number.isFinite(effectiveTotal)) {
      setError("Opening float cannot be negative.");
      return;
    }
    setSaving(true);
    try {
      const token = runtime && runtime.sessionToken;
      const result = await api.openCashierSession(
        {
          openingFloat: effectiveTotal,
          terminal,
          denominationCounts: mode === "denominations" ? counts : null,
        },
        token
      );
      actions.setSession(result.session);
      actions.showToast(
        "Register opened · Opening float " + formatPeso(result.session.openingFloat),
        true,
        "success"
      );
      close();
    } catch (err) {
      setError((err && err.message) || "Unable to open the register.");
      setSaving(false);
    }
  };

  return (
    <Dialog wide title="Open Register — Opening Cash Float" onClose={close} className="open-register">
      <p className="dialog__hint">
        Enter the starting cash placed in the drawer for <strong>{terminal}</strong>. This float is
        drawer cash, <strong>not sales revenue</strong>. It cannot be edited after opening.
      </p>

      <div className="open-register__tabs" role="group" aria-label="Opening cash entry mode">
        <button
          type="button"
          className={"open-register__tab" + (mode === "amount" ? " is-active" : "")}
          onClick={() => setMode("amount")}
        >
          Enter Total Amount
        </button>
        <button
          type="button"
          className={"open-register__tab" + (mode === "denominations" ? " is-active" : "")}
          onClick={() => setMode("denominations")}
        >
          Count by Denomination
        </button>
      </div>

      {error && <div className="dialog__error">{error}</div>}

      {mode === "amount" ? (
        <div className="open-register__amount">
          <label className="payment__label" htmlFor="opening-float-input">
            Opening Cash Float
          </label>
          <input
            id="opening-float-input"
            ref={amountRef}
            data-focus
            className="payment__cash-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          <div className="payment__quick" role="group" aria-label="Quick opening float amounts">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                className={"payment__quick-btn" + (roundMoney(Number(amount) || 0) === amt ? " is-active" : "")}
                onClick={() => { setAmount(String(amt)); if (amountRef.current) amountRef.current.focus(); }}
              >
                {amt === 0 ? "₱0" : formatPeso(amt)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <DenominationCounter counts={counts} onChange={setCounts} />
      )}

      <div className="open-register__preview">
        <span>Opening Cash Float total</span>
        <strong>{formatPeso(effectiveTotal)}</strong>
      </div>

      <p className="dialog__hint">
        Once confirmed, the float is locked for this session. A correction requires a
        manager-approved cash adjustment (audited).
      </p>

      {mode === "denominations" && denomTotals && (
        <p className="dialog__hint">
          Counted: {Object.keys(denominationBreakdown(counts)).length || 0} denomination(s) · total {formatPeso(denomTotals.total)}
        </p>
      )}

      <DialogFooter saving={saving} onCancel={close} onConfirm={confirm} confirmLabel="Open Register" />
    </Dialog>
  );
}

function DialogFooter({ saving, onCancel, onConfirm, confirmLabel = "Confirm" }) {
  return (
    <>
      <button type="button" className="dialog-btn dialog-btn--ghost" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
      <button type="button" className="dialog-btn dialog-btn--primary" onClick={onConfirm} disabled={saving}>
        {saving ? "Opening…" : confirmLabel}
      </button>
    </>
  );
}
export { DialogFooter };