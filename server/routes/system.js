const express = require('express');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { exec } = require('child_process');

function createSystemRouter(
  tunnelManager,
  staticServerManager,
  proxyManager,
  systemPowerManager,
  serviceErrorLogger,
  baseDir,
  updateManager
) {
  const router = express.Router();

  const startupDir = path.join(process.env.APPDATA || '', 'Microsoft/Windows/Start Menu/Programs/Startup');
  const vbsPath = path.join(startupDir, 'HomeServer.vbs');

  function runCommand(cmd) {
    return new Promise((resolve) => {
      exec(cmd, (err, stdout, stderr) => {
        resolve({ err, stdout, stderr });
      });
    });
  }

  // Get global status
  router.get('/status', (req, res) => {
    res.json({
      ready: tunnelManager.isReady(),
      downloadStatus: tunnelManager.downloadStatus,
      tunnelsCount: tunnelManager.getTunnelsList().filter(t => t.status === 'running').length,
      serversCount: staticServerManager.getServersList().filter(s => s.status === 'running').length
    });
  });

  // Trigger download of binaries
  router.post('/download', (req, res) => {
    tunnelManager.downloadBinaries().catch(err => {
      console.error('Deferred error downloading binaries:', err);
    });
    res.json({ success: true, message: 'Binary downloads started.' });
  });

  // Verify path exists on local machine
  router.post('/verify-path', (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ error: 'Folder path is required.' });
    }

    try {
      const resolvedPath = path.resolve(folderPath);
      if (!fs.existsSync(resolvedPath)) {
        return res.json({ exists: false, error: 'Path does not exist.' });
      }
      const stat = fs.statSync(resolvedPath);
      res.json({
        exists: true,
        isDirectory: stat.isDirectory(),
        resolvedPath
      });
    } catch (err) {
      res.json({ exists: false, error: err.message });
    }
  });

  // Startup APIs
  router.get('/startup/status', async (req, res) => {
    if (!process.env.APPDATA) {
      return res.json({ supported: false, mode: 'disabled' });
    }
    
    const vbsExists = fs.existsSync(vbsPath);
    const { err } = await runCommand('schtasks /query /tn "HomeServer"');
    const taskExists = !err;
    
    let mode = 'disabled';
    if (vbsExists) mode = 'login';
    else if (taskExists) mode = 'boot';
    
    res.json({ supported: true, mode });
  });

  router.post('/startup/enable', async (req, res) => {
    if (!process.env.APPDATA) {
      return res.status(400).json({ error: 'Startup configuration is only supported on Windows.' });
    }

    const { mode } = req.body;
    
    try {
      if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath);
    } catch (e) { console.error('Failed to remove existing startup VBScript file:', e.message); }
    await runCommand('schtasks /delete /tn "HomeServer" /f');

    const execPath = process.execPath;
    const workingDir = path.dirname(execPath);

    if (mode === 'login') {
      try {
        const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${workingDir}"
WshShell.Run """${execPath}""", 0, false
`;
        if (!fs.existsSync(startupDir)) {
          fs.mkdirSync(startupDir, { recursive: true });
        }
        fs.writeFileSync(vbsPath, vbsContent, 'utf8');
        res.json({ success: true, mode: 'login', message: 'Auto-start on login enabled successfully.' });
      } catch (err) {
        serviceErrorLogger.logError('System', 'startup_config_error', 'Failed to configure startup VBScript file', err.message);
        res.status(500).json({ error: err.message });
      }
    } else if (mode === 'boot') {
      const cmd = `schtasks /create /tn "HomeServer" /tr "\\"${execPath}\\"" /sc onstart /ru "SYSTEM" /f`;
      const { err, stderr } = await runCommand(cmd);
      
      if (err) {
        console.error('Failed to create scheduled task:', stderr || err.message);
        serviceErrorLogger.logError('System', 'startup_config_error', 'Failed to create Windows scheduled task (schtasks)', stderr || err.message);
        return res.status(500).json({ 
          error: 'Failed to create Windows scheduled task. Make sure you run homeserver.exe as Administrator on your NAS to enable this.' 
        });
      }
      
      res.json({ success: true, mode: 'boot', message: 'Auto-start on boot (system service) enabled successfully.' });
    } else {
      res.status(400).json({ error: 'Invalid startup mode.' });
    }
  });

  router.post('/startup/disable', async (req, res) => {
    if (!process.env.APPDATA) {
      return res.status(400).json({ error: 'Startup configuration is only supported on Windows.' });
    }

    try {
      if (fs.existsSync(vbsPath)) {
        fs.unlinkSync(vbsPath);
      }
      await runCommand('schtasks /delete /tn "HomeServer" /f');
      res.json({ success: true, message: 'Auto-start disabled successfully.' });
    } catch (err) {
      serviceErrorLogger.logError('System', 'startup_config_error', 'Failed to disable auto-start', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Diagnostics
  router.post('/diagnostics/clear-errors', (req, res) => {
    serviceErrorLogger.clearErrors();
    res.json({ success: true, message: 'Service error logs cleared successfully.' });
  });

  router.post('/diagnostics/port-test', async (req, res) => {
    const { port } = req.body;
    if (!port) return res.status(400).json({ error: 'Port is required.' });

    const axios = require('axios');
    try {
      const ipRes = await axios.get('https://api.ipify.org?format=json');
      const publicIp = ipRes.data.ip;

      const socket = net.createConnection({
        host: publicIp,
        port: parseInt(port, 10),
        timeout: 3000
      });

      let resultSent = false;

      socket.on('connect', () => {
        if (!resultSent) {
          resultSent = true;
          socket.destroy();
          res.json({ success: true, status: 'open', ip: publicIp, port });
        }
      });

      socket.on('timeout', () => {
        if (!resultSent) {
          resultSent = true;
          socket.destroy();
          res.json({ success: true, status: 'closed', reason: 'Connection timed out', ip: publicIp, port });
        }
      });

      socket.on('error', (err) => {
        if (!resultSent) {
          resultSent = true;
          socket.destroy();
          res.json({ success: true, status: 'closed', reason: err.message, ip: publicIp, port });
        }
      });
    } catch (err) {
      serviceErrorLogger.logError('System', 'port_test_error', 'Failed to perform port test', err.message);
      res.status(500).json({ error: 'Failed to retrieve public IP or execute port test: ' + err.message });
    }
  });

  // Proxy Rules
  router.get('/proxy/rules', (req, res) => {
    res.json(proxyManager.getRulesList());
  });

  router.post('/proxy/rules/add', (req, res) => {
    const { path: pathStr, port } = req.body;
    if (!pathStr || !port) {
      return res.status(400).json({ error: 'path and port are required.' });
    }
    try {
      const rule = proxyManager.addRule(pathStr, port);
      res.json({ success: true, rule });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/proxy/rules/delete', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required.' });
    const success = proxyManager.deleteRule(id);
    res.json({ success });
  });

  // Power Schedule
  router.get('/power-schedule', (req, res) => {
    res.json(systemPowerManager.getDashboardData());
  });

  router.post('/power-schedule', async (req, res) => {
    try {
      await systemPowerManager.updateConfig(req.body);
      res.json({ success: true, data: systemPowerManager.getDashboardData() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/power-schedule/manual', async (req, res) => {
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required.' });
    try {
      await systemPowerManager.executeManualAction(action);
      res.json({ success: true, message: `System will enter ${action} in 2 seconds.` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // System Update APIs
  router.get('/system/update/status', (req, res) => {
    if (!updateManager) return res.status(503).json({ error: 'Update manager not initialized.' });
    res.json(updateManager.getState());
  });

  router.post('/system/update/check', async (req, res) => {
    if (!updateManager) return res.status(503).json({ error: 'Update manager not initialized.' });
    try {
      const state = await updateManager.checkForUpdates(true);
      res.json({ success: true, state });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/system/update/apply', async (req, res) => {
    if (!updateManager) return res.status(503).json({ error: 'Update manager not initialized.' });
    try {
      const result = await updateManager.applyUpdate();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createSystemRouter;
