import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Cpu, 
  HardDrive, 
  Activity, 
  ArrowUp, 
  ArrowDown, 
  Clock, 
  Terminal,
  Globe,
  Radio,
  Network,
  Settings,
  Database,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Trash2,
  ChevronDown,
  ChevronUp,
  Info,
  Download,
  RefreshCw,
  ArrowUpCircle,
  ShieldCheck
} from 'lucide-react';

// Format bytes to readable string (GB, MB, etc)
const formatBytes = (bytes, decimals = 1) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Format seconds to uptime string
const formatUptime = (seconds) => {
  if (!seconds) return '0s';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const dDisplay = d > 0 ? `${d}d ` : '';
  const hDisplay = h > 0 ? `${h}h ` : '';
  const mDisplay = m > 0 ? `${m}m ` : '';
  const sDisplay = s > 0 ? `${s}s` : '';
  return dDisplay + hDisplay + mDisplay + sDisplay;
};

// Custom Mini Line Chart Component (Pure SVG)
const MiniLineChart = ({ history, maxVal = 100, colorClass = "" }) => {
  const width = 300;
  const height = 100;
  
  if (history.length === 0) {
    return (
      <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Gathering telemetry data...
      </div>
    );
  }

  const points = history.map((val, idx) => {
    const x = (idx / Math.max(1, history.length - 1)) * width;
    const y = height - (val / maxVal) * height;
    return { x, y };
  });

  const pathD = "M " + points.map(p => `${p.x} ${p.y}`).join(" L ");
  const areaD = pathD + ` L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="chart-container">
      <svg viewBox={`0 0 ${width} ${height}`} className="svg-chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chart-gradient-indigo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.45"/>
            <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="chart-gradient-cyan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-secondary)" stopOpacity="0.45"/>
            <stop offset="100%" stopColor="var(--accent-secondary)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        
        {/* Grid lines */}
        <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} className="chart-grid-line" />
        <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} className="chart-grid-line" />
        <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} className="chart-grid-line" />

        {/* Area under curve */}
        <path d={areaD} className={`chart-area-path ${colorClass}`} />
        {/* The line itself */}
        <path d={pathD} className={`chart-line-path ${colorClass}`} />
      </svg>
    </div>
  );
};

// Custom Radial Gauge component (SVG)
const RadialGauge = ({ value, label, totalText, colorClass = "" }) => {
  const radius = 45;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <div className="gauge-container">
      <svg className="gauge-svg" viewBox="0 0 110 110" style={{ width: '120px', height: '120px' }}>
        <circle className="gauge-bg" cx="55" cy="55" r={radius} strokeWidth={strokeWidth} />
        <circle 
          className={`gauge-fill ${colorClass}`} 
          cx="55" 
          cy="55" 
          r={radius} 
          strokeWidth={strokeWidth} 
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
        <text className="gauge-text" x="55" y="63" textAnchor="middle">{value}%</text>
      </svg>
      <div className="stat-label" style={{ marginTop: '8px', fontSize: '11px', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{totalText}</div>
    </div>
  );
};

function Dashboard({ 
  telemetry, 
  cpuHistory, 
  ramHistory, 
  tunnelsCount, 
  serversCount,
  databaseStatus,
  apiMetrics,
  serviceErrors,
  updateStatus
}) {
  const [startupMode, setStartupMode] = useState('disabled');
  const [startupSupported, setStartupSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [updateActionMsg, setUpdateActionMsg] = useState('');

  const [serviceFilter, setServiceFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogs, setExpandedLogs] = useState({});
  const [expandedFailures, setExpandedFailures] = useState({});
  const [clearingErrors, setClearingErrors] = useState(false);

  const API_BASE = window.location.port === '5173' ? 'http://localhost:5000' : '';

  const handleClearErrors = async () => {
    if (!window.confirm('Are you sure you want to clear all persisted service logs?')) return;
    setClearingErrors(true);
    try {
      const res = await fetch(`${API_BASE}/api/diagnostics/clear-errors`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to clear logs.');
    } catch (err) {
      console.error(err);
      alert('Error clearing logs: ' + err.message);
    } finally {
      setClearingErrors(false);
    }
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/startup/status`)
      .then(res => res.json())
      .then(data => {
        setStartupSupported(data.supported);
        setStartupMode(data.mode || 'disabled');
      })
      .catch(err => console.error('Error fetching startup status:', err));
  }, []);

  const handleSetStartupMode = async (mode) => {
    setLoading(true);
    try {
      let res;
      if (mode === 'disabled') {
        res = await fetch(`${API_BASE}/api/startup/disable`, { method: 'POST' });
      } else {
        res = await fetch(`${API_BASE}/api/startup/enable`, { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode })
        });
      }
      const data = await res.json();
      if (res.ok) {
        setStartupMode(mode);
      } else {
        alert(data.error || 'Failed to update startup configuration.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateActionMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/system/update/check`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to check for updates.');
      setUpdateActionMsg(data.state?.hasUpdate ? `New version v${data.state.latestVersion} available!` : 'HomeServer is on the latest version.');
    } catch (err) {
      setUpdateActionMsg('Error checking update: ' + err.message);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!window.confirm('Download and apply update now? HomeServer will restart automatically.')) return;
    setApplyingUpdate(true);
    setUpdateActionMsg('Downloading update executable...');
    try {
      const res = await fetch(`${API_BASE}/api/system/update/apply`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply update.');
      setUpdateActionMsg(data.message || 'Update initiated. Server is restarting...');
    } catch (err) {
      setUpdateActionMsg('Error applying update: ' + err.message);
      setApplyingUpdate(false);
    }
  };

  if (!telemetry) {
    return (
      <div>
        <div className="header-container">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-desc">Initializing system telemetry channels...</p>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: '16px' }}>
          <Activity size={40} className="logo-icon animate-pulse" />
          <h3 style={{ fontSize: '18px', color: 'var(--text-primary)' }}>Loading System Status</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Connecting to local telemetry agent. Please wait...</p>
        </div>
      </div>
    );
  }

  const { cpu, ram, disks, network, system } = telemetry;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Top Header */}
      <div className="header-container">
        <div>
          <h1 className="page-title">System Dashboard</h1>
          <p className="page-desc">Real-time Windows telemetry overview for <strong>{system.hostname}</strong></p>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid-4">
        <div className="card stat-card">
          <div className="stat-icon-wrapper">
            <Cpu size={22} />
          </div>
          <div>
            <div className="stat-label">CPU Usage</div>
            <div className="stat-value">{cpu.current}%</div>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-icon-wrapper cyan">
            <Server size={22} />
          </div>
          <div>
            <div className="stat-label">RAM Allocated</div>
            <div className="stat-value">{formatBytes(ram.used)}</div>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-icon-wrapper success">
            <Globe size={22} />
          </div>
          <div>
            <div className="stat-label">Local Websites</div>
            <div className="stat-value">{serversCount}</div>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-icon-wrapper success" style={{ color: 'var(--accent-secondary)', background: 'rgba(6,182,212,0.1)', borderColor: 'rgba(6,182,212,0.2)' }}>
            <Radio size={22} />
          </div>
          <div>
            <div className="stat-label">Active Tunnels</div>
            <div className="stat-value">{tunnelsCount}</div>
          </div>
        </div>
      </div>

      {/* Gauges and Real-time graphs */}
      <div className="grid-2">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cpu size={18} style={{ color: 'var(--accent-primary)' }} />
            CPU Telemetry
          </h3>
          <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
            <RadialGauge 
              value={cpu.current} 
              label="CPU LOAD" 
              totalText={`${cpu.cores.length} Cores`} 
            />
            <div style={{ flexGrow: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <span>Real-time History (30s)</span>
                <span>{cpu.current}%</span>
              </div>
              <MiniLineChart history={cpuHistory} />
            </div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={18} style={{ color: 'var(--accent-secondary)' }} />
            Memory (RAM)
          </h3>
          <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
            <RadialGauge 
              value={ram.percent} 
              label="RAM USED" 
              totalText={`${(ram.used / (1024 * 1024 * 1024)).toFixed(1)} / ${(ram.total / (1024 * 1024 * 1024)).toFixed(1)} GB`} 
              colorClass="cyan"
            />
            <div style={{ flexGrow: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <span>Memory History (30s)</span>
                <span>{ram.percent}%</span>
              </div>
              <MiniLineChart history={ramHistory} colorClass="cyan" />
            </div>
          </div>
        </div>
      </div>

      {/* Network speeds and Hard Drives */}
      <div className="grid-2">
        {/* Network & Info Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Network size={18} style={{ color: 'var(--accent-primary)' }} />
            Network & System Metadata
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1, padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ArrowDown style={{ color: 'var(--color-success)' }} size={24} />
                <div>
                  <div className="stat-label">Download Speed</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'Outfit' }}>{formatBytes(network.rx)}/s</div>
                </div>
              </div>

              <div style={{ flex: 1, padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ArrowUp style={{ color: 'var(--accent-primary)' }} size={24} />
                <div>
                  <div className="stat-label">Upload Speed</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'Outfit' }}>{formatBytes(network.tx)}/s</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Server size={14} /> Operating System</span>
                <span style={{ fontWeight: 600 }}>{system.distro}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={14} /> Uptime</span>
                <span style={{ fontWeight: 600 }}>{formatUptime(system.uptime)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Terminal size={14} /> PC Hostname</span>
                <span style={{ fontWeight: 600 }} className="mono-font">{system.hostname}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Disk Space Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <HardDrive size={18} style={{ color: 'var(--accent-secondary)' }} />
            Storage Volumes (Disk)
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '230px', overflowY: 'auto', paddingRight: '4px' }}>
            {disks.length > 0 ? (
              disks.map((disk, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ fontWeight: 600 }}>Volume ({disk.mount}) <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 400 }}>{disk.fs}</span></span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {formatBytes(disk.used)} / {formatBytes(disk.size)} ({disk.use}%)
                    </span>
                  </div>
                  <div className="progress-bar-container" style={{ margin: '4px 0' }}>
                    <div 
                      className={`progress-bar-fill ${disk.use > 90 ? 'danger' : disk.use > 75 ? 'warning' : 'cyan'}`}
                      style={{ 
                        width: `${disk.use}%`,
                        background: disk.use > 90 ? 'var(--color-danger)' : disk.use > 75 ? 'var(--color-warning)' : 'var(--accent-secondary)'
                      }}
                    ></div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                No storage drives found.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Background Startup Settings Card */}
      {startupSupported && (
        <div className="card" style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Settings size={24} style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', margin: 0 }}>Windows Background Startup</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                  Configure if and how HomeServer starts automatically when your NAS system turns on.
                </p>
              </div>
            </div>
            
            <div className="tabs" style={{ background: 'rgba(255,255,255,0.01)', padding: '2px', margin: 0, width: 'auto', display: 'flex' }}>
              <button 
                type="button"
                className={`tab ${startupMode === 'disabled' ? 'active' : ''}`}
                onClick={() => handleSetStartupMode('disabled')}
                disabled={loading}
                style={{ padding: '6px 12px', fontSize: '13px' }}
              >
                Disabled
              </button>
              <button 
                type="button"
                className={`tab ${startupMode === 'login' ? 'active' : ''}`}
                onClick={() => handleSetStartupMode('login')}
                disabled={loading}
                style={{ padding: '6px 12px', fontSize: '13px' }}
              >
                On Login
              </button>
              <button 
                type="button"
                className={`tab ${startupMode === 'boot' ? 'active' : ''}`}
                onClick={() => handleSetStartupMode('boot')}
                disabled={loading}
                style={{ padding: '6px 12px', fontSize: '13px' }}
              >
                On Boot (No Login)
              </button>
            </div>
          </div>
          
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
            {startupMode === 'disabled' && (
              <span>⚠️ Auto-start is currently disabled. HomeServer will not start automatically if your NAS reboots.</span>
            )}
            {startupMode === 'login' && (
              <span>ℹ️ Starts silently in the background <strong>after a user logs into</strong> the Windows desktop on your NAS.</span>
            )}
            {startupMode === 'boot' && (
              <span>🚀 Starts instantly as a system task <strong>when the NAS reboots</strong>, without requiring any Windows login. (Requires running homeserver.exe as Admin).</span>
            )}
          </div>
        </div>
      )}

      {/* System Version & Auto-Update Card */}
      <div className="card" style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={24} style={{ color: 'var(--accent-secondary)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ fontSize: '16px', margin: 0 }}>System Version & Updates</h3>
                <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                  v{updateStatus?.currentVersion || '1.0.0'}
                </span>
                {updateStatus?.hasUpdate && (
                  <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.4)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                    Update Available: v{updateStatus?.latestVersion}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                Automatic daily update check is active. Published releases are served from app.mhservice.co.in.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCheckUpdate}
              disabled={checkingUpdate || applyingUpdate || updateStatus?.checking}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', fontSize: '13px' }}
            >
              <RefreshCw size={14} className={checkingUpdate || updateStatus?.checking ? 'spin' : ''} />
              {checkingUpdate || updateStatus?.checking ? 'Checking...' : 'Check for Updates'}
            </button>

            {updateStatus?.hasUpdate && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApplyUpdate}
                disabled={applyingUpdate || updateStatus?.downloading}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', fontSize: '13px', backgroundColor: '#22c55e', borderColor: '#16a34a', color: '#ffffff' }}
              >
                <ArrowUpCircle size={15} />
                {applyingUpdate || updateStatus?.downloading 
                  ? `Updating... (${updateStatus?.downloadProgress || 0}%)` 
                  : `Update Now (v${updateStatus?.latestVersion})`}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <strong>Last Checked:</strong> {updateStatus?.lastCheckTime ? new Date(updateStatus.lastCheckTime).toLocaleString() : 'Not checked yet today'}
          </div>
          {updateActionMsg && (
            <div style={{ color: updateActionMsg.includes('Error') ? '#ef4444' : '#38bdf8', fontWeight: 500 }}>
              {updateActionMsg}
            </div>
          )}
          {updateStatus?.error && !updateActionMsg && (
            <div style={{ color: '#ef4444' }}>
              ⚠️ {updateStatus.error}
            </div>
          )}
        </div>

        {updateStatus?.hasUpdate && updateStatus?.changelog && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Info size={14} style={{ color: '#38bdf8' }} /> What's New in v{updateStatus.latestVersion}:
            </div>
            <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {updateStatus.changelog}
            </div>
          </div>
        )}
      </div>

      {/* Diagnostics Divider Title */}
      <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>Diagnostics & Telemetry Logs</div>
        <div style={{ height: '1px', flexGrow: 1, background: 'var(--border-color)' }}></div>
      </div>

      {/* Grid: Database Status & API metrics */}
      <div className="grid-2">
        {/* DB Health & Stats */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Database size={18} style={{ color: 'var(--accent-primary)' }} />
            Database REST API Status
          </h3>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <span className={`status-indicator ${databaseStatus?.status === 'connected' ? 'ready' : databaseStatus?.status === 'error' ? 'offline' : 'starting'}`} style={{ width: '12px', height: '12px' }}></span>
                <span style={{ fontSize: '20px', fontWeight: 700, textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                  {databaseStatus?.status || 'disconnected'}
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <div>Host: <code style={{ color: 'var(--accent-secondary)' }}>{databaseStatus?.host || '127.0.0.1'}:{databaseStatus?.port || 5432}</code></div>
                <div>Default DB: <strong style={{ color: 'var(--text-primary)' }}>{databaseStatus?.database || 'postgres'}</strong></div>
                {databaseStatus?.status === 'connected' && (
                  <div>Ping Latency: <strong style={{ color: 'var(--color-success)' }}>{databaseStatus.latency} ms</strong></div>
                )}
                {databaseStatus?.status === 'error' && (
                  <div style={{ color: 'var(--color-danger)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebKitLineClamp: 2, WebKitBoxOrient: 'vertical' }}>
                    Error: {databaseStatus.error}
                  </div>
                )}
              </div>
            </div>

            {/* DB Query Metrics inside DB status */}
            <div style={{ flex: 1.2, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>SQL REST API STATS</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                <span style={{ flexGrow: 1 }}>Total Queries:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{databaseStatus?.metrics?.totalQueries || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                <span style={{ flexGrow: 1 }}>Success / Failed:</span>
                <span>
                  <strong style={{ color: 'var(--color-success)' }}>{databaseStatus?.metrics?.successQueries || 0}</strong>
                  <span style={{ color: 'var(--text-muted)' }}> / </span>
                  <strong style={{ color: 'var(--color-danger)' }}>{databaseStatus?.metrics?.errorQueries || 0}</strong>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ flexGrow: 1 }}>Avg Execution:</span>
                <strong style={{ color: 'var(--accent-secondary)' }}>{databaseStatus?.metrics?.avgResponseTimeMs || 0} ms</strong>
              </div>
            </div>
          </div>
        </div>

        {/* API Request Traffic Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
              <Activity size={18} style={{ color: 'var(--accent-secondary)' }} />
              API Traffic Telemetry
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Real-time Gateway Traffic</span>
          </div>

          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Quick Metrics */}
            <div style={{ flex: 1, minWidth: '130px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <span className="stat-label" style={{ fontSize: '11px' }}>Total Requests</span>
                <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'Outfit' }}>{apiMetrics?.totalRequests || 0}</div>
              </div>
              <div>
                <span className="stat-label" style={{ fontSize: '11px' }}>Avg Response Time</span>
                <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'Outfit', color: 'var(--accent-secondary)' }}>{apiMetrics?.avgResponseTimeMs || 0} <span style={{ fontSize: '12px' }}>ms</span></div>
              </div>
            </div>

            {/* Chart */}
            <div style={{ flex: 2, minWidth: '220px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                <span>Traffic Activity</span>
                <span>
                  Success: <strong style={{ color: 'var(--color-success)' }}>{apiMetrics?.successRequests || 0}</strong>
                  <span style={{ color: 'var(--text-muted)' }}> | </span>
                  Failed: <strong style={{ color: 'var(--color-danger)' }}>{apiMetrics?.failedRequests || 0}</strong>
                </span>
              </div>
              <MiniLineChart 
                history={apiMetrics?.trafficHistory || []} 
                maxVal={apiMetrics?.trafficHistory?.length > 0 ? Math.max(...apiMetrics.trafficHistory, 5) : 5}
                colorClass="cyan"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Centralized Service Logs & API Failure Details */}
      <div className="grid-2">
        {/* Centralized Service logs */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: '340px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
              <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
              Centralized Service Logs
            </h3>
            
            <button 
              className="btn btn-secondary" 
              onClick={handleClearErrors} 
              disabled={clearingErrors || serviceErrors.length === 0}
              style={{ padding: '4px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', height: 'auto', border: '1px solid var(--border-color)' }}
            >
              <Trash2 size={12} />
              Clear Logs
            </button>
          </div>

          {/* Search and Filters */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ position: 'relative', flexGrow: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search logs..." 
                className="form-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '32px', fontSize: '13px', height: '34px' }}
              />
            </div>
            <select 
              className="form-input" 
              value={serviceFilter} 
              onChange={(e) => setServiceFilter(e.target.value)}
              style={{ width: 'auto', padding: '0 24px 0 10px', height: '34px', fontSize: '13px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              <option value="All">All Services</option>
              <option value="Database">Database</option>
              <option value="Tunnel">Tunnel</option>
              <option value="Web Host">Web Host</option>
              <option value="Cloudflare Sync">Cloudflare Sync</option>
              <option value="System">System</option>
            </select>
          </div>

          {/* Logs List */}
          <div style={{ flexGrow: 1, overflowY: 'auto', maxHeight: '200px', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(() => {
              const filtered = serviceErrors.filter(err => {
                const matchesService = serviceFilter === 'All' || err.service === serviceFilter;
                const matchesSearch = searchQuery.trim() === '' || 
                  err.message.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  err.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  err.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  JSON.stringify(err.details).toLowerCase().includes(searchQuery.toLowerCase());
                return matchesService && matchesSearch;
              });

              if (filtered.length === 0) {
                return (
                  <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '10px', minHeight: '130px' }}>
                    <Info size={32} />
                    <span style={{ fontSize: '13px' }}>No warnings or crash reports recorded.</span>
                  </div>
                );
              }

              return filtered.map((err) => {
                const isExpanded = !!expandedLogs[err.id];
                
                const getServiceColor = (srv) => {
                  switch (srv) {
                    case 'Database': return { bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.2)', text: '#a78bfa' };
                    case 'Tunnel': return { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' };
                    case 'Web Host': return { bg: 'rgba(6, 182, 212, 0.1)', border: 'rgba(6, 182, 212, 0.2)', text: '#22d3ee' };
                    case 'Cloudflare Sync': return { bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.2)', text: '#fb923c' };
                    default: return { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.2)', text: '#f87171' };
                  }
                };

                const colors = getServiceColor(err.service);

                return (
                  <div key={err.id} style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(255,255,255,0.01)' }}>
                    <div 
                      onClick={() => setExpandedLogs(prev => ({ ...prev, [err.id]: !prev[err.id] }))}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexGrow: 1, minWidth: 0 }}>
                        <span style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, padding: '2px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '10px', whiteSpace: 'nowrap' }}>
                          {err.service}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {err.message}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '12px', flexShrink: 0 }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {new Date(err.timestamp).toLocaleTimeString()}
                        </span>
                        {isExpanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-color)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.15)' }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>Event Type: </span>
                          <strong className="mono-font" style={{ color: 'var(--text-primary)' }}>{err.type}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>Occurred: </span>
                          <strong className="mono-font" style={{ color: 'var(--text-primary)' }}>{new Date(err.timestamp).toLocaleString()}</strong>
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Error Details:</span>
                          <pre style={{ margin: 0, background: 'var(--terminal-bg)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '6px', color: '#c0caf5', fontFamily: 'monospace', overflowX: 'auto', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            <code>{typeof err.details === 'object' ? JSON.stringify(err.details, null, 2) : err.details}</code>
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* API Failure details */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: '340px' }}>
          <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <XCircle size={18} style={{ color: 'var(--color-danger)' }} />
            API Request Failures Log
          </h3>

          <div style={{ flexGrow: 1, overflowY: 'auto', maxHeight: '250px', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {apiMetrics?.recentFailures && apiMetrics.recentFailures.length > 0 ? (
              apiMetrics.recentFailures.map((fail) => {
                const isExpanded = !!expandedFailures[fail.id];
                return (
                  <div key={fail.id} style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.02)' }}>
                    <div 
                      onClick={() => setExpandedFailures(prev => ({ ...prev, [fail.id]: !prev[fail.id] }))}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', minWidth: 0, flexGrow: 1 }}>
                        <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '11px', border: '1px solid rgba(239, 68, 68, 0.15)', flexShrink: 0 }}>
                          {fail.method}
                        </span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} className="mono-font">
                          {fail.path}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '12px', flexShrink: 0 }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-danger)' }}>{fail.statusCode}</span>
                        {isExpanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-color)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.15)' }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>Timestamp: </span>
                          <strong className="mono-font" style={{ color: 'var(--text-primary)' }}>{new Date(fail.timestamp).toLocaleTimeString()} ({new Date(fail.timestamp).toLocaleDateString()})</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>Client IP: </span>
                          <strong className="mono-font" style={{ color: 'var(--text-primary)' }}>{fail.ip}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>Response Time: </span>
                          <strong className="mono-font" style={{ color: 'var(--text-primary)' }}>{fail.duration} ms</strong>
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Error Details:</span>
                          <div style={{ background: 'var(--terminal-bg)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '6px', color: 'var(--color-danger)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '11px' }}>
                            {fail.errorMessage}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '10px', minHeight: '180px' }}>
                <CheckCircle2 size={32} style={{ color: 'var(--color-success)' }} />
                <span style={{ fontSize: '13px' }}>No HTTP API request failures recorded.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
