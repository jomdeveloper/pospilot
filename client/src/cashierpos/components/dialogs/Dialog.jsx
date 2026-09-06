/**
 * Dialog.jsx
 * --------------------------------------------------------------------------
 * Generic modal shell, ported from the vanilla `openDialog()` helper. Renders
 * a fixed backdrop + dialog panel. Closes ONLY via the header Close (×)
 * button or the Escape key — clicking the backdrop / outside never closes it
 * (prevents accidental dismissal while a cashier is mid-entry). Focus moves
 * into the first `[data-focus]` / primary button inside on open.
 */
import React, { useEffect, useRef, useState } from "react";

export default function Dialog({ title, header, onClose, children, footer, wide, hideClose, receipt, className }) {
  const panelRef = useRef(null);
  const [leaving, setLeaving] = useState(false);

  // Drive the exit animation: first trigger "leaving", call onClose after it
  // finishes so the CSS transition plays before unmount.
  const requestClose = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => onClose(), 180); // matches the exit transition duration
  };

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }

      if (e.key === "Enter") {
        const panel = panelRef.current;
        if (!panel) return;
        const target = e.target;
        const typingInDialog =
          target && target.tagName === "INPUT" && !!target.closest(".dialog");
        if (typingInDialog) return;
        const primary = panel.querySelector(".dialog-btn--primary");
        if (primary) {
          e.preventDefault();
          primary.click();
        }
        return;
      }
    }
    document.addEventListener("keydown", onKey);

    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const el =
        panel.querySelector("[data-focus]") ||
        panel.querySelector(".dialog-btn--primary") ||
        panel.querySelector("input, select, button");
      if (el) el.focus();
    }, 0);

    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      className={"dialog-backdrop" + (leaving ? " is-leaving" : "")}
      onClick={() => {}}
    >
      <section
        className={
          "dialog" +
          (wide ? " dialog--wide" : "") +
          (receipt ? " dialog--receipt" : "") +
          (className ? " " + className : "")
        }
        role="dialog"
        aria-modal="true"
        aria-label={header ? undefined : title}
        ref={panelRef}
      >
        <header className="dialog__header">
          {header ? header : <span className="dialog__title">{title}</span>}
          {!hideClose && (
            <button
              type="button"
              className="focus dialog__close"
              aria-label="Close"
              onClick={requestClose}
            >
              &times;
            </button>
          )}
        </header>

        <div className="dialog__body">{children}</div>

        {footer ? <footer className="dialog__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}