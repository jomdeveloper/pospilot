/**
 * VoidDialog.jsx
 * Port of `actionVoid()`. Confirms removal of the selected cart line.
 */
import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../../context/PosContext";
import { formatPeso } from "../../utils/calculations";
import Dialog from "./Dialog.jsx";

export default function VoidDialog({ dialog }) {
  const { actions } = usePos();
  const [selectedAction, setSelectedAction] = useState(1);
  const buttonRefs = useRef([]);
  const close = () => actions.closeDialog();

  const voidIt = () => {
    actions.voidLine(dialog.lineId);
    actions.showToast("Removed: " + dialog.name, false, "removed");
    close();
  };

  useEffect(() => {
    const button = buttonRefs.current[selectedAction];
    if (button) button.focus();
  }, [selectedAction]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        setSelectedAction((current) => (current + direction + 2) % 2);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const button = buttonRefs.current[selectedAction];
        if (button) button.click();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedAction]);

  const selectAction = (index) => setSelectedAction(index);

  return (
    <Dialog
      className="dialog--remove-item"
      title="Remove Item"
      onClose={close}
      footer={
        <>
          <button
            ref={(element) => (buttonRefs.current[0] = element)}
            type="button"
            className={"dialog-btn dialog-btn--ghost" + (selectedAction === 0 ? " dialog-btn--selected" : "")}
            onFocus={() => selectAction(0)}
            onClick={close}
          >
            Cancel
          </button>
          <button
            ref={(element) => (buttonRefs.current[1] = element)}
            type="button"
            data-focus
            className={"dialog-btn dialog-btn--danger" + (selectedAction === 1 ? " dialog-btn--selected" : "")}
            onFocus={() => selectAction(1)}
            onClick={voidIt}
          >
            Remove item
          </button>
        </>
      }
    >
      <div className="remove-item-dialog">
        <h3 className="remove-item-dialog__name">{dialog.name}</h3>
        <p className="remove-item-dialog__message">Remove this item from the current transaction?</p>
        <div className="remove-item-dialog__details">
          <div><span>Price</span><strong>{formatPeso(dialog.price)}</strong></div>
          <div><span>Quantity</span><strong>{dialog.qty}</strong></div>
          <div><span>Total</span><strong>{formatPeso(dialog.total)}</strong></div>
        </div>
      </div>
    </Dialog>
  );
}