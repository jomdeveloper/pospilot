/**
 * PosWorkspace.jsx
 * --------------------------------------------------------------------------
 * Main POS workspace — the wide left column of the cashier screen. Holds the
 * search toolbar (barcode/product search + "+ Add Item") above the scrolling
 * transaction table. When no transaction is in progress it shows a Ready
 * screen (logo + "New Transaction"); a paused transaction shows the same
 * card with a "Resume Transaction" button instead.
 */
import React from "react";
import { usePos } from "../context/PosContext";
import BarcodeSearch from "./BarcodeSearch.jsx";
import TransactionTable from "./TransactionTable.jsx";
import Icon from "./Icon.jsx";
import { getStoreLogo, PHARMACY } from "../data/storeConfig";

export default function PosWorkspace() {
  const { state, actions, dispatchAction } = usePos();
  const storeLogo = getStoreLogo();
  const storeName = PHARMACY.name || "My Store";

  const newTransaction = () => {
    actions.pressButton("newTransaction");
    actions.startTransaction();
    actions.showToast("New transaction started", false, "success");
  };

  const recallTransaction = () => {
    actions.openDialog({ type: "recall" });
  };

  const resume = () => {
    actions.resumeTransaction();
    actions.showToast("Transaction resumed", false, "success");
  };

  if (state.paused) {
    return (
      <section className="pos-workspace pos-workspace--standby" aria-label="Transaction paused">
        <div className="standby">
          <img
            className="standby__logo"
            src={storeLogo}
            alt={storeName + " logo"}
          />
          <p className="standby__desc standby__desc--paused">
            Your current transaction is paused.
            <br />
            Press <strong>Resume Transaction</strong> to continue where you left off.
          </p>
          <button
            type="button"
            className="standby__new standby__resume"
            onClick={resume}
            title="Resume the paused transaction"
          >
            <span className="standby__key" aria-hidden="true">F12</span>
            ▶ Resume Transaction
          </button>
        </div>
      </section>
    );
  }

  if (state.standby) {
    return (
      <section className="pos-workspace pos-workspace--standby" aria-label="Ready">
        <div className="standby">
          <img
            className="standby__logo"
            src={storeLogo}
            alt={storeName + " logo"}
          />
          <p className="standby__desc">
            No active sale.
            <br />
            Press <strong>New Transaction</strong> to begin.
          </p>
          <div className="standby__actions">
            {state.heldSales.length > 0 && (
              <button
                type="button"
                className="standby__new standby__recall"
                onClick={recallTransaction}
                title="Recall a held transaction"
              >
                <span className="standby__icon"><Icon name="recall" /></span>
                Recall Transaction <span className="standby__count">{state.heldSales.length}</span>
              </button>
            )}
            <button
              type="button"
              className="standby__new standby__start"
              onClick={newTransaction}
              title="Start a new sale"
            >
              <span className="standby__key" aria-hidden="true">F11</span>
              + New Transaction
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pos-workspace" aria-label="Point of sale workspace">
      <div className="pos-toolbar">
        <div className="pos-toolbar__search">
          <BarcodeSearch />
        </div>
        <button
          type="button"
          className="pos-toolbar__add"
          onClick={() => dispatchAction("priceCheck")}
          title="Scan a barcode to add an item (F5)"
        >
          + Add Item
        </button>
      </div>

      <div className="pos-cart">
        <TransactionTable />
      </div>
    </section>
  );
}