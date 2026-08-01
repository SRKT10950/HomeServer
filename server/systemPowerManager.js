const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = path.join(baseDir, 'power_settings.json');

class SystemPowerManager {
  constructor(wsBroadcastCallback, errorLogger) {
    this.wsBroadcast = wsBroadcastCallback || (() => {});
    this.errorLogger = errorLogger;
    
    // Default configuration
    this.config = {
      enabled: false,
      action: 'sleep', // 'sleep', 'hibernate', 'shutdown'
      shutdownTime: '23:00', // 24h format
      startTime: '07:00' // 24h format
    };
    
    this.isAdmin = false;
    this.lastError = null;

    this.loadConfig();
    this.checkAdminStatus().then(() => {
      // Sync the task scheduler with the current configuration on startup
      if (this.isAdmin) {
        this.applySchedule().catch(err => {
          console.error('Failed to sync power schedule on startup:', err.message);
        });
      }
    });
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        this.config = { ...this.config, ...parsed };
      } else {
        this.saveConfig();
      }
    } catch (err) {
      console.error('Error loading power_settings.json:', err);
      if (this.errorLogger) {
        this.errorLogger.logError('System', 'power_config_load_error', 'Failed to load power settings', err.message);
      }
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving power_settings.json:', err);
      if (this.errorLogger) {
        this.errorLogger.logError('System', 'power_config_save_error', 'Failed to save power settings', err.message);
      }
    }
  }

  async checkAdminStatus() {
    return new Promise((resolve) => {
      // 'net session' fails if the process is not run as administrator
      exec('net session', (err) => {
        this.isAdmin = !err;
        resolve(this.isAdmin);
      });
    });
  }

  async updateConfig(newConfig) {
    this.config = {
      enabled: !!newConfig.enabled,
      action: ['sleep', 'hibernate', 'shutdown'].includes(newConfig.action) ? newConfig.action : 'sleep',
      shutdownTime: newConfig.shutdownTime || '23:00',
      startTime: newConfig.startTime || '07:00'
    };
    
    this.saveConfig();
    
    await this.checkAdminStatus();
    
    if (this.isAdmin) {
      try {
        await this.applySchedule();
        this.lastError = null;
      } catch (err) {
        this.lastError = err.message;
        throw err;
      } finally {
        this.notifyChanged();
      }
    } else {
      this.lastError = 'Administrator privileges required to apply schedule in Windows Task Scheduler.';
      this.notifyChanged();
      if (this.config.enabled) {
        throw new Error(this.lastError);
      }
    }
  }

  async applySchedule() {
    // Delete existing tasks first to ensure a clean state
    await this.removeTasksFromScheduler();

    if (!this.config.enabled) {
      return;
    }

    const wakeXmlPath = path.join(baseDir, 'wake_task_temp.xml');
    const shutdownXmlPath = path.join(baseDir, 'shutdown_task_temp.xml');

    try {
      // 1. Create Wake Task
      const wakeXmlContent = this.generateWakeTaskXml(this.config.startTime);
      fs.writeFileSync(wakeXmlPath, wakeXmlContent, 'utf8');
      await this.runCommand(`schtasks /create /xml "${wakeXmlPath}" /tn "HomeServer_WakeTask" /f`);

      // 2. Create Shutdown Task
      const shutdownXmlContent = this.generateShutdownTaskXml(this.config.shutdownTime, this.config.action);
      fs.writeFileSync(shutdownXmlPath, shutdownXmlContent, 'utf8');
      await this.runCommand(`schtasks /create /xml "${shutdownXmlPath}" /tn "HomeServer_ShutdownTask" /f`);

      console.log(`Power schedules applied successfully: Wake at ${this.config.startTime}, ${this.config.action} at ${this.config.shutdownTime}`);
    } catch (err) {
      console.error('Error applying power schedule to Task Scheduler:', err);
      if (this.errorLogger) {
        this.errorLogger.logError('System', 'power_schedule_apply_error', 'Failed to register scheduled tasks in OS', err.message);
      }
      throw err;
    } finally {
      // Clean up XML files
      try {
        if (fs.existsSync(wakeXmlPath)) fs.unlinkSync(wakeXmlPath);
      } catch (e) {}
      try {
        if (fs.existsSync(shutdownXmlPath)) fs.unlinkSync(shutdownXmlPath);
      } catch (e) {}
    }
  }

  async removeTasksFromScheduler() {
    return new Promise((resolve) => {
      // We attempt to delete both tasks; ignore errors if they do not exist
      exec('schtasks /delete /tn "HomeServer_WakeTask" /f', () => {
        exec('schtasks /delete /tn "HomeServer_ShutdownTask" /f', () => {
          resolve();
        });
      });
    });
  }

  runCommand(cmd) {
    return new Promise((resolve, reject) => {
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || stdout || err.message));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  generateWakeTaskXml(timeStr) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Date>2026-01-01T00:00:00</Date>
    <Author>HomeServer</Author>
    <Description>Wakes the computer up at the scheduled start time to reduce electricity bills.</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-01-01T${timeStr}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>cmd.exe</Command>
      <Arguments>/c exit</Arguments>
    </Exec>
  </Actions>
</Task>`;
  }

  generateShutdownTaskXml(timeStr, action) {
    let command = 'shutdown.exe';
    let argumentsStr = '/s /f /t 0'; // default shutdown

    if (action === 'sleep') {
      command = 'powershell.exe';
      argumentsStr = '-WindowStyle Hidden -Command "Add-Type -Assemblypath System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState(\'Suspend\', $false, $false)"';
    } else if (action === 'hibernate') {
      command = 'shutdown.exe';
      argumentsStr = '/h';
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Date>2026-01-01T00:00:00</Date>
    <Author>HomeServer</Author>
    <Description>Puts the computer to ${action} at the scheduled shutdown time.</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-01-01T${timeStr}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${command}</Command>
      <Arguments>${argumentsStr}</Arguments>
    </Exec>
  </Actions>
</Task>`;
  }

  async executeManualAction(action) {
    if (!['sleep', 'hibernate', 'shutdown'].includes(action)) {
      throw new Error(`Invalid power action: ${action}`);
    }

    console.log(`Executing manual power action: ${action}`);

    // We delay execution by 2 seconds so that the Express response is sent back to the client first.
    setTimeout(() => {
      if (action === 'sleep') {
        exec('powershell -Command "Add-Type -Assemblypath System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState(\'Suspend\', $false, $false)"', (err) => {
          if (err) {
            console.error('Manual sleep failed:', err);
            if (this.errorLogger) {
              this.errorLogger.logError('System', 'manual_sleep_error', 'Manual sleep command failed', err.message);
            }
          }
        });
      } else if (action === 'hibernate') {
        exec('shutdown /h', (err) => {
          if (err) {
            console.error('Manual hibernate failed:', err);
            if (this.errorLogger) {
              this.errorLogger.logError('System', 'manual_hibernate_error', 'Manual hibernate command failed', err.message);
            }
          }
        });
      } else if (action === 'shutdown') {
        exec('shutdown /s /f /t 5', (err) => {
          if (err) {
            console.error('Manual shutdown failed:', err);
            if (this.errorLogger) {
              this.errorLogger.logError('System', 'manual_shutdown_error', 'Manual shutdown command failed', err.message);
            }
          }
        });
      }
    }, 2000);
  }

  getDashboardData() {
    return {
      enabled: this.config.enabled,
      action: this.config.action,
      shutdownTime: this.config.shutdownTime,
      startTime: this.config.startTime,
      isAdmin: this.isAdmin,
      error: this.lastError
    };
  }

  notifyChanged() {
    this.wsBroadcast({
      type: 'power_schedule_status',
      data: this.getDashboardData()
    });
  }
}

module.exports = SystemPowerManager;
