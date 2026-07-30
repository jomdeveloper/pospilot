const path = require('path');
const express = require('express');
const cors = require('cors');

const medicinesRouter = require('./routes/medicines');
const salesRouter = require('./routes/sales');

const PORT = process.env.PORT || 4000;

function createServer() {
  const app = express();
  const clientDistPath = path.resolve(__dirname, '..', '..', 'client', 'dist');

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/medicines', medicinesRouter);
  app.use('/api/sales', salesRouter);

  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.sendFile(path.join(clientDistPath, 'index.html'));
  });

  return app;
}

// Allow this file to be run directly (`npm start`) or required by Electron's
// main process (`const { start } = require('./src/index')`).
function start(port = PORT) {
  const app = createServer();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`PosPilot server listening on http://localhost:${port}`);
      resolve(server);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`Port ${port} already in use; continuing with the existing server.`);
        resolve(null);
        return;
      }
      reject(error);
    });
  });
}

if (require.main === module) {
  start();
}

module.exports = { createServer, start };
