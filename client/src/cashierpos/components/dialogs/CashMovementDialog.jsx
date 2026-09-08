/**
 * CashMovementDialog.jsx
 * --------------------------------------------------------------------------
 * One dialog for the three non-sale drawer movements:
 *   • Cash In   — additional physical cash placed in the drawer
 *   • Cash Out  — physical cash removed from the drawer (petty cash, etc.)
 *   • Cash Drop — manager-only removal to the safe (requiring a manager role)
 * Requires an amount + reason; never touches sales. Results flow straight to
 * the ledger + session totals via the API and update the sidebar state.
 */
import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../../context/PosContext";
import { api } from "../../../api";
import { formatPeso, roundMoney } from "../../utils/calculations";
import Dialog from "./Dialog.jsx";

const DEFINITIONS = {
  cashIn: {
    title: "Cash In",
    desc: "Record additional physical cash added to the drawer (extra change, manager deposit, transfer from another drawer).",
    confirm: "Post Cash In",
    endpoint: "cashIn",
    tone: "success",
  },
  cashOut: {
    title: "Cash Out",
    desc: "Record physical cash removed from the drawer without a sale (petty cash expense, supplier payment, cash withdrawal).",
    confirm: "Post Cash Out",
    endpoint: "cashOut",
    tone: "danger",
  },
  cashDrop: {
    title: "Cash Drop / Safe Drop",
    desc: "Manager removal: transfer cash from the drawer to the safe. Requires a Manager or Administrator.",
    confirm: "Record Cash Drop",
    endpoint: "cashDrop",
    tone: "danger",
    managerOnly: true,
  },
};

export default function CashMovementDialog({ dialog }) {
  const { state, actions, runtime } = usePos();
  const def = DEFINITIONS[dialog.type] || DEFINITIONS.cashIn;
  const close = () => actions.openDialog({ type: "registerActions" });
  const session = state.session;

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(dialog.reason || "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const amountRef = useRef(null);

  useEffect(() => { setTimeout(() => amountRef.current && amountRef.current.focus(), 30); }, []);

  if (!session || session.status !== "Open") {
    return (
      <Dialog title={def.title} onClose={close}>
        <p className="dialog__hint">The register is not open. Open the register first.</p>
      </Dialog>
    );
  }

  const amountNum = roundMoney(Number(amount) || 0);

  const confirm = async () => {
    setError("");
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSaving(true);
    try {
      const token = runtime && runtime.sessionToken;
      const result = await api[def.endpoint](session.id, { amount: amountNum, reason: reason.trim(), notes: notes.trim() || undefined }, token);
      actions.setSession(result.session);
      actions.showToast(def.title + " · " + formatPeso(amountNum) + " posted", true, "success");
      close();
    } catch (err) {
      setError((err && err.message) || "Unable to post the movement.");
      setSaving(false);
    }
  };

  return (
    <Dialog title={def.title} onClose={close} className="cash-movement">
      <p className="dialog__hint">{def.desc}</p>
      {def.managerOnly && (
        <p className="dialog__hint cash-movement__manager-note">
          Authorization required: a manager must be signed in to confirm this.
        </p>
      )}

      {error && <div className="dialog__error">{error}</div>}

      <div className="open-register__amount">
        <label className="payment__label" htmlFor="cash-movement-amount">Amount</label>
        <input
          id="cash-movement-amount"
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
      </div>

      <label className="payment__label" htmlFor="cash-movement-reason">Reason</label>
      <input
        id="cash-movement-reason"
        className="dialog__text-input"
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={def.title === "Cash In" ? "e.g. Additional change money" : "e.g. Petty cash expense"}
        maxLength={200}
      />

      <label className="payment__label" htmlFor="cash-movement-notes">Notes (optional)</label>
      <input
        id="cash-movement-notes"
        className="dialog__text-input"
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional reference / note"
        maxLength={200}
      />

      <div className="dialog__footer-row">
        <span className="dialog__hint">Current drawer after posting</span>
        <strong>
          {formatPeso(def.title === "Cash In" ? session.summary.expectedCash + amountNum : session.summary.expectedCash - amountNum)}
        </strong>
      </div>

      <div className="dialog__footer-actions">
        <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="dialog-btn dialog-btn--primary" onClick={confirm} disabled={saving}>
          {saving ? "Posting…" : def.confirm}
        </button>
      </div>
    </Dialog>
  );
}