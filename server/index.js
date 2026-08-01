const express = require('express');
const http = require('http');
const ws = require('ws');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const si = require('systeminformation');
const net = require('net');

const ServiceErrorLogger = require('./serviceErrorLogger');
const ApiMonitor = require('./apiMonitor');
const TunnelManager = require('./tunnelManager');
const StaticServerManager = require('./staticServer');
const ProxyManager = require('./proxyManager');
const BackupManager = require('./backupManager');
const CloudflareApi = require('./cloudflareApi');
const DbManager = require('./dbManager');
const authManager = require('./authManager');
const SystemPowerManager = require('./systemPowerManager');

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;

const SETTINGS_PATH = path.join(baseDir, 'cloudflare_settings.json');
let cfSettings = {
  accountId: '',
  apiToken: '',
  tunnelId: '',
  domainName: ''
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
      cfSettings = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading Cloudflare settings:', err);
  }
}

function saveSettings(settings) {
  try {
    cfSettings = {
      accountId: settings.accountId || '',
      apiToken: settings.apiToken || '',
      tunnelId: settings.tunnelId || '',
      domainName: settings.domainName || ''
    };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(cfSettings, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving Cloudflare settings:', err);
  }
}

loadSettings();

const PORT_CONFIG_PATH = path.join(baseDir, 'port.json');
let PORT = 5000;
let DB_PORT = null;
if (fs.existsSync(PORT_CONFIG_PATH)) {
  try {
    const portData = JSON.parse(fs.readFileSync(PORT_CONFIG_PATH, 'utf8'));
    if (portData.port) {
      PORT = parseInt(portData.port, 10);
    }
    if (portData.dbPort) {
      DB_PORT = parseInt(portData.dbPort, 10);
    }
  } catch (e) {
    console.error('Error reading port.json:', e.message);
  }
} else {
  try {
    fs.writeFileSync(PORT_CONFIG_PATH, JSON.stringify({ port: 5000, dbPort: 443 }, null, 2), 'utf8');
  } catch (e) {}
}

const app = express();

const server = http.createServer(app);
const dbServer = DB_PORT && DB_PORT !== PORT ? http.createServer(app) : null;
const wss = new ws.WebSocketServer({ server });

// WebSocket Broadcaster
const wsBroadcast = (messageObj) => {
  const payload = JSON.stringify(messageObj);
  wss.clients.forEach((client) => {
    if (client.readyState === ws.WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

// Initialize loggers and monitors
const serviceErrorLogger = new ServiceErrorLogger(wsBroadcast);
const apiMonitor = new ApiMonitor(wsBroadcast);

app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins dynamically (essential for router and third-party dashboard fetches)
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-app-name', 'x-device-id'],
  credentials: true
}));
app.use(express.json());
app.use(apiMonitor.middleware());

// Security middleware: Protect all private endpoints under /api/*
app.use((req, res, next) => {
  const publicRoutes = [
    '/api/auth/status',
    '/api/auth/setup',
    '/api/auth/login',
    '/api/status'
  ];

  // Bypass for public database REST API queries (authenticated by API key)
  if (req.path.startsWith('/api/db/') && req.path.endsWith('/query')) {
    return next();
  }

  // Allow static files, OPTIONS preflights, or public routes to pass
  if (publicRoutes.includes(req.path) || !req.path.startsWith('/api') || req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token || !authManager.verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized: Session login required.' });
  }

  next();
});

// Auth API Endpoints
app.get('/api/auth/status', (req, res) => {
  res.json({ supported: true, setupRequired: authManager.isSetupRequired() });
});

app.post('/api/auth/setup', (req, res) => {
  const { username, password } = req.body;
  try {
    if (!authManager.isSetupRequired()) {
      return res.status(400).json({ error: 'Initial setup has already been completed.' });
    }
    const success = authManager.setupAdmin(username, password);
    if (success) {
      res.json({ success: true, message: 'Administrator account created successfully.' });
    } else {
      res.status(500).json({ error: 'Failed to save admin credentials.' });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const result = authManager.login(username, password);
    if (result.success) {
      res.json({ success: true, token: result.token });
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (token) {
    authManager.logout(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Initialize managers
const tunnelManager = new TunnelManager(wsBroadcast, serviceErrorLogger);
const staticServerManager = new StaticServerManager(wsBroadcast, serviceErrorLogger);
const dbManager = new DbManager(wsBroadcast, serviceErrorLogger);
const proxyManager = new ProxyManager(wsBroadcast);
const backupManager = new BackupManager(wsBroadcast, dbManager, serviceErrorLogger);
const systemPowerManager = new SystemPowerManager(wsBroadcast, serviceErrorLogger);

// Global exception and rejection handlers to prevent server crash and isolate component failures
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  
  let component = 'System';
  let details = { message: err.message, stack: err.stack };
  
  // Inspect stack trace to isolate component
  const stackStr = err.stack ? err.stack.toString() : '';
  if (stackStr.includes('tunnelManager.js')) {
    component = 'Tunnel';
  } else if (stackStr.includes('staticServer.js')) {
    component = 'Web Host';
  } else if (stackStr.includes('dbManager.js') || stackStr.includes('pg')) {
    component = 'Database';
  } else if (stackStr.includes('backupManager.js')) {
    component = 'Backup';
  } else if (stackStr.includes('proxyManager.js')) {
    component = 'Proxy';
  }
  
  if (serviceErrorLogger) {
    serviceErrorLogger.logError(component, 'uncaught_exception', `Uncaught exception in ${component} component: ${err.message}`, details);
  }

  // Attempt to gracefully stop only the failed sub-component if identifiable from stack
  try {
    if (component === 'Web Host' && staticServerManager) {
      // Find which server port was active in stack trace or stop starting servers
      const portMatch = stackStr.match(/:(\d+)\/|port\s+(\d+)/);
      if (portMatch) {
        const port = parseInt(portMatch[1] || portMatch[2], 10);
        const serverList = staticServerManager.getServersList() || [];
        const serverInfo = serverList.find(s => s.port === port);
        if (serverInfo) {
          console.warn(`Stopping Web Host server ${serverInfo.id} due to uncaught exception...`);
          staticServerManager.stopServer(serverInfo.id);
        }
      }
    } else if (component === 'Tunnel' && tunnelManager) {
      // Find if specific tunnel ID was in logs/error or stack
      const tunnelList = tunnelManager.getTunnelsList() || [];
      for (const t of tunnelList) {
        if (stackStr.includes(t.id)) {
          console.warn(`Stopping Tunnel ${t.id} due to uncaught exception...`);
          tunnelManager.stopTunnel(t.id);
        }
      }
    }
  } catch (stopErr) {
    console.error('Failed to gracefully stop failed component:', stopErr.message);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  
  let component = 'System';
  const err = reason instanceof Error ? reason : new Error(String(reason));
  let details = { message: err.message, stack: err.stack };
  
  // Inspect stack trace to isolate component
  const stackStr = err.stack ? err.stack.toString() : String(reason);
  if (stackStr.includes('tunnelManager.js')) {
    component = 'Tunnel';
  } else if (stackStr.includes('staticServer.js')) {
    component = 'Web Host';
  } else if (stackStr.includes('dbManager.js') || stackStr.includes('pg')) {
    component = 'Database';
  } else if (stackStr.includes('backupManager.js')) {
    component = 'Backup';
  } else if (stackStr.includes('proxyManager.js')) {
    component = 'Proxy';
  }
  
  if (serviceErrorLogger) {
    serviceErrorLogger.logError(component, 'unhandled_rejection', `Unhandled promise rejection in ${component} component: ${err.message}`, details);
  }
});

// DDNS settings loading
const DDNS_SETTINGS_PATH = path.join(baseDir, 'ddns_settings.json');
let ddnsSettings = {
  enabled: false,
  hostname: '',
  lastSync: null,
  lastIp: '',
  error: null
};

function loadDdnsSettings() {
  try {
    if (fs.existsSync(DDNS_SETTINGS_PATH)) {
      ddnsSettings = JSON.parse(fs.readFileSync(DDNS_SETTINGS_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading ddns_settings.json:', e.message);
  }
}

function saveDdnsSettings() {
  try {
    fs.writeFileSync(DDNS_SETTINGS_PATH, JSON.stringify(ddnsSettings, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving ddns_settings.json:', e.message);
  }
}

function broadcastDdnsSettings() {
  wsBroadcast({
    type: 'ddns_status',
    data: ddnsSettings
  });
}

loadDdnsSettings();

// DDNS Sync logic
async function checkDDNS() {
  if (!ddnsSettings.enabled || !ddnsSettings.hostname) return;
  if (!cfSettings.accountId || !cfSettings.apiToken || !cfSettings.domainName) {
    ddnsSettings.error = 'Cloudflare API integration is not fully configured.';
    saveDdnsSettings();
    broadcastDdnsSettings();
    return;
  }

  const axios = require('axios');
  try {
    const ipRes = await axios.get('https://api.ipify.org?format=json');
    const publicIp = ipRes.data.ip;

    if (ddnsSettings.lastIp === publicIp && ddnsSettings.lastSync && !ddnsSettings.error) {
      return;
    }

    const cf = new CloudflareApi(cfSettings.accountId, cfSettings.apiToken);
    const zoneId = await cf.getZoneId(cfSettings.domainName);

    const dnsRes = await cf.client.get(`/zones/${zoneId}/dns_records`, {
      params: { name: ddnsSettings.hostname, type: 'A' }
    });
    const records = dnsRes.data.result;

    if (records && records.length > 0) {
      const recordId = records[0].id;
      await cf.client.put(`/zones/${zoneId}/dns_records/${recordId}`, {
        type: 'A',
        name: ddnsSettings.hostname,
        content: publicIp,
        ttl: 1,
        proxied: false
      });
    } else {
      await cf.client.post(`/zones/${zoneId}/dns_records`, {
        type: 'A',
        name: ddnsSettings.hostname,
        content: publicIp,
        ttl: 1,
        proxied: false
      });
    }

    ddnsSettings.lastIp = publicIp;
    ddnsSettings.lastSync = new Date().toISOString();
    ddnsSettings.error = null;
    console.log(`DDNS sync successful: ${ddnsSettings.hostname} -> ${publicIp}`);
  } catch (err) {
    console.error('DDNS sync failed:', err.message);
    ddnsSettings.error = err.message;
    serviceErrorLogger.logError('Cloudflare Sync', 'ddns_error', 'DDNS sync failed for ' + ddnsSettings.hostname, err.message);
  } finally {
    saveDdnsSettings();
    broadcastDdnsSettings();
  }
}

// Check DDNS every 10 minutes
setInterval(checkDDNS, 600000);
// Trigger check on startup if enabled
setTimeout(checkDDNS, 5000);

// API Routes

// Get global status
app.get('/api/status', (req, res) => {
  res.json({
    ready: tunnelManager.isReady(),
    downloadStatus: tunnelManager.downloadStatus,
    tunnelsCount: tunnelManager.getTunnelsList().filter(t => t.status === 'running').length,
    serversCount: staticServerManager.getServersList().filter(s => s.status === 'running').length
  });
});

// Trigger download of binaries
app.post('/api/download', (req, res) => {
  tunnelManager.downloadBinaries().catch(err => {
    console.error('Deferred error downloading binaries:', err);
  });
  res.json({ success: true, message: 'Binary downloads started.' });
});

// Verify path exists on local machine
app.post('/api/verify-path', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'Folder path is required.' });
  }

  try {
    const resolvedPath = path.resolve(folderPath);
    if (!fs.existsSync(resolvedPath)) {
      return res.json({ exists: false, error: 'Path does not exist.' });
    }
    const stat = fs.statSync(resolvedPath);
    res.json({
      exists: true,
      isDirectory: stat.isDirectory(),
      resolvedPath
    });
  } catch (err) {
    res.json({ exists: false, error: err.message });
  }
});

// Tunnels APIs
app.get('/api/tunnels', (req, res) => {
  res.json(tunnelManager.getTunnelsList());
});

app.post('/api/tunnels/start-cloudflare', (req, res) => {
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

app.post('/api/tunnels/start-rathole', (req, res) => {
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

app.post('/api/tunnels/stop', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'id is required.' });
  }

  const success = tunnelManager.stopTunnel(id);
  res.json({ success });
});

app.post('/api/tunnels/delete', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'id is required.' });
  }

  const success = tunnelManager.deleteTunnel(id);
  res.json({ success });
});

// Static servers APIs
app.get('/api/servers', (req, res) => {
  res.json(staticServerManager.getServersList());
});

app.post('/api/servers/start', async (req, res) => {
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

app.post('/api/servers/stop', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'id is required.' });
  }

  const success = await staticServerManager.stopServer(id);
  res.json({ success });
});

app.post('/api/servers/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'id is required.' });
  }

  const success = await staticServerManager.deleteServer(id);
  res.json({ success });
});

// PHP Configuration APIs
app.get('/api/php/status', (req, res) => {
  res.json(staticServerManager.phpStatus);
});

app.post('/api/php/settings', (req, res) => {
  const { phpPath } = req.body;
  if (phpPath === undefined) {
    return res.status(400).json({ error: 'phpPath is required.' });
  }
  const status = staticServerManager.updatePhpSettings(phpPath);
  res.json({ success: true, status });
});

// Cloudflare Zero Trust REST API Integration
app.get('/api/cloudflare/settings', (req, res) => {
  res.json({
    accountId: cfSettings.accountId,
    tunnelId: cfSettings.tunnelId,
    domainName: cfSettings.domainName,
    hasToken: !!cfSettings.apiToken
  });
});

app.post('/api/cloudflare/settings', (req, res) => {
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

app.get('/api/cloudflare/routes', async (req, res) => {
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

app.post('/api/cloudflare/routes/add', async (req, res) => {
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

app.post('/api/cloudflare/routes/delete', async (req, res) => {
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

// Database API Integration Endpoints
app.get('/api/database/settings', (req, res) => {
  res.json(dbManager.getDashboardData());
});

app.post('/api/database/settings', async (req, res) => {
  try {
    await dbManager.updateConfig(req.body);
    res.json({ success: true, database: dbManager.getDashboardData() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// In-memory rate limiting store
const rateLimits = {};
function checkRateLimit(ip, dbName, maxRequestsPerMinute = 60) {
  const now = Date.now();
  const key = `${ip}:${dbName}`;
  if (!rateLimits[key]) {
    rateLimits[key] = [];
  }
  // Filter out timestamps older than 1 minute
  rateLimits[key] = rateLimits[key].filter(ts => now - ts < 60000);
  if (rateLimits[key].length >= maxRequestsPerMinute) {
    return false;
  }
  rateLimits[key].push(now);
  return true;
}

// Granular query permission scanner
function checkQueryPermission(sql, dbConfig) {
  if (!sql || typeof sql !== 'string') return { allowed: true };
  
  const readOnly = dbConfig?.readOnly !== false;
  const allowSelect = dbConfig?.allowSelect !== undefined ? dbConfig.allowSelect : true;
  const allowInsert = dbConfig?.allowInsert !== undefined ? dbConfig.allowInsert : !readOnly;
  const allowUpdate = dbConfig?.allowUpdate !== undefined ? dbConfig.allowUpdate : !readOnly;
  const allowDelete = dbConfig?.allowDelete !== undefined ? dbConfig.allowDelete : !readOnly;
  const allowDDL = dbConfig?.allowDDL !== undefined ? dbConfig.allowDDL : false;

  const normalized = sql.toUpperCase().trim();
  
  // DDL check (DROP, ALTER, TRUNCATE, CREATE, RENAME, GRANT, REVOKE)
  const ddlRegex = /\b(DROP|ALTER|TRUNCATE|CREATE|RENAME|GRANT|REVOKE)\b/;
  if (ddlRegex.test(normalized)) {
    if (readOnly || !allowDDL) {
      return { allowed: false, error: 'Forbidden: Schema modifications (DDL) are disabled for this database API.' };
    }
  }

  // INSERT check
  if (/\bINSERT\b/.test(normalized)) {
    if (readOnly || !allowInsert) {
      return { allowed: false, error: 'Forbidden: INSERT queries are disabled for this database API.' };
    }
  }

  // UPDATE check
  if (/\bUPDATE\b/.test(normalized)) {
    if (readOnly || !allowUpdate) {
      return { allowed: false, error: 'Forbidden: UPDATE queries are disabled for this database API.' };
    }
  }

  // DELETE check
  if (/\bDELETE\b/.test(normalized)) {
    if (readOnly || !allowDelete) {
      return { allowed: false, error: 'Forbidden: DELETE queries are disabled for this database API.' };
    }
  }

  // SELECT / FETCH check
  if (/\b(SELECT|WITH)\b/.test(normalized) && !allowSelect) {
    return { allowed: false, error: 'Forbidden: SELECT queries are disabled for this database API.' };
  }

  return { allowed: true };
}

// Consolidated secure query handler
async function handleQueryRequest(req, res, targetDb) {
  const dbName = targetDb || dbManager.config.database || 'postgres';
  const apiKey = req.headers['x-api-key'];
  const appName = req.headers['x-app-name'] || 'Unknown Client';
  const deviceId = req.headers['x-device-id'] || null;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown IP';
  
  const { query, params } = req.body;
  const startTime = Date.now();

  // Validate API key
  const globalKey = dbManager.config.apiKey;
  const dbConfig = dbManager.config.databases?.[dbName];
  const dbKey = dbConfig?.apiKey;

  let isAuthorized = false;
  let isMasterKey = false;

  if (apiKey && apiKey === globalKey) {
    isAuthorized = true;
    isMasterKey = true;
  } else if (apiKey && dbKey && apiKey === dbKey) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    const errorMsg = 'Unauthorized: Invalid or missing x-api-key header.';
    dbManager.logAudit(dbName, clientIp, appName, query, false, 0, errorMsg, deviceId);
    return res.status(401).json({ error: errorMsg });
  }

  // Restrict database access if using a database-specific key
  if (!isMasterKey && !dbConfig) {
    const errorMsg = `Forbidden: Database "${dbName}" is not configured for public access.`;
    dbManager.logAudit(dbName, clientIp, appName, query, false, 0, errorMsg, deviceId);
    return res.status(403).json({ error: errorMsg });
  }

  // Rate Limiting
  const rateLimitEnabled = !isMasterKey ? (dbConfig?.rateLimit !== false) : false;
  if (rateLimitEnabled) {
    if (!checkRateLimit(clientIp, dbName, 60)) {
      const errorMsg = 'Too Many Requests: Rate limit exceeded (Max 60 req/min).';
      dbManager.logAudit(dbName, clientIp, appName, query, false, 0, errorMsg, deviceId);
      return res.status(429).json({ error: errorMsg });
    }
  }

  // Missing SQL check
  if (!query) {
    const errorMsg = 'Missing SQL query string.';
    dbManager.logAudit(dbName, clientIp, appName, query, false, 0, errorMsg, deviceId);
    return res.status(400).json({ error: errorMsg });
  }

  // Granular Access Permission Enforcement
  if (!isMasterKey && dbConfig) {
    const perm = checkQueryPermission(query, dbConfig);
    if (!perm.allowed) {
      dbManager.logAudit(dbName, clientIp, appName, query, false, 0, perm.error, deviceId);
      return res.status(403).json({ error: perm.error });
    }
  }

  // Execute
  try {
    const rows = await dbManager.executeQueryOnDb(dbName, query, params || []);
    const duration = Date.now() - startTime;
    dbManager.logAudit(dbName, clientIp, appName, query, true, duration, '', deviceId);
    res.json({ success: true, rows });
  } catch (err) {
    const duration = Date.now() - startTime;
    dbManager.logAudit(dbName, clientIp, appName, query, false, duration, err.message, deviceId);
    res.status(500).json({ error: err.message });
  }
}

// Public Query REST API for Mobile Apps (Default Database)
app.post('/api/db/query', async (req, res) => {
  await handleQueryRequest(req, res, dbManager.config.database);
});

// Public Query REST API for specific databases
app.post('/api/db/:dbName/query', async (req, res) => {
  await handleQueryRequest(req, res, req.params.dbName);
});

// Database Configs APIs (Admin-protected CRUD)
app.post('/api/database/configs/save', async (req, res) => {
  const { dbName, config } = req.body;
  if (!dbName || !config) {
    return res.status(400).json({ error: 'dbName and config are required.' });
  }
  try {
    const saved = await dbManager.saveDatabaseConfig(dbName, config);
    res.json({ success: true, config: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/database/configs/delete', async (req, res) => {
  const { dbName } = req.body;
  if (!dbName) {
    return res.status(400).json({ error: 'dbName is required.' });
  }
  try {
    const success = await dbManager.deleteDatabaseConfig(dbName);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Windows Startup / Background Execution APIs
const { exec } = require('child_process');
const startupDir = path.join(process.env.APPDATA || '', 'Microsoft/Windows/Start Menu/Programs/Startup');
const vbsPath = path.join(startupDir, 'HomeServer.vbs');

function runCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout, stderr) => {
      resolve({ err, stdout, stderr });
    });
  });
}

app.get('/api/startup/status', async (req, res) => {
  if (!process.env.APPDATA) {
    return res.json({ supported: false, mode: 'disabled' });
  }
  
  const vbsExists = fs.existsSync(vbsPath);
  
  // Check if scheduled task exists
  const { err } = await runCommand('schtasks /query /tn "HomeServer"');
  const taskExists = !err;
  
  let mode = 'disabled';
  if (vbsExists) mode = 'login';
  else if (taskExists) mode = 'boot';
  
  res.json({ supported: true, mode });
});

app.post('/api/startup/enable', async (req, res) => {
  if (!process.env.APPDATA) {
    return res.status(400).json({ error: 'Startup configuration is only supported on Windows.' });
  }

  const { mode } = req.body; // 'login' or 'boot'
  
  // Clear any existing configurations first
  try {
    if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath);
  } catch (e) {}
  await runCommand('schtasks /delete /tn "HomeServer" /f');

  const execPath = process.execPath;
  const workingDir = path.dirname(execPath);

  if (mode === 'login') {
    try {
      const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${workingDir}"
WshShell.Run """${execPath}""", 0, false
`;
      if (!fs.existsSync(startupDir)) {
        fs.mkdirSync(startupDir, { recursive: true });
      }
      fs.writeFileSync(vbsPath, vbsContent, 'utf8');
      res.json({ success: true, mode: 'login', message: 'Auto-start on login enabled successfully.' });
    } catch (err) {
      serviceErrorLogger.logError('System', 'startup_config_error', 'Failed to configure startup VBScript file', err.message);
      res.status(500).json({ error: err.message });
    }
  } else if (mode === 'boot') {
    // Create Task Scheduler task (requires admin privileges)
    // Run at system startup (/sc onstart) under SYSTEM account (/ru "SYSTEM")
    const cmd = `schtasks /create /tn "HomeServer" /tr "\\"${execPath}\\"" /sc onstart /ru "SYSTEM" /f`;
    const { err, stderr } = await runCommand(cmd);
    
    if (err) {
      console.error('Failed to create scheduled task:', stderr || err.message);
      serviceErrorLogger.logError('System', 'startup_config_error', 'Failed to create Windows scheduled task (schtasks)', stderr || err.message);
      return res.status(500).json({ 
        error: 'Failed to create Windows scheduled task. Make sure you run homeserver.exe as Administrator on your NAS to enable this.' 
      });
    }
    
    res.json({ success: true, mode: 'boot', message: 'Auto-start on boot (system service) enabled successfully.' });
  } else {
    res.status(400).json({ error: 'Invalid startup mode.' });
  }
});

app.post('/api/startup/disable', async (req, res) => {
  if (!process.env.APPDATA) {
    return res.status(400).json({ error: 'Startup configuration is only supported on Windows.' });
  }

  try {
    if (fs.existsSync(vbsPath)) {
      fs.unlinkSync(vbsPath);
    }
    await runCommand('schtasks /delete /tn "HomeServer" /f');
    res.json({ success: true, message: 'Auto-start disabled successfully.' });
  } catch (err) {
    serviceErrorLogger.logError('System', 'startup_config_error', 'Failed to disable auto-start', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Clear diagnostic service error logs
app.post('/api/diagnostics/clear-errors', (req, res) => {
  serviceErrorLogger.clearErrors();
  res.json({ success: true, message: 'Service error logs cleared successfully.' });
});

// Port Forwarding Tester API
app.post('/api/diagnostics/port-test', async (req, res) => {
  const { port } = req.body;
  if (!port) return res.status(400).json({ error: 'Port is required.' });

  const axios = require('axios');
  try {
    const ipRes = await axios.get('https://api.ipify.org?format=json');
    const publicIp = ipRes.data.ip;

    const socket = net.createConnection({
      host: publicIp,
      port: parseInt(port, 10),
      timeout: 3000
    });

    let resultSent = false;

    socket.on('connect', () => {
      if (!resultSent) {
        resultSent = true;
        socket.destroy();
        res.json({ success: true, status: 'open', ip: publicIp, port });
      }
    });

    socket.on('timeout', () => {
      if (!resultSent) {
        resultSent = true;
        socket.destroy();
        res.json({ success: true, status: 'closed', reason: 'Connection timed out', ip: publicIp, port });
      }
    });

    socket.on('error', (err) => {
      if (!resultSent) {
        resultSent = true;
        socket.destroy();
        res.json({ success: true, status: 'closed', reason: err.message, ip: publicIp, port });
      }
    });
  } catch (err) {
    serviceErrorLogger.logError('System', 'port_test_error', 'Failed to perform port test', err.message);
    res.status(500).json({ error: 'Failed to retrieve public IP or execute port test: ' + err.message });
  }
});

// DDNS Configuration APIs
app.get('/api/cloudflare/ddns', (req, res) => {
  res.json(ddnsSettings);
});

app.post('/api/cloudflare/ddns', async (req, res) => {
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

// Proxy Rules Configuration APIs
app.get('/api/proxy/rules', (req, res) => {
  res.json(proxyManager.getRulesList());
});

app.post('/api/proxy/rules/add', (req, res) => {
  const { path: pathStr, port } = req.body;
  if (!pathStr || !port) {
    return res.status(400).json({ error: 'path and port are required.' });
  }
  try {
    const rule = proxyManager.addRule(pathStr, port);
    res.json({ success: true, rule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/proxy/rules/delete', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id is required.' });
  const success = proxyManager.deleteRule(id);
  res.json({ success });
});

// Database Backups APIs
app.get('/api/database/backups', (req, res) => {
  res.json(backupManager.getBackupList());
});

app.post('/api/database/backups/run', async (req, res) => {
  try {
    const meta = await backupManager.runBackup();
    res.json({ success: true, backup: meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/database/backups/delete', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id is required.' });
  const success = backupManager.deleteBackup(id);
  res.json({ success });
});

app.post('/api/database/backups/schedule', (req, res) => {
  const { schedule } = req.body;
  if (!schedule) return res.status(400).json({ error: 'schedule is required.' });
  backupManager.updateSchedule(schedule);
  res.json({ success: true, schedule });
});

// Power Scheduling APIs
app.get('/api/power-schedule', (req, res) => {
  res.json(systemPowerManager.getDashboardData());
});

app.post('/api/power-schedule', async (req, res) => {
  try {
    await systemPowerManager.updateConfig(req.body);
    res.json({ success: true, data: systemPowerManager.getDashboardData() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/power-schedule/manual', async (req, res) => {
  const { action } = req.body;
  if (!action) return res.status(400).json({ error: 'action is required.' });
  try {
    await systemPowerManager.executeManualAction(action);
    res.json({ success: true, message: `System will enter ${action} in 2 seconds.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Website Specific Config APIs (Basic Auth & Custom Headers)
app.get('/api/servers/:port/config', (req, res) => {
  const { port } = req.params;
  res.json(staticServerManager.getServerConfig(parseInt(port, 10)));
});

app.post('/api/servers/:port/config', (req, res) => {
  const { port } = req.params;
  const { basicAuth, headers } = req.body;
  staticServerManager.updateServerConfig(parseInt(port, 10), basicAuth, headers);
  res.json({ success: true, message: 'Server configuration updated successfully.' });
});

// Wildcard Reverse Proxy handler
app.all('/proxy/:ruleId/:subPath(*)?', (req, res) => {
  const { ruleId, subPath } = req.params;
  const rule = proxyManager.rules[ruleId];
  if (!rule || rule.status !== 'active') {
    return res.status(404).send('Proxy target not found or inactive.');
  }
  proxyManager.handleProxy(req, res, rule, subPath || '', serviceErrorLogger);
});

// Serve frontend assets if built
const distPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// WebSocket setup
wss.on('error', (err) => {
  console.error('WebSocket Server error:', err.message);
  if (serviceErrorLogger) {
    serviceErrorLogger.logError('System', 'websocket_server_error', 'WebSocket Server error occurred', err.message);
  }
});

wss.on('connection', (socket) => {
  console.log('WS Client connected');

  socket.on('error', (err) => {
    console.error('WS Client error:', err.message);
  });

  // Push immediate state
  socket.send(JSON.stringify({ type: 'download_status', data: tunnelManager.downloadStatus }));
  socket.send(JSON.stringify({ type: 'tunnels_list', data: tunnelManager.getTunnelsList() }));
  socket.send(JSON.stringify({ type: 'servers_list', data: staticServerManager.getServersList() }));
  socket.send(JSON.stringify({ type: 'database_status', data: dbManager.getDashboardData() }));
  socket.send(JSON.stringify({ type: 'service_errors', data: serviceErrorLogger.getErrors() }));
  socket.send(JSON.stringify({ type: 'api_metrics', data: apiMonitor.getMetrics() }));
  socket.send(JSON.stringify({ type: 'proxy_rules', data: proxyManager.getRulesList() }));
  socket.send(JSON.stringify({ type: 'database_backups', data: backupManager.getBackupList() }));
  socket.send(JSON.stringify({ type: 'ddns_status', data: ddnsSettings }));
  socket.send(JSON.stringify({ type: 'power_schedule_status', data: systemPowerManager.getDashboardData() }));

  socket.on('close', () => {
    console.log('WS Client disconnected');
  });
});

// Telemetry interval (2s)
let cachedOs = null;
si.osInfo().then(info => cachedOs = info).catch(console.error);

let dbCheckCounter = 0;

setInterval(async () => {
  if (wss.clients.size === 0) return;

  // Run database health check every 10s (5 * 2s)
  dbCheckCounter++;
  if (dbCheckCounter >= 5) {
    dbCheckCounter = 0;
    dbManager.testConnection().then(() => dbManager.notifyChanged()).catch(() => {});
  }

  try {
    const [load, mem, fsSize, netStats, time] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.time()
    ]);

    let rxSpeed = 0;
    let txSpeed = 0;
    if (netStats && netStats.length > 0) {
      // Find the first active interface
      const active = netStats.find(n => n.operstate === 'up') || netStats[0];
      if (active) {
        rxSpeed = active.rx_sec || 0;
        txSpeed = active.tx_sec || 0;
      }
    }

    // Filter out internal/empty filesystems and format disks
    const disks = fsSize
      .filter(f => f.size > 0 && !f.mount.includes('/boot') && !f.fs.includes('loop'))
      .map(f => ({
        fs: f.fs,
        size: f.size,
        used: f.used,
        use: Math.round(f.use),
        mount: f.mount
      }));

    const telemetryData = {
      cpu: {
        current: Math.round(load.currentLoad),
        cores: load.cpus.map(c => Math.round(c.load))
      },
      ram: {
        total: mem.total,
        free: mem.free,
        used: mem.used,
        percent: Math.round((mem.used / mem.total) * 100)
      },
      disks,
      network: {
        rx: rxSpeed,
        tx: txSpeed
      },
      system: {
        uptime: time.uptime,
        hostname: cachedOs ? cachedOs.hostname : 'HomeServer',
        distro: cachedOs ? `${cachedOs.distro} ${cachedOs.release} (${cachedOs.arch})` : 'Windows'
      }
    };

    wsBroadcast({
      type: 'telemetry',
      data: telemetryData
    });
  } catch (err) {
    console.error('Error gathering telemetry data:', err);
  }
}, 2000);

// Handle main HTTP server errors
server.on('error', (err) => {
  console.error(`===============================================`);
  console.error(` FATAL ERROR: Main HTTP server failed on port ${PORT}!`);
  console.error(` Reason: ${err.message}`);
  console.error(`===============================================`);
  if (serviceErrorLogger) {
    serviceErrorLogger.logError('System', 'server_error', `Main HTTP server failed on port ${PORT}`, err.message);
  }
  if (!server.listening) {
    process.exit(1);
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`   HomeServer Backend Running on Port ${PORT}`);
  console.log(`===============================================`);
});

if (dbServer && DB_PORT) {
  dbServer.on('error', (err) => {
    console.error(`===============================================`);
    console.error(` ERROR: Failed to bind Database API to port ${DB_PORT}!`);
    console.error(` Reason: ${err.message}`);
    console.error(` Tip: Run homeserver.exe as Administrator.`);
    console.error(`===============================================`);
  });

  dbServer.listen(DB_PORT, () => {
    console.log(`===============================================`);
    console.log(`   Database REST API Running on Port ${DB_PORT}`);
    console.log(`===============================================`);
  });
}
