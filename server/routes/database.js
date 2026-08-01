const express = require('express');
const authManager = require('../authManager');

function createDatabaseRouter(dbManager, backupManager) {
  const router = express.Router();

  // In-memory rate limiting store
  const rateLimits = {};
  function checkRateLimit(ip, dbName, maxRequestsPerMinute = 60) {
    const now = Date.now();
    const key = `${ip}:${dbName}`;
    if (!rateLimits[key]) {
      rateLimits[key] = [];
    }
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
    
    const ddlRegex = /\b(DROP|ALTER|TRUNCATE|CREATE|RENAME|GRANT|REVOKE)\b/;
    if (ddlRegex.test(normalized)) {
      if (readOnly || !allowDDL) {
        return { allowed: false, error: 'Forbidden: Schema modifications (DDL) are disabled for this database API.' };
      }
    }

    if (/\bINSERT\b/.test(normalized)) {
      if (readOnly || !allowInsert) {
        return { allowed: false, error: 'Forbidden: INSERT queries are disabled for this database API.' };
      }
    }

    if (/\bUPDATE\b/.test(normalized)) {
      if (readOnly || !allowUpdate) {
        return { allowed: false, error: 'Forbidden: UPDATE queries are disabled for this database API.' };
      }
    }

    if (/\bDELETE\b/.test(normalized)) {
      if (readOnly || !allowDelete) {
        return { allowed: false, error: 'Forbidden: DELETE queries are disabled for this database API.' };
      }
    }

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
    
    // Also check session Bearer token authorization
    const authHeader = req.headers['authorization'];
    const sessionToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const hasValidSession = sessionToken && authManager.verifyToken(sessionToken);

    const { query, params } = req.body;
    const startTime = Date.now();

    // Validate authorization (either valid Session Token OR valid API key)
    const globalKey = dbManager.config.apiKey;
    const dbConfig = dbManager.config.databases?.[dbName];
    const dbKey = dbConfig?.apiKey;

    let isAuthorized = hasValidSession;
    let isMasterKey = hasValidSession;

    if (!isAuthorized) {
      if (apiKey && apiKey === globalKey) {
        isAuthorized = true;
        isMasterKey = true;
      } else if (apiKey && dbKey && apiKey === dbKey) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      const errorMsg = 'Unauthorized: Session login or valid x-api-key required.';
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

  // Database API Settings
  router.get('/settings', (req, res) => {
    res.json(dbManager.getDashboardData());
  });

  router.post('/settings', async (req, res) => {
    try {
      await dbManager.updateConfig(req.body);
      res.json({ success: true, database: dbManager.getDashboardData() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Query REST APIs
  router.post('/db/query', async (req, res) => {
    await handleQueryRequest(req, res, dbManager.config.database);
  });

  router.post('/db/:dbName/query', async (req, res) => {
    await handleQueryRequest(req, res, req.params.dbName);
  });

  // Database Configs APIs (Admin-protected CRUD)
  router.post('/configs/save', async (req, res) => {
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

  router.post('/configs/delete', async (req, res) => {
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

  // Database Backups APIs
  router.get('/backups', (req, res) => {
    res.json(backupManager.getBackupList());
  });

  router.post('/backups/run', async (req, res) => {
    try {
      const meta = await backupManager.runBackup();
      res.json({ success: true, backup: meta });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/backups/delete', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required.' });
    const success = backupManager.deleteBackup(id);
    res.json({ success });
  });

  router.post('/backups/schedule', (req, res) => {
    const { schedule } = req.body;
    if (!schedule) return res.status(400).json({ error: 'schedule is required.' });
    backupManager.updateSchedule(schedule);
    res.json({ success: true, schedule });
  });

  return router;
}

module.exports = createDatabaseRouter;
