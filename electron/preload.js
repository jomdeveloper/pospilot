const { contextBridge } = require('electron');

// The React client talks to the local Express server over plain HTTP
// (http://localhost:4000/api/...), so no privileged IPC bridge is required
// yet. Exposed here as a place to grow into (e.g. native printing, app info).
contextBridge.exposeInMainWorld('pospilot', {
  apiBaseUrl: 'http://localhost:4000/api',
  version: process.env.npm_package_version || 'dev',
});
