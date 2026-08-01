import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Globe, 
  Radio, 
  Terminal, 
  Settings, 
  Download, 
  RefreshCw, 
  Network,
  Database,
  Menu,
  X,
  Lock,
  LogOut,
  User,
  ShieldAlert,
  LayoutGrid
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import WebHost from './components/WebHost';
import TunnelManager from './components/TunnelManager';
import CloudflareSync from './components/CloudflareSync';
import DatabaseMonitor from './components/DatabaseMonitor';
import FeatureHub from './components/FeatureHub';

// Dynamic API and WS targets
export const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : '';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = import.meta.env.DEV ? 'ws://localhost:5000' : `${wsProtocol}//${window.location.host}`;

// Global fetch interceptor to append authorization token automatically
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  const token = localStorage.getItem('hs_auth_token');
  if (token && url.toString().includes('/api/')) {
    options.headers = options.headers || {};
    if (options.headers instanceof Headers) {
      options.headers.set('Authorization', `Bearer ${token}`);
    } else if (Array.isArray(options.headers)) {
      const hasAuth = options.headers.some(h => h[0].toLowerCase() === 'authorization');
      if (!hasAuth) options.headers.push(['Authorization', `Bearer ${token}`]);
    } else {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return originalFetch(url, options);
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wsConnected, setWsConnected] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState(null);
  const [tunnels, setTunnels] = useState([]);
  const [servers, setServers] = useState([]);
  const [databaseStatus, setDatabaseStatus] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [apiMetrics, setApiMetrics] = useState(null);
  const [serviceErrors, setServiceErrors] = useState([]);
  
  // Service Hub States
  const [proxyRules, setProxyRules] = useState([]);
  const [databaseBackups, setDatabaseBackups] = useState({ history: [], schedule: 'disabled' });
  const [ddnsStatus, setDdnsStatus] = useState({ enabled: false, hostname: '', lastSync: null, lastIp: '', error: null });
  const [powerScheduleStatus, setPowerScheduleStatus] = useState({ enabled: false, action: 'sleep', shutdownTime: '23:00', startTime: '07:00', isAdmin: false, error: null });
  const [theme, setTheme] = useState(localStorage.getItem('hs_theme') || 'dark');
  
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('hs_auth_token') || '');
  const [setupRequired, setSetupRequired] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  
  // Responsive UI state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // History for charts
  const [cpuHistory, setCpuHistory] = useState([]);
  const [ramHistory, setRamHistory] = useState([]);
  
  // Real-time logs state
  const [logs, setLogs] = useState({}); // tunnelId -> array of logs

  const wsRef = useRef(null);
  const reconnectInterval = useRef(null);

  // Check auth status on load / token change
  useEffect(() => {
    checkAuthStatus();
  }, [token]);

  // Theme management effect
  useEffect(() => {
    localStorage.setItem('hs_theme', theme);
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [theme]);

  const checkAuthStatus = async () => {
    try {
      const res = await originalFetch(`${API_BASE}/api/auth/status`);
      const data = await res.json();
      setSetupRequired(data.setupRequired);
      
      // Verify token is valid by testing status endpoint
      if (token) {
        const testRes = await originalFetch(`${API_BASE}/api/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (testRes.status === 401) {
          localStorage.removeItem('hs_auth_token');
          setToken('');
        }
      }
    } catch (e) {
      console.error('Auth verification failed:', e);
    } finally {
      setAuthChecking(false);
    }
  };

  // WebSocket Connection Lifecycle
  const connectWebSocket = () => {
    // Only connect if logged in!
    if (!token) return;
    if (wsRef.current) return;

    console.log('Connecting to WebSocket...');
    const socket = new WebSocket(WS_BASE);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('WebSocket connected successfully');
      setWsConnected(true);
      if (reconnectInterval.current) {
        clearInterval(reconnectInterval.current);
        reconnectInterval.current = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, data } = message;

        switch (type) {
          case 'download_status':
            setDownloadStatus(data);
            break;
          case 'tunnels_list':
            setTunnels(data);
            break;
          case 'servers_list':
            setServers(data);
            break;
          case 'telemetry':
            setTelemetry(data);
            // Append to CPU and RAM history
            setCpuHistory(prev => {
              const updated = [...prev, data.cpu.current];
              if (updated.length > 30) updated.shift();
              return updated;
            });
            setRamHistory(prev => {
              const updated = [...prev, data.ram.percent];
              if (updated.length > 30) updated.shift();
              return updated;
            });
            break;
          case 'tunnel_log':
            setLogs(prev => {
              const tunnelId = data.id;
              const prevLogs = prev[tunnelId] || [];
              const updatedLogs = [...prevLogs, data.log];
              if (updatedLogs.length > 100) updatedLogs.shift();
              return {
                ...prev,
                [tunnelId]: updatedLogs
              };
            });
            break;
          case 'database_status':
            setDatabaseStatus(data);
            break;
          case 'api_metrics':
            setApiMetrics(data);
            break;
          case 'service_errors':
            setServiceErrors(data);
            break;
          case 'proxy_rules':
            setProxyRules(data);
            break;
          case 'database_backups':
            setDatabaseBackups(data);
            break;
          case 'ddns_status':
            setDdnsStatus(data);
            break;
          case 'power_schedule_status':
            setPowerScheduleStatus(data);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket connection closed.');
      setWsConnected(false);
      wsRef.current = null;

      // Try reconnecting every 3 seconds if logged in
      if (!reconnectInterval.current && localStorage.getItem('hs_auth_token')) {
        reconnectInterval.current = setInterval(() => {
          connectWebSocket();
        }, 3000);
      }
    };

    socket.onerror = (err) => {
      console.error('WebSocket encountered error:', err);
      socket.close();
    };
  };

  // WS trigger when token/login changes
  useEffect(() => {
    if (token) {
      connectWebSocket();
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectInterval.current) {
        clearInterval(reconnectInterval.current);
        reconnectInterval.current = null;
      }
      setWsConnected(false);
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectInterval.current) clearInterval(reconnectInterval.current);
    };
  }, [token]);

  // Auth Operations
  const handleSetup = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    if (password.length < 4) {
      setAuthError('Password must be at least 4 characters.');
      return;
    }
    try {
      const res = await originalFetch(`${API_BASE}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete setup.');
      
      // Log in automatically after setup
      await handleLogin(e);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await originalFetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid username or password.');
      
      localStorage.setItem('hs_auth_token', data.token);
      setToken(data.token);
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setSetupRequired(false);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('hs_auth_token');
    setToken('');
    setSetupRequired(false);
    setAuthChecking(true);
    checkAuthStatus();
  };

  // Trigger binary downloads
  const handleDownloadBinaries = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/download`, {
        method: 'POST'
      });
      const data = await response.json();
      console.log('Download trigger response:', data);
    } catch (err) {
      console.error('Error triggering binary downloads:', err);
    }
  };

  // Determine if setup is complete
  const isSetupComplete = downloadStatus && 
    downloadStatus.cloudflared?.status === 'ready' && 
    downloadStatus.rathole?.status === 'ready';

  const isDownloading = downloadStatus && (
    downloadStatus.cloudflared?.status === 'downloading' ||
    downloadStatus.cloudflared?.status === 'extracting' ||
    downloadStatus.rathole?.status === 'downloading' ||
    downloadStatus.rathole?.status === 'extracting'
  );

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false); // Close sidebar drawer on mobile after clicking
  };

  // Loader View
  if (authChecking) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--accent-primary)', animation: 'spin 1.5s linear infinite', marginBottom: '16px' }} />
        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Securing HomeServer...</span>
      </div>
    );
  }

  // Setup Wizard View
  if (setupRequired) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '16px' }}>
        <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ padding: '10px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
              <ShieldAlert size={28} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', margin: 0 }}>Initial Admin Setup</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Configure credentials for your server</p>
            </div>
          </div>

          <form onSubmit={handleSetup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="setupUser">Administrator Username</label>
              <input 
                type="text" 
                id="setupUser" 
                className="form-input" 
                placeholder="e.g. admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="setupPass">Password</label>
              <input 
                type="password" 
                id="setupPass" 
                className="form-input" 
                placeholder="At least 4 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="setupConfirm">Confirm Password</label>
              <input 
                type="password" 
                id="setupConfirm" 
                className="form-input" 
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {authError && (
              <div className="folder-validator invalid" style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {authError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              Create Account & Log In
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Login View
  if (!token) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '16px' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ padding: '10px', background: 'rgba(6, 182, 212, 0.1)', borderRadius: '12px', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
              <Lock size={28} style={{ color: 'var(--accent-secondary)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', margin: 0 }}>Welcome Back</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Log in to manage HomeServer</p>
            </div>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="loginUser">Username</label>
              <input 
                type="text" 
                id="loginUser" 
                className="form-input" 
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="loginPass">Password</label>
              <input 
                type="password" 
                id="loginPass" 
                className="form-input" 
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {authError && (
              <div className="folder-validator invalid" style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {authError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Dashboard Main View
  return (
    <div className="app-container">
      {/* Mobile Top Header bar */}
      <div className="mobile-header" style={{ display: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <span className="logo-text" style={{ fontSize: '18px' }}>HomeServer</span>
        </div>
        <div className="status-indicator-wrapper">
          <span className={`status-indicator ${wsConnected ? 'ready' : 'offline'}`} style={{ display: 'inline-block', width: '8px', height: '8px' }}></span>
        </div>
      </div>

      {/* Sidebar Overlay for Mobile */}
      {isMobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="logo-container">
          <Globe className="logo-icon" size={28} />
          <span className="logo-text">HomeServer</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <ul className="nav-links">
            <li>
              <button 
                className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => handleTabClick('dashboard')}
                style={{ width: '100%', background: 'transparent', textAlign: 'left' }}
              >
                <Activity className="nav-icon" />
                Dashboard
              </button>
            </li>
            <li>
              <button 
                className={`nav-item ${activeTab === 'webhost' ? 'active' : ''}`}
                onClick={() => handleTabClick('webhost')}
                style={{ width: '100%', background: 'transparent', textAlign: 'left' }}
              >
                <Globe className="nav-icon" />
                Local Hosting
              </button>
            </li>
            <li>
              <button 
                className={`nav-item ${activeTab === 'tunnels' ? 'active' : ''}`}
                onClick={() => handleTabClick('tunnels')}
                style={{ width: '100%', background: 'transparent', textAlign: 'left' }}
              >
                <Radio className="nav-icon" />
                Tunnel Manager
              </button>
            </li>
            <li>
              <button 
                className={`nav-item ${activeTab === 'cloudflare' ? 'active' : ''}`}
                onClick={() => handleTabClick('cloudflare')}
                style={{ width: '100%', background: 'transparent', textAlign: 'left' }}
              >
                <Network className="nav-icon" />
                Cloudflare Sync
              </button>
            </li>
            <li>
              <button 
                className={`nav-item ${activeTab === 'database' ? 'active' : ''}`}
                onClick={() => handleTabClick('database')}
                style={{ width: '100%', background: 'transparent', textAlign: 'left' }}
              >
                <Database className="nav-icon" />
                Database Monitor
              </button>
            </li>
            <li>
              <button 
                className={`nav-item ${activeTab === 'features' ? 'active' : ''}`}
                onClick={() => handleTabClick('features')}
                style={{ width: '100%', background: 'transparent', textAlign: 'left' }}
              >
                <LayoutGrid className="nav-icon" />
                Service Hub
              </button>
            </li>
          </ul>

          <div className="sidebar-footer">
            <button 
              className="nav-item" 
              onClick={handleLogout} 
              style={{ width: '100%', background: 'transparent', textAlign: 'left', border: 'none', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-danger)', padding: '10px 12px' }}
            >
              <LogOut className="nav-icon" style={{ color: 'var(--color-danger)' }} />
              Logout
            </button>
            
            <div className="status-badge" style={{ marginTop: '12px' }}>
              <span className={`status-indicator ${wsConnected ? 'ready' : 'offline'}`}></span>
              <span>{wsConnected ? 'Connected to Node' : 'Offline / Connecting'}</span>
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Content Pane */}
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <Dashboard 
            telemetry={telemetry} 
            cpuHistory={cpuHistory} 
            ramHistory={ramHistory}
            tunnelsCount={tunnels.filter(t => t.status === 'running').length}
            serversCount={servers.filter(s => s.status === 'running').length}
            databaseStatus={databaseStatus}
            apiMetrics={apiMetrics}
            serviceErrors={serviceErrors}
          />
        )}
        
        {activeTab === 'webhost' && (
          <WebHost 
            servers={servers} 
            tunnels={tunnels}
            API_BASE={API_BASE}
            onExposeCloudflare={(port) => handleTabClick('tunnels')}
          />
        )}

        {activeTab === 'tunnels' && (
          <TunnelManager 
            tunnels={tunnels} 
            servers={servers} 
            logs={logs} 
            API_BASE={API_BASE}
            setLogs={setLogs}
          />
        )}

        {activeTab === 'cloudflare' && (
          <CloudflareSync 
            API_BASE={API_BASE}
            servers={servers}
          />
        )}

        {activeTab === 'database' && (
          <DatabaseMonitor 
            API_BASE={API_BASE}
            databaseStatus={databaseStatus}
          />
        )}
        
        {activeTab === 'features' && (
          <FeatureHub 
            API_BASE={API_BASE}
            proxyRules={proxyRules}
            databaseBackups={databaseBackups}
            ddnsStatus={ddnsStatus}
            powerScheduleStatus={powerScheduleStatus}
            theme={theme}
            setTheme={setTheme}
          />
        )}
      </main>

      {/* Dependency Installation Wizard overlay */}
      {!isSetupComplete && downloadStatus && (
        <div className="setup-overlay">
          <div className="card setup-card">
            <Download className="setup-icon" />
            <h2 className="setup-title">System Setup Required</h2>
            <p className="setup-desc">
              HomeServer needs to download helper binaries (Cloudflare Quick Tunnel Client and Rathole client proxy) to operate tunneling. This is a one-time automated process.
            </p>

            {/* Cloudflare progress */}
            <div style={{ textAlign: 'left', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600 }}>Cloudflare Client (cloudflared.exe)</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {downloadStatus.cloudflared?.status === 'ready' ? 'Ready' : 
                   downloadStatus.cloudflared?.status === 'downloading' ? `Downloading ${downloadStatus.cloudflared?.progress}%` : 
                   downloadStatus.cloudflared?.status === 'error' ? 'Failed' : 'Pending'}
                </span>
              </div>
              <div className="progress-bar-container">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${downloadStatus.cloudflared?.status === 'ready' ? 100 : downloadStatus.cloudflared?.progress || 0}%` }}
                ></div>
              </div>
            </div>

            {/* Rathole progress */}
            <div style={{ textAlign: 'left', marginBottom: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600 }}>Rathole Client Proxy (rathole.exe)</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {downloadStatus.rathole?.status === 'ready' ? 'Ready' : 
                   downloadStatus.rathole?.status === 'downloading' ? `Downloading ${downloadStatus.rathole?.progress}%` : 
                   downloadStatus.rathole?.status === 'extracting' ? 'Extracting ZIP...' : 
                   downloadStatus.rathole?.status === 'error' ? 'Failed' : 'Pending'}
                </span>
              </div>
              <div className="progress-bar-container">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${downloadStatus.rathole?.status === 'ready' ? 100 : downloadStatus.rathole?.progress || 0}%` }}
                ></div>
              </div>
            </div>

            {isDownloading ? (
              <button className="btn btn-secondary" style={{ width: '100%' }} disabled>
                <RefreshCw className="animate-spin" size={16} style={{ animation: 'spin 1.5s linear infinite' }} />
                Downloading helper binaries...
              </button>
            ) : (
              <button 
                className="btn btn-primary" 
                style={{ width: '100%' }}
                onClick={handleDownloadBinaries}
              >
                Start Automatic Setup
              </button>
            )}

            {downloadStatus.cloudflared?.error && (
              <div className="folder-validator invalid" style={{ marginTop: '12px', justifyContent: 'center' }}>
                Error: {downloadStatus.cloudflared.error}
              </div>
            )}
            {downloadStatus.rathole?.error && (
              <div className="folder-validator invalid" style={{ marginTop: '12px', justifyContent: 'center' }}>
                Error: {downloadStatus.rathole.error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
