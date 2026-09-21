import React, { useEffect, useState } from "react";
import { usePos } from "../../context/PosContext";
import { formatPeso } from "../../utils/calculations";
import { api } from "../../../api";
import Dialog from "./Dialog.jsx";

export default function TransferDialog() {
  const { state, actions, runtime, summary } = usePos();
  const [terminals, setTerminals] = useState([]);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getOpenCashierTerminals(runtime?.sessionToken)
      .then((response) => {
        const available = (Array.isArray(response?.terminals) ? response.terminals : [])
          .map((item) => item.terminal)
          .filter((terminal) => terminal && terminal !== runtime?.terminal);
        setTerminals(available);
        setTarget(available[0] || "");
      })
      .catch((requestError) => setError(requestError.message || "Unable to load open POS machines."));
  }, [runtime?.sessionToken, runtime?.terminal]);

  const transfer = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError("");
    const transferred = await actions.transferSale(target);
    if (transferred) {
      actions.closeDialog();
    } else {
      setError("The transaction was not transferred. The current cart is still open.");
    }
    setBusy(false);
  };

  return (
    <Dialog
      title="Transfer Transaction"
      onClose={() => actions.closeDialog()}
      footer={
        <>
          <button type="button" className="dialog-btn dialog-btn--ghost" onClick={() => actions.closeDialog()} disabled={busy}>Cancel</button>
          <button type="button" className="dialog-btn dialog-btn--primary" onClick={transfer} disabled={busy || !target}>
            {busy ? "Transferring..." : "Transfer Transaction"}
          </button>
        </>
      }
    >
      <p className="dialog__hint">Send this active transaction to another open POS. This POS will leave the cart after the transfer succeeds.</p>
      <div className="settings">
        <div className="form-row"><span>Current total</span><strong>{formatPeso(summary.amountDue)}</strong></div>
        <div className="form-row"><span>Items</span><strong>{state.cart.reduce((total, line) => total + (Number(line.qty) || 0), 0)}</strong></div>
        <label className="form-row">
          <span>Destination POS</span>
          <select value={target} onChange={(event) => setTarget(event.target.value)} disabled={busy}>
            <option value="">Select an open POS</option>
            {terminals.map((terminal) => <option key={terminal} value={terminal}>{terminal}</option>)}
          </select>
        </label>
        {terminals.length === 0 && !error && <p className="dialog__hint">No other POS machine currently has an open register.</p>}
        {error && <p className="dialog__hint" style={{ color: "#b91c1c" }}>{error}</p>}
      </div>
    </Dialog>
  );
}
