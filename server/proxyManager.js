const fs = require('fs');
const path = require('path');
const http = require('http');

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;
const PROXY_RULES_PATH = path.join(baseDir, 'proxy_rules.json');

class ProxyManager {
  constructor(wsBroadcastCallback) {
    this.wsBroadcast = wsBroadcastCallback || (() => {});
    this.rules = {}; // id -> rules details
    this.loadRules();
  }

  loadRules() {
    try {
      if (fs.existsSync(PROXY_RULES_PATH)) {
        const raw = fs.readFileSync(PROXY_RULES_PATH, 'utf8');
        this.rules = JSON.parse(raw);
      }
    } catch (e) {
      console.error('Error loading proxy_rules.json:', e.message);
      this.rules = {};
    }
  }

  saveRules() {
    try {
      fs.writeFileSync(PROXY_RULES_PATH, JSON.stringify(this.rules, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saving proxy_rules.json:', e.message);
    }
  }

  addRule(pathStr, targetPort) {
    let cleanPath = pathStr.trim();
    if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
    if (cleanPath.endsWith('/') && cleanPath.length > 1) cleanPath = cleanPath.slice(0, -1);

    for (const id in this.rules) {
      if (this.rules[id].path === cleanPath) {
        throw new Error(`Proxy rule for path "${cleanPath}" already exists.`);
      }
    }

    const id = `proxy_${Date.now()}`;
    this.rules[id] = {
      id,
      path: cleanPath,
      targetPort: parseInt(targetPort, 10),
      status: 'active'
    };
    
    this.saveRules();
    this.notifyChanged();
    return this.rules[id];
  }

  deleteRule(id) {
    if (this.rules[id]) {
      delete this.rules[id];
      this.saveRules();
      this.notifyChanged();
      return true;
    }
    return false;
  }

  getRulesList() {
    return Object.values(this.rules);
  }

  handleProxy(req, res, rule, subPath, errorLogger) {
    const targetPort = rule.targetPort;
    const targetPath = '/' + (subPath || '');

    const options = {
      host: '127.0.0.1',
      port: targetPort,
      path: targetPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''),
      method: req.method,
      headers: { ...req.headers }
    };

    delete options.headers.host;

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`Proxy request error:`, err.message);
      if (errorLogger) {
        errorLogger.logError('Web Host', 'proxy_error', `Proxy failed for path "${rule.path}" to port ${targetPort}`, err.message);
      }
      res.status(502).send(`Bad Gateway: Failed to connect to proxy target on port ${targetPort}.`);
    });

    req.pipe(proxyReq);
  }

  notifyChanged() {
    this.wsBroadcast({
      type: 'proxy_rules',
      data: this.getRulesList()
    });
  }
}

module.exports = ProxyManager;
