/**
 * RegisterGate.jsx
 * --------------------------------------------------------------------------
 * Full-screen gate shown when this terminal has NO open cashier session.
 * Selling is impossible until the register is opened with an opening cash
 * float. Presents the brand mark + an "Open Register" button which auto-opens
 * the opening-cash dialog on first render.
 */
import React, { useEffect } from "react";
import { usePos } from "../context/PosContext";
import { getStoreLogo, PHARMACY } from "../data/storeConfig";

export default function RegisterGate() {
  const { state, actions, dispatchAction, runtime } = usePos();
  const storeLogo = getStoreLogo();
  const storeName = PHARMACY.name || "My Store";
  const terminal = (runtime && runtime.terminal) || "POS-02";

  // Auto-open the opening-cash dialog once (no dialog is open when the gate
  // first renders so the cashier is guided straight into the float entry).
  useEffect(() => {
    if (!state.dialog) {
      const t = setTimeout(() => dispatchAction("openRegister"), 250);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <div className="register-gate">
      <div className="standby">
        <img className="standby__logo" src={storeLogo} alt={storeName + " logo"} />
        <p className="standby__desc">
          <strong>{terminal}</strong> is closed.
          <br />
          Press <strong>Open Register</strong> and enter the opening cash float to begin the shift.
        </p>
        <button
          type="button"
          className="standby__new"
          onClick={() => actions.openDialog({ type: "openRegister" })}
          title="Open the register with the opening cash float"
        >
          Open Register
        </button>
      </div>
    </div>
  );
}