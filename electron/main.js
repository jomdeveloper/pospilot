const path = require('path');
const { app, BrowserWindow } = require('electron');

let serverInstance;

function startBackend() {
  const { start } = require('../server/src/index');
  return start(4000);
}

const isDev = !app.isPackaged;
const SERVER_PORT = 4000;
const DEV_CLIENT_URL = 'http://127.0.0.1:5173';
const PROD_CLIENT_URL = `http://127.0.0.1:${SERVER_PORT}`;

let mainWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    fullscreenable: true,
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

  mainWindow.maximize();
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  serverInstance = await startBackend(SERVER_PORT);
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverInstance) serverInstance.close();
  if (process.platform !== 'darwin') app.quit();
});
