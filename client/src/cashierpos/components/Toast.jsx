/**
 * Toast.jsx
 * --------------------------------------------------------------------------
 * Status toast. Shows `.is-visible` while a toast message is set, then hides
 * automatically. Every toast is auto-hidden so nothing ever gets stuck:
 *   – normal toasts: ~2.2s
 *   – `persist` toasts (confirmation messages): ~4s
 * Each toast renders with a unique id, so a fresh timer is started for every
 * new message (and the old timer is torn down the moment it is replaced).
 */
import React, { useEffect } from "react";
import { usePos } from "../context/PosContext";
import Icon from "./Icon.jsx";

/**
 * Toast kind → { icon, tone }. The icon is shown in a small chip next to the
 * message so the cashier instantly knows what action just happened.
 */
const KINDS = {
  added:   { icon: "check",   tone: "success" },
  success: { icon: "check",   tone: "success" },
  removed: { icon: "void",    tone: "danger" },
  void:    { icon: "void",    tone: "danger" },
  cancel:  { icon: "cancel",  tone: "danger" },
  error:   { icon: "cancel",  tone: "danger" },
  hold:    { icon: "hold",    tone: "accent" },
  recall:  { icon: "recall",  tone: "accent" },
  qty:     { icon: "qty",     tone: "accent" },
  user:    { icon: "user",    tone: "accent" },
  percent: { icon: "percent", tone: "accent" },
  tag:     { icon: "tag",     tone: "accent" },
  receipt: { icon: "receipt", tone: "accent" },
  help:    { icon: "help",    tone: "accent" },
  more:    { icon: "more",    tone: "accent" },
  cash:    { icon: "cash",    tone: "success" }
};

/** Invisible child that owns the auto-hide timer for ONE toast. Keyed by the
    toast id so a new toast always resets the countdown. */
function ToastTimer({ toast, hide }) {
  useEffect(() => {
    const ms = toast.persist ? 4000 : 2200;
    const t = setTimeout(hide, ms);
    return () => clearTimeout(t);
  }, [toast.persist, hide]);

  return null;
}

export default function Toast() {
  const { state, actions } = usePos();
  const { toast } = state;
  const visible = toast !== null;
  const kind = toast ? KINDS[toast.kind] || KINDS.added : KINDS.added;

  return (
    <div
      id="toast"
      className={
        "toast toast--" + kind.tone + (visible ? " is-visible" : "")
      }
      role="status"
      aria-live="polite"
    >
      {toast && <ToastTimer key={toast.id} toast={toast} hide={actions.hideToast} />}
      {visible && (
        <>
          <span className="toast__icon" aria-hidden="true">
            <Icon name={kind.icon} />
          </span>
          <span className="toast__message">{toast.message}</span>
        </>
      )}
    </div>
  );
}