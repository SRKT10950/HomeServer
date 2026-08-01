const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const unzipper = require('unzipper');

// Determine if running as a compiled standalone binary (pkg)
const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;

const BIN_DIR = path.join(baseDir, 'bin');
const CLOUDFLARED_PATH = path.join(BIN_DIR, 'cloudflared.exe');
const RATHOLE_PATH = path.join(BIN_DIR, 'rathole.exe');

// URLs for Windows binaries
const CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const RATHOLE_URL = 'https://github.com/rapiz1/rathole/releases/download/v0.4.8/rathole-x86_64-pc-windows-msvc.zip';

class TunnelManager {
  constructor(wsBroadcastCallback, errorLogger) {
    this.wsBroadcast = wsBroadcastCallback || (() => {});
    this.errorLogger = errorLogger;
    this.tunnels = {}; // id -> tunnel details
    this.downloadStatus = {
      cloudflared: { status: 'idle', progress: 0, error: null },
      rathole: { status: 'idle', progress: 0, error: null }
    };
    
    // Ensure bin directory exists
    if (!fs.existsSync(BIN_DIR)) {
      fs.mkdirSync(BIN_DIR, { recursive: true });
    }

    // Check if binaries are already present
    if (fs.existsSync(CLOUDFLARED_PATH)) {
      this.downloadStatus.cloudflared.status = 'ready';
    }
    if (fs.existsSync(RATHOLE_PATH)) {
      this.downloadStatus.rathole.status = 'ready';
    }

    this.persistedTunnelsPath = path.join(baseDir, 'tunnels.json');
    this.loadTunnels();
  }

  loadTunnels() {
    try {
      if (fs.existsSync(this.persistedTunnelsPath)) {
        const raw = fs.readFileSync(this.persistedTunnelsPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.tunnels = parsed;
        
        // Auto-start any tunnel that was previously running
        setTimeout(() => {
          for (const id in this.tunnels) {
            const t = this.tunnels[id];
            if (t.status === 'running' || t.status === 'starting') {
              console.log(`Auto-starting tunnel ${id} on system boot...`);
              t.status = 'stopped';
              t.process = null;
              t.startedAt = null;
              t.logs = [];
              
              if (t.type === 'cloudflare') {
                const token = t.config?.token;
                const customPublicUrl = t.config?.customPublicUrl;
                this.startCloudflare(t.id, t.localPort, token, customPublicUrl);
              } else if (t.type === 'rathole') {
                const config = t.config || {};
                this.startRathole(
                  t.id, 
                  t.localPort, 
                  config.serverAddr, 
                  config.defaultToken, 
                  config.serviceName, 
                  config.customPublicUrl
                );
              }
            } else {
              t.status = 'stopped';
              t.process = null;
              t.startedAt = null;
              t.logs = [];
            }
          }
        }, 3000); // 3 seconds delay for system/network initialization
      }
    } catch (err) {
      console.error('Error loading tunnels config:', err);
      this.tunnels = {};
    }
  }

  saveTunnels() {
    try {
      const simplified = {};
      for (const id in this.tunnels) {
        const t = this.tunnels[id];
        simplified[id] = {
          id: t.id,
          type: t.type,
          localPort: t.localPort,
          publicUrl: t.publicUrl,
          status: t.status === 'starting' ? 'running' : t.status, // Save running state
          config: t.config
        };
      }
      fs.writeFileSync(this.persistedTunnelsPath, JSON.stringify(simplified, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving tunnels config:', err);
    }
  }

  deleteTunnel(id) {
    this.stopTunnel(id);
    delete this.tunnels[id];
    this.saveTunnels();
    this.notifyTunnelChanged(id);
    return true;
  }

  // Check if binaries are ready
  isReady() {
    return fs.existsSync(CLOUDFLARED_PATH) && fs.existsSync(RATHOLE_PATH);
  }

  // Trigger downloads if not present
  async downloadBinaries() {
    await this.downloadCloudflared();
    await this.downloadRathole();
  }

  async downloadCloudflared() {
    if (fs.existsSync(CLOUDFLARED_PATH)) {
      this.downloadStatus.cloudflared.status = 'ready';
      this.notifyStatus();
      return;
    }

    this.downloadStatus.cloudflared.status = 'downloading';
    this.downloadStatus.cloudflared.progress = 0;
    this.notifyStatus();

    try {
      const response = await axios({
        method: 'get',
        url: CLOUDFLARED_URL,
        responseType: 'stream'
      });

      const totalLength = parseInt(response.headers['content-length'], 10) || 30000000; // fallback approx 30MB
      let downloadedLength = 0;

      const writer = fs.createWriteStream(CLOUDFLARED_PATH);
      
      response.data.on('data', (chunk) => {
        downloadedLength += chunk.length;
        this.downloadStatus.cloudflared.progress = Math.round((downloadedLength / totalLength) * 100);
        this.notifyStatus();
      });

      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      this.downloadStatus.cloudflared.status = 'ready';
      this.downloadStatus.cloudflared.progress = 100;
      this.notifyStatus();
    } catch (err) {
      console.error('Error downloading cloudflared:', err);
      this.downloadStatus.cloudflared.status = 'error';
      this.downloadStatus.cloudflared.error = err.message;
      if (this.errorLogger) {
        this.errorLogger.logError('Tunnel', 'download_error', 'Failed to download cloudflared client binary', err.message);
      }
      this.notifyStatus();
      if (fs.existsSync(CLOUDFLARED_PATH)) {
        fs.unlinkSync(CLOUDFLARED_PATH);
      }
    }
  }

  async downloadRathole() {
    if (fs.existsSync(RATHOLE_PATH)) {
      this.downloadStatus.rathole.status = 'ready';
      this.notifyStatus();
      return;
    }

    this.downloadStatus.rathole.status = 'downloading';
    this.downloadStatus.rathole.progress = 0;
    this.notifyStatus();

    const zipPath = path.join(BIN_DIR, 'rathole.zip');

    try {
      const response = await axios({
        method: 'get',
        url: RATHOLE_URL,
        responseType: 'stream'
      });

      const totalLength = parseInt(response.headers['content-length'], 10) || 5000000; // fallback approx 5MB
      let downloadedLength = 0;

      const writer = fs.createWriteStream(zipPath);
      
      response.data.on('data', (chunk) => {
        downloadedLength += chunk.length;
        this.downloadStatus.rathole.progress = Math.round((downloadedLength / totalLength) * 100);
        this.notifyStatus();
      });

      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Extract the zip to find rathole.exe
      this.downloadStatus.rathole.status = 'extracting';
      this.notifyStatus();

      await fs.createReadStream(zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry) => {
          const fileName = entry.path;
          // Look for rathole.exe inside zip
          if (fileName === 'rathole.exe' || fileName.endsWith('/rathole.exe')) {
            entry.pipe(fs.createWriteStream(RATHOLE_PATH));
          } else {
            entry.autodrain();
          }
        })
        .promise();

      this.downloadStatus.rathole.status = 'ready';
      this.downloadStatus.rathole.progress = 100;
      this.notifyStatus();
      
      // Cleanup zip file
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    } catch (err) {
      console.error('Error downloading/extracting rathole:', err);
      this.downloadStatus.rathole.status = 'error';
      this.downloadStatus.rathole.error = err.message;
      if (this.errorLogger) {
        this.errorLogger.logError('Tunnel', 'download_error', 'Failed to download/extract rathole client binary', err.message);
      }
      this.notifyStatus();
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
      if (fs.existsSync(RATHOLE_PATH)) {
        fs.unlinkSync(RATHOLE_PATH);
      }
    }
  }

  notifyStatus() {
    this.wsBroadcast({
      type: 'download_status',
      data: this.downloadStatus
    });
  }

  // Get list of active/inactive tunnels
  getTunnelsList() {
    return Object.values(this.tunnels).map(t => ({
      id: t.id,
      type: t.type,
      localPort: t.localPort,
      publicUrl: t.publicUrl,
      status: t.status,
      uptime: t.startedAt ? Math.round((Date.now() - t.startedAt) / 1000) : 0,
      config: t.config
    }));
  }

  // Start a Cloudflare tunnel
  startCloudflare(id, localPort, token = '', customPublicUrl = '') {
    if (this.tunnels[id] && this.tunnels[id].status === 'running') {
      return this.tunnels[id];
    }

    if (!fs.existsSync(CLOUDFLARED_PATH)) {
      throw new Error('cloudflared.exe is not downloaded yet');
    }

    const tunnel = {
      id,
      type: 'cloudflare',
      localPort: token ? (localPort || 'Token') : localPort,
      publicUrl: customPublicUrl || '',
      status: 'starting',
      startedAt: Date.now(),
      logs: [],
      process: null,
      config: { localPort, token, customPublicUrl }
    };

    this.tunnels[id] = tunnel;

    let proc;
    if (token) {
      // Spawn named tunnel: cloudflared tunnel run --token <TOKEN>
      proc = spawn(CLOUDFLARED_PATH, ['tunnel', 'run', '--token', token]);
    } else {
      // Spawn quick tunnel: cloudflared tunnel --url http://127.0.0.1:PORT
      proc = spawn(CLOUDFLARED_PATH, ['tunnel', '--url', `http://127.0.0.1:${localPort}`]);
    }
    tunnel.process = proc;

    const logHandler = (data) => {
      const line = data.toString().trim();
      if (!line) return;

      // Add to logs
      tunnel.logs.push(line);
      if (tunnel.logs.length > 200) tunnel.logs.shift();

      // Log errors to error logger if it contains error/fatal and not too frequent
      const lineLower = line.toLowerCase();
      if ((lineLower.includes('error') || lineLower.includes('fatal')) && this.errorLogger) {
        const now = Date.now();
        if (!tunnel.lastErrorLoggedTime || (now - tunnel.lastErrorLoggedTime > 10000) || tunnel.lastErrorLoggedMsg !== line) {
          tunnel.lastErrorLoggedTime = now;
          tunnel.lastErrorLoggedMsg = line;
          this.errorLogger.logError('Tunnel', 'stderr_error', `Cloudflare tunnel "${id}" error`, line);
        }
      }

      if (token) {
        // For token-based tunnels, check if connection is registered
        if (line.includes('Registered tunnel connection') || line.includes('Registered connector') || line.includes('Connection') && line.includes('established')) {
          tunnel.status = 'running';
          tunnel.publicUrl = customPublicUrl || 'https://one.dash.cloudflare.com';
          this.notifyTunnelChanged(id);
        }
      } else {
        // For quick tunnels, parse the trycloudflare URL
        const urlMatch = line.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (urlMatch) {
          tunnel.publicUrl = urlMatch[0];
          tunnel.status = 'running';
          this.notifyTunnelChanged(id);
        }
      }

      // Stream logs to clients via WS
      this.wsBroadcast({
        type: 'tunnel_log',
        data: { id, log: line }
      });
    };

    proc.stdout.on('data', logHandler);
    proc.stderr.on('data', logHandler);

    proc.on('close', (code) => {
      console.log(`Cloudflare tunnel ${id} exited with code ${code}`);
      const wasUnexpected = tunnel.status !== 'stopped';
      tunnel.status = 'stopped';
      tunnel.publicUrl = '';
      tunnel.startedAt = null;
      if (wasUnexpected && code !== 0 && this.errorLogger) {
        this.errorLogger.logError('Tunnel', 'process_exited', `Cloudflare tunnel "${id}" exited unexpectedly with code ${code}`, {
          exitCode: code,
          lastLogs: tunnel.logs.slice(-5)
        });
      }
      this.notifyTunnelChanged(id);
    });

    proc.on('error', (err) => {
      console.error(`Cloudflare tunnel ${id} process error:`, err);
      tunnel.status = 'error';
      tunnel.logs.push(`Process error: ${err.message}`);
      if (this.errorLogger) {
        this.errorLogger.logError('Tunnel', 'process_error', `Cloudflare tunnel "${id}" process error`, err.message);
      }
      this.notifyTunnelChanged(id);
    });

    this.saveTunnels();
    this.notifyTunnelChanged(id);
    return tunnel;
  }

  // Start a Rathole tunnel
  startRathole(id, localPort, serverAddr, defaultToken, serviceName, customPublicUrl = '') {
    if (this.tunnels[id] && this.tunnels[id].status === 'running') {
      return this.tunnels[id];
    }

    if (!fs.existsSync(RATHOLE_PATH)) {
      throw new Error('rathole.exe is not downloaded yet');
    }

    // Write client.toml config file
    const configName = `client_${id}.toml`;
    const configPath = path.join(BIN_DIR, configName);

    // Format config file contents
    const configContent = `
[client]
remote_addr = "${serverAddr}"
default_token = "${defaultToken}"

[client.services.${serviceName}]
type = "tcp"
local_addr = "127.0.0.1:${localPort}"
`;

    fs.writeFileSync(configPath, configContent);

    const tunnel = {
      id,
      type: 'rathole',
      localPort,
      publicUrl: customPublicUrl || `http://${serverAddr.split(':')[0]}`,
      status: 'starting',
      startedAt: Date.now(),
      logs: [],
      process: null,
      configPath,
      config: { localPort, serverAddr, defaultToken, serviceName, customPublicUrl }
    };

    this.tunnels[id] = tunnel;

    // Spawn: rathole -c client_id.toml
    const proc = spawn(RATHOLE_PATH, ['-c', configPath], { cwd: BIN_DIR });
    tunnel.process = proc;

    const logHandler = (data) => {
      const line = data.toString().trim();
      if (!line) return;

      tunnel.logs.push(line);
      if (tunnel.logs.length > 200) tunnel.logs.shift();

      // Log errors to error logger if it contains error/fatal and not too frequent
      const lineLower = line.toLowerCase();
      if ((lineLower.includes('error') || lineLower.includes('fatal') || lineLower.includes('panic')) && this.errorLogger) {
        const now = Date.now();
        if (!tunnel.lastErrorLoggedTime || (now - tunnel.lastErrorLoggedTime > 10000) || tunnel.lastErrorLoggedMsg !== line) {
          tunnel.lastErrorLoggedTime = now;
          tunnel.lastErrorLoggedMsg = line;
          this.errorLogger.logError('Tunnel', 'stderr_error', `Rathole tunnel "${id}" error`, line);
        }
      }

      // Detect active connection. Rathole client prints control channel details on successful connection.
      // Usually: "Control channel established" or similar success logs
      if (line.includes('established') || line.includes('Control channel') || line.includes('run client')) {
        tunnel.status = 'running';
        this.notifyTunnelChanged(id);
      }

      this.wsBroadcast({
        type: 'tunnel_log',
        data: { id, log: line }
      });
    };

    proc.stdout.on('data', logHandler);
    proc.stderr.on('data', logHandler);

    proc.on('close', (code) => {
      console.log(`Rathole tunnel ${id} exited with code ${code}`);
      const wasUnexpected = tunnel.status !== 'stopped';
      tunnel.status = 'stopped';
      tunnel.startedAt = null;
      // Clean up configuration file
      if (fs.existsSync(configPath)) {
        try {
          fs.unlinkSync(configPath);
        } catch (e) {}
      }
      if (wasUnexpected && code !== 0 && this.errorLogger) {
        this.errorLogger.logError('Tunnel', 'process_exited', `Rathole tunnel "${id}" exited unexpectedly with code ${code}`, {
          exitCode: code,
          lastLogs: tunnel.logs.slice(-5)
        });
      }
      this.notifyTunnelChanged(id);
    });

    proc.on('error', (err) => {
      console.error(`Rathole tunnel ${id} process error:`, err);
      tunnel.status = 'error';
      tunnel.logs.push(`Process error: ${err.message}`);
      if (this.errorLogger) {
        this.errorLogger.logError('Tunnel', 'process_error', `Rathole tunnel "${id}" process error`, err.message);
      }
      this.notifyTunnelChanged(id);
    });

    this.saveTunnels();
    this.notifyTunnelChanged(id);
    return tunnel;
  }

  // Stop a tunnel
  stopTunnel(id) {
    const tunnel = this.tunnels[id];
    if (!tunnel) return false;

    if (tunnel.process) {
      // Kill process tree or process
      tunnel.process.kill('SIGINT');
      // Force kill if it doesn't stop soon
      setTimeout(() => {
        if (tunnel.status === 'running' || tunnel.status === 'starting') {
          tunnel.process.kill('SIGKILL');
        }
      }, 2000);
    }

    if (tunnel.configPath && fs.existsSync(tunnel.configPath)) {
      try {
        fs.unlinkSync(tunnel.configPath);
      } catch (e) {}
    }

    tunnel.status = 'stopped';
    tunnel.startedAt = null;
    this.saveTunnels();
    this.notifyTunnelChanged(id);
    return true;
  }

  // Get logs for a specific tunnel
  getLogs(id) {
    return this.tunnels[id] ? this.tunnels[id].logs : [];
  }

  notifyTunnelChanged(id) {
    this.wsBroadcast({
      type: 'tunnels_list',
      data: this.getTunnelsList()
    });
  }
}

module.exports = TunnelManager;
