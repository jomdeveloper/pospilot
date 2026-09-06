const { contextBridge, ipcRenderer } = require('electron');

// Match the API protocol to the HTTPS or HTTP mode selected by the launcher.
contextBridge.exposeInMainWorld('pospilot', {
  apiBaseUrl: `${process.env.HTTPS_KEY_PATH ? 'https' : 'http'}://localhost:4000/api`,
  scannerUrl: `${process.env.HTTPS_KEY_PATH ? 'https' : 'http'}://${process.env.POSPILOT_LAN_IP || 'localhost'}:5173/scanner`,
  version: process.env.npm_package_version || 'dev',
});

// Desktop bridge used by the cashier POS. The Printer Settings dialog and the
// auto-print path rely on these IPC-backed methods (raw ESC/POS + the OS print
// dialog fallback). `quit` closes the frameless + fullscreen window.
contextBridge.exposeInMainWorld('desktop', {
  quit: () => ipcRenderer.send('app-quit'),

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
