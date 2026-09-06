const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

// Raw ESC/POS receipt printer (optional). If the config env vars are not set,
// isConfigured() is false and we always fall back to webContents.print().
const expos = require('./espos.cjs');

// A POS register is single-owner: only one instance may hold the database and
// the drawer. If a second instance is launched, focus the existing window and
// exit immediately.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let serverInstance;
// Guard so shutdown logic (stopping backups, closing the HTTP server / releasing
// port 4000, closing the SQLite DB) can be invoked from multiple exit paths
// (ipc app-quit AND window-all-closed) but runs exactly once.
let serverStopped = false;

// Graceful desktop shutdown: stop scheduled backups, close the Express server
// (releasing the port it bound) and close the SQLite database. Each step is
// guarded so a second call is a no-op and partial states never crash the quit.
function stopServerCleanly() {
  if (serverStopped) return;
  serverStopped = true;

  try {
    require('../server/src/backup').stopBackups();
  } catch (_error) {
    // Backup scheduler never started — nothing to stop.
  }

  if (serverInstance && typeof serverInstance.close === 'function') {
    try {
      // Force-close lingering keep-alive sockets so the port is released
      // immediately instead of waiting for sockets to time out.
      if (typeof serverInstance.closeAllConnections === 'function') serverInstance.closeAllConnections();
      serverInstance.close();
    } catch (_error) {
      // Server already closed or never bound — ignore.
    }
    serverInstance = null;
  }

  try {
    const db = require('../server/src/db');
    if (db && typeof db.close === 'function') db.close();
  } catch (_error) {
    // DB already closed or never opened — ignore.
  }
}

function startBackend() {
  // Packaged apps ship their code inside a read-only asar, so live data
  // (database + automatic backups) must live in the per-user app-data folder
  // instead of next to the executable. Dev builds keep using server/data so
  // browser mode and desktop mode share the same database.
  if (app.isPackaged && !process.env.POSPILOT_DB_PATH) {
    process.env.POSPILOT_DB_PATH = path.join(app.getPath('userData'), 'data', 'pospilot.db');
  }
  const { start } = require('../server/src/index');
  return start(4000);
}

const isDev = !app.isPackaged;
const SERVER_PORT = 4000;
const DEV_CLIENT_URL = process.env.POSPILOT_DEV_CLIENT_URL || 'http://127.0.0.1:5173';
const PROD_CLIENT_URL = `http://127.0.0.1:${SERVER_PORT}`;

let mainWindow;

// Production crash capture: uncaught exceptions and rejected promises are
// written to the same rotating logs the server uses so support staff can see
// what happened even when the window disappears.
const logger = require('../server/src/logger');
process.on('uncaughtException', (error) => {
  logger.error('electron', 'Uncaught exception', { error: (error && error.stack) || String(error) });
  app.quit();
});
process.on('unhandledRejection', (reason) => {
  logger.error('electron', 'Unhandled rejection', { reason: String(reason) });
});

if (DEV_CLIENT_URL.startsWith('https://')) {
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url.startsWith('https://127.0.0.1:') || url.startsWith('https://localhost:')) {
      event.preventDefault();
      callback(true);
      return;
    }
    callback(false);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    fullscreenable: true,
    // Full-size POS terminal window — frameless + fullscreen, matching the
    // StockPos Pilot cashier screen.
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    frame: false,      // no OS title bar — removes icon / title / min-max-close chrome
    fullscreen: true,  // always open full screen, like F11 in a browser
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Electron failed to load the app:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Electron finished loading the app shell.');
  });

  if (isDev) {
    await mainWindow.loadURL(DEV_CLIENT_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadURL(PROD_CLIENT_URL);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* ------------------------- Receipt printer bridge ------------------------ */

/** Path of the persisted printer settings file (managed by the settings UI). */
function printerConfigPath() {
  return path.join(app.getPath('userData'), 'printer-config.json');
}

/** Load persisted ESC/POS settings at startup (env vars still take priority). */
function loadPrinterConfig() {
  try {
    const p = printerConfigPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = raw ? JSON.parse(raw) : {};
      expos.setFileConfig(parsed);
    }
  } catch (e) {
    console.warn('[receipt] could not load printer-config.json:', (e && e.message) || e);
  }
}

/** Persist ESC/POS settings from the UI to the config file (env still wins). */
function savePrinterConfig(obj) {
  const p = printerConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj || {}, null, 2), 'utf8');
  expos.setFileConfig(obj || {});
  return obj || {};
}

/**
 * Detect serial/COM ports available on this machine, including Bluetooth
 * "Standard Serial over Bluetooth link" ports. Uses built-in Windows APIs via
 * PowerShell (no extra dependency). Returns [{ port, friendly, bluetooth }].
 */
function listSerialPortsInfo() {
  return new Promise((resolve) => {
    const script = String.raw`
      $ErrorActionPreference = 'SilentlyContinue'
      $seen = @{}
      $rows = @()

      # Source 1: classic COM devices with friendly names (Win32_SerialPort).
      Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | ForEach-Object {
        $name = "$($_.DeviceID)"
        if ($name -match 'COM\d+' -and -not $seen[$name.ToUpper()]) {
          $seen[$name.ToUpper()] = $true
          $rows += [pscustomobject]@{ Port = $name.ToUpper(); Friendly = "$($_.Name)"; Bluetooth = $false }
        }
      }

      # Source 2: present PnP devices that expose a COM designation (USB serial
      # adapters, BT links, and some USB-to-serial bridge chips).
      Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | ForEach-Object {
        $raw = "$($_.Name)"
        if ($raw -match '\((?<com>\w*[Cc][Oo][Mm]\d+)\)') {
          $name = $matches['com'].ToUpper()
          if (-not $seen[$name]) {
            $seen[$name] = $true
            $rows += [pscustomobject]@{ Port = $name; Friendly = $raw; Bluetooth = ($raw -match 'bluetooth') }
          }
        }
      }

      Get-PnpDevice -Class Ports -PresentOnly -ErrorAction SilentlyContinue | ForEach-Object {
        $raw = "$($_.FriendlyName)"
        if ($raw -match '\((?<com>\w*[Cc][Oo][Mm]\d+)\)') {
          $name = $matches['com'].ToUpper()
          if (-not $seen[$name]) {
            $seen[$name] = $true
            $rows += [pscustomobject]@{ Port = $name; Friendly = $raw; Bluetooth = ($raw -match 'bluetooth') }
          }
        }
      }

      # Source 3: every COM port Windows hands to apps + registry mapping.
      $map = @{}
      $key = Get-ItemProperty 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM' -ErrorAction SilentlyContinue
      if ($key) {
        $key.PSObject.Properties | ForEach-Object {
          if ($_.Name -notmatch '^PS') { $map[("$($_.Value)").ToUpper()] = "$($_.Name)" }
        }
      }
      [System.IO.Ports.SerialPort]::GetPortNames() | ForEach-Object {
        $name = $_.ToUpper()
        if (-not $seen[$name]) {
          $seen[$name] = $true
          $device = $map[$name]
          $friendly = $name
          if ($device -match 'BthModem') { $friendly = 'Standard Serial over Bluetooth link (' + $name + ')' }
          elseif ($map[$name]) { $friendly = $map[$name] }
          $rows += [pscustomobject]@{
            Port = $name
            Friendly = $friendly
            Bluetooth = ($device -match 'BthModem')
          }
        }
      }

      # Source 4 (removed): installed driver printers are shown in the
      # Windows-driver tab of the settings UI, not in this COM list.

      $rows | ForEach-Object {
        if ($_.Driver) { "DRIVER|$($_.Port)|$($_.Friendly)" }
        else { "PORT|$($_.Port)|$($_.Friendly)|$($_.Bluetooth)" }
      }
    `;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
            { timeout: 10000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const ports = [];
        String(stdout)
          .split(/\r?\n/)
          .forEach((line) => {
            const parts = line.trim().split('|');
            if (!parts || parts.length < 2 || parts[0] === '') return;
            if (parts[0] === 'PORT') {
              ports.push({
                port: parts[1],
                friendly: parts[2] || parts[1],
                bluetooth: String(parts[3] || '').toLowerCase() === 'true',
              });
            }
          });
        const byName = new Map();
        for (const pt of ports) if (!byName.has(pt.port)) byName.set(pt.port, pt);
        resolve([...byName.values()]);
      }
    );
  });
}
/**
 * Common thermal/receipt printer keywords, used by auto-detect.
 */
const RECEIPT_PRINTER_TOKENS = [
  'receipt', 'thermal', 'tm-', 'tm ', 't20', 't88', 'ts100', 'pos-58',
  'pos58', '58mm', '50mm', '80mm', 'e-studio', 'star', 'proworld', 'e-touch',
  'sm-s', 'rk-', 'xp-', 'dp-', 'gs-', 'qs-', 'copia', 'mandc', 'beeprt',
  'bixolon', 'hprt', 'xprinter', 'rongta', 'gprinter', 'sam4s', 'eoj',
  'toshiba tec', 'sanea', 'vsi'
];

async function findReceiptPrinter(win) {
  try {
    const printers = await win.webContents.getPrintersAsync();
    if (!printers || printers.length === 0) return null;
    const names = printers.map((p) => p.name || '');

    const pinned = process.env.RECEIPT_PRINTER;
    if (pinned) {
      const hit = names.find((n) => n.toLowerCase().includes(pinned.toLowerCase()));
      if (hit) return hit;
    }

    const hit = names.find(
      (n) => RECEIPT_PRINTER_TOKENS.some((t) => n.toLowerCase().includes(t))
    );
    return hit || null;
  } catch (e) {
    return null;
  }
}

/**
 * Print the receipt to the detected thermal printer via webContents.print().
 * By default it shows the OS print dialog pre-selected to a detected receipt
 * printer (reliable path); set RECEIPT_AUTO_PRINT=1 for true silent printing.
 */
async function printReceiptToPrinter(win, contentHeightMicrons, forcedDeviceName) {
  let deviceName = null;
  try {
    deviceName = forcedDeviceName && forcedDeviceName.trim()
      ? forcedDeviceName
      : await findReceiptPrinter(win);

    const heightMicrons =
      Number(contentHeightMicrons) >= 10000 ? Number(contentHeightMicrons) : 120000;
    const silent = !!(process.env.RECEIPT_AUTO_PRINT && deviceName);

    const result = await new Promise((resolve) => {
      win.webContents.print(
        {
          silent,
          printBackground: true,
          deviceName: deviceName || '',
          margins: { marginType: 'none' },
          pageSize: { width: 45000, height: heightMicrons }
        },
        (success, failureReason) => resolve({ success, failureReason })
      );
    });
    return { ok: !!result.success, deviceName, error: result.failureReason };
  } catch (e) {
    return { ok: false, deviceName, error: String((e && e.message) || e) };
  }
}

/**
 * Print a list of receipt lines. connection = WHERE the printer is,
 * method = HOW (auto → try raw ESC/POS then dialog; escos → raw only;
 * dialog → Windows print dialog only).
 */
async function printReceiptFlow(win, payload) {
  payload = payload || {};
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const heightMicrons = payload.heightMicrons;
  const cfg = expos.getConfig();
  const conn = cfg.connection || cfg.interface;
  const method = (cfg.method || 'auto').toLowerCase();
  const rawPossible = expos.isConfigured(cfg);
  const dialogName = expos.deviceNameForDialog(cfg);

  const raster = async (deviceName) => printReceiptToPrinter(win, heightMicrons, deviceName);

  if (method === 'dialog') {
    if (!dialogName) {
      return { ok: false, mode: 'dialog', error: `No Windows printer available for ${conn}` };
    }
    const res = await raster(dialogName);
    return { ok: res.ok, mode: 'dialog', deviceName: dialogName, error: res.error };
  }

  if (method === 'escos') {
    if (!rawPossible) {
      return { ok: false, mode: 'escos', error: 'Raw ESC/POS not configured/reachable on ' + conn };
    }
    const res = await expos.printReceiptLines(lines, cfg);
    return res.ok
      ? { ok: true, mode: 'escos', printer: res.printer }
      : { ok: false, mode: 'escos', printer: res.printer, error: res.reason };
  }

  // method === "auto": try raw, then dialog
  if (rawPossible) {
    try {
      const res = await expos.printReceiptLines(lines, cfg);
      if (res.ok) return { ok: true, mode: 'escos', printer: res.printer };
      console.warn(`[receipt] raw ESC/POS failed (${res.reason}) — trying dialog`);
    } catch (e) {
      console.error(`[receipt] ESC/POS threw (${(e && e.message) || e}) — trying dialog`);
    }
  }

  if (!dialogName) {
    return { ok: false, mode: 'raster', error: `No Windows printer available for ${conn}` };
  }
  const res = await raster(dialogName);
  return { ok: res.ok, mode: 'dialog', deviceName: dialogName, error: res.error };
}

/**
 * Print a short HTML test page through a chosen Windows printer driver, using
 * a hidden window. Used for the driver/dialog path.
 */
function printTestToDriver(deviceName) {
  return new Promise((resolve) => {
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    const html =
      '<html><head><style>' +
      '@page{size:58mm auto;margin:0}' +
      'body{font-family:monospace;width:58mm;padding:2px}' +
      '.c{text-align:center}' +
      '</style></head><body>' +
      '<div class="c"><b>POSPILOT</b></div>' +
      '<div class="c">PRINTER TEST</div>' +
      '<div class="c">Via: ' + String(deviceName) + '</div>' +
      '<div class="c">' + new Date().toLocaleString() + '</div>' +
      '<div class="c">If readable, the driver works.</div>' +
      '</body></html>';
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    w.webContents.once('did-finish-load', () => {
      w.webContents.print(
        {
          silent: false,
          printBackground: true,
          deviceName,
          margins: { marginType: 'none' },
          pageSize: { width: 45000, height: 60000 }
        },
        (ok, reason) => {
          w.destroy();
          resolve({ ok: !!ok, reason });
        }
      );
    });
    w.webContents.once('did-fail-load', (_e, code, desc) => {
      w.destroy();
      resolve({ ok: false, reason: 'failed to load test page: ' + (desc || code) });
    });
  });
}

/** Send a diagnostic test receipt honoring the selected method+connection. */
async function runReceiptTest() {
  const cfg = expos.getConfig();
  const conn = cfg.connection || cfg.interface;
  const method = (cfg.method || 'auto').toLowerCase();
  const rawPossible = expos.isConfigured(cfg);

  if (method === 'dialog' || (method !== 'escos' && !rawPossible)) {
    if (conn === 'bluetooth' || conn === 'usbserial') {
      return { ok: false, reason: 'This connection uses raw ESC/POS — select a COM port (e.g. COM3) or set Print method to Raw ESC/POS' };
    }
    const name = expos.deviceNameForDialog(cfg);
    if (!name) {
      return { ok: false, reason: 'No Windows printer driver for connection "' + conn + '" (select a printer driver, or set Print method to Raw ESC/POS)' };
    }
    const r = await printTestToDriver(name);
    return { ok: r.ok, printer: name, reason: !r.ok ? r.reason : undefined };
  }

  if (!rawPossible) {
    return { ok: false, reason: 'Raw ESC/POS not configured for "' + conn + '"' };
  }
  const result = await expos.printTest();
  // A failed raw test over a COM port is almost always a port problem — give
  // the settings screen the list of detected ports so the cashier can see
  // what else to try (another USB port, or the Bluetooth device reconnected).
  if (!result.ok && (conn === 'bluetooth' || conn === 'usbserial')) {
    try {
      const ports = await listSerialPortsInfo();
      if (ports && ports.length) {
        result.ports = ports;
        result.reason =
          (result.reason || 'Test failed') +
          ' Detected ports: ' +
          ports.map((p) => p.port + ' (' + p.friendly + ')').join('; ') +
          '.';
      }
    } catch (_e) {
      /* leave the reason as-is */
    }
  }
  return result;
}

app.whenReady().then(async () => {
  serverInstance = await startBackend(SERVER_PORT);
  // Load previously-saved ESC/POS printer settings into the module.
  loadPrinterConfig();

  // Automatic database snapshots: right after boot, then every 6 hours.
  const { scheduleBackups } = require('../server/src/index');
  scheduleBackups();

  // Frameless + fullscreen window has no title-bar close button, so expose a
  // clean quit path for the renderer (login X button / Ctrl+Q / Cmd+Q).
  ipcMain.on('app-quit', () => {
    stopServerCleanly();
    app.quit();
  });

  // List installed printers (for the Printer Settings dialog).
  ipcMain.handle('list-printers', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return [];
    try {
      const printers = await win.webContents.getPrintersAsync();
      return (printers || []).map((p) => ({ name: p.name, isDefault: !!p.isDefault }));
    } catch (e) {
      return [];
    }
  });

  // List serial / Bluetooth COM ports detected by Windows.
  ipcMain.handle('list-serial-ports', async () => listSerialPortsInfo());

  // Let the Settings page pick an off-machine backup folder (network share,
  // USB drive, second disk) through the OS directory picker.
  ipcMain.handle('select-backup-directory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return null;
    try {
      const result = await dialog.showOpenDialog(win, {
        title: 'Choose a backup folder',
        buttonLabel: 'Use this folder',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths || !result.filePaths[0]) return null;
      return result.filePaths[0];
    } catch (_error) {
      return null;
    }
  });

  // Launch at Windows sign-in (kiosk / register convenience).
  ipcMain.handle('launch-on-startup-get', () => {
    if (app.isPackaged) return app.getLoginItemSettings().openAtLogin;
    return false;
  });

  ipcMain.handle('launch-on-startup-set', (_event, enabled) => {
    if (!app.isPackaged) return false;
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: false, path: process.execPath });
    return app.getLoginItemSettings().openAtLogin;
  });

  // Priority receipt printing: ESC/POS (if configured/reachable) else raster
  // via webContents.print(). payload = { lines, heightMicrons }.
  ipcMain.handle('print-receipt', async (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false, error: 'no-window' };
    return printReceiptFlow(win, payload);
  });

  // Diagnostic: send a test receipt through whatever ESC/POS mode is active.
  ipcMain.handle('print-test-espos', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false, error: 'no-window' };
    return runReceiptTest();
  });

  // Describe current receipt-print configuration (for debugging / UI).
  ipcMain.handle('receipt-print-info', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const raster = win && win.webContents ? await findReceiptPrinter(win) : null;
    return {
      exposConfigured: expos.isConfigured(),
      exposPrinter: expos.describePrinter(),
      rasterDetected: raster
    };
  });

  // Return saved + effective ESC/POS settings for the Printer Settings UI.
  ipcMain.handle('printer-config-get', () => ({
    saved: expos.getFileConfig(),
    effective: expos.getConfig(),
    exposConfigured: expos.isConfigured(),
    exposPrinter: expos.describePrinter()
  }));

  // Save ESC/POS settings from the UI to the persisted config file.
  ipcMain.handle('printer-config-save', async (event, obj) => {
    try {
      const saved = savePrinterConfig(obj);
      return { ok: true, saved, exposConfigured: expos.isConfigured() };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopServerCleanly();
  if (process.platform !== 'darwin') app.quit();
});
