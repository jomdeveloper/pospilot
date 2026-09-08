const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

const productsRouter = require('./routes/products');
const salesRouter = require('./routes/sales');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const procurementRouter = require('./routes/procurement');
const categoriesRouter = require('./routes/categories');
const suppliersRouter = require('./routes/suppliers');
const customersRouter = require('./routes/customers');
const settingsRouter = require('./routes/settings');
const auditRouter = require('./routes/audit');
const barcodeScansRouter = require('./routes/barcodeScans');
const inventoryRouter = require('./routes/inventory');
const cashierSessionsRouter = require('./routes/cashierSessions');
const backupRouter = require('./routes/backup');
const approvalsRouter = require('./routes/approvals');
const pendingSalesRouter = require('./routes/pendingSales');
const { scheduleBackups } = require('./backup');
const { securityHeaders } = require('./security');
const db = require('./db');
const logger = require('./logger');
const { cleanupSessions } = require('./routes/auth');
const { auditSystemEvent } = require('./audit');
const serverPackage = require('../package.json');

// Default to loopback-only so the API is never exposed to the rest of the LAN
// unless an operator explicitly opts in (the HTTPS dev/phone launchers set HOST=0.0.0.0).
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 4000;

function createServer() {
  const app = express();
  const clientDistPath = path.resolve(__dirname, '..', '..', 'client', 'dist');

  app.use(cors({
      origin(origin, callback) {
        // Allow the Vite dev server, Electron's file:// build (origin "null"),
        // and non-browser clients (no Origin header). Block everything else.
        if (!origin || origin === 'null') return callback(null, true);
        const allowed = [
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://192.168.123.35:5173',
          'https://localhost:5173',
          'https://127.0.0.1:5173',
          'https://192.168.123.35:5173',
          'http://localhost:4000',
          'http://127.0.0.1:4000',
          'https://localhost:4000',
          'https://127.0.0.1:4000',
        ];
        const isPrivateLanOrigin = /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}:5173$/.test(origin);
        return callback(null, allowed.includes(origin) || isPrivateLanOrigin);
      },
    }));
  app.use(express.json({ limit: '10mb' }));
  app.use(securityHeaders());
  app.use((req, res, next) => {
    req.requestId = String(req.headers['x-request-id'] || '').trim() || crypto.randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    res.on('finish', () => {
      if (res.statusCode >= 400 && !req.systemErrorAudited) {
        auditSystemEvent(req, 'System request failed', 'SystemError', {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
        }, res.statusCode >= 500 ? 'Failed' : 'Rejected');
      }
    });
    next();
  });

  app.get('/api/health', (req, res) => {
    try {
      const row = db.prepare('SELECT 1 AS ok').get();
      res.json({ ok: row.ok === 1, version: serverPackage.version, db: 'ok' });
    } catch (error) {
      res.status(500).json({ ok: false, version: serverPackage.version, db: 'error' });
    }
  });
  app.use('/api/products', productsRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/procurement', procurementRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/suppliers', suppliersRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/audit-logs', auditRouter);
  app.use('/api/barcode-scans', barcodeScansRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/cashier-sessions', cashierSessionsRouter);
  app.use('/api/approvals', approvalsRouter);
  app.use('/api/pending-sales', pendingSalesRouter);
  app.use('/api/backups', backupRouter);

  // JSON 404 for any unmatched /api route (any HTTP method).
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.sendFile(path.join(clientDistPath, 'index.html'));
  });

  // Centralized error handler — never leak stack traces to the client.
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    logger.error('server', 'Unhandled server error', { error: (error && error.message) || String(error) });
    auditSystemEvent(req, 'Unhandled server error', 'SystemError', {
      requestId: req?.requestId,
      method: req?.method,
      path: req?.path,
      errorName: error?.name || 'Error',
      errorMessage: error?.message || String(error),
    }, 'Failed');
    req.systemErrorAudited = true;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// Allow this file to be run directly (`npm start`) or required by Electron's
// main process (`const { start } = require('./src/index')`).
function start(port = PORT) {
  const app = createServer();
  let sessionCleanupTimer = null;

  const scheduleSessionCleanup = () => {
    try { cleanupSessions(); } catch (_error) { /* non-fatal */ }
    if (sessionCleanupTimer) clearInterval(sessionCleanupTimer);
    sessionCleanupTimer = setInterval(() => {
      try { cleanupSessions(); } catch (_error) { /* non-fatal */ }
    }, 6 * 60 * 60 * 1000);
    // Background maintenance: must never keep the process alive (tests/scripts
    // rely on natural exit; the HTTP server or Electron keeps us alive).
    if (sessionCleanupTimer.unref) sessionCleanupTimer.unref();
    return sessionCleanupTimer;
  };

  return new Promise((resolve, reject) => {
    const keyPath = process.env.HTTPS_KEY_PATH;
    const certPath = process.env.HTTPS_CERT_PATH;
    const serverOptions = keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)
      ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
      : undefined;

    const onError = (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.warn('server', `Port ${port} already in use; continuing with the existing server.`);
        resolve(null);
        return;
      }
      reject(error);
    };

    let server;
    if (serverOptions) {
      // HTTPS: build the server explicitly because https.Server is not an
      // Express app and must be created with the app as its request handler.
      server = https.createServer(serverOptions, app);
      server.on('error', onError);
      server.listen(port, HOST, () => {
        logger.info('server', `PosPilot server listening on https://${HOST}:${port}`);
        scheduleSessionCleanup();
        resolve(server);
      });
    } else {
      // HTTP: `app.listen()` returns the REAL http.Server (Express apps are
      // just listeners and don't expose address()/close()). Resolving the app
      // here breaks callers that call server.address() (tests) or server.close()
      // (Electron shutdown), so resolve the server `listen()` produced.
      server = app.listen(port, HOST, () => {
        logger.info('server', `PosPilot server listening on http://${HOST}:${port}`);
        scheduleSessionCleanup();
        resolve(server);
      });
      server.on('error', onError);
    }
  });
}

if (require.main === module) {
  process.on('uncaughtException', (error) => {
    logger.error('server', 'Uncaught exception', { error: (error && error.stack) || String(error) });
    auditSystemEvent(null, 'Uncaught server exception', 'SystemError', {
      errorName: error?.name || 'Error',
      errorMessage: error?.message || String(error),
    }, 'Failed');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('server', 'Unhandled rejection', { reason: String(reason) });
    auditSystemEvent(null, 'Unhandled promise rejection', 'SystemError', { reason: String(reason) }, 'Failed');
  });

  start()
    .then((srv) => {
      // Automatically snapshot the database on boot and on a rolling schedule.
      if (srv) scheduleBackups();
    })
    .catch((error) => {
      logger.error('server', 'Failed to start PosPilot server', { error: (error && error.message) || String(error) });
      auditSystemEvent(null, 'Server startup failed', 'SystemError', {
        errorName: error?.name || 'Error',
        errorMessage: error?.message || String(error),
      }, 'Failed');
      process.exit(1);
    });
}

module.exports = { createServer, start, scheduleBackups };
