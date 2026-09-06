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
import Icon from "./Icon.jsx";
import { usePos } from "../context/PosContext";
import { CASHIER, COUNTER, PHARMACY, getStoreLogo } from "../data/storeConfig";

export default function PosHeader() {
  const { state, runtime } = usePos();
  const cashierName = (runtime && runtime.cashierName) || CASHIER;
  const onLogout = runtime && runtime.onLogout;
  const storeName = PHARMACY.name || "My Store";
  const storeLogo = getStoreLogo();
  const session = state.session;
  const sessionLabel =
    session && session.status === "Open"
      ? "Register Open · Float " + Number(session.openingFloat || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })
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
            Counter {COUNTER} · {cashierName} · {sessionLabel}
          </div>
        </div>
        <div className="pos-header__avatar" aria-hidden="true">
          <Icon name="user" />
        </div>
        {onLogout && (
          <button
            type="button"
            className="pos-header__logout"
            onClick={onLogout}
            title="Sign out of PosPilot"
          >
            Sign out
          </button>
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