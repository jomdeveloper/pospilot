/**
 * SidePanels.jsx
 * --------------------------------------------------------------------------
 * Right-hand column of the cashier screen (400px). Stacks the Customer card,
 * the Quick Actions grid, the Transaction Summary and the Cancel / Pay
 * buttons. The summary block grows to fill the panel's height so the column's
 * content stretches edge-to-edge.
 */
import React from "react";
import { usePos } from "../context/PosContext";
import { customerTypeLabel } from "../data/customerTypes";
import QuickActions from "./QuickActions.jsx";
import TransactionSummary from "./TransactionSummary.jsx";
import { useButtonFlash } from "./useButtonFlash.js";

export default function SidePanels() {
  const { state, actions, dispatchAction } = usePos();

  // Flash the Cancel / Pay buttons when triggered by their F9 / F8 shortcuts.
  const cancelPressed = state.pressedButton === "cancel";
  useButtonFlash(cancelPressed, actions.clearPress);
  const payPressed = state.pressedButton === "pay";
  useButtonFlash(payPressed, actions.clearPress);
  // Recall uses the F7 id (bottom-F7) so both the Quick Actions tile and this
  // dedicated button flash when the F7 shortcut fires.
  const recallPressed = state.pressedButton === "bottom-F7";
  useButtonFlash(recallPressed, actions.clearPress);

  const customerName = state.customer || "Walk-in";
  const initials = state.customer
    ? state.customer.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
    : "WI";
  const isDiscountCustomer =
    state.customerType === "senior" || state.customerType === "pwd";
  const customerTypeLabelText = customerTypeLabel(state.customerType);
  // Badge colors per type (inline style — the type comes from dynamic state so
  // a Tailwind class per type would be purged by the content scanner).
  const badgeStyleMap = {
    member: { background: "linear-gradient(180deg,#6ec78f,#3e8f5f)", borderColor: "#2c6b45" },
    senior: { background: "linear-gradient(180deg,#e8934a,#c96f2e)", borderColor: "#9c541f" },
    pwd: { background: "linear-gradient(180deg,#9a7fe6,#7050c4)", borderColor: "#563a9c" },
    default: { background: "linear-gradient(180deg,#3b82f6,#1d4ed8)", borderColor: "#1e40af" }
  };
  const customerMeta = state.customer
    ? isDiscountCustomer
      ? state.customerType + " · " + (state.customerId ? state.customerId : "ID required")
      : state.customerType === "member"
        ? "Member · " + (state.customerId ? state.customerId : "ID required")
        : "Customer on file"
    : "No customer set — press F2 to add";

  const cancel = () => {
    actions.pressButton("cancel");
    dispatchAction("cancelTransaction");
  };
  const pay = () => {
    actions.pressButton("pay");
    dispatchAction("payment");
  };
  const hold = () => {
    actions.pressButton("hold");
    dispatchAction("hold");
  };
  const pause = () => {
    actions.setSearchQuery(""); // clear any half-typed search while paused
    actions.pauseTransaction();
    actions.showToast("Transaction paused", false, "hold");
  };
  const recall = () => {
    actions.pressButton("bottom-F7");
    dispatchAction("recall");
  };

  // The right panel is hidden while Ready OR Paused — only the workspace's
  // New Transaction / Resume Transaction button is active in those modes.
  const rightHidden = state.standby || state.paused;

  return (
    <aside className={"pos-sidebar" + (rightHidden ? " pos-sidebar--standby" : "")} aria-label="Side panels">
      {!rightHidden && (
        <>
          <div className="sidebar-block">
        <div className="sidebar-block__title">Customer</div>
        <div className="customer-card">
          <div className="customer-card__avatar" aria-hidden="true">{initials}</div>
          <div className="customer-card__info">
            <div className="customer-card__name">
              {customerName}
              {state.customerType !== "walkin" && (
                <span
                  className="cust-type-badge"
                  style={badgeStyleMap[state.customerType] || badgeStyleMap.default}
                >
                  {customerTypeLabelText}
                </span>
              )}
            </div>
            <div className="customer-card__meta">{customerMeta}</div>
          </div>
        </div>
      </div>

      <div className="sidebar-block sidebar-block--quick">
        <div className="sidebar-block__title">Quick Actions</div>
        <QuickActions />
      </div>

      <div className="sidebar-block sidebar-block--summary">
        <div className="sidebar-block__title">Transaction Summary</div>
        <TransactionSummary />
      </div>

      {/* Pay spans the full width; Hold + Recall share an equal-width row, and
          Pause + Cancel an equal-width row underneath (all always visible). */}
      <div className="pos-paybar">
        <button
          type="button"
          className={"pos-btn pos-btn--pay" + (payPressed ? " is-pressed" : "")}
          onClick={pay}
        >
          <span className="pos-btn__key" aria-hidden="true">F8</span>
          Pay
        </button>

        <div className="pos-paybar__row">
          <button
            type="button"
            className="pos-btn pos-btn--hold"
            onClick={hold}
          >
            <span className="pos-btn__key" aria-hidden="true">F6</span>
            ⏸ Hold
          </button>
          <button
            type="button"
            className={"pos-btn pos-btn--recall" + (recallPressed ? " is-pressed" : "")}
            onClick={recall}
            title="Recall a held sale (F7)"
          >
            <span className="pos-btn__key" aria-hidden="true">F7</span>
            ↺ Recall
            {state.heldSales.length > 0 && (
              <span className="pos-btn__badge" aria-label={state.heldSales.length + " held transaction(s)"}>
                {state.heldSales.length}
              </span>
            )}
          </button>
        </div>

        <div className="pos-paybar__row">
          <button
            type="button"
            className="pos-btn pos-btn--pause"
            onClick={pause}
            title="Pause the current transaction"
          >
            <span className="pos-btn__key" aria-hidden="true">⏸</span>
            Pause
          </button>
          <button
            type="button"
            className={"pos-btn pos-btn--cancel" + (cancelPressed ? " is-pressed" : "")}
            onClick={cancel}
          >
            <span className="pos-btn__key" aria-hidden="true">F9</span>
            ✕ Cancel
          </button>
        </div>
      </div>
        </>
      )}
    </aside>
  );
}