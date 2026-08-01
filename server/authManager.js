const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AuthManager {
  constructor() {
    const isPackaged = typeof process.pkg !== 'undefined';
    const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;
    this.authFilePath = path.join(baseDir, 'auth.json');
    this.activeTokens = new Set();
    this.credentials = null;
    this.loadCredentials();
  }

  loadCredentials() {
    try {
      if (fs.existsSync(this.authFilePath)) {
        const raw = fs.readFileSync(this.authFilePath, 'utf8');
        this.credentials = JSON.parse(raw);
      }
    } catch (err) {
      console.error('Error loading credentials from auth.json:', err.message);
    }
  }

  saveCredentials(username, salt, passwordHash) {
    try {
      this.credentials = { username, salt, passwordHash };
      fs.writeFileSync(this.authFilePath, JSON.stringify(this.credentials, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('Error saving credentials to auth.json:', err.message);
      return false;
    }
  }

  isSetupRequired() {
    return this.credentials === null;
  }

  hashPassword(password, salt = null) {
    if (!salt) {
      salt = crypto.randomBytes(16).toString('hex');
    }
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
  }

  setupAdmin(username, password) {
    if (!username || !password || username.trim() === '' || password.length < 4) {
      throw new Error('Username and password (min 4 chars) are required.');
    }
    const { salt, hash } = this.hashPassword(password.trim());
    return this.saveCredentials(username.trim(), salt, hash);
  }

  login(username, password) {
    if (this.isSetupRequired()) {
      throw new Error('Initial admin setup is required first.');
    }

    if (!username || !password) {
      return { success: false, error: 'Username and password are required.' };
    }

    if (username.trim() !== this.credentials.username) {
      return { success: false, error: 'Invalid username or password.' };
    }

    const { hash } = this.hashPassword(password, this.credentials.salt);
    if (hash === this.credentials.passwordHash) {
      // Generate a secure session token
      const token = crypto.randomBytes(32).toString('hex');
      this.activeTokens.add(token);
      return { success: true, token };
    }

    return { success: false, error: 'Invalid username or password.' };
  }

  logout(token) {
    if (token) {
      return this.activeTokens.delete(token);
    }
    return false;
  }

  verifyToken(token) {
    if (!token) return false;
    return this.activeTokens.has(token);
  }
}

// Singleton instance
module.exports = new AuthManager();
