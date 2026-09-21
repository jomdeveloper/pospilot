/**
 * PosHeader.jsx
 * --------------------------------------------------------------------------
 * Top bar of the cashier screen: pharmacy brand (Rx mark + name + mode) on
 * the left,andthe live clock, counter/cashier line and avatar on the
 * right — matching the glossy "S4 Glossy Plastic Blue" header of the design.
 *
 * PosPilot integration: the signed-in cashier's username replaces the static
 * cashier constant,andan optional "Sign out" button appears when `onLogout`
 * is provided by the host app..
 */
import React from "react";
import DateTimeClock from "./DateTimeClock.jsx";
import { usePos } from "../context/PosContext";
import { CASHIER, COUNTER, PHARMACY, getStoreLogo } from "../data/storeConfig";

export default function PosHeader() {
  const { state, runtime, dispatchAction } = usePos();
  const cashierName = (runtime && runtime.cashierName) || CASHIER;
  const onLogout = runtime && runtime.onLogout;
  const storeName = PHARMACY.name || "My Store";
  const storeLogo = getStoreLogo();
  const session = state.session;
  const terminal = (session && session.terminal) || (runtime && runtime.terminal) || `POS-${COUNTER}`;
  const counterMatch = String(terminal).match(/(?:POS|COUNTER)[\s_-]*(\d+)$/i);
  const counterLabel = counterMatch ? counterMatch[1] : terminal;
  const cashFloat = session && session.status === "Open"
    ? session.summary?.expectedCash ?? session.expectedCash ?? session.openingFloat
    : 0;
  const sessionLabel =
    session && session.status === "Open"
      ? "Register Open · Float " + Number(cashFloat || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })
      : "Register Closed";

  return (
    <header className="pos-header">
      <div className="pos-header__brand">
        <img
          className="pos-brand__logo pos-brand__logo--img"
          src={storeLogo}
          alt={storeName + " logo"}
        />
        <div className="pos-brand__copy">
          <div className="pos-brand__name">{storeName}</div>
          <div className="pos-brand__mode">Powered by POS-Pilot</div>
        </div>
      </div>

      <div className="pos-header__right">
        <div className="pos-header__meta">
          <DateTimeClock />
          <div className="pos-header__who">
            Counter {counterLabel} · {cashierName} · {sessionLabel}
          </div>
        </div>
        {(onLogout || (session && session.status === "Open")) && (
          <div className="pos-header__actions">
            {onLogout && (
              <button
                type="button"
                className="pos-header__action"
                onClick={onLogout}
              >
                Sign Out
              </button>
            )}
            {session && session.status === "Open" && (
              <button
                type="button"
                className="pos-header__action pos-header__action--primary"
                onClick={() => dispatchAction("registerActions")}
              >
                Register
              </button>
            )}
          </div>
        )}
        {state.standby && (
          <span className="pos-header__standby">Ready</span>
        )}
        {!state.standby && state.paused && (
          <span className="pos-header__standby">Paused</span>
        )}
      </div>
    </header>
  );
}