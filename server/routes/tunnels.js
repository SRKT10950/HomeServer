const express = require('express');

function createTunnelRouter(tunnelManager) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(tunnelManager.getTunnelsList());
  });

  router.post('/start-cloudflare', (req, res) => {
    const { id, port, token, customPublicUrl } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'id is required.' });
    }
    if (!token && !port) {
      return res.status(400).json({ error: 'Either port (for Quick Tunnels) or token (for Named Tunnels) is required.' });
    }

    try {
      const tunnel = tunnelManager.startCloudflare(
        id,
        port ? parseInt(port, 10) : 0,
        token || '',
        customPublicUrl || ''
      );
      res.json({ success: true, tunnel: { id: tunnel.id, status: tunnel.status, publicUrl: tunnel.publicUrl } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/start-rathole', (req, res) => {
    const { id, port, serverAddr, defaultToken, serviceName, customPublicUrl } = req.body;
    if (!id || !port || !serverAddr || !defaultToken || !serviceName) {
      return res.status(400).json({ error: 'Missing required parameters: id, port, serverAddr, defaultToken, serviceName.' });
    }

    try {
      const tunnel = tunnelManager.startRathole(
        id,
        parseInt(port, 10),
        serverAddr,
        defaultToken,
        serviceName,
        customPublicUrl
      );
      res.json({ success: true, tunnel: { id: tunnel.id, status: tunnel.status, publicUrl: tunnel.publicUrl } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/stop', (req, res) => {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'id is required.' });
    }

    const success = tunnelManager.stopTunnel(id);
    res.json({ success });
  });

  router.post('/delete', (req, res) => {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'id is required.' });
    }

    const success = tunnelManager.deleteTunnel(id);
    res.json({ success });
  });

  return router;
}

module.exports = createTunnelRouter;
