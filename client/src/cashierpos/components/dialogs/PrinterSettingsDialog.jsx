import React, { useEffect, useRef, useState } from "react";
import { usePos } from "../../context/PosContext";
import Dialog from "./Dialog.jsx";

/**
 * Printer Settings — simplified.
 *  - Shows detected serial/COM ports (USB + Bluetooth) directly as a
 *    "choose a device" list. Raw ESC/POS is always used for these.
 *  - LAN / Wi-Fi is a separate section (IP + port).
 *  - A "fall back to the Windows print dialog" toggle for when raw can't
 *    reach the target.
 */
export default function PrinterSettingsDialog() {
  const { actions } = usePos();
  const close = () => actions.closeDialog();
  const [saved, setSaved] = useState({});
  const [form, setForm] = useState({
    mode: "com",
    devicePort: "",
    driverPrinter: "",
    lanIp: "",
    lanPort: 9100,
    baud: 9600,
    peso: "p",
    width: 32,
    cut: true,
    feedLines: 3,
    fallback: true
  });
  const [printers, setPrinters] = useState([]);
  const [ports, setPorts] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [testPorts, setTestPorts] = useState([]);
  const loaded = useRef(false);
  const broker = typeof window.desktop === "object" ? window.desktop : null;

  useEffect(() => {
    if (!broker || loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const cfg = await broker.getPrinterConfig();
        const eff = (cfg && cfg.effective) || saved;
        setSaved(cfg && cfg.saved ? cfg.saved : {});
        const conn = (eff && (eff.connection || eff.interface)) || "bluetooth";
        setForm({
          mode: conn === "lan" ? "lan" : conn === "usb" ? "driver" : "com",
          devicePort: conn === "usbserial" || conn === "bluetooth" ? String((eff && eff.address) || "") : "",
          driverPrinter: conn === "usb" ? String((eff && eff.printerName) || "") : "",
          lanIp: conn === "lan" ? String((eff && eff.address) || "") : "",
          lanPort: Number((eff && eff.port) || 9100),
          baud: Number((eff && eff.baud) || 9600),
          peso: String((eff && eff.peso) || "p"),
          width: Number((eff && eff.width) || 32),
          cut: !!(eff && eff.cut),
          feedLines: Number((eff && eff.feedLines) || 3),
          fallback: ((eff && eff.method) || "auto") !== "escos"
        });
        setStatus(cfg && cfg.exposConfigured ? `Active: ${cfg.exposPrinter}` : "No printer configured — pick a device below.");
      } catch (e) { setStatus("Could not read current printer config."); }
      try { setPrinters(await broker.listPrinters()); } catch (e) { setPrinters([]); }
      try { setPorts(await broker.listSerialPorts()); } catch (e) { setPorts([]); }
    })();
  }, [broker, saved]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setNum = (key) => (e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }));

  // Re-scan for COM ports AND installed Windows printers (called on mount and
  // by the Refresh button so a printer plugged in mid-session shows up).
  const refreshDevices = async () => {
    if (!broker) { setPorts([]); setPrinters([]); return; }
    try { setPorts(await broker.listSerialPorts()); } catch (e) { setPorts([]); }
    try { setPrinters(await broker.listPrinters()); } catch (e) { setPrinters([]); }
    setStatus("Devices rescanned.");
  };

  const deviceIsBluetooth = (comName) => {
    const p = ports.find((pt) => pt.port === comName);
    return !!(p && p.bluetooth);
  };

  const toConfig = () => {
    const m = form.mode;
    const connection =
      m === "lan" ? "lan" : m === "driver" ? "usb" : deviceIsBluetooth(form.devicePort) ? "bluetooth" : "usbserial";
    return {
      RECEIPT_CONNECTION: connection,
      RECEIPT_METHOD: form.fallback ? "auto" : "escos",
      RECEIPT_ESCPOS_ADDRESS: m === "lan" ? form.lanIp : m === "com" ? form.devicePort : "",
      RECEIPT_ESCPOS_PORT: Number(form.lanPort) || 9100,
      RECEIPT_ESCPOS_PRINTER_NAME: m === "driver" ? form.driverPrinter : "",
      RECEIPT_ESCPOS_WIDTH: Number(form.width) || 32,
      RECEIPT_ESCPOS_CUT: form.cut,
      RECEIPT_ESCPOS_FEED: Number(form.feedLines) || 3,
      RECEIPT_ESCPOS_BAUD: Number(form.baud) || 9600,
      RECEIPT_ESCPOS_PESO: form.peso || "p"
    };
  };

  const doSave = async (silent) => {
    if (!broker) { setStatus("Desktop bridge unavailable."); return; }
    setBusy(true); setStatus("Saving…");
    try {
      const res = await broker.savePrinterConfig(toConfig());
      if (res && res.ok) {
        setSaved(res.saved || {});
        setStatus(res.exposConfigured ? "Saved ✓" : "Saved. The selected device wasn't detected.");
        if (!silent) actions.showToast("Printer settings saved", false, "receipt");
      } else {
        setStatus("Save failed: " + ((res && res.error) || "unknown error"));
      }
    } catch (e) { setStatus("Save error: " + ((e && e.message) || e)); }
    finally { setBusy(false); }
  };

  const doTest = async () => {
    if (!broker) return;
    await doSave(true);
    setBusy(true); setStatus("Sending test receipt…"); setTestPorts([]);
    try {
      const res = await broker.printTestEsPos();
      if (res && res.ok) {
        setStatus(`Test sent → ${res.printer}`);
        actions.showToast("Test receipt sent", false, "receipt");
      } else {
        // res.reason now carries friendly guidance (see expos.cjs) plus the
        // detected-port list when the raw serial target could not be opened.
        setStatus("Test failed: " + ((res && res.reason) || "not configured"));
        if (res && Array.isArray(res.ports)) setTestPorts(res.ports);
        actions.showToast("Test failed", true, "error");
      }
    } catch (e) {
      setStatus("Test error: " + ((e && e.message) || e));
      actions.showToast("Test error", true, "error");
    } finally { setBusy(false); }
  };

  return (
    <Dialog wide title="Printer Settings" className="dialog--settings" onClose={close} footer={
      <>
        <button type="button" className="dialog-btn dialog-btn--ghost" onClick={doTest} disabled={busy}>Test Printer</button>
        <button type="button" className="dialog-btn dialog-btn--ghost" onClick={close}>Cancel</button>
        <button type="button" className="dialog-btn dialog-btn--primary" onClick={() => doSave(false)} disabled={busy}>Save</button>
      </>
    }>
{status && <div className="settings__status">{status}</div>}
{testPorts.length > 0 && (
  <div className="settings-hint">
    <p className="settings-hint__title">Try another detected port:</p>
    <ul className="settings__bt-list">
      {testPorts.map((pt) => (
        <li
          key={pt.port}
          className={"settings__port" + (form.devicePort === pt.port ? " is-active" : "")}
          onClick={() => setForm((f) => ({ ...f, mode: "com", devicePort: pt.port }))}
        >
          <span className="settings__port-name">{pt.port}</span>
          <span className="settings__port-desc">{pt.friendly}</span>
          {pt.bluetooth ? <span className="settings__bt-badge">BLUETOOTH</span> : <span className="settings__bt-badge">USB</span>}
        </li>
      ))}
    </ul>
  </div>
)}

      <div className="settings">
        <div className="form-row">
          <label>Printer is connected by</label>
          <div className="settings__seg">
            <button type="button" className={"settings__seg-btn" + (form.mode === "com" ? " is-active" : "")} onClick={() => setForm((f) => ({ ...f, mode: "com" }))}>
              USB / Bluetooth (port)
            </button>
            <button type="button" className={"settings__seg-btn" + (form.mode === "driver" ? " is-active" : "")} onClick={() => setForm((f) => ({ ...f, mode: "driver" }))}>
              Windows driver
            </button>
            <button type="button" className={"settings__seg-btn" + (form.mode === "lan" ? " is-active" : "")} onClick={() => setForm((f) => ({ ...f, mode: "lan" }))}>
              LAN / Wi-Fi
            </button>
          </div>
        </div>

        {form.mode === "com" && (
          <div className="settings-bt">
            <div className="settings-bt__head">
              <label>Available devices (raw ESC/POS)</label>
              <button
                type="button"
                className="settings__refresh"
                onClick={refreshDevices}
                disabled={busy}
                title="Re-scan for connected COM / Bluetooth ports"
              >
                Refresh
              </button>
            </div>
            {ports.length === 0 ? (
              <p className="dialog__hint">
                No COM ports detected. Connect the printer by USB or pair it over Bluetooth, then
                press <strong>Refresh</strong>. If your USB printer only installs as a Windows
                printer (no COM port), switch to the <strong>Windows driver</strong> tab above.
              </p>
            ) : (
              <ul className="settings__bt-list">
                {ports.map((pt) => {
                  const sel = form.devicePort === pt.port;
                  return (
                    <li key={pt.port} className={"settings__port" + (sel ? " is-active" : "")} onClick={() => setForm((f) => ({ ...f, devicePort: pt.port }))}>
                      <span className="settings__port-name">{pt.port}</span>
                      <span className="settings__port-desc">{pt.friendly}</span>
                      {pt.bluetooth ? <span className="settings__bt-badge">BLUETOOTH</span> : <span className="settings__bt-badge">USB</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="form-row">
              <label htmlFor="cfg-baud">Baud rate</label>
              <select id="cfg-baud" value={form.baud} onChange={(e) => setForm((f) => ({ ...f, baud: Number(e.target.value) }))}>
                <option value={9600}>9600</option>
                <option value={19200}>19200</option>
                <option value={38400}>38400</option>
                <option value={57600}>57600</option>
                <option value={115200}>115200</option>
              </select>
            </div>
          </div>
        )}

        {form.mode === "driver" && (
          <div className="form-row">
            <div className="settings-bt__head">
              <label htmlFor="cfg-pname">Windows printer</label>
              <button
                type="button"
                className="settings__refresh"
                onClick={refreshDevices}
                disabled={busy}
                title="Re-scan for installed printers"
              >
                Refresh
              </button>
            </div>
            <select id="cfg-pname" value={form.driverPrinter} onChange={set("driverPrinter")}>
              <option value="">-- Select a printer --</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>{p.name}{p.isDefault ? "  (default)" : ""}</option>
              ))}
            </select>
            <p className="dialog__hint">
              Lists installed printers (USB / Bluetooth driver). Use this for driver-only printers&nbsp;
              — e.g. a USB thermal printer that appears under "Printers &amp; scanners" in Windows but
              has no COM port. If your printer is not listed, make sure its driver is installed, then
              press <strong>Refresh</strong>.
            </p>
          </div>
        )}

        {form.mode === "lan" && (
          <>
            <div className="form-row">
              <label htmlFor="cfg-lanip">Printer IP address</label>
              <input id="cfg-lanip" type="text" placeholder="e.g. 192.168.1.50" value={form.lanIp} onChange={set("lanIp")} />
            </div>
            <div className="form-row">
              <label htmlFor="cfg-lanport">Port</label>
              <input id="cfg-lanport" type="number" min="1" max="65535" value={form.lanPort} onChange={setNum("lanPort")} />
            </div>
          </>
        )}

        <label className="settings__check">
          <input type="checkbox" checked={!!form.fallback} onChange={(e) => setForm((f) => ({ ...f, fallback: e.target.checked }))} />
          <span>Fall back to the Windows print dialog if raw ESC/POS fails</span>
        </label>

        <div className="form-row">
          <label htmlFor="cfg-width">Characters per line</label>
          <select id="cfg-width" value={form.width} onChange={setNum("width")}>
            <option value={32}>58mm — 32 chars</option>
            <option value={42}>80mm — 42 chars</option>
            <option value={48}>80mm — 48 chars</option>
          </select>
        </div>

        <div className="form-row">
          <label htmlFor="cfg-feed">Feed lines before cut</label>
          <input id="cfg-feed" type="number" min="1" max="20" value={form.feedLines} onChange={setNum("feedLines")} />
          <p className="dialog__hint">Blank lines so the cut doesn&apos;t slice the last line. Increase if text is cut off.</p>
        </div>

        <label className="settings__check">
          <input type="checkbox" checked={!!form.cut} onChange={(e) => setForm((f) => ({ ...f, cut: e.target.checked }))} />
          <span>Cut paper after printing</span>
        </label>

        <div className="form-row">
          <label htmlFor="cfg-peso">Peso sign on receipt</label>
          <select id="cfg-peso" value={form.peso} onChange={(e) => setForm((f) => ({ ...f, peso: e.target.value }))}>
            <option value="none">None (no peso sign)</option>
            <option value="p">Use "P" — most compatible</option>
            <option value="php">Use "PHP"</option>
            <option value="php-nospace">Use "PHP" (no space)</option>
          </select>
          <p className="dialog__hint">Many thermal printers can&apos;t print the &ldquo;₱&rdquo; symbol. Pick how it appears, or none.</p>
        </div>
      </div>
    </Dialog>
  );
}