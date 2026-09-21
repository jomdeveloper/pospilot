const { contextBridge, ipcRenderer } = require('electron');

// Match the API protocol to the HTTPS or HTTP mode selected by the launcher.
const lanHost = process.env.POSPILOT_LAN_IP || 'localhost';
const apiProtocol = process.env.HTTPS_KEY_PATH ? 'https' : 'http';
// The desktop window should always use loopback. LAN mode is for remote phones
// and scanners; routing the local renderer through the LAN adapter can fail
// on Windows firewall or virtual-network configurations.
const apiHost = 'localhost';
const apiPort = 4000;
const scannerHost = process.env.POSPILOT_LAN_MODE === '1' ? lanHost : apiHost;

contextBridge.exposeInMainWorld('pospilot', {
  apiBaseUrl: `${apiProtocol}://${apiHost}:${apiPort}/api`,
  scannerUrl: `${apiProtocol}://${scannerHost}:${apiPort}/scanner`,
  version: process.env.npm_package_version || 'dev',
});

// Desktop bridge used by the cashier POS. The Printer Settings dialog and the
// auto-print path rely on these IPC-backed methods (raw ESC/POS + the OS print
// dialog fallback). `quit` closes the frameless + fullscreen window.
contextBridge.exposeInMainWorld('desktop', {
  quit: () => ipcRenderer.send('app-quit'),
  relaunch: () => ipcRenderer.send('app-relaunch'),

  selectBackupDirectory: () => ipcRenderer.invoke('select-backup-directory'),
  getLaunchOnStartup: () => ipcRenderer.invoke('launch-on-startup-get'),
  setLaunchOnStartup: (enabled) => ipcRenderer.invoke('launch-on-startup-set', enabled),

  getPrinterConfig: () => ipcRenderer.invoke('printer-config-get'),
  savePrinterConfig: (obj) => ipcRenderer.invoke('printer-config-save', obj),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  listSerialPorts: () => ipcRenderer.invoke('list-serial-ports'),
  printReceipt: (payload) => ipcRenderer.invoke('print-receipt', payload),
  printTestEsPos: () => ipcRenderer.invoke('print-test-espos'),
  receiptPrintInfo: () => ipcRenderer.invoke('receipt-print-info'),
});
