const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

class StaticServerManager {
  constructor(wsBroadcastCallback, errorLogger) {
    this.wsBroadcast = wsBroadcastCallback || (() => {});
    this.errorLogger = errorLogger;
    this.servers = {}; // id -> server info

    const isPackaged = typeof process.pkg !== 'undefined';
    const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;
    this.persistedServersPath = path.join(baseDir, 'servers.json');
    this.authPath = path.join(baseDir, 'basic_auth.json');
    this.headersPath = path.join(baseDir, 'custom_headers.json');
    this.phpSettingsPath = path.join(baseDir, 'php_settings.json');
    this.loadServers();
    this.loadConfigs();
  }

  loadConfigs() {
    try {
      this.basicAuthRules = fs.existsSync(this.authPath) ? JSON.parse(fs.readFileSync(this.authPath, 'utf8')) : {};
    } catch (e) {
      this.basicAuthRules = {};
    }
    try {
      this.customHeadersRules = fs.existsSync(this.headersPath) ? JSON.parse(fs.readFileSync(this.headersPath, 'utf8')) : {};
    } catch (e) {
      this.customHeadersRules = {};
    }
    try {
      this.phpSettings = fs.existsSync(this.phpSettingsPath) 
        ? JSON.parse(fs.readFileSync(this.phpSettingsPath, 'utf8')) 
        : { phpPath: '' };
    } catch (e) {
      this.phpSettings = { phpPath: '' };
    }
    this.detectPhp();
  }

  saveConfigs() {
    try {
      fs.writeFileSync(this.authPath, JSON.stringify(this.basicAuthRules, null, 2), 'utf8');
      fs.writeFileSync(this.headersPath, JSON.stringify(this.customHeadersRules, null, 2), 'utf8');
      fs.writeFileSync(this.phpSettingsPath, JSON.stringify(this.phpSettings, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saving configs:', e.message);
    }
  }

  updateServerConfig(port, basicAuth, headers) {
    const portStr = port.toString();
    if (basicAuth) {
      this.basicAuthRules[portStr] = basicAuth;
    }
    if (headers) {
      this.customHeadersRules[portStr] = headers;
    }
    this.saveConfigs();
  }

  getServerConfig(port) {
    const portStr = port.toString();
    return {
      basicAuth: this.basicAuthRules[portStr] || { enabled: false, user: '', pass: '' },
      headers: this.customHeadersRules[portStr] || {
        'Access-Control-Allow-Origin': '',
        'X-Frame-Options': '',
        'Content-Security-Policy': ''
      }
    };
  }

  loadServers() {
    try {
      if (fs.existsSync(this.persistedServersPath)) {
        const raw = fs.readFileSync(this.persistedServersPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.servers = parsed;
        
        // Auto-start any static server that was running
        setTimeout(() => {
          for (const id in this.servers) {
            const s = this.servers[id];
            if (s.status === 'running') {
              console.log(`Auto-starting server ${id} on system boot...`);
              s.status = 'stopped';
              s.instance = null;
              s.process = null;
              s.error = null;
              this.startServer(s.id, s.path, s.port).catch(err => {
                console.error(`Auto-start failed for server ${id}:`, err.message);
              });
            } else {
              s.status = 'stopped';
              s.instance = null;
              s.process = null;
              s.error = null;
            }
          }
        }, 2000); // 2 seconds delay
      }
    } catch (err) {
      console.error('Error loading servers config:', err);
      this.servers = {};
    }
  }

  saveServers() {
    try {
      const simplified = {};
      for (const id in this.servers) {
        const s = this.servers[id];
        simplified[id] = {
          id: s.id,
          path: s.path,
          port: s.port,
          status: s.status, // Save running state
          error: null
        };
      }
      fs.writeFileSync(this.persistedServersPath, JSON.stringify(simplified, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving servers config:', err);
    }
  }

  async deleteServer(id) {
    await this.stopServer(id);
    delete this.servers[id];
    this.saveServers();
    this.notifyChanged();
    return true;
  }

  // Get list of active static servers
  getServersList() {
    return Object.values(this.servers).map(s => {
      const isNode = fs.existsSync(path.join(s.path, 'server.js'));
      let type = isNode ? 'node' : 'static';
      
      if (!isNode) {
        try {
          if (fs.existsSync(s.path)) {
            const hasIndexPhp = fs.existsSync(path.join(s.path, 'index.php'));
            if (hasIndexPhp) {
              type = 'php';
            } else {
              const files = fs.readdirSync(s.path);
              const hasPhpFiles = files.some(file => file.endsWith('.php'));
              if (hasPhpFiles) {
                type = 'php';
              }
            }
          }
        } catch (e) {
          // ignore read errors
        }
      }

      return {
        id: s.id,
        path: s.path,
        port: s.port,
        status: s.status,
        error: s.error,
        type
      };
    });
  }

  // Start a static web server
  async startServer(id, folderPath, port) {
    // Check if server is already running
    if (this.servers[id] && this.servers[id].status === 'running') {
      if (this.servers[id].port === port && this.servers[id].path === folderPath) {
        return this.servers[id];
      }
      // Stop old if it's changing configs
      await this.stopServer(id);
    }

    // Verify directory exists
    if (!fs.existsSync(folderPath)) {
      throw new Error(`The folder path "${folderPath}" does not exist.`);
    }

    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      throw new Error(`The path "${folderPath}" is a file, not a directory.`);
    }

    // Check if server.js exists
    const serverJsPath = path.join(folderPath, 'server.js');
    const isNode = fs.existsSync(serverJsPath);

    if (isNode) {
      return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        
        console.log(`Spawning Node server: node server.js on port ${port} in ${folderPath}`);
        const child = spawn('node', ['server.js'], {
          cwd: folderPath,
          env: { ...process.env, PORT: port.toString() }
        });

        this.servers[id] = {
          id,
          path: folderPath,
          port,
          status: 'starting',
          error: null,
          process: child,
          instance: null
        };

        let hasEnded = false;

        child.stdout.on('data', (data) => {
          console.log(`[Server ${id} STDOUT]: ${data.toString().trim()}`);
        });

        child.stdout.on('error', (err) => {
          console.error(`[Server ${id} STDOUT ERROR]: ${err.message}`);
        });

        child.stderr.on('data', (data) => {
          const errText = data.toString().trim();
          console.error(`[Server ${id} STDERR]: ${errText}`);
          if (this.servers[id]) {
            this.servers[id].error = errText.substring(0, 300);
            if (this.errorLogger) {
              this.errorLogger.logError('Web Host', 'stderr_error', `Node server "${id}" stderr`, errText);
            }
            this.notifyChanged();
          }
        });

        child.stderr.on('error', (err) => {
          console.error(`[Server ${id} STDERR ERROR]: ${err.message}`);
        });

        child.on('close', (code) => {
          hasEnded = true;
          console.log(`Server process ${id} exited with code ${code}`);
          if (this.servers[id]) {
            const wasUnexpected = this.servers[id].status !== 'stopped';
            this.servers[id].status = 'stopped';
            this.servers[id].process = null;
            if (wasUnexpected && code !== 0 && code !== null && this.errorLogger) {
              this.errorLogger.logError('Web Host', 'process_exited', `Node server "${id}" exited unexpectedly with code ${code}`);
            }
            this.notifyChanged();
          }
        });

        child.on('error', (err) => {
          hasEnded = true;
          console.error(`Server process ${id} error:`, err);
          if (this.servers[id]) {
            this.servers[id].status = 'error';
            this.servers[id].error = err.message;
            this.servers[id].process = null;
            if (this.errorLogger) {
              this.errorLogger.logError('Web Host', 'process_error', `Node server "${id}" process error`, err.message);
            }
            this.notifyChanged();
          }
          reject(err);
        });

        // Let the process run for 1.2s to verify if it binds successfully
        setTimeout(() => {
          if (!hasEnded) {
            if (this.servers[id]) {
              this.servers[id].status = 'running';
              this.servers[id].error = null;
              this.saveServers();
              this.notifyChanged();
              resolve(this.servers[id]);
            }
          } else {
            reject(new Error(this.servers[id]?.error || 'Failed to start Node process.'));
          }
        }, 1200);
      });
    }

    return new Promise((resolve, reject) => {
      const app = express();
      
      // Inject Custom Headers Middleware
      app.use((req, res, next) => {
        const portStr = port.toString();
        const customHeaders = this.customHeadersRules[portStr];
        if (customHeaders) {
          for (const header in customHeaders) {
            if (customHeaders[header]) {
              res.setHeader(header, customHeaders[header]);
            }
          }
        }
        next();
      });

      // Inject Basic Auth Middleware
      app.use((req, res, next) => {
        const portStr = port.toString();
        const rule = this.basicAuthRules[portStr];
        if (rule && rule.enabled) {
          const authHeader = req.headers['authorization'];
          if (!authHeader || !authHeader.startsWith('Basic ')) {
            res.setHeader('WWW-Authenticate', 'Basic realm="HomeServer Realm"');
            return res.status(401).send('Unauthorized: Password protected.');
          }
          const creds = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf8').split(':');
          const username = creds[0];
          const password = creds[1];

          if (username !== rule.user || password !== rule.pass) {
            res.setHeader('WWW-Authenticate', 'Basic realm="HomeServer Realm"');
            return res.status(401).send('Unauthorized: Invalid credentials.');
          }
        }
        next();
      });

      // Check if PHP request
      app.use((req, res, next) => {
        const phpScriptPath = this.resolvePhpScript(folderPath, req.path);
        if (phpScriptPath) {
          this.handlePhpRequest(req, res, phpScriptPath, port, folderPath);
        } else {
          next();
        }
      });

      // Serve folder statically
      app.use(express.static(folderPath));
      
      // Add a simple index.html fallback or listing if necessary
      app.get('/', (req, res, next) => {
        const hasIndex = fs.existsSync(path.join(folderPath, 'index.html'));
        if (!hasIndex) {
          res.send(`
            <html>
              <head>
                <title>HomeServer Hosting</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; color: #cbd5e1; padding: 40px; text-align: center; }
                  .card { background: #1e293b; border-radius: 12px; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); max-width: 500px; margin: 0 auto; border: 1px solid #334155; }
                  h1 { color: #f8fafc; font-size: 24px; margin-bottom: 10px; }
                  p { color: #94a3b8; line-height: 1.5; }
                  .path { font-family: monospace; background: #0f172a; padding: 8px 12px; border-radius: 6px; color: #a78bfa; word-break: break-all; margin: 15px 0; display: inline-block; }
                </style>
              </head>
              <body>
                <div class="card">
                  <h1>HomeServer Hosting</h1>
                  <p>Your local folder is successfully hosted, but no <code>index.html</code> was found in the directory.</p>
                  <div class="path">${folderPath}</div>
                  <p>Place an <code>index.html</code> file in this folder to serve your site.</p>
                </div>
              </body>
            </html>
          `);
        } else {
          next();
        }
      });

      const server = http.createServer(app);

      this.servers[id] = {
        id,
        path: folderPath,
        port,
        status: 'starting',
        error: null,
        process: null,
        instance: server
      };

      server.on('error', (err) => {
        console.error(`Static server ${id} error:`, err);
        if (err.code === 'EADDRINUSE') {
          this.servers[id].status = 'error';
          this.servers[id].error = `Port ${port} is already in use by another application.`;
        } else {
          this.servers[id].status = 'error';
          this.servers[id].error = err.message;
        }
        if (this.errorLogger) {
          this.errorLogger.logError('Web Host', 'server_error', `Static server "${id}" failed to start`, this.servers[id].error);
        }
        this.notifyChanged();
        reject(new Error(this.servers[id].error));
      });

      server.listen(port, () => {
        console.log(`Static server ${id} running at http://localhost:${port} for ${folderPath}`);
        this.servers[id].status = 'running';
        this.servers[id].error = null;
        this.saveServers();
        this.notifyChanged();
        resolve(this.servers[id]);
      });
    });
  }

  // Stop a static web server
  stopServer(id) {
    return new Promise((resolve) => {
      const serverInfo = this.servers[id];
      if (!serverInfo) {
        return resolve(false);
      }

      if (serverInfo.process && (serverInfo.status === 'running' || serverInfo.status === 'starting')) {
        console.log(`Stopping Node process ${id} (PID: ${serverInfo.process.pid})...`);
        const { spawn } = require('child_process');
        
        if (process.platform === 'win32') {
          // Kill the process tree cleanly
          const taskkill = spawn('taskkill', ['/pid', serverInfo.process.pid, '/f', '/t']);
          taskkill.on('close', () => {
            serverInfo.status = 'stopped';
            serverInfo.process = null;
            this.saveServers();
            this.notifyChanged();
            resolve(true);
          });
        } else {
          serverInfo.process.kill('SIGKILL');
          serverInfo.status = 'stopped';
          serverInfo.process = null;
          this.saveServers();
          this.notifyChanged();
          resolve(true);
        }
      } else if (serverInfo.instance && serverInfo.status === 'running') {
        serverInfo.instance.close((err) => {
          if (err) {
            console.error(`Error closing static server ${id}:`, err);
          }
          serverInfo.status = 'stopped';
          serverInfo.instance = null;
          this.saveServers();
          this.notifyChanged();
          resolve(true);
        });
      } else {
        serverInfo.status = 'stopped';
        this.saveServers();
        this.notifyChanged();
        resolve(true);
      }
    });
  }

  notifyChanged() {
    this.wsBroadcast({
      type: 'servers_list',
      data: this.getServersList()
    });
  }

  detectPhp() {
    let candidatePath = this.phpSettings.phpPath || '';
    
    const testPhpBinary = (binPath) => {
      if (!binPath) return null;
      try {
        const { execSync } = require('child_process');
        const out = execSync(`"${binPath}" -v`, { stdio: [] }).toString();
        if (out.includes('PHP')) {
          return {
            path: binPath,
            version: out.split(/\r?\n/)[0] || 'Unknown version',
            isCgi: binPath.toLowerCase().includes('cgi') || out.toLowerCase().includes('cgi')
          };
        }
      } catch (e) {
        // failed to run
      }
      return null;
    };

    if (candidatePath) {
      const result = testPhpBinary(candidatePath);
      if (result) {
        this.phpStatus = {
          detected: true,
          phpPath: result.path,
          isCgi: result.isCgi,
          version: result.version,
          error: null
        };
        return;
      } else {
        this.phpStatus = {
          detected: false,
          phpPath: candidatePath,
          isCgi: false,
          version: '',
          error: `Configured PHP executable at "${candidatePath}" is not valid or failed to execute.`
        };
        return;
      }
    }

    try {
      const { execSync } = require('child_process');
      const whereCgi = execSync('where php-cgi', { stdio: [] }).toString().trim().split(/\r?\n/)[0];
      if (whereCgi && fs.existsSync(whereCgi)) {
        const result = testPhpBinary(whereCgi);
        if (result) {
          this.phpStatus = { detected: true, phpPath: result.path, isCgi: result.isCgi, version: result.version, error: null };
          return;
        }
      }
    } catch (e) {}

    try {
      const { execSync } = require('child_process');
      const whereCli = execSync('where php', { stdio: [] }).toString().trim().split(/\r?\n/)[0];
      if (whereCli && fs.existsSync(whereCli)) {
        const result = testPhpBinary(whereCli);
        if (result) {
          this.phpStatus = { detected: true, phpPath: result.path, isCgi: result.isCgi, version: result.version, error: null };
          return;
        }
      }
    } catch (e) {}

    const commonPaths = [
      'C:\\php\\php-cgi.exe',
      'C:\\php\\php.exe',
      'C:\\xampp\\php\\php-cgi.exe',
      'C:\\xampp\\php\\php.exe'
    ];

    const wampPhpDir = 'C:\\wamp64\\bin\\php';
    if (fs.existsSync(wampPhpDir)) {
      try {
        const versions = fs.readdirSync(wampPhpDir);
        for (const ver of versions) {
          commonPaths.push(path.join(wampPhpDir, ver, 'php-cgi.exe'));
          commonPaths.push(path.join(wampPhpDir, ver, 'php.exe'));
        }
      } catch (e) {}
    }

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        const result = testPhpBinary(p);
        if (result) {
          this.phpStatus = { detected: true, phpPath: result.path, isCgi: result.isCgi, version: result.version, error: null };
          return;
        }
      }
    }

    this.phpStatus = {
      detected: false,
      phpPath: '',
      isCgi: false,
      version: '',
      error: 'PHP CGI executable not found. Please install PHP or specify a path in settings.'
    };
  }

  updatePhpSettings(phpPath) {
    this.phpSettings.phpPath = phpPath;
    this.saveConfigs();
    this.detectPhp();
    return this.phpStatus;
  }

  resolvePhpScript(folderPath, reqPath) {
    const cleanPath = reqPath.split('?')[0];
    const physicalPath = path.join(folderPath, cleanPath);
    
    try {
      if (fs.existsSync(physicalPath)) {
        const stat = fs.statSync(physicalPath);
        if (stat.isDirectory()) {
          const indexPhp = path.join(physicalPath, 'index.php');
          if (fs.existsSync(indexPhp)) {
            return indexPhp;
          }
        } else if (cleanPath.endsWith('.php')) {
          return physicalPath;
        }
      } else {
        const phpPathCandidate = physicalPath + '.php';
        if (fs.existsSync(phpPathCandidate) && fs.statSync(phpPathCandidate).isFile()) {
          return phpPathCandidate;
        }
      }
    } catch (e) {}
    return null;
  }

  servePhpErrorPage(res, message, details) {
    res.status(500).send(`
      <html>
        <head>
          <title>PHP Configuration Error - HomeServer</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #080c14; color: #cbd5e1; padding: 40px; text-align: center; }
            .card { background: #0f172a; border-radius: 12px; padding: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 600px; margin: 50px auto; border: 1px solid rgba(239, 68, 68, 0.2); text-align: left; }
            h1 { color: #f8fafc; font-size: 22px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
            .error-icon { color: #ef4444; font-weight: bold; font-size: 24px; margin-right: 8px; }
            p { color: #94a3b8; line-height: 1.6; font-size: 14px; margin-bottom: 20px; }
            .details { font-family: monospace; background: #020617; padding: 12px 16px; border-radius: 8px; color: #f43f5e; font-size: 13px; border: 1px solid #334155; word-break: break-all; white-space: pre-wrap; margin-bottom: 20px; }
            .instructions { font-size: 13px; color: #94a3b8; }
            .instructions ul { padding-left: 20px; margin-top: 10px; }
            .instructions li { margin-bottom: 8px; }
            code { font-family: monospace; color: #a78bfa; background: rgba(167, 139, 250, 0.1); padding: 2px 6px; border-radius: 4px; }
            a { color: #6366f1; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1><span class="error-icon">⚠️</span> PHP Execution Error</h1>
            <p>${message}</p>
            ${details ? '<div class="details">' + details + '</div>' : ''}
            <div class="instructions">
              <strong>How to resolve this:</strong>
              <ul>
                <li>Ensure PHP is installed on this system. You can download it from <a href="https://windows.php.net/download/" target="_blank">windows.php.net</a> or install <strong>XAMPP</strong>.</li>
                <li>Go to the <strong>HomeServer Dashboard</strong> -> <strong>Local Hosting</strong> tab.</li>
                <li>Under the <strong>PHP Configuration</strong> panel, specify the absolute path to your <code>php-cgi.exe</code> binary (e.g., <code>C:\\xampp\\php\\php-cgi.exe</code>) and click Save.</li>
              </ul>
            </div>
          </div>
        </body>
      </html>
    `);
  }

  handlePhpRequest(req, res, scriptPath, port, folderPath) {
    if (!this.phpStatus.detected) {
      return this.servePhpErrorPage(res, 'PHP is not detected or configured on this HomeServer.', this.phpStatus.error);
    }

    const phpBinary = this.phpStatus.phpPath;
    const urlObj = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    const queryString = urlObj.searchParams.toString();

    const env = {
      ...process.env,
      SERVER_SIGNATURE: 'Node.js Express HomeServer',
      SERVER_SOFTWARE: 'Node.js Express HomeServer',
      SERVER_NAME: req.hostname || 'localhost',
      SERVER_ADDR: '127.0.0.1',
      SERVER_PORT: port.toString(),
      REMOTE_ADDR: req.socket.remoteAddress || '127.0.0.1',
      DOCUMENT_ROOT: folderPath,
      REQUEST_SCHEME: req.protocol,
      CONTEXT_DOCUMENT_ROOT: folderPath,
      GATEWAY_INTERFACE: 'CGI/1.1',
      SERVER_PROTOCOL: req.protocol.toUpperCase() + '/' + req.httpVersion,
      REQUEST_METHOD: req.method,
      QUERY_STRING: queryString,
      REQUEST_URI: req.originalUrl,
      SCRIPT_NAME: req.path,
      SCRIPT_FILENAME: scriptPath,
      REDIRECT_STATUS: '200'
    };

    for (const headerName in req.headers) {
      const envName = 'HTTP_' + headerName.toUpperCase().replace(/-/g, '_');
      env[envName] = req.headers[headerName];
    }

    if (req.headers['content-type']) {
      env['CONTENT_TYPE'] = req.headers['content-type'];
    }
    if (req.headers['content-length']) {
      env['CONTENT_LENGTH'] = req.headers['content-length'];
    }

    const { spawn } = require('child_process');
    let phpProcess;
    
    try {
      phpProcess = spawn(phpBinary, [], { env, cwd: path.dirname(scriptPath) });
    } catch (spawnError) {
      console.error('Failed to spawn PHP binary:', spawnError);
      return this.servePhpErrorPage(res, 'Failed to execute PHP CGI binary: ' + spawnError.message, spawnError.stack);
    }

    let processExited = false;
    const phpTimeout = setTimeout(() => {
      if (!processExited) {
        console.warn(`PHP CGI process timed out (30s limit). Killing PID ${phpProcess.pid}`);
        try {
          phpProcess.kill('SIGKILL');
        } catch (e) {}
        if (!res.headersSent) {
          res.status(504).send('504 Gateway Timeout: PHP script execution exceeded the 30-second limit.');
        }
      }
    }, 30000);

    res.on('close', () => {
      if (!processExited) {
        console.log(`HTTP connection closed. Killing PHP CGI process (PID: ${phpProcess.pid})`);
        try {
          phpProcess.kill('SIGKILL');
        } catch (e) {}
      }
    });

    phpProcess.on('error', (err) => {
      console.error('PHP process error event:', err);
      if (!res.headersSent) {
        this.servePhpErrorPage(res, 'PHP process encountered an error: ' + err.message, err.stack);
      }
    });

    // Avoid EPIPE errors when process crashes / terminates prematurely
    phpProcess.stdin.on('error', (err) => {
      console.error(`PHP stdin error on port ${port}:`, err.message);
    });

    phpProcess.stdout.on('error', (err) => {
      console.error(`PHP stdout error on port ${port}:`, err.message);
    });

    phpProcess.stderr.on('error', (err) => {
      console.error(`PHP stderr error on port ${port}:`, err.message);
    });

    req.pipe(phpProcess.stdin);

    let responseBuffer = Buffer.alloc(0);
    let headersSent = false;

    phpProcess.stdout.on('data', (chunk) => {
      if (headersSent) {
        res.write(chunk);
        return;
      }

      responseBuffer = Buffer.concat([responseBuffer, chunk]);
      
      let index = responseBuffer.indexOf('\r\n\r\n');
      let delimiterLength = 4;
      if (index === -1) {
        index = responseBuffer.indexOf('\n\n');
        delimiterLength = 2;
      }

      if (index !== -1) {
        const headersPart = responseBuffer.slice(0, index).toString('utf8');
        const bodyPart = responseBuffer.slice(index + delimiterLength);

        const lines = headersPart.split(/\r?\n/);
        let statusCode = 200;
        
        for (const line of lines) {
          const colonIdx = line.indexOf(':');
          if (colonIdx !== -1) {
            const name = line.substring(0, colonIdx).trim();
            const value = line.substring(colonIdx + 1).trim();

            if (name.toLowerCase() === 'status') {
              const code = parseInt(value.split(' ')[0], 10);
              if (!isNaN(code)) {
                statusCode = code;
              }
            } else {
              res.setHeader(name, value);
            }
          }
        }

        res.status(statusCode);
        headersSent = true;

        if (bodyPart.length > 0) {
          res.write(bodyPart);
        }
      }
    });

    let stderrText = '';
    phpProcess.stderr.on('data', (chunk) => {
      stderrText += chunk.toString('utf8');
    });

    phpProcess.on('close', (code) => {
      processExited = true;
      clearTimeout(phpTimeout);
      if (!headersSent) {
        let errMsg = 'PHP process closed prematurely with code ' + code + '.';
        if (stderrText) {
          errMsg += '\n\nStderr output:\n' + stderrText;
        } else {
          if (!this.phpStatus.isCgi) {
            errMsg += '\n\nNote: The configured path seems to be the PHP CLI binary (php.exe) instead of PHP CGI (php-cgi.exe). Please configure it to use php-cgi.exe for web execution.';
          }
        }
        this.servePhpErrorPage(res, 'CGI Execution Error', errMsg);
      } else {
        res.end();
      }
    });
  }
}

module.exports = StaticServerManager;
