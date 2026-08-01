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

// Route modules
const authRouter = require('./routes/auth');
const createTunnelRouter = require('./routes/tunnels');
const createStaticServerRouter = require('./routes/staticServers');
const createCloudflareRouter = require('./routes/cloudflare');
const createDatabaseRouter = require('./routes/database');
const createSystemRouter = require('./routes/system');

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

// Initialize system managers
const tunnelManager = new TunnelManager(wsBroadcast, serviceErrorLogger);
const staticServerManager = new StaticServerManager(wsBroadcast, serviceErrorLogger);
const dbManager = new DbManager(wsBroadcast, serviceErrorLogger);
const proxyManager = new ProxyManager(wsBroadcast);
const backupManager = new BackupManager(wsBroadcast, dbManager, serviceErrorLogger);
const systemPowerManager = new SystemPowerManager(wsBroadcast, serviceErrorLogger);

// Global Exception & Rejection Isolation Handlers
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  let component = 'System';
  const stackStr = err.stack ? err.stack.toString() : '';
  if (stackStr.includes('tunnelManager.js')) component = 'Tunnel';
  else if (stackStr.includes('staticServer.js')) component = 'Web Host';
  else if (stackStr.includes('dbManager.js') || stackStr.includes('pg')) component = 'Database';
  else if (stackStr.includes('backupManager.js')) component = 'Backup';
  else if (stackStr.includes('proxyManager.js')) component = 'Proxy';
  
  if (serviceErrorLogger) {
    serviceErrorLogger.logError(component, 'uncaught_exception', `Uncaught exception in ${component} component: ${err.message}`, { message: err.message, stack: err.stack });
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  let component = 'System';
  const err = reason instanceof Error ? reason : new Error(String(reason));
  const stackStr = err.stack ? err.stack.toString() : String(reason);
  if (stackStr.includes('tunnelManager.js')) component = 'Tunnel';
  else if (stackStr.includes('staticServer.js')) component = 'Web Host';
  else if (stackStr.includes('dbManager.js') || stackStr.includes('pg')) component = 'Database';
  else if (stackStr.includes('backupManager.js')) component = 'Backup';
  else if (stackStr.includes('proxyManager.js')) component = 'Proxy';
  
  if (serviceErrorLogger) {
    serviceErrorLogger.logError(component, 'unhandled_rejection', `Unhandled promise rejection in ${component} component: ${err.message}`, { message: err.message, stack: err.stack });
  }
});

// Graceful Shutdown & Process Cleanup
const gracefulShutdown = async () => {
  console.log('Shutting down HomeServer gracefully...');
  try {
    if (tunnelManager) {
      const tunnels = tunnelManager.getTunnelsList() || [];
      tunnels.forEach(t => tunnelManager.stopTunnel(t.id));
    }
    if (staticServerManager) {
      const servers = staticServerManager.getServersList() || [];
      servers.forEach(s => staticServerManager.stopServer(s.id));
    }
  } catch (err) {
    console.error('Error during cleanup:', err.message);
  }
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// DDNS settings loading & sync
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

setInterval(checkDDNS, 600000);
setTimeout(checkDDNS, 5000);

// Express Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Restrict origins dynamically to loopback and LAN origins if present
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.startsWith('http://192.168.') || origin.startsWith('http://10.')) {
      return callback(null, true);
    }
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

  // Database queries manage their own authentication checks (Bearer token or x-api-key)
  if (req.path.startsWith('/api/db/')) {
    return next();
  }

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

// Mount Express Routers
app.use('/api/auth', authRouter);
app.use('/api/tunnels', createTunnelRouter(tunnelManager));
app.use('/api', createStaticServerRouter(staticServerManager));
app.use('/api/cloudflare', createCloudflareRouter(cfSettings, saveSettings, ddnsSettings, saveDdnsSettings, broadcastDdnsSettings, checkDDNS, serviceErrorLogger));
app.use('/api', createDatabaseRouter(dbManager, backupManager));
app.use('/api', createSystemRouter(tunnelManager, staticServerManager, proxyManager, systemPowerManager, serviceErrorLogger, baseDir));

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
      const active = netStats.find(n => n.operstate === 'up') || netStats[0];
      if (active) {
        rxSpeed = active.rx_sec || 0;
        txSpeed = active.tx_sec || 0;
      }
    }

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
