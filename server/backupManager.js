const fs = require('fs');
const path = require('path');

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;
const BACKUPS_DIR = path.join(baseDir, 'backups');
const BACKUPS_META_PATH = path.join(baseDir, 'backups_meta.json');

class BackupManager {
  constructor(wsBroadcastCallback, dbManager, errorLogger) {
    this.wsBroadcast = wsBroadcastCallback || (() => {});
    this.dbManager = dbManager;
    this.errorLogger = errorLogger;
    this.history = [];
    this.schedule = 'disabled'; // 'disabled', 'hourly', 'daily'
    this.timer = null;

    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    this.loadMeta();
    this.setupSchedule();
  }

  loadMeta() {
    try {
      if (fs.existsSync(BACKUPS_META_PATH)) {
        const raw = fs.readFileSync(BACKUPS_META_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        this.history = parsed.history || [];
        this.schedule = parsed.schedule || 'disabled';
      }
    } catch (e) {
      console.error('Error loading backups_meta.json:', e.message);
      this.history = [];
      this.schedule = 'disabled';
    }
  }

  saveMeta() {
    try {
      fs.writeFileSync(BACKUPS_META_PATH, JSON.stringify({
        history: this.history,
        schedule: this.schedule
      }, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saving backups_meta.json:', e.message);
    }
  }

  getBackupList() {
    this.history = this.history.filter(item => {
      const filePath = path.join(BACKUPS_DIR, item.filename);
      return fs.existsSync(filePath);
    });
    return {
      history: this.history,
      schedule: this.schedule
    };
  }

  updateSchedule(newSchedule) {
    this.schedule = newSchedule;
    this.saveMeta();
    this.setupSchedule();
    this.notifyChanged();
  }

  setupSchedule() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.schedule === 'disabled') return;

    let intervalMs = 3600000; // hourly
    if (this.schedule === 'daily') {
      intervalMs = 86400000;
    }

    this.timer = setInterval(() => {
      console.log(`Running scheduled database backup (${this.schedule})...`);
      this.runBackup().catch(err => {
        console.error('Scheduled backup failed:', err.message);
      });
    }, intervalMs);
  }

  async runBackup() {
    if (!this.dbManager || this.dbManager.status !== 'connected') {
      const errorMsg = 'Database is not connected. Cannot perform backup.';
      if (this.errorLogger) {
        this.errorLogger.logError('Database', 'backup_error', 'Backup failed', errorMsg);
      }
      throw new Error(errorMsg);
    }

    const dbName = this.dbManager.config.database || 'postgres';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${dbName}_${timestamp}.json`;
    const filePath = path.join(BACKUPS_DIR, filename);

    try {
      const getTablesSql = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
      `;
      const tablesResult = await this.dbManager.executeQuery(getTablesSql);
      const tables = tablesResult.map(r => r.table_name);

      const backupData = {
        database: dbName,
        timestamp: new Date().toISOString(),
        tables: {}
      };

      for (const table of tables) {
        if (!/^[a-zA-Z0-9_]+$/.test(table)) continue;
        const rows = await this.dbManager.executeQuery(`SELECT * FROM ${table}`);
        backupData.tables[table] = rows;
      }

      fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');

      const stat = fs.statSync(filePath);
      const metaEntry = {
        id: `backup_${Date.now()}`,
        filename,
        database: dbName,
        sizeBytes: stat.size,
        timestamp: backupData.timestamp
      };

      this.history.unshift(metaEntry);
      if (this.history.length > 50) {
        const oldest = this.history.pop();
        try {
          fs.unlinkSync(path.join(BACKUPS_DIR, oldest.filename));
        } catch (e) {}
      }

      this.saveMeta();
      this.notifyChanged();
      return metaEntry;
    } catch (err) {
      console.error('Backup database query failed:', err.message);
      if (this.errorLogger) {
        this.errorLogger.logError('Database', 'backup_error', `Backup failed for database: ${dbName}`, err.message);
      }
      throw err;
    }
  }

  deleteBackup(id) {
    const idx = this.history.findIndex(item => item.id === id);
    if (idx !== -1) {
      const item = this.history[idx];
      try {
        fs.unlinkSync(path.join(BACKUPS_DIR, item.filename));
      } catch (e) {}
      this.history.splice(idx, 1);
      this.saveMeta();
      this.notifyChanged();
      return true;
    }
    return false;
  }

  notifyChanged() {
    this.wsBroadcast({
      type: 'database_backups',
      data: this.getBackupList()
    });
  }
}

module.exports = BackupManager;
