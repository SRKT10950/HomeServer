const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');

class UpdateManager {
  constructor(wsBroadcast, serviceErrorLogger, baseDir) {
    this.wsBroadcast = wsBroadcast;
    this.serviceErrorLogger = serviceErrorLogger;
    this.baseDir = baseDir || process.cwd();
    this.settingsPath = path.join(this.baseDir, 'update_settings.json');
    this.packageName = 'co.in.mhservice.homeserver';
    this.apiEndpoint = `https://app.mhservice.co.in/api/apps/package/${this.packageName}`;

    this.currentVersion = this.loadCurrentVersion();
    this.state = {
      currentVersion: this.currentVersion,
      latestVersion: this.currentVersion,
      hasUpdate: false,
      downloadUrl: null,
      changelog: '',
      lastCheckTime: null,
      checking: false,
      downloading: false,
      downloadProgress: 0,
      error: null
    };

    this.loadSettings();
  }

  loadCurrentVersion() {
    try {
      const serverPkg = require('./package.json');
      if (serverPkg && serverPkg.version) return serverPkg.version;
    } catch (e) {}
    try {
      const rootPkg = require('../package.json');
      if (rootPkg && rootPkg.version) return rootPkg.version;
    } catch (e) {}
    try {
      const rootPkgPath = path.join(this.baseDir, 'package.json');
      if (fs.existsSync(rootPkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
        if (pkg.version) return pkg.version;
      }
    } catch (e) {}
    return '1.0.2';
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf8');
        const saved = JSON.parse(raw);
        this.state.lastCheckTime = saved.lastCheckTime || null;
        this.state.latestVersion = saved.latestVersion || this.currentVersion;
        this.state.hasUpdate = saved.hasUpdate || false;
        this.state.downloadUrl = saved.downloadUrl || null;
        this.state.changelog = saved.changelog || '';
      }
    } catch (e) {
      console.error('Error loading update_settings.json:', e.message);
    }
  }

  saveSettings() {
    try {
      const saved = {
        lastCheckTime: this.state.lastCheckTime,
        latestVersion: this.state.latestVersion,
        hasUpdate: this.state.hasUpdate,
        downloadUrl: this.state.downloadUrl,
        changelog: this.state.changelog
      };
      fs.writeFileSync(this.settingsPath, JSON.stringify(saved, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saving update_settings.json:', e.message);
    }
  }

  notifyState() {
    if (typeof this.wsBroadcast === 'function') {
      this.wsBroadcast({
        type: 'update_status',
        data: this.getState()
      });
    }
  }

  getState() {
    return {
      currentVersion: this.currentVersion,
      latestVersion: this.state.latestVersion,
      hasUpdate: this.state.hasUpdate,
      downloadUrl: this.state.downloadUrl,
      changelog: this.state.changelog,
      lastCheckTime: this.state.lastCheckTime,
      checking: this.state.checking,
      downloading: this.state.downloading,
      downloadProgress: this.state.downloadProgress,
      error: this.state.error
    };
  }

  compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    const clean1 = String(v1).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const clean2 = String(v2).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const maxLen = Math.max(clean1.length, clean2.length);
    for (let i = 0; i < maxLen; i++) {
      const num1 = clean1[i] || 0;
      const num2 = clean2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }

  async checkForUpdates(manual = false) {
    this.state.checking = true;
    this.state.error = null;
    this.notifyState();

    try {
      console.log(`Checking for updates from ${this.apiEndpoint}...`);
      const response = await axios.get(this.apiEndpoint, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
      const data = response.data || {};

      // Parse payload from app.mhservice.co.in (which returns { latestVersion: { versionName, apkPath, changelog } })
      const latestObj = data.latestVersion || data.latest || data;
      const remoteVersion = latestObj.versionName || latestObj.version || data.versionName || null;
      let rawApkPath = latestObj.apkPath || latestObj.apkUrl || latestObj.downloadUrl || data.downloadUrl || null;
      
      let remoteDownloadUrl = `https://app.mhservice.co.in/api/apps/package/${this.packageName}/download`;
      if (rawApkPath) {
        remoteDownloadUrl = rawApkPath.startsWith('http') ? rawApkPath : `https://app.mhservice.co.in${rawApkPath.startsWith('/') ? '' : '/'}${rawApkPath}`;
      }

      const changelog = latestObj.changelog || latestObj.description || data.changelog || data.description || 'No release notes provided.';

      this.state.lastCheckTime = new Date().toISOString();

      if (remoteVersion && this.compareVersions(remoteVersion, this.currentVersion) > 0) {
        this.state.hasUpdate = true;
        this.state.latestVersion = remoteVersion;
        this.state.downloadUrl = remoteDownloadUrl;
        this.state.changelog = changelog;
        console.log(`New version available: ${remoteVersion} (Current: ${this.currentVersion})`);
      } else {
        this.state.hasUpdate = false;
        this.state.latestVersion = remoteVersion || this.currentVersion;
        console.log(`HomeServer is up to date (Version ${this.currentVersion}). Remote version: ${remoteVersion || 'N/A'}`);
      }

      this.saveSettings();
    } catch (err) {
      console.error('Failed to check for updates:', err.message);
      this.state.error = `Update check failed: ${err.message}`;
      if (this.serviceErrorLogger) {
        this.serviceErrorLogger.logError('System', 'update_check_error', 'Failed to check for system updates', err.message);
      }
    } finally {
      this.state.checking = false;
      this.notifyState();
    }

    return this.getState();
  }

  scheduleDailyCheck() {
    // Initial check on server startup after 10 seconds
    setTimeout(() => {
      this.checkForUpdates().catch(e => console.error('Initial update check error:', e.message));
    }, 10000);

    // Daily automatic check once every 24 hours (86,400,000 ms)
    const dailyTimer = setInterval(() => {
      this.checkForUpdates().catch(e => console.error('Daily automatic update check error:', e.message));
    }, 86400000);

    if (dailyTimer.unref) {
      dailyTimer.unref();
    }
  }

  async applyUpdate() {
    if (this.state.downloading) {
      throw new Error('Update is already in progress.');
    }

    const downloadUrl = this.state.downloadUrl || `https://app.mhservice.co.in/api/apps/package/${this.packageName}/download`;
    const tempExePath = path.join(this.baseDir, 'homeserver_new.exe');

    this.state.downloading = true;
    this.state.downloadProgress = 0;
    this.state.error = null;
    this.notifyState();

    try {
      console.log(`Downloading update executable from ${downloadUrl}...`);
      const response = await axios({
        method: 'get',
        url: downloadUrl,
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const totalLength = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;

      const writer = fs.createWriteStream(tempExePath);

      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalLength > 0) {
          this.state.downloadProgress = Math.round((downloadedBytes / totalLength) * 100);
          this.notifyState();
        }
      });

      await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      console.log(`Update downloaded to ${tempExePath}. Preparing Windows batch installer...`);

      const batPath = path.join(this.baseDir, 'update_installer.bat');
      const targetExePath = process.execPath.endsWith('node.exe')
        ? path.join(this.baseDir, 'homeserver.exe')
        : process.execPath;

      const batContent = `@echo off
echo Waiting for HomeServer process to stop...
timeout /t 3 /nobreak > NUL
if exist "${tempExePath}" (
  echo Replacing executable...
  copy /y "${tempExePath}" "${targetExePath}"
  del /f /q "${tempExePath}"
)
echo Starting updated HomeServer...
start "" "${targetExePath}"
del "%~f0"
`;

      fs.writeFileSync(batPath, batContent, 'utf8');

      console.log('Spawning installer script and shutting down HomeServer process...');
      const sub = spawn('cmd.exe', ['/c', batPath], {
        detached: true,
        stdio: 'ignore'
      });
      sub.unref();

      setTimeout(() => {
        process.exit(0);
      }, 1000);

      return { success: true, message: 'Update downloaded. Restarting application...' };
    } catch (err) {
      this.state.downloading = false;
      this.state.error = `Failed to apply update: ${err.message}`;
      this.notifyState();
      if (fs.existsSync(tempExePath)) {
        try { fs.unlinkSync(tempExePath); } catch (e) {}
      }
      throw err;
    }
  }
}

module.exports = UpdateManager;
