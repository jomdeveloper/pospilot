import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../../context/PosContext";
import Icon from "../Icon.jsx";
import Dialog from "./Dialog.jsx";

const ACTIONS = [
  { id: "cashIn", label: "Cash In", eyebrow: "Drawer movement", description: "Add physical cash to the drawer.", icon: "cash", tone: "positive" },
  { id: "cashOut", label: "Cash Out", eyebrow: "Drawer movement", description: "Remove physical cash from the drawer.", icon: "cash", tone: "negative" },
  { id: "closeRegister", label: "Close Register", eyebrow: "End of shift", description: "Count the drawer and close this session.", icon: "clock", tone: "closing" },
];

export default function RegisterActionsDialog() {
  const { actions, dispatchAction } = usePos();
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRefs = useRef([]);
  const close = () => actions.closeDialog();

  useEffect(() => {
    const button = buttonRefs.current[activeIndex];
    if (button) button.focus();
  }, [activeIndex]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((current) => (current + direction + ACTIONS.length) % ACTIONS.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        dispatchAction(ACTIONS[activeIndex].id);
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeIndex, dispatchAction]);

  return (
    <Dialog title="Register Actions" onClose={close} className="register-actions-dialog">
      <p className="dialog__hint">Choose an action for the current cashier session.</p>
      <div className="register-actions-dialog__list">
        {ACTIONS.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => (buttonRefs.current[index] = element)}
            type="button"
            className={"register-actions-dialog__button" + (index === activeIndex ? " is-selected" : "")}
            onFocus={() => setActiveIndex(index)}
            onClick={() => dispatchAction(item.id)}
          >
            <span className={"register-actions-dialog__icon is-" + item.tone}>
              <Icon name={item.icon} />
            </span>
            <span className="register-actions-dialog__copy">
              <small>{item.eyebrow}</small>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </span>
            <span className="register-actions-dialog__arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <div className="dialog__footer-actions">
        <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
