/**
 * RemoteScanner.jsx
 * --------------------------------------------------------------------------
 * Bridges the phone camera scanner (`/scanner` page) into the register.
 *
 * - On the logged-in cashier screen, creates a one-time pairing key and shows
 *   it in the header so the cashier can connect a phone at /scanner.
 * - Polls the server for scans published by the paired phone and drops each
 *   new barcode into the cart (exact lookup) — the same behaviour a hardware
 *   USB scanner provides.
 *
 * This restores the documented "test the camera from a phone" flow, which the
 * old legacy cashier UI in the root App.jsx used to own (a poller that fed the
 * now-removed invisible cart). Here it feeds the live reducer cart instead.
 */
import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../context/PosContext";
import { api } from "../../api";

export default function RemoteScanner() {
  const { state, actions, runtime } = usePos();
  const [connected, setConnected] = useState(false);
  const [key, setKey] = useState("");
  const phoneWasConnectedRef = useRef(false);
  const refreshingPairingRef = useRef(false);

  // Live refs so the poll loop always reads fresh state/actions without having
  // to re-subscribe the effect on every cart/standby/session change.
  const stateRef = useRef(state);
  stateRef.current = state;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  useEffect(() => {
    const token = runtimeRef.current?.sessionToken;
    if (!token) return undefined;

    let active = true;
    let pollTimer = null;
    let lastScanId = 0;
    let busy = false;

    // Best-effort pairing: shows the connect key for the phone page.
    api.createBarcodePairing(token)
      .then((res) => {
        if (active) setKey((res && res.key) || "");
      })
      .catch(() => { /* pairing is best-effort */ });

    const refreshStatus = async () => {
      try {
        const st = await api.getBarcodePairingStatus(token);
        if (!active) return;
        const phoneConnected = Boolean(st && st.connected);
        setConnected(phoneConnected);
        if (phoneConnected) {
          phoneWasConnectedRef.current = true;
          return;
        }
        if (phoneWasConnectedRef.current && !refreshingPairingRef.current) {
          refreshingPairingRef.current = true;
          phoneWasConnectedRef.current = false;
          api.createBarcodePairing(token)
            .then((res) => {
              if (active) setKey((res && res.key) || "");
            })
            .catch(() => {})
            .finally(() => {
              refreshingPairingRef.current = false;
            });
        }
      } catch {
        // Transient — the next poll retries.
      }
    };

    const consumeLatest = async () => {
      if (busy) return;
      busy = true;
      try {
        const scan = await api.getLatestBarcodeScan(lastScanId, token);
        if (!active || !scan) return;

        // Phone scans are never buffered. A scan is consumed immediately when
        // the cashier cannot receive it, so it cannot replay later.
        const s = stateRef.current;
        if (s.standby || s.paused || s.dialog) {
          lastScanId = scan.id;
          return;
        }

        // Use the same visible barcode-input path as a physical scanner. This
        // keeps the phone scan visible to the cashier and lets BarcodeSearch
        // perform the normal exact lookup, add-to-cart, and not-found flow.
        const input = document.getElementById("product-search-input");
        if (input && !input.disabled && !stateRef.current.dialog) {
          // Acknowledge before touching the controlled input. Any interruption
          // after this point discards the scan instead of replaying it.
          lastScanId = scan.id;
          input.focus();
          actionsRef.current.setSearchQuery(scan.barcode);
          window.setTimeout(() => {
            if (stateRef.current.dialog) {
              actionsRef.current.setSearchQuery("");
              return;
            }
            const currentInput = document.getElementById("product-search-input");
            if (currentInput && !currentInput.disabled) {
              currentInput.dispatchEvent(new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
                cancelable: true,
              }));
            }
          }, 0);
          return;
        }

        // The input is unavailable, so deliberately discard this phone scan.
        lastScanId = scan.id;
      } catch {
        // Network blip — the next poll retries.
      } finally {
        busy = false;
      }
    };

    refreshStatus();
    consumeLatest();
    pollTimer = window.setInterval(() => {
      refreshStatus();
      consumeLatest();
    }, 1000);

    return () => {
      active = false;
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, []);

  if (!runtime?.sessionToken) return null;

  return (
    <span
      className="pos-header__scanner"
      title={
        connected
          ? "Phone scanner connected — scan a barcode to add it to the sale"
          : key
            ? `Connect your phone: open /scanner and enter key ${key}`
            : "Pairing phone scanner…"
      }
    >
      <span
        className="pos-header__scanner-dot"
        style={{ background: connected ? "#22c55e" : "#e5e7eb" }}
      />
      {connected ? "Scanner on" : (key ? "Scanner: " + key : "Scanner pairing…")}
    </span>
  );
}