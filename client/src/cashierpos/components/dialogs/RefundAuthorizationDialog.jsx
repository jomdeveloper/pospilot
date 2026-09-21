import React, { useState } from "react";
import { usePos } from "../../context/PosContext";
import { api } from "../../../api";
import { formatPeso } from "../../utils/calculations";
import Icon from "../Icon.jsx";
import Dialog from "./Dialog.jsx";

export default function RefundAuthorizationDialog({ dialog }) {
  const { actions, runtime } = usePos();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refund = dialog.refund;
  const authorize = async () => {
    if (!username.trim() || !password) {
      setError("Enter the authorizing manager or administrator username and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.returnSale(refund.saleId, {
        items: refund.items,
        reason: refund.reason,
        refundMethod: refund.refundMethod,
        authorization: { username: username.trim(), password },
      }, runtime?.sessionToken);
      actions.showToast(`Refund completed: ${formatPeso(result.refundTotal)}`, false, "success");
      actions.closeDialog();
    } catch (requestError) {
      setError(requestError.message || "Authorization failed.");
      setBusy(false);
    }
  };

  return (
    <Dialog wide title="Authorize Refund" onClose={() => actions.closeDialog()}>
      <div className="refund-auth__banner">
        <span className="refund-auth__icon" aria-hidden="true"><Icon name="warning" /></span>
        <span><strong>Authorization required</strong><small>Enter approving credentials to complete this refund.</small></span>
      </div>
      {error && <p className="dialog__hint" style={{ color: "#b91c1c" }}>{error}</p>}
      <label className="form-row">
        <span>Authorizing username</span>
        <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus />
      </label>
      <label className="form-row">
        <span>Authorizing password</span>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
      </label>
      <div className="dialog__actions">
        <button type="button" className="dialog-btn dialog-btn--ghost" onClick={() => actions.closeDialog()} disabled={busy}>Cancel</button>
        <button type="button" className="dialog-btn dialog-btn--primary" onClick={authorize} disabled={busy}>
          {busy ? "Authorizing..." : "Authorize Refund"}
        </button>
      </div>
    </Dialog>
  );
}
