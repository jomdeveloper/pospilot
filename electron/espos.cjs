/**
 * expos.cjs — Raw ESC/POS receipt printing (Electron main process).
 * --------------------------------------------------------------------------
 * Sends the receipt to a receipt printer as native ESC/POS text commands,
 * which is far more reliable on real POS printers than Chromium's raster
 * printing (blanks/cut-off on cheap drivers).
 *
 * CONFIGURATION — two sources (ENV VARS take priority, then persisted file):
 *   RECEIPT_CONNECTION   = "usb" | "bluetooth" | "lan"   (where the printer is)
 *   RECEIPT_METHOD       = "auto" | "escos" | "dialog"    (how to send the job)
 *   RECEIPT_ESCPOS_ADDRESS = "192.168.1.50" (lan) or "COM5" (bluetooth)
 *   RECEIPT_ESCPOS_PORT     = 9100   (default raw/LPD port for lan)
 *   RECEIPT_ESCPOS_PRINTER_NAME = Windows printer name (for usb)
 *   RECEIPT_ESCPOS_WIDTH   = 42   (Font B chars per line on 58mm; 80mm≈42/48)
 *   RECEIPT_ESCPOS_CUT     = 1    (1 = cut paper after print)
 *   RECEIPT_ESCPOS_FEED    = 3    (blank line-feeds before the cut)
 *   RECEIPT_ESCPOS_BAUD    = 9600 (bluetooth serial baud)
 *   RECEIPT_ESCPOS_PESO    = "p" | "php" | "none"  (how to render ₱)
 *
 * The same values can be saved by the UI (main.cjs) into a JSON config file
 * under app.getPath("userData"); setFileConfig() installs them here as the
 * low-priority defaults so the UI can manage the printer without env vars.
 *
 * When not configured (or unreachable) the app falls back to the normal
 * webContents.print() raster path automatically.
 */
const net = require("net");

// Low-priority defaults sourced from the persisted settings file (env wins).
let fileConfig = {};

/** Read an env var, falling back to the file value then a default. */
function envOr(name, def) {
  if (process.env[name] !== undefined && process.env[name] !== "") {
    return process.env[name];
  }
  if (fileConfig && fileConfig[name] !== undefined) {
    return fileConfig[name];
  }
  return def;
}

function getConfig() {
  const boolOf = (v) => (v === true || v === "1" || v === "true");
  // Backward-compat: old "interface" values map to the new "connection".
  const legacyIface = String(envOr("RECEIPT_ESCPOS_INTERFACE", "") || "").toLowerCase();
  const connection =
    String(envOr("RECEIPT_CONNECTION", "") || "").toLowerCase() ||
    (legacyIface === "network" ? "lan" : legacyIface === "printer" ? "usb" : legacyIface);
  const method = String(envOr("RECEIPT_METHOD", "auto") || "auto").toLowerCase();
  return {
    connection,
    method,
    // legacy alias kept so existing printReceiptLines/writeBytes still work
    interface: connection,
    address: String(envOr("RECEIPT_ESCPOS_ADDRESS", "") || ""),
    port: Number(envOr("RECEIPT_ESCPOS_PORT", 9100)),
    printerName: String(envOr("RECEIPT_ESCPOS_PRINTER_NAME", "") || ""),
    width: Number(envOr("RECEIPT_ESCPOS_WIDTH", 42)) || 42,
    cut: boolOf(envOr("RECEIPT_ESCPOS_CUT", true)),
    feedLines: Number(envOr("RECEIPT_ESCPOS_FEED", 3)),
    baud: Number(envOr("RECEIPT_ESCPOS_BAUD", 9600)),
    // How to render the ₱ peso (not a Unicode font char on ESC/POS):
    //   "none" -> no peso text at all (blank)
    //   "p"    -> "P" prefix   (most compatible)
    //   "php"  -> "PHP " prefix
    peso: String(envOr("RECEIPT_ESCPOS_PESO", "p") || "p")
  };
}

/** Install low-priority defaults from the persisted settings file. */
function setFileConfig(obj) {
  fileConfig = {};
  if (obj && typeof obj === "object") fileConfig = { ...obj };
  return getConfig();
}

/** Return the persisted (non-env) config keys, for the settings UI. */
function getFileConfig() {
  return { ...fileConfig };
}

/** True when a raw ESC/POS target is configured for this connection. */
function isConfigured(cfg) {
  cfg = cfg || getConfig();
  const c = cfg.connection || cfg.interface;
  if (c === "lan") return !!cfg.address;
  if (c === "usb") return !!(cfg.printerName && driverAvailable());
  // USB-serial and Bluetooth both use a raw COM port.
  if (c === "usbserial" || c === "bluetooth") return /^[Cc][Oo][Mm]\d+$/.test(cfg.address || "");
  return false;
}

/**
 * Turn raw Windows serialport errors into messages a cashier can act on.
 * Common failures when opening a COM port:
 *   - "GetCommState / Unknown error code 1" (ERROR_INVALID_FUNCTION) — the
 *     port exists but is not usable right now: a Bluetooth SPP port that is
 *     paired but NOT connected, or a ghost/unplugged USB port.
 *   - "Access denied" (ERROR_ACCESS_DENIED) — another application already has
 *     the port open with an exclusive handle (scanner utility, vendor tool,
 *     another POS window, a serial monitor), so Windows refuses a second open.
 */
function friendlySerialError(address, rawError, isBluetooth) {
  const msg = String((rawError && rawError.message) || rawError || "unknown serial error");
  if (/GetCommState|Unknown error code 1/i.test(msg)) {
    if (isBluetooth || /bluetooth/i.test(address)) {
      return (
        "cannot open " + address + " — the Bluetooth printer is not connected. " +
        "Place the printer back in range and confirm it is CONNECTED (paired is not enough) in " +
        "Windows Bluetooth settings, then retry the test."
      );
    }
    return (
      "cannot open " + address + " — the port is not usable right now. " +
      "Re-plug the USB cable or try a different USB port, then retry the test."
    );
  }
  if (/Access denied|access is denied|EACCES|denied/i.test(msg)) {
    return (
      "cannot open " + address + " — the port is already in use by another program. " +
      "Close any utility that is using that port (printer/vendor tool, barcode scanner " +
      "program, serial monitor, another open POS window) and retry the test."
    );
  }
  if (/does not exist|not found|no such|ENOENT/i.test(msg)) {
    return (
      "cannot open " + address + " — Windows could not find this port. " +
      "Open Device Manager → Ports (COM & LPT) to confirm the port number, then update the setting."
    );
  }
  if (/timeout|not responding/i.test(msg)) {
    return (
      "cannot reach " + address + " — the printer did not respond. " +
      "Check the cable/link and that the printer is powered on, then retry."
    );
  }
  return "cannot open " + address + ": " + msg;
}

/**
 * The Windows printer driver name to use for the Chromium "Print Dialog"
 * (raster) method, or "" if this connection has no usable driver printer.
 *   - usb      -> the chosen installed printer
 *   - bluetooth-> the chosen printer driver, if one was set
 *   - lan      -> none (LAN is a raw network printer, no Windows driver)
 */
function deviceNameForDialog(cfg) {
  cfg = cfg || getConfig();
  const c = cfg.connection || cfg.interface;
  if ((c === "usb" || c === "bluetooth") && cfg.printerName) return cfg.printerName;
  return null;
}

/** Human-readable description used for the console log + debug. */
function describePrinter(cfg) {
  cfg = cfg || getConfig();
  const c = cfg.connection || cfg.interface;
  if (c === "lan") return `LAN ${cfg.address}:${cfg.port} (ESC/POS)`;
  if (c === "usb")
    return cfg.printerName
      ? `USB printer "${cfg.printerName}" (${driverAvailable() ? "ESC/POS via driver pkg" : "Windows driver"})`
      : "USB (no printer selected)";
  if (c === "usbserial")
    return cfg.address ? `USB serial ${cfg.address} (ESC/POS)` : "USB serial (no COM port)";
  if (c === "bluetooth")
    return cfg.address ? `Bluetooth serial ${cfg.address} (ESC/POS)` : "Bluetooth (no COM port)";
  return "(not configured)";
}

/** ESC/POS alignment byte: left=0, center=1, right=2. */
function alignByte(a) {
  return a === "center" ? 1 : a === "right" ? 2 : 0;
}
/** Encode a single text line (align, bold, text, LF). */
function encodeLine(line, width, cfg) {
  let text = String(line && line.text || "");
  const peso = (cfg && cfg.peso) || "p";
  // ESC/POS fonts have no Unicode ₱ — map it to a printable representation.
  if (peso === "none") text = text.split("₱").join("");
  else if (peso === "php") text = text.split("₱").join("PHP ");
  else if (peso === "php-nospace") text = text.split("₱").join("PHP");
  else text = text.split("₱").join("P");
  text = text.slice(0, width);
  const align = alignByte(line && line.align);
  const bold = !!(line && line.bold);
  return Buffer.concat([
    Buffer.from([0x1b, 0x61, align]),       // ESC a n — horizontal alignment
    Buffer.from([0x1b, 0x45, bold ? 1 : 0]), // ESC E n — bold on/off
    Buffer.from(text, "ascii"),
    Buffer.from([0x0a])                    // LF
  ]);
}

/** Send raw bytes over TCP (standard raw/LPD 9100 style). */
function sendOverNetwork(cfg, data) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: cfg.address, port: cfg.port }, () => {
      sock.write(data, (err) => {
        if (err) { sock.destroy(); return reject(err); }
        sock.end();
      });
    });
    sock.setTimeout(6000);
    sock.on("timeout", () => { sock.destroy(); reject(new Error("printer timeout")); });
    sock.on("error", reject);
  });
}

/** True if the optional `printer` npm package is installed (raw-to-driver). */
function driverAvailable() {
  try {
    const pd = require("printer");
    return !!(pd && pd.printDirect);
  } catch (e) {
    return false;
  }
}

/** Send bytes through a Windows printer driver by name (optional `printer` pkg). */
function sendToDriver(cfg, data) {
  let pd = null;
  try { pd = require("printer"); } catch (e) { /* not installed */ }
  if (!pd || !pd.printDirect) {
    return Promise.reject(
      new Error('ESC/POS "printer" interface requires the optional `printer` npm package')
    );
  }
  return new Promise((resolve, reject) => {
    pd.printDirect({
      data: Buffer.from(data),
      printer: cfg.printerName,
      type: "RAW",
      success: (job) => resolve(job),
      error: (e) => reject(e)
    });
  });
}

/** Send bytes over a serial/COM port (Bluetooth SPP). Optional `serialport`. */
function sendOverSerial(cfg, data) {
  let sp = null;
  try { sp = require("serialport"); } catch (e) { /* not installed */ }
  if (!sp || !sp.SerialPort) {
    return Promise.reject(
      new Error('Bluetooth serial printing needs the optional `serialport` npm package')
    );
  }
  return new Promise((resolve, reject) => {
    const isBluetooth = (cfg.connection || cfg.interface) === "bluetooth";
    let done = false;

    // `lock: false` lets us open Bluetooth/SPP virtual COM ports that Windows
    // otherwise holds with an exclusive lock (fixes "GetCommState: error 1").
    const port = new sp.SerialPort(
      {
        path: cfg.address,
        baudRate: cfg.baud || 9600,
        autoOpen: false, // we open below so we can retry with different options
        lock: false
      },
      (openErr) => { if (openErr) fail(openErr); }
    );

    const settle = (kind, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (kind === "ok") resolve(value);
      else reject(value);
    };
    const ok = (v) => settle("ok", v);
    const fail = (e) => settle("err", e instanceof Error ? e : new Error(String(e)));

    // Never hang the UI: give the open/write up to 8s, then fail cleanly.
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        try { port.destroy(); } catch (e) { /* ignore */ }
        reject(new Error("timeout opening/writing " + cfg.address + " (printer not responding)"));
      }
    }, 8000);

    port.on("error", (e) => {
      fail(new Error(friendlySerialError(cfg.address, e, isBluetooth)));
    });

    port.open((openErr) => {
      if (done) return;
      if (openErr) return fail(new Error(friendlySerialError(cfg.address, openErr, isBluetooth)));
      port.write(Buffer.isBuffer(data) ? data : Buffer.from(data), (werr) => {
        port.close(() => {});
        if (werr) return fail(new Error(friendlySerialError(cfg.address, werr, isBluetooth)));
        ok();
      });
    });
  });
}

async function writeBytes(cfg, data) {
  const c = cfg.connection || cfg.interface;
  if (c === "printer") return await sendToDriver(cfg, data);
  // USB-serial and Bluetooth both send raw over a COM port.
  if (c === "usbserial" || c === "bluetooth") return await sendOverSerial(cfg, data);
  return await sendOverNetwork(cfg, data); // lan/network (TCP 9100)
}

/**
 * Print a list of { text, align, bold } lines. Returns { ok, printer, error }.
 * Does not throw for a misconfigured target — caller uses this to fall back.
 */
async function printReceiptLines(lines, cfg) {
  cfg = cfg || getConfig();
  if (!isConfigured(cfg)) {
    return { ok: false, printer: describePrinter(cfg), reason: "not-configured" };
  }
  const width = Math.max(16, cfg.width);
  const parts = [
    Buffer.from([0x1b, 0x40]),       // ESC @ — initialise printer
    Buffer.from([0x1b, 0x21, 0x01]), // ESC ! 1 — Font B, normal width/height
    Buffer.from([0x1d, 0x21, 0x00]), // GS ! 0 — standard 1x width and 1x height
    Buffer.from([0x1b, 0x61, 0x00])  // ESC a 0 — left alignment
  ];
  for (const l of lines || []) parts.push(encodeLine(l, width, cfg));
  // Feed enough blank lines that the last printed line clears the paper, so
  // the cut doesn't slice through it.
  const feed = Math.max(1, Math.min(Number(cfg.feedLines) || 3, 20));
  for (let i = 0; i < feed; i++) parts.push(Buffer.from([0x0a])); // LF blank lines
  if (cfg.cut) parts.push(Buffer.from([0x1d, 0x56, 0x41])); // GS V A — cut full paper

  try {
    await writeBytes(cfg, Buffer.concat(parts));
    return { ok: true, printer: describePrinter(cfg) };
  } catch (e) {
    return { ok: false, printer: describePrinter(cfg), reason: String((e && e.message) || e) };
  }
}

/** Print a short diagnostic/test receipt to confirm the ESC/POS config. */
async function printTest(cfg) {
  cfg = cfg || getConfig();
  const now = new Date();
  const lines = [
    { text: "STOCKPOS PILOT", align: "center", bold: true },
    { text: "ESC/POS TEST", align: "center" },
    { text: "" },
    { text: now.toLocaleString() },
    { text: "If you can read this, the", align: "center" },
    { text: "printer is reachable via", align: "center" },
    { text: "raw ESC/POS commands.", align: "center" },
    { text: "" },
    { text: "connection : " + cfg.interface },
    { text: "target     : " + cfg.address + (cfg.interface === "network" ? ":" + cfg.port : "") }
  ];
  return printReceiptLines(lines, cfg);
}

module.exports = {
  getConfig,
  isConfigured,
  deviceNameForDialog,
  describePrinter,
  driverAvailable,
  setFileConfig,
  getFileConfig,
  printReceiptLines,
  printTest
};