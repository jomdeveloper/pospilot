/**
 * AboutDialog.jsx
 * Shows POS application info + a quick help reference. Opened via Ctrl+H
 * or the right panel's "About/Help" button. Modern, clean layout that stays
 * within the system's palette.
 */
import React from "react";
import { usePos } from "../../context/PosContext";
import Dialog from "./Dialog.jsx";

const SHORTCUTS = [
  ["Ctrl + H", "About / Help"],
  ["F1", "Product Search"],
  ["F4", "Customer"],
  ["F3", "Quantity"],
  ["F5", "Discount"],
  ["F6", "Hold Sale"],
  ["F7", "Recall"],
  ["F8", "Pay Amount Due"],
  ["F9", "Cancel Transaction"],
  ["F10", "More Actions"],
  ["Enter", "Add highlighted search result / confirm"],
  ["\u2191 \u2193", "Move cart selection / recall list"],
  ["Del / D", "Remove Item"]
];

export default function AboutDialog() {
  const { actions } = usePos();
  const close = () => actions.closeDialog();

  return (
    <Dialog
      wide
      title="About / Help"
      onClose={close}
      footer={
        <button type="button" className="dialog-btn dialog-btn--primary" onClick={close}>
          Close
        </button>
      }
    >
      <div className="about">
        <div className="about__brand">
          <span className="about__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 6v12M8 6v12M12 6v3M12 15v3M16 6v12M4 6v12h16v-2" />
            </svg>
          </span>
          <div className="about__title">
            <strong>StockPos Pilot</strong>
            <em>Point of Sale</em>
          </div>
          <span className="about__badge">v1.1.0</span>
        </div>

        <p className="about__desc">
          A modern, clean Point-of-Sale interface for rapid checkout — scan a
          barcode or search a product to start.
        </p>

        <div className="about__grid">
          <div className="about__panel about__meta">
            <div className="about__panel-title">Application</div>
            <div className="about__meta-rows">
              <div className="about__row">
                <span className="about__label">Platform</span>
                <span className="about__value">Desktop (Electron)</span>
              </div>
              <div className="about__row">
                <span className="about__label">Runtime</span>
                <span className="about__value">React + Vite</span>
              </div>
              <div className="about__row">
                <span className="about__label">Catalog</span>
                <span className="about__value">~100 items</span>
              </div>
            </div>
          </div>

          <div className="about__panel about__shortcuts">
            <div className="about__panel-title">Keyboard shortcuts</div>
            <ul className="about__shortcuts-list">
              {SHORTCUTS.map(([key, desc]) => (
                <li key={key + desc}>
                  <kbd className="about__key">{key}</kbd>
                  <span className="about__shortcut-desc">{desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Dialog>
  );
}