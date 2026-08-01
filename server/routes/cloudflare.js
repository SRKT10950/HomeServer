const express = require('express');
const CloudflareApi = require('../cloudflareApi');

function createCloudflareRouter(cfSettings, saveSettings, ddnsSettings, saveDdnsSettings, broadcastDdnsSettings, checkDDNS, serviceErrorLogger) {
  const router = express.Router();

  router.get('/settings', (req, res) => {
    res.json({
      accountId: cfSettings.accountId,
      tunnelId: cfSettings.tunnelId,
      domainName: cfSettings.domainName,
      hasToken: !!cfSettings.apiToken
    });
  });

  router.post('/settings', (req, res) => {
    const { accountId, apiToken, tunnelId, domainName } = req.body;
    const updatedToken = apiToken === '******' || !apiToken ? cfSettings.apiToken : apiToken;
    
    saveSettings({
      accountId,
      apiToken: updatedToken,
      tunnelId,
      domainName
    });
    
    res.json({ success: true, message: 'Cloudflare settings saved successfully.' });
  });

  router.get('/routes', async (req, res) => {
    if (!cfSettings.accountId || !cfSettings.apiToken || !cfSettings.tunnelId) {
      return res.json({ configured: false, routes: [] });
    }

    try {
      const cf = new CloudflareApi(cfSettings.accountId, cfSettings.apiToken);
      const configResult = await cf.getTunnelConfig(cfSettings.tunnelId);
      const ingress = configResult?.config?.ingress || [];
      const routes = ingress.filter(rule => rule.hostname);
      
      res.json({ configured: true, routes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/routes/add', async (req, res) => {
    const { hostname, service } = req.body;
    if (!hostname || !service) {
      return res.status(400).json({ error: 'hostname and service are required.' });
    }

    if (!cfSettings.accountId || !cfSettings.apiToken || !cfSettings.tunnelId || !cfSettings.domainName) {
      return res.status(400).json({ error: 'Cloudflare API integration is not fully configured.' });
    }

    try {
      const cf = new CloudflareApi(cfSettings.accountId, cfSettings.apiToken);
      const configResult = await cf.getTunnelConfig(cfSettings.tunnelId);
      const ingress = configResult?.config?.ingress || [];
      
      let updatedIngress = ingress.filter(rule => rule.hostname !== hostname);
      const newRule = { hostname, service };
      
      const catchAllIndex = updatedIngress.findIndex(rule => !rule.hostname);
      if (catchAllIndex !== -1) {
        updatedIngress.splice(catchAllIndex, 0, newRule);
      } else {
        updatedIngress.push(newRule);
        updatedIngress.push({ service: 'http_status:404' });
      }

      await cf.updateTunnelConfig(cfSettings.tunnelId, updatedIngress);
      
      const zoneId = await cf.getZoneId(cfSettings.domainName);
      await cf.createCnameRecord(zoneId, hostname, cfSettings.tunnelId);
      
      res.json({ success: true, message: `Route added successfully for ${hostname}` });
    } catch (err) {
      serviceErrorLogger.logError('Cloudflare Sync', 'api_error', 'Failed to add Cloudflare route', { hostname, service, error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/routes/delete', async (req, res) => {
    const { hostname } = req.body;
    if (!hostname) {
      return res.status(400).json({ error: 'hostname is required.' });
    }

    if (!cfSettings.accountId || !cfSettings.apiToken || !cfSettings.tunnelId || !cfSettings.domainName) {
      return res.status(400).json({ error: 'Cloudflare API integration is not fully configured.' });
    }

    try {
      const cf = new CloudflareApi(cfSettings.accountId, cfSettings.apiToken);
      const configResult = await cf.getTunnelConfig(cfSettings.tunnelId);
      const ingress = configResult?.config?.ingress || [];
      
      const updatedIngress = ingress.filter(rule => rule.hostname !== hostname);
      await cf.updateTunnelConfig(cfSettings.tunnelId, updatedIngress);
      
      const zoneId = await cf.getZoneId(cfSettings.domainName);
      const dnsRecords = await cf.getDnsRecords(zoneId, cfSettings.domainName);
      const recordToDelete = dnsRecords.find(r => r.name === hostname);
      
      if (recordToDelete) {
        await cf.deleteDnsRecord(zoneId, recordToDelete.id);
      }
      
      res.json({ success: true, message: `Route deleted successfully for ${hostname}` });
    } catch (err) {
      serviceErrorLogger.logError('Cloudflare Sync', 'api_error', 'Failed to delete Cloudflare route', { hostname, error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/ddns', (req, res) => {
    res.json(ddnsSettings);
  });

  router.post('/ddns', async (req, res) => {
    const { enabled, hostname } = req.body;
    ddnsSettings.enabled = !!enabled;
    ddnsSettings.hostname = hostname || '';
    saveDdnsSettings();
    broadcastDdnsSettings();
    
    if (ddnsSettings.enabled) {
      checkDDNS().catch(() => {});
    }
    
    res.json({ success: true, ddns: ddnsSettings });
  });

  return router;
}

module.exports = createCloudflareRouter;
