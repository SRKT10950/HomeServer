const express = require('express');

function createStaticServerRouter(staticServerManager) {
  const router = express.Router();

  router.get('/servers', (req, res) => {
    res.json(staticServerManager.getServersList());
  });

  router.post('/servers/start', async (req, res) => {
    const { id, path: folderPath, port } = req.body;
    if (!id || !folderPath || !port) {
      return res.status(400).json({ error: 'id, path, and port are required.' });
    }

    try {
      const serverInfo = await staticServerManager.startServer(id, folderPath, parseInt(port, 10));
      res.json({ success: true, server: { id: serverInfo.id, status: serverInfo.status, port: serverInfo.port } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/servers/stop', async (req, res) => {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'id is required.' });
    }

    const success = await staticServerManager.stopServer(id);
    res.json({ success });
  });

  router.post('/servers/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'id is required.' });
    }

    const success = await staticServerManager.deleteServer(id);
    res.json({ success });
  });

  router.get('/php/status', (req, res) => {
    res.json(staticServerManager.phpStatus);
  });

  router.post('/php/settings', (req, res) => {
    const { phpPath } = req.body;
    if (phpPath === undefined) {
      return res.status(400).json({ error: 'phpPath is required.' });
    }
    const status = staticServerManager.updatePhpSettings(phpPath);
    res.json({ success: true, status });
  });

  router.get('/servers/:port/config', (req, res) => {
    const { port } = req.params;
    res.json(staticServerManager.getServerConfig(parseInt(port, 10)));
  });

  router.post('/servers/:port/config', (req, res) => {
    const { port } = req.params;
    const { basicAuth, headers } = req.body;
    staticServerManager.updateServerConfig(parseInt(port, 10), basicAuth, headers);
    res.json({ success: true, message: 'Server configuration updated successfully.' });
  });

  return router;
}

module.exports = createStaticServerRouter;
