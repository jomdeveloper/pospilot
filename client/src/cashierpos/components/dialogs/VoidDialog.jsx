/**
 * VoidDialog.jsx
 * Port of `actionVoid()`. Confirms removal of the selected cart line.
 */
import React from "react";
import { usePos } from "../../context/PosContext";
import Dialog from "./Dialog.jsx";

export default function VoidDialog({ dialog }) {
  const { actions } = usePos();
  const close = () => actions.closeDialog();

  const voidIt = () => {
    actions.voidLine(dialog.lineId);
    actions.showToast("Removed: " + dialog.name, false, "removed");
    close();
  };

  return (
    <Dialog
      title="Remove Item"
      onClose={close}
      footer={
        <>
          <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close}>
            Cancel
          </button>
          <button type="button" className="dialog-btn dialog-btn--primary" onClick={voidIt}>
            Remove item
          </button>
        </>
      }
    >
      <p className="dialog__hint">
        Remove <strong>{dialog.name}</strong> (x{dialog.qty}) from this transaction?
      </p>
    </Dialog>
  );
}