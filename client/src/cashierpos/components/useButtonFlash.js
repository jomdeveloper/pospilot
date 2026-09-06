/**
 * useButtonFlash.js
 * --------------------------------------------------------------------------
 * Replicates the vanilla `flashKey()` helper (adds `.is-pressed` for 260ms).
 * `isPressed` is derived from the global `pressedButton` state so keyboard
 * shortcuts can flash buttons too.
 */
import { useEffect } from "react";

export function useButtonFlash(isPressed, clearPress) {
  useEffect(() => {
    if (!isPressed) return;
    const t = setTimeout(() => clearPress(), 260);
    return () => clearTimeout(t);
  }, [isPressed, clearPress]);
}