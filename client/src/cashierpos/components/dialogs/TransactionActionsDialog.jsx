import React, { useEffect, useState } from "react";
import { usePos } from "../../context/PosContext";
import { api } from "../../../api";
import { formatPeso } from "../../utils/calculations";
import Dialog from "./Dialog.jsx";

const VOID_REASONS = ["Wrong item", "Wrong quantity", "Incorrect price", "Duplicate transaction", "Customer cancelled", "Cashier error", "Other"];

export default function TransactionActionsDialog({ initialMode = "void" }) {
  const { actions, runtime } = usePos();
  const token = runtime?.sessionToken;
  const [mode, setMode] = useState(initialMode);
  const [sales, setSales] = useState([]);
  const [selected, setSelected] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState("");
  const [voidReason, setVoidReason] = useState(VOID_REASONS[0]);
  const [description, setDescription] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => actions.closeDialog();

  useEffect(() => {
    api.getSales(token)
      .then((rows) => setSales(Array.isArray(rows) ? rows : []))
      .catch((requestError) => setError(requestError.message || "Unable to load completed transactions."));
  }, [token]);

  const chooseSale = async (sale) => {
    setError("");
    try {
      const detail = await api.getSale(sale.id, token);
      setSelected(detail);
      setQuantities({});
      setReason("");
      setConfirmVoid(false);
    } catch (requestError) {
      setError(requestError.message || "Unable to load transaction.");
    }
  };

  const voidSale = async () => {
    if (!selected || busy) return;
    if (!confirmVoid) {
      setConfirmVoid(true);
      return;
    }
    if (voidReason === "Other" && !description.trim()) {
      setError("Describe the reason when Other is selected.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.voidSale(selected.id, { reason: voidReason, description }, token);
      actions.showToast("Transaction voided", false, "success");
      close();
    } catch (requestError) {
      setError(requestError.message || "Unable to void transaction.");
    } finally {
      setBusy(false);
    }
  };

  const refundSale = async () => {
    if (!selected || busy) return;
    const items = selected.items
      .filter((item) => Number(quantities[item.id]) > 0)
      .map((item) => ({ itemId: item.id, quantity: Number(quantities[item.id]) }));
    if (!items.length) {
      setError("Choose at least one item to return.");
      return;
    }
    if (!reason.trim()) {
      setError("Enter a refund reason.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.returnSale(selected.id, { items, reason, refundMethod }, token);
      actions.showToast(`Refund completed: ${formatPeso(result.refundTotal)}`, false, "success");
      close();
    } catch (requestError) {
      setError(requestError.message || "Unable to process refund.");
    } finally {
      setBusy(false);
    }
  };

  const returnableItems = selected?.items?.filter((item) => Number(item.returnable_qty) > 0) || [];
  const availableSales = sales.filter((sale) => {
    const status = String(sale.status || "COMPLETED").toUpperCase();
    if (mode === "void") return status === "COMPLETED";
    return !["VOIDED", "CANCELLED", "FULLY_REFUNDED"].includes(status) && Number(sale.returnable_count) > 0;
  });

  return (
    <Dialog wide title={mode === "void" ? "Void Transaction" : "Refund / Return"} onClose={close} footer={
      <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close} disabled={busy}>Close</button>
    }>
      <div className="settings__seg" role="tablist" aria-label="Transaction action">
        <button type="button" className={"settings__seg-btn" + (mode === "void" ? " is-active" : "")} onClick={() => { setMode("void"); setSelected(null); }}>Void Transaction</button>
        <button type="button" className={"settings__seg-btn" + (mode === "refund" ? " is-active" : "")} onClick={() => { setMode("refund"); setSelected(null); }}>Refund / Return</button>
      </div>
      {error && <p className="dialog__hint" style={{ color: "#b91c1c" }}>{error}</p>}
      {!selected ? (
        <ul className="held-list">
          {availableSales.length === 0 && <li className="held-list__item"><span><strong>No eligible completed transactions.</strong><span className="held-list__meta">Completed sales appear here after payment.</span></span></li>}
          {availableSales.map((sale) => (
            <li key={sale.id} className="held-list__item" onClick={() => chooseSale(sale)}>
              <span><strong>{sale.transaction_ref || `Sale #${sale.id}`}</strong><span className="held-list__meta">{sale.customer || "Walk-in Customer"} · {sale.created_at}</span></span>
              <strong>{formatPeso(sale.grand_total)}</strong>
            </li>
          ))}
        </ul>
      ) : mode === "void" ? (
        <div className="cancel">
          <div className="cancel__title">Void Transaction?</div>
          <p className="dialog__hint cancel__desc">This will reverse the completed sale and restore the affected inventory. This action will be recorded in the audit log.</p>
          <label className="form-row"><span>Reason</span><select value={voidReason} onChange={(event) => setVoidReason(event.target.value)}>{VOID_REASONS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="form-row"><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Required for Other" /></label>
          <div className="dialog__actions"><button type="button" className="dialog-btn dialog-btn--ghost" onClick={() => setConfirmVoid(false)} disabled={busy}>Go Back</button><button type="button" className="dialog-btn dialog-btn--primary dialog-btn--danger" onClick={voidSale} disabled={busy}>{busy ? "Voiding..." : confirmVoid ? "Void Transaction" : "Review Void"}</button></div>
        </div>
      ) : (
        <div className="settings">
          <p className="dialog__hint">Select returned quantities from {selected.transaction_ref || `Sale #${selected.id}`}.</p>
          {returnableItems.map((item) => <label key={item.id} className="form-row"><span>{item.name} · purchased {item.qty}, returnable {item.returnable_qty}</span><input type="number" min="0" max={item.returnable_qty} step="1" value={quantities[item.id] || ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} /></label>)}
          <label className="form-row"><span>Refund method</span><select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank">Bank transfer</option><option value="other">Other</option></select></label>
          <label className="form-row"><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for return" /></label>
          <div className="dialog__actions"><button type="button" className="dialog-btn dialog-btn--ghost" onClick={() => setSelected(null)} disabled={busy}>Back</button><button type="button" className="dialog-btn dialog-btn--primary" onClick={refundSale} disabled={busy}>{busy ? "Processing..." : "Complete Refund"}</button></div>
        </div>
      )}
    </Dialog>
  );
}
