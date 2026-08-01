const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('./cryptoHelper');

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = path.join(baseDir, 'db_settings.json');

class DbManager {
  constructor(wsBroadcastCallback, errorLogger) {
    this.wsBroadcast = wsBroadcastCallback || (() => {});
    this.errorLogger = errorLogger;
    this.config = {
      host: '127.0.0.1',
      port: 5432,
      user: 'postgres',
      password: '',
      database: 'postgres',
      ssl: false,
      apiKey: this.generateApiKey(),
      databases: {}
    };
    
    this.auditLog = [];
    
    this.pool = null;
    this.pools = {}; // dbName -> Pool instance
    this.status = 'disconnected'; // disconnected, connected, error
    this.lastError = null;
    this.latency = 0;
    this.databasesList = [];
    
    // Metrics
    this.metrics = {
      totalQueries: 0,
      successQueries: 0,
      errorQueries: 0,
      avgResponseTimeMs: 0
    };

    this.loadConfig();
    this.initializePool();
  }

  generateApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = 'hs_live_';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        
        // Decrypt global credentials
        if (parsed.user) parsed.user = decrypt(parsed.user);
        if (parsed.password) parsed.password = decrypt(parsed.password);
        
        // Decrypt database-specific credentials
        if (parsed.databases && typeof parsed.databases === 'object') {
          for (const dbName in parsed.databases) {
            const dbConf = parsed.databases[dbName];
            if (dbConf.user) dbConf.user = decrypt(dbConf.user);
            if (dbConf.password) dbConf.password = decrypt(dbConf.password);
          }
        }

        this.config = { ...this.config, ...parsed };
      } else {
        this.saveConfig(); // Save defaults
      }
    } catch (err) {
      console.error('Error loading db_settings.json:', err);
    }
  }

  saveConfig() {
    try {
      // Create a copy to encrypt before saving
      const encryptedConfig = { ...this.config };
      
      // Encrypt global credentials
      if (encryptedConfig.user) encryptedConfig.user = encrypt(encryptedConfig.user);
      if (encryptedConfig.password) encryptedConfig.password = encrypt(encryptedConfig.password);
      
      // Encrypt database-specific credentials
      if (encryptedConfig.databases && typeof encryptedConfig.databases === 'object') {
        const encryptedDbs = {};
        for (const dbName in encryptedConfig.databases) {
          const dbConf = encryptedConfig.databases[dbName];
          encryptedDbs[dbName] = {
            ...dbConf,
            user: dbConf.user ? encrypt(dbConf.user) : '',
            password: dbConf.password ? encrypt(dbConf.password) : ''
          };
        }
        encryptedConfig.databases = encryptedDbs;
      }

      fs.writeFileSync(CONFIG_PATH, JSON.stringify(encryptedConfig, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving db_settings.json:', err);
    }
  }

  async updateConfig(newConfig) {
    const password = (newConfig.password === undefined || newConfig.password === '' || newConfig.password === '******') && this.config.password 
      ? this.config.password 
      : newConfig.password;
    
    this.config = {
      ...this.config,
      host: newConfig.host || '127.0.0.1',
      port: parseInt(newConfig.port, 10) || 5432,
      user: newConfig.user || 'postgres',
      password: password || '',
      database: newConfig.database || 'postgres',
      ssl: !!newConfig.ssl
    };
    
    this.saveConfig();
    await this.initializePool();
    await this.testConnection();
    this.notifyChanged();
  }

  async initializePool() {
    // End all cached database pools
    for (const dbName in this.pools) {
      try {
        await this.pools[dbName].end();
      } catch (e) {}
    }
    this.pools = {};

    if (this.pool) {
      try {
        await this.pool.end();
      } catch (e) {}
    }

    if (!this.config.host) {
      this.pool = null;
      this.status = 'disconnected';
      return;
    }

    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000 // 5 seconds timeout
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle pg client:', err);
      this.status = 'error';
      this.lastError = err.message;
      if (this.errorLogger) {
        this.errorLogger.logError('Database', 'pool_error', 'Unexpected error on idle pg client', err.message);
      }
      this.notifyChanged();
    });
  }

  async testConnection() {
    if (!this.pool) {
      this.status = 'disconnected';
      return { success: false, error: 'No connection pool initialized' };
    }

    const start = Date.now();
    try {
      const client = await this.pool.connect();
      try {
        // Query pg databases list and verify
        const resDb = await client.query("SELECT datname FROM pg_database WHERE datistemplate = false;");
        this.databasesList = resDb.rows.map(row => row.datname);
        
        await client.query("SELECT 1;");
        
        this.status = 'connected';
        this.lastError = null;
        this.latency = Date.now() - start;
        return { success: true, latency: this.latency };
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('PostgreSQL test connection failed:', err.message);
      this.status = 'error';
      this.lastError = err.message;
      this.databasesList = [];
      this.latency = 0;
      if (this.errorLogger) {
        this.errorLogger.logError('Database', 'connection_error', 'PostgreSQL test connection failed', err.message);
      }
      return { success: false, error: err.message };
    }
  }

  async getPoolForDb(dbName) {
    if (this.pools[dbName]) {
      return this.pools[dbName];
    }

    // Verify database exists on PG host to prevent injection
    if (this.databasesList.length > 0 && !this.databasesList.includes(dbName)) {
      throw new Error(`Database "${dbName}" does not exist on this PostgreSQL server.`);
    }

    // Check if database-specific config exists
    const dbConf = this.config.databases && this.config.databases[dbName];
    
    let host = this.config.host;
    let port = this.config.port;
    let user = this.config.user;
    let password = this.config.password;
    let ssl = this.config.ssl;

    if (dbConf) {
      if (dbConf.host) host = dbConf.host;
      if (dbConf.port) port = dbConf.port;
      if (dbConf.user) user = dbConf.user;
      if (dbConf.password) password = dbConf.password;
      if (dbConf.ssl !== undefined) ssl = dbConf.ssl;
    }

    const pool = new Pool({
      host,
      port,
      user,
      password,
      database: dbName,
      ssl: ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
      console.error(`Unexpected error on idle pg client for db ${dbName}:`, err);
    });

    this.pools[dbName] = pool;
    return pool;
  }

  async executeQueryOnDb(dbName, sql, params = []) {
    this.metrics.totalQueries++;
    const start = Date.now();

    try {
      const pool = await this.getPoolForDb(dbName);
      const result = await pool.query(sql, params);

      this.metrics.successQueries++;
      const duration = Date.now() - start;

      // Update running average response time
      this.metrics.avgResponseTimeMs = Math.round(
        (this.metrics.avgResponseTimeMs * (this.metrics.successQueries - 1) + duration) / this.metrics.successQueries
      );

      this.notifyChanged();
      return result.rows;
    } catch (err) {
      this.metrics.errorQueries++;
      if (this.errorLogger) {
        this.errorLogger.logError('Database', 'query_error', `SQL query failed on database: ${dbName}`, {
          query: sql,
          error: err.message
        });
      }
      this.notifyChanged();
      throw err;
    }
  }

  async executeQuery(sql, params = []) {
    return this.executeQueryOnDb(this.config.database || 'postgres', sql, params);
  }

  logAudit(dbName, ip, appName, query, success, duration, errorMessage = '', deviceId = null) {
    const logEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      database: dbName,
      ip: ip || 'Unknown',
      appName: appName || 'Unknown Client',
      deviceId: deviceId || null,
      query: query ? (query.length > 80 ? query.substring(0, 80) + '...' : query) : '',
      success,
      duration,
      errorMessage
    };
    this.auditLog.unshift(logEntry);
    if (this.auditLog.length > 50) {
      this.auditLog.pop();
    }
    this.notifyChanged();
  }

  async saveDatabaseConfig(dbName, config) {
    if (!dbName) throw new Error('Database name is required.');
    
    this.config.databases = this.config.databases || {};
    
    const existing = this.config.databases[dbName] || {};
    const password = (config.password === undefined || config.password === '' || config.password === '******') && existing.password 
      ? existing.password 
      : config.password;

    const readOnly = config.readOnly === undefined ? true : !!config.readOnly;

    this.config.databases[dbName] = {
      host: config.host || '',
      port: config.port ? parseInt(config.port, 10) : 0,
      user: config.user || '',
      password: password || '',
      apiKey: config.apiKey || existing.apiKey || this.generateApiKey(),
      readOnly: readOnly,
      allowSelect: config.allowSelect === undefined ? true : !!config.allowSelect,
      allowInsert: config.allowInsert === undefined ? !readOnly : !!config.allowInsert,
      allowUpdate: config.allowUpdate === undefined ? !readOnly : !!config.allowUpdate,
      allowDelete: config.allowDelete === undefined ? !readOnly : !!config.allowDelete,
      allowDDL: config.allowDDL === undefined ? false : !!config.allowDDL,
      rateLimit: config.rateLimit === undefined ? true : !!config.rateLimit,
      ssl: !!config.ssl
    };

    this.saveConfig();
    
    // Close existing pool for this db so it reconnects with new credentials
    if (this.pools[dbName]) {
      try {
        await this.pools[dbName].end();
      } catch (e) {}
      delete this.pools[dbName];
    }

    this.notifyChanged();
    return this.config.databases[dbName];
  }

  async deleteDatabaseConfig(dbName) {
    if (this.config.databases && this.config.databases[dbName]) {
      delete this.config.databases[dbName];
      this.saveConfig();
      
      if (this.pools[dbName]) {
        try {
          await this.pools[dbName].end();
        } catch (e) {}
        delete this.pools[dbName];
      }
      this.notifyChanged();
      return true;
    }
    return false;
  }

  getDashboardData() {
    // Map databases configs to a safe version for dashboard (mask credentials)
    const safeDatabases = {};
    if (this.config.databases) {
      for (const dbName in this.config.databases) {
        const dbConf = this.config.databases[dbName];
        safeDatabases[dbName] = {
          host: dbConf.host,
          port: dbConf.port,
          user: dbConf.user,
          hasPassword: !!dbConf.password,
          apiKey: dbConf.apiKey,
          readOnly: !!dbConf.readOnly,
          allowSelect: dbConf.allowSelect === undefined ? true : !!dbConf.allowSelect,
          allowInsert: dbConf.allowInsert === undefined ? !dbConf.readOnly : !!dbConf.allowInsert,
          allowUpdate: dbConf.allowUpdate === undefined ? !dbConf.readOnly : !!dbConf.allowUpdate,
          allowDelete: dbConf.allowDelete === undefined ? !dbConf.readOnly : !!dbConf.allowDelete,
          allowDDL: dbConf.allowDDL === undefined ? false : !!dbConf.allowDDL,
          rateLimit: !!dbConf.rateLimit,
          ssl: !!dbConf.ssl
        };
      }
    }

    return {
      status: this.status,
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      database: this.config.database,
      hasPassword: !!this.config.password,
      ssl: this.config.ssl,
      apiKey: this.config.apiKey,
      latency: this.latency,
      databases: this.databasesList,
      error: this.lastError,
      metrics: this.metrics,
      databasesConfigs: safeDatabases,
      auditLog: this.auditLog
    };
  }

  notifyChanged() {
    this.wsBroadcast({
      type: 'database_status',
      data: this.getDashboardData()
    });
  }
}

module.exports = DbManager;
