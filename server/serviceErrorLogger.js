const fs = require('fs');
const path = require('path');

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;
const ERROR_LOG_PATH = path.join(baseDir, 'service_errors.json');

class ServiceErrorLogger {
  constructor(wsBroadcastCallback) {
    this.wsBroadcast = wsBroadcastCallback || (() => {});
    this.errors = [];
    this.loadErrors();
  }

  loadErrors() {
    try {
      if (fs.existsSync(ERROR_LOG_PATH)) {
        const raw = fs.readFileSync(ERROR_LOG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.errors = parsed;
        }
      }
    } catch (err) {
      console.error('Error loading service_errors.json:', err);
      this.errors = [];
    }
  }

  saveErrors() {
    try {
      fs.writeFileSync(ERROR_LOG_PATH, JSON.stringify(this.errors, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving service_errors.json:', err);
    }
  }

  logError(service, type, message, details = {}) {
    const errorEntry = {
      id: Math.random().toString(36).substring(2, 9),
      service, // 'Database', 'Tunnel', 'Web Host', 'Cloudflare Sync', 'System', etc.
      type, // 'connection_error', 'process_exited', 'stderr_error', etc.
      message: message || 'Unknown error occurred.',
      details: typeof details === 'object' ? details : { raw: details },
      timestamp: new Date().toISOString()
    };
    this.errors.unshift(errorEntry);
    if (this.errors.length > 100) {
      this.errors.pop();
    }
    this.saveErrors();
    this.notifyChanged();
  }

  clearErrors() {
    this.errors = [];
    this.saveErrors();
    this.notifyChanged();
  }

  getErrors() {
    return this.errors;
  }

  notifyChanged() {
    this.wsBroadcast({
      type: 'service_errors',
      data: this.errors
    });
  }
}

module.exports = ServiceErrorLogger;
