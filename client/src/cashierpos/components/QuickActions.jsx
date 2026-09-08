/**
 * QuickActions.jsx
 * --------------------------------------------------------------------------
 * The right-side "Quick Actions" grid. Each tile matches the design's look
 * (key-cap chip top-right, icon, bold label) but is wired to the app's real
 * function-key actions so the shortcuts stay honest: F2 = Search,
 * F3 = Quantity, F4 = Customer, F5 = Discount, DEL = Remove, F10 = More.
 * (Scan barcode F1 has no tile — the toolbar's barcode field is always visible.)
 * Icons use the app's inline SVG registry (matches the rest of the UI).
 */
import React from "react";
import { usePos } from "../context/PosContext";
import Icon from "./Icon.jsx";
import { useButtonFlash } from "./useButtonFlash.js";

const QUICK_ACTIONS = [
  { key: "F2", name: "Search", icon: "tag", action: "productSearch" },
  { key: "F3", name: "Quantity", icon: "qty", action: "quantity" },
  { key: "F4", name: "Customer", icon: "user", action: "customer" },
  { key: "F5", name: "Discount", icon: "percent", action: "discount" },
  { key: "DEL", name: "Remove", icon: "void", action: "void" },
  { key: "F10", name: "More", icon: "more", action: "more" }
];

function QuickActionButton({ def }) {
  const { state, actions, dispatchAction } = usePos();
  // The same id scheme the global shortcuts flash in App.jsx (`bottom-<key>`).
  const buttonId = `bottom-${def.key}`;
  const isPressed = state.pressedButton === buttonId;
  useButtonFlash(isPressed, actions.clearPress);

  const handleClick = () => {
    actions.pressButton(buttonId);
    dispatchAction(def.action);
  };

  return (
    <button
      type="button"
      className={"quick-action" + (isPressed ? " is-pressed" : "")}
      onClick={handleClick}
      title={def.name + " (" + def.key + ")"}
    >
      <span className="quick-action__key">{def.key}</span>
      <span className="quick-action__icon" aria-hidden="true">
        <Icon name={def.icon} />
      </span>
      <span className="quick-action__name">{def.name}</span>
    </button>
  );
}

export default function QuickActions() {
  return (
    <div className="quick-actions">
      {QUICK_ACTIONS.map((def) => (
        <QuickActionButton key={def.key + def.action} def={def} />
      ))}
    </div>
  );
}