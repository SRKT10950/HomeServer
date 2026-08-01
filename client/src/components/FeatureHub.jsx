import React, { useState, useEffect } from 'react';
import { 
  Lock,
  UserCheck,
  Shield,
  ShieldAlert,
  Database,
  FolderOpen,
  Radio,
  Activity,
  Network,
  Globe,
  Compass,
  Maximize2,
  HardDrive,
  Code,
  GitBranch,
  AppWindow,
  Palette,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Sparkles,
  Search,
  Trash2,
  Loader2,
  Moon,
  Sun
} from 'lucide-react';

function FeatureHub({ 
  API_BASE, 
  proxyRules = [], 
  databaseBackups = { history: [], schedule: 'disabled' }, 
  ddnsStatus = { enabled: false, hostname: '', lastSync: null, lastIp: '', error: null }, 
  powerScheduleStatus = { enabled: false, action: 'sleep', shutdownTime: '23:00', startTime: '07:00', isAdmin: false, error: null },
  theme, 
  setTheme 
}) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Interactive Modal Selection
  const [configureFeature, setConfigureFeature] = useState(null);
  const [votedFeatures, setVotedFeatures] = useState({});
  
  // 1. Basic Auth & Headers Configuration States
  const [configPort, setConfigPort] = useState('8080');
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [corsHeader, setCorsHeader] = useState('');
  const [frameHeader, setFrameHeader] = useState('');
  const [cspHeader, setCspHeader] = useState('');
  const [configLoading, setConfigLoading] = useState(false);

  // 2. Proxy Configuration States
  const [proxyPath, setProxyPath] = useState('');
  const [proxyPort, setProxyPort] = useState('8080');
  const [proxyLoading, setProxyLoading] = useState(false);

  // 3. Port Testing States
  const [portToTest, setPortToTest] = useState('80');
  const [portTestResult, setPortTestResult] = useState(null);
  const [portTesting, setPortTesting] = useState(false);

  // 4. DDNS Configuration States
  const [ddnsHost, setDdnsHost] = useState(ddnsStatus?.hostname || '');
  const [ddnsEnabled, setDdnsEnabled] = useState(ddnsStatus?.enabled || false);
  const [ddnsLoading, setDdnsLoading] = useState(false);

  // 5. Database Backup States
  const [backupLoading, setBackupLoading] = useState(false);

  // 6. Power Scheduling States
  const [powerEnabled, setPowerEnabled] = useState(powerScheduleStatus?.enabled || false);
  const [powerAction, setPowerAction] = useState(powerScheduleStatus?.action || 'sleep');
  const [shutdownTime, setShutdownTime] = useState(powerScheduleStatus?.shutdownTime || '23:00');
  const [startTime, setStartTime] = useState(powerScheduleStatus?.startTime || '07:00');
  const [powerLoading, setPowerLoading] = useState(false);
  const [showConfirmAction, setShowConfirmAction] = useState(null);

  // Sync DDNS input fields when status updates via WS
  useEffect(() => {
    if (ddnsStatus) {
      setDdnsHost(ddnsStatus.hostname || '');
      setDdnsEnabled(ddnsStatus.enabled || false);
    }
  }, [ddnsStatus]);

  // Sync Power Scheduling inputs when status updates via WS
  useEffect(() => {
    if (powerScheduleStatus) {
      setPowerEnabled(powerScheduleStatus.enabled || false);
      setPowerAction(powerScheduleStatus.action || 'sleep');
      setShutdownTime(powerScheduleStatus.shutdownTime || '23:00');
      setStartTime(powerScheduleStatus.startTime || '07:00');
    }
  }, [powerScheduleStatus]);

  // Load website configs when port is changed
  useEffect(() => {
    if (configureFeature === 'basic_auth' || configureFeature === 'headers') {
      fetchServerConfig(configPort);
    }
  }, [configPort, configureFeature]);

  const categories = ['All', 'Security', 'Network', 'Storage', 'Dev Tools'];

  const featuresList = [
    {
      id: 'ssl',
      name: 'Automatic SSL/TLS Provisioning',
      category: 'Security',
      desc: 'Integrate Let\'s Encrypt to automatically provision and renew free SSL certificates for local static/Node websites using HTTP-01 or DNS-01 challenges.',
      status: 'Planned',
      icon: Lock,
      color: '#3b82f6'
    },
    {
      id: 'basic_auth',
      name: 'Built-in Basic Authentication (ACL)',
      category: 'Security',
      desc: 'Protect exposed folders and local hosting directories with basic auth credentials. Setup rules, usernames, passwords, and secure directories.',
      status: 'Configure Active',
      icon: UserCheck,
      color: '#8b5cf6',
      interactive: true
    },
    {
      id: 'vpn',
      name: 'VPN Server Setup (WireGuard)',
      category: 'Security',
      desc: 'Configure a secure, fast WireGuard VPN server on your NAS in one click to access your entire local home network from anywhere in the world.',
      status: 'Planned',
      icon: Radio,
      color: '#06b6d4'
    },
    {
      id: 'waf',
      name: 'IP Rate Limiting & WAF',
      category: 'Security',
      desc: 'Prevent brute-force attempts and mitigate small-scale DDoS attacks. Analyze request signatures to block SQL injections and suspicious cross-site scripting on database REST routes.',
      status: 'Planned',
      icon: Shield,
      color: '#ef4444'
    },
    {
      id: 'proxy',
      name: 'Reverse Proxy Manager',
      category: 'Network',
      desc: 'A complete reverse proxy dashboard to route subpaths (e.g. /proxy/rules) to target internal ports, with WebSocket support and stream forwarding.',
      status: 'Configure Active',
      icon: Globe,
      color: '#10b981',
      interactive: true
    },
    {
      id: 'ddns',
      name: 'Dynamic DNS (DDNS) Client',
      category: 'Network',
      desc: 'Monitor your public WAN IP address and automatically update DNS records on Cloudflare when your router IP address changes.',
      status: 'Configure Active',
      icon: Network,
      color: '#6366f1',
      interactive: true
    },
    {
      id: 'local_dns',
      name: 'Local DNS Resolver & Ad-Blocker',
      category: 'Network',
      desc: 'Run a local DNS server (Pi-hole style) to resolve local hostnames (e.g. server.local) and block advertisement/tracker queries network-wide.',
      status: 'Planned',
      icon: Compass,
      color: '#fb923c'
    },
    {
      id: 'port_test',
      name: 'Port Forwarding Tester',
      category: 'Network',
      desc: 'Verify if external ports (80, 443, 5432, 22) are open and accessible from the public internet. Test router port mappings instantly.',
      status: 'Run Tool Active',
      icon: Maximize2,
      color: '#ec4899',
      interactive: true
    },
    {
      id: 'docker',
      name: 'Application Marketplace (Docker)',
      category: 'Storage',
      desc: 'One-click deploy popular self-hosted applications (Nextcloud, Plex, Pi-hole, Home Assistant) in local Docker containers directly from this dashboard.',
      status: 'Planned',
      icon: AppWindow,
      color: '#0284c7'
    },
    {
      id: 'file_manager',
      name: 'Web File Manager & WebDAV',
      category: 'Storage',
      desc: 'Browser-based file management for your NAS server. Upload, organize, preview media, and host WebDAV endpoints for mounting local folders.',
      status: 'Planned',
      icon: FolderOpen,
      color: '#f59e0b'
    },
    {
      id: 'backup',
      name: 'Automated Database Backups',
      category: 'Storage',
      desc: 'Schedule cron-based backups of PostgreSQL databases to local directories, Samba/NFS network shares, or AWS S3 cloud buckets.',
      status: 'Configure Active',
      icon: Database,
      color: '#a855f7',
      interactive: true
    },
    {
      id: 'smart_disk',
      name: 'RAID & SMART Disk Health',
      category: 'Storage',
      desc: 'Monitor connected storage drives. Read SMART indicators, track hard drive temperature, inspect bad sectors, and evaluate RAID arrays.',
      status: 'Planned',
      icon: HardDrive,
      color: '#14b8a6'
    },
    {
      id: 'git',
      name: 'Git Server & Deployments',
      category: 'Dev Tools',
      desc: 'Host private Git repositories locally. Configure git hooks to automatically build and deploy websites to local hosting folders upon Git push.',
      status: 'Planned',
      icon: GitBranch,
      color: '#f43f5e'
    },
    {
      id: 'speed_test',
      name: 'ISP Speed Tests & Logs',
      category: 'Dev Tools',
      desc: 'Run speed tests in the background to log internet speed quality. Graphs bandwidth performance, jitter, and packet loss logs.',
      status: 'Planned',
      icon: Activity,
      color: '#10b981'
    },
    {
      id: 'headers',
      name: 'Response Headers & CORS Manager',
      category: 'Dev Tools',
      desc: 'Manage custom HTTP response headers (HSTS, Content Security Policy, cache controls) and customize CORS configurations on website servers.',
      status: 'Configure Active',
      icon: Code,
      color: '#06b6d4',
      interactive: true
    },
    {
      id: 'alerts',
      name: 'Resource Threshold Alerts',
      category: 'Dev Tools',
      desc: 'Establish trigger limits for CPU usage, memory occupancy, or storage margins. Receive alerts on Discord, Telegram, Slack, or Email.',
      status: 'Planned',
      icon: ShieldAlert,
      color: '#eab308'
    },
    {
      id: 'theme',
      name: 'Dark/Light Theme Customizer',
      category: 'Dev Tools',
      desc: 'Modify user interface tokens. Set glassmorphism blur opacity, primary accent gradients, or toggle between light and dark themes.',
      status: 'Theme Toggler Active',
      icon: Palette,
      color: '#d946ef',
      interactive: true
    },
    {
      id: 'power_schedule',
      name: 'Power Scheduling & ECO Mode',
      category: 'Dev Tools',
      desc: 'Schedule daily system shutdown, sleep, or hibernate states and set automatic daily wake times to reduce energy usage and electricity bills.',
      status: 'Configure Active',
      icon: Clock,
      color: '#10b981',
      interactive: true
    }
  ];

  // ==========================================
  // API Call Handlers
  // ==========================================

  // Website Config (Basic Auth & Custom Headers)
  const fetchServerConfig = async (port) => {
    if (!port || isNaN(port)) return;
    try {
      const res = await fetch(`${API_BASE}/api/servers/${port}/config`);
      const data = await res.json();
      if (res.ok) {
        setAuthEnabled(data.basicAuth.enabled);
        setAuthUser(data.basicAuth.user || '');
        setAuthPass(data.basicAuth.pass || '');
        setCorsHeader(data.headers['Access-Control-Allow-Origin'] || '');
        setFrameHeader(data.headers['X-Frame-Options'] || '');
        setCspHeader(data.headers['Content-Security-Policy'] || '');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveServerConfig = async (e) => {
    e.preventDefault();
    setConfigLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/servers/${configPort}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basicAuth: { enabled: authEnabled, user: authUser, pass: authPass },
          headers: {
            'Access-Control-Allow-Origin': corsHeader,
            'X-Frame-Options': frameHeader,
            'Content-Security-Policy': cspHeader
          }
        })
      });
      if (!res.ok) throw new Error('Failed to save config.');
      alert(`Security configuration updated successfully for Port ${configPort}.`);
    } catch (err) {
      alert('Error saving configuration: ' + err.message);
    } finally {
      setConfigLoading(false);
    }
  };

  // Reverse Proxy Rules
  const handleAddProxyRule = async (e) => {
    e.preventDefault();
    if (!proxyPath.trim() || !proxyPort) return;
    proxyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/proxy/rules/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: proxyPath.trim(), port: parseInt(proxyPort, 10) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add rule.');
      setProxyPath('');
    } catch (err) {
      alert('Failed to register proxy: ' + err.message);
    } finally {
      proxyLoading(false);
    }
  };

  const handleDeleteProxyRule = async (id) => {
    try {
      await fetch(`${API_BASE}/api/proxy/rules/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Port testing
  const handlePortTest = async (e) => {
    e.preventDefault();
    setPortTesting(true);
    setPortTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/diagnostics/port-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: parseInt(portToTest, 10) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to test port.');
      setPortTestResult(data);
    } catch (err) {
      setPortTestResult({ status: 'error', reason: err.message });
    } finally {
      setPortTesting(false);
    }
  };

  // DDNS Config
  const handleSaveDdns = async (e) => {
    e.preventDefault();
    if (!ddnsHost.trim()) return;
    setDdnsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cloudflare/ddns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: ddnsEnabled, hostname: ddnsHost.trim() })
      });
      if (!res.ok) throw new Error('Failed to update DDNS settings.');
      alert('Cloudflare DDNS configurations updated successfully.');
    } catch (err) {
      alert('Error updating DDNS: ' + err.message);
    } finally {
      setDdnsLoading(false);
    }
  };

  // Database Backups
  const handleRunBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/database/backups/run`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Backup run failed.');
      alert('Database backup completed: ' + data.backup.filename);
    } catch (err) {
      alert('Backup query error: ' + err.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleDeleteBackup = async (id) => {
    if (!window.confirm('Delete this backup file from your local NAS directory?')) return;
    try {
      await fetch(`${API_BASE}/api/database/backups/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleBackupSchedule = async (e) => {
    const val = e.target.value;
    try {
      await fetch(`${API_BASE}/api/database/backups/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: val })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Theme Toggler
  const toggleThemeMode = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // Power Scheduling Handlers
  const handleSavePowerSchedule = async (e) => {
    e.preventDefault();
    setPowerLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/power-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: powerEnabled,
          action: powerAction,
          shutdownTime,
          startTime
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update power schedule.');
      alert('Power scheduling configuration saved and applied successfully.');
    } catch (err) {
      alert('Error saving power schedule: ' + err.message);
    } finally {
      setPowerLoading(false);
    }
  };

  const handleManualPowerAction = async (action) => {
    try {
      const res = await fetch(`${API_BASE}/api/power-schedule/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to trigger power action.');
      alert(data.message || `System will enter ${action} shortly.`);
      setShowConfirmAction(null);
      setConfigureFeature(null);
    } catch (err) {
      alert('Error triggering power action: ' + err.message);
      setShowConfirmAction(null);
    }
  };

  const handleVote = (id) => {
    setVotedFeatures(prev => ({
      ...prev,
      [id]: prev[id] ? prev[id] + 1 : 1
    }));
  };

  const filteredFeatures = featuresList.filter(feat => {
    const matchesCategory = activeCategory === 'All' || feat.category === activeCategory;
    const matchesSearch = searchQuery.trim() === '' || 
      feat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feat.desc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header */}
      <div className="header-container">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles style={{ color: 'var(--accent-primary)' }} />
            HomeServer Service Hub
          </h1>
          <p className="page-desc">
            Expose services, protect websites, configure DDNS updaters, run port tests, and schedule database backups.
          </p>
        </div>
      </div>

      {/* Categories and Search */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div className="tabs" style={{ margin: 0, background: 'rgba(255,255,255,0.01)', padding: '2px', display: 'flex', width: 'auto' }}>
          {categories.map(cat => (
            <button
              key={cat}
              className={`tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
              style={{ padding: '6px 16px', fontSize: '13px' }}
            >
              {cat}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search features..."
          className="form-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: '300px', fontSize: '13px', height: '36px' }}
        />
      </div>

      {/* Grid of Cards */}
      <div className="grid-3" style={{ gap: '20px' }}>
        {filteredFeatures.map(feat => {
          const IconComponent = feat.icon;
          const isVoted = !!votedFeatures[feat.id];
          
          return (
            <div 
              key={feat.id} 
              className="card" 
              style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between', 
                height: '240px',
                border: feat.interactive ? `1px solid ${feat.color}44` : '1px solid var(--border-color)',
                background: feat.interactive ? `linear-gradient(to bottom, rgba(255,255,255,0.02), ${feat.color}05)` : 'rgba(255,255,255,0.01)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'default'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ 
                    padding: '8px', 
                    borderRadius: '8px', 
                    background: `${feat.color}15`, 
                    border: `1px solid ${feat.color}30`, 
                    color: feat.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <IconComponent size={20} />
                  </div>
                  <span style={{ 
                    fontSize: '10px', 
                    fontWeight: 700, 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em', 
                    padding: '2px 8px', 
                    borderRadius: '20px',
                    background: feat.interactive ? `${feat.color}20` : 'rgba(255,255,255,0.03)',
                    color: feat.interactive ? feat.color : 'var(--text-secondary)',
                    border: feat.interactive ? `1px solid ${feat.color}40` : '1px solid var(--border-color)'
                  }}>
                    {feat.status}
                  </span>
                </div>

                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                  {feat.name}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebKitLineClamp: 4, WebKitBoxOrient: 'vertical' }}>
                  {feat.desc}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                {feat.interactive ? (
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => setConfigureFeature(feat.id)}
                    style={{ 
                      width: '100%', 
                      background: `linear-gradient(135deg, ${feat.color} 0%, #d946ef 100%)`,
                      boxShadow: 'none',
                      fontSize: '12px',
                      padding: '6px 12px',
                      fontWeight: 600
                    }}
                  >
                    Configure Gateway
                  </button>
                ) : (
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleVote(feat.id)}
                    style={{ 
                      width: '100%', 
                      fontSize: '12px', 
                      padding: '6px 12px', 
                      borderColor: isVoted ? `${feat.color}40` : 'var(--border-color)',
                      color: isVoted ? feat.color : 'var(--text-secondary)',
                      background: isVoted ? `${feat.color}05` : 'transparent'
                    }}
                  >
                    {isVoted ? `Prioritized (Votes: ${votedFeatures[feat.id]})` : 'Prioritize Roadmap'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 1. Basic Auth & Response Headers Gateway Modal */}
      {(configureFeature === 'basic_auth' || configureFeature === 'headers') && (
        <div className="setup-overlay" style={{ zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '580px', width: '100%', padding: '24px', position: 'relative' }}>
            <button 
              onClick={() => setConfigureFeature(null)}
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <XCircle size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', color: '#8b5cf6' }}>
                <UserCheck size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)' }}>Site Security & Headers Gate</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Configure credentials and CORS/Security headers per hosted website port.</p>
              </div>
            </div>

            <form onSubmit={handleSaveServerConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Select Hosting Server Port</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={configPort} 
                  onChange={(e) => setConfigPort(e.target.value)}
                  placeholder="e.g. 8080"
                  required
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Entering a port will automatically pull its current configurations.</span>
              </div>

              {/* Basic Auth Subgroup */}
              <div style={{ border: '1px solid var(--border-color)', padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.01)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>Basic Access Protection (ACL)</span>
                  <input 
                    type="checkbox" 
                    checked={authEnabled} 
                    onChange={(e) => setAuthEnabled(e.target.checked)} 
                    style={{ width: 'auto', cursor: 'pointer' }}
                  />
                </div>
                {authEnabled && (
                  <div className="form-row" style={{ display: 'flex', gap: '10px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '11px' }}>Username</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={authUser} 
                        onChange={(e) => setAuthUser(e.target.value)} 
                        placeholder="admin"
                        required={authEnabled}
                        style={{ height: '32px', fontSize: '12px' }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '11px' }}>Password</label>
                      <input 
                        type="password" 
                        className="form-input" 
                        value={authPass} 
                        onChange={(e) => setAuthPass(e.target.value)} 
                        placeholder="password"
                        required={authEnabled}
                        style={{ height: '32px', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Headers Subgroup */}
              <div style={{ border: '1px solid var(--border-color)', padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.01)' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '12px', color: 'var(--text-primary)' }}>Custom Response Headers (CORS / Security)</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '11px' }}>Access-Control-Allow-Origin (CORS)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={corsHeader} 
                      onChange={(e) => setCorsHeader(e.target.value)} 
                      placeholder="e.g. * or http://domain.com"
                      style={{ height: '32px', fontSize: '12px' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '11px' }}>X-Frame-Options (Clickjacking protection)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={frameHeader} 
                      onChange={(e) => setFrameHeader(e.target.value)} 
                      placeholder="e.g. DENY or SAMEORIGIN"
                      style={{ height: '32px', fontSize: '12px' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '11px' }}>Content-Security-Policy (CSP)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={cspHeader} 
                      onChange={(e) => setCspHeader(e.target.value)} 
                      placeholder="e.g. default-src 'self'"
                      style={{ height: '32px', fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={configLoading}
                  style={{ flex: 1 }}
                >
                  {configLoading ? <Loader2 className="animate-spin" size={14} /> : 'Save & Apply Config'}
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setConfigureFeature(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Reverse Proxy Configuration Modal */}
      {configureFeature === 'proxy' && (
        <div className="setup-overlay" style={{ zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '580px', width: '100%', padding: '24px', position: 'relative' }}>
            <button 
              onClick={() => setConfigureFeature(null)}
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <XCircle size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                <Globe size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)' }}>Reverse Proxy Manager</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Route incoming subpaths to local target ports.</p>
              </div>
            </div>

            <form onSubmit={handleAddProxyRule} style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1.5 }}>
                <label className="form-label" style={{ fontSize: '11px' }}>Proxy Path Subdirectory</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={proxyPath} 
                  onChange={(e) => setProxyPath(e.target.value)} 
                  placeholder="e.g. nextcloud or main"
                  required
                  style={{ height: '34px', fontSize: '12px' }}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ fontSize: '11px' }}>Target Port</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={proxyPort} 
                  onChange={(e) => setProxyPort(e.target.value)} 
                  placeholder="8080"
                  required
                  style={{ height: '34px', fontSize: '12px' }}
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={proxyLoading}
                style={{ height: '34px', fontSize: '12px', padding: '0 16px' }}
              >
                {proxyLoading ? <Loader2 className="animate-spin" size={14} /> : 'Add Proxy'}
              </button>
            </form>

            {/* Active Rules List */}
            <div>
              <h4 style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '8px' }}>Active Proxy Mappings ({proxyRules.length})</h4>
              <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {proxyRules.length > 0 ? (
                  proxyRules.map((rule) => (
                    <div key={rule.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '12px', display: 'flex', gap: '14px', alignItems: 'center' }}>
                        <span>Path: <code className="mono-font" style={{ color: 'var(--accent-secondary)' }}>/proxy/{rule.path.replace(/^\//, '')}</code></span>
                        <span>➔</span>
                        <span>Port: <strong style={{ color: 'var(--text-primary)' }}>{rule.targetPort}</strong></span>
                      </div>
                      <button 
                        onClick={() => handleDeleteProxyRule(rule.id)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', padding: '16px' }}>
                    No proxy rules defined yet.
                  </div>
                )}
              </div>
            </div>

            <button 
              className="btn btn-secondary" 
              onClick={() => setConfigureFeature(null)}
              style={{ width: '100%', marginTop: '20px', height: '36px', fontSize: '12px' }}
            >
              Close Proxy Manager
            </button>
          </div>
        </div>
      )}

      {/* 3. DDNS Client Configuration Modal */}
      {configureFeature === 'ddns' && (
        <div className="setup-overlay" style={{ zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '540px', width: '100%', padding: '24px', position: 'relative' }}>
            <button 
              onClick={() => setConfigureFeature(null)}
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <XCircle size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', color: '#6366f1' }}>
                <Network size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)' }}>Dynamic DNS (DDNS) Client</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Map dynamic public IP changes to Cloudflare records.</p>
              </div>
            </div>

            <form onSubmit={handleSaveDdns} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                <input 
                  type="checkbox" 
                  id="ddnsCheck" 
                  checked={ddnsEnabled} 
                  onChange={(e) => setDdnsEnabled(e.target.checked)} 
                  style={{ width: 'auto', cursor: 'pointer' }}
                />
                <label htmlFor="ddnsCheck" style={{ margin: 0, cursor: 'pointer', fontSize: '13px' }}>
                  Enable Cloudflare DDNS Sync (Runs every 10 min)
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">DDNS A Record Hostname</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={ddnsHost} 
                  onChange={(e) => setDdnsHost(e.target.value)} 
                  placeholder="e.g. ddns.domain.com"
                  required
                />
              </div>

              {/* Status display */}
              <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>Status: <strong style={{ color: ddnsStatus?.error ? 'var(--color-danger)' : ddnsStatus?.lastSync ? 'var(--color-success)' : 'var(--text-muted)' }}>
                  {ddnsStatus?.error ? 'Sync Error' : ddnsStatus?.lastSync ? 'Active' : 'Disabled / Standby'}
                </strong></div>
                {ddnsStatus?.lastSync && (
                  <div>Last Sync: <strong>{new Date(ddnsStatus.lastSync).toLocaleString()}</strong></div>
                )}
                {ddnsStatus?.lastIp && (
                  <div>Last Synced IP: <code>{ddnsStatus.lastIp}</code></div>
                )}
                {ddnsStatus?.error && (
                  <div style={{ color: 'var(--color-danger)' }}>Error: {ddnsStatus.error}</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={ddnsLoading}
                  style={{ flex: 1 }}
                >
                  {ddnsLoading ? <Loader2 className="animate-spin" size={14} /> : 'Save Settings'}
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setConfigureFeature(null)}
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Port Forwarding Tester Modal */}
      {configureFeature === 'port_test' && (
        <div className="setup-overlay" style={{ zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '24px', position: 'relative' }}>
            <button 
              onClick={() => setConfigureFeature(null)}
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <XCircle size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(236, 72, 153, 0.1)', border: '1px solid rgba(236, 72, 153, 0.2)', color: '#ec4899' }}>
                <Maximize2 size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)' }}>Port Forwarding Tester</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Verify external WAN accessibility of NAS local ports.</p>
              </div>
            </div>

            <form onSubmit={handlePortTest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Port number to test</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={portToTest} 
                    onChange={(e) => setPortToTest(e.target.value)} 
                    placeholder="80"
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={portTesting}
                  style={{ height: '38px', padding: '0 20px' }}
                >
                  {portTesting ? <Loader2 className="animate-spin" size={14} /> : 'Verify Port'}
                </button>
              </div>

              {/* Port Test result display */}
              {portTestResult && (
                <div style={{ 
                  background: 'rgba(255,255,255,0.01)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px', 
                  padding: '16px', 
                  fontSize: '13px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '8px'
                }}>
                  {portTestResult.status === 'open' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)', fontWeight: 600 }}>
                      <CheckCircle2 size={16} />
                      <span>Port {portTestResult.port} is OPEN and visible from the WAN!</span>
                    </div>
                  ) : portTestResult.status === 'closed' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', fontWeight: 600 }}>
                      <XCircle size={16} />
                      <span>Port {portTestResult.port} is CLOSED or filtered.</span>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--color-danger)' }}>
                      Error conducting WAN port scan: {portTestResult.reason}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Tested public IP: <code>{portTestResult.ip || 'Unknown'}</code>
                  </div>
                  {portTestResult.status === 'closed' && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4, borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '6px' }}>
                      💡 Tip: Verify that the website service is running on this port and you have configured a Port Forwarding rule in your ISP router settings.
                    </div>
                  )}
                </div>
              )}

              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setConfigureFeature(null)}
                style={{ width: '100%', height: '36px', fontSize: '12px' }}
              >
                Close
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. Database Automated Backups Configuration Modal */}
      {configureFeature === 'backup' && (
        <div className="setup-overlay" style={{ zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '580px', width: '100%', padding: '24px', position: 'relative' }}>
            <button 
              onClick={() => setConfigureFeature(null)}
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <XCircle size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.2)', color: '#a855f7' }}>
                <Database size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)' }}>Automated Database Backups</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Schedule schema and tables local SQL/JSON backups.</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '20px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1.5 }}>
                <label className="form-label">Auto-Backup Schedule</label>
                <select 
                  className="form-input" 
                  value={databaseBackups.schedule} 
                  onChange={handleBackupSchedule}
                  style={{ height: '36px', fontSize: '13px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                >
                  <option value="disabled">Disabled / Manual Only</option>
                  <option value="hourly">Hourly Sync</option>
                  <option value="daily">Daily Sync</option>
                </select>
              </div>

              <button 
                className="btn btn-primary" 
                onClick={handleRunBackup} 
                disabled={backupLoading}
                style={{ height: '36px', fontSize: '12px', flexShrink: 0 }}
              >
                {backupLoading ? <Loader2 className="animate-spin" size={14} /> : 'Backup Now'}
              </button>
            </div>

            {/* Backups History */}
            <div>
              <h4 style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '8px' }}>Backup Archives ({databaseBackups.history?.length || 0})</h4>
              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {databaseBackups.history && databaseBackups.history.length > 0 ? (
                  databaseBackups.history.map((backup) => (
                    <div key={backup.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <strong style={{ color: 'var(--text-primary)' }} className="mono-font">{backup.filename}</strong>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                          DB: {backup.database} | size: {(backup.sizeBytes / 1024).toFixed(1)} KB | {new Date(backup.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <button 
                        onClick={() => handleDeleteBackup(backup.id)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', padding: '16px' }}>
                    No database backups found in local NAS directory.
                  </div>
                )}
              </div>
            </div>

            <button 
              className="btn btn-secondary" 
              onClick={() => setConfigureFeature(null)}
              style={{ width: '100%', marginTop: '20px', height: '36px', fontSize: '12px' }}
            >
              Close Configuration
            </button>
          </div>
        </div>
      )}

      {/* 6. Theme Toggler Modal */}
      {configureFeature === 'theme' && (
        <div className="setup-overlay" style={{ zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '24px', position: 'relative' }}>
            <button 
              onClick={() => setConfigureFeature(null)}
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <XCircle size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(217, 70, 239, 0.1)', border: '1px solid rgba(217, 70, 239, 0.2)', color: '#d946ef' }}>
                <Palette size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)' }}>System Theme Customizer</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Configure user interface styling tokens.</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', margin: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>Active Theme Mode</span>
                <button 
                  onClick={toggleThemeMode} 
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '36px', textTransform: 'capitalize', width: '130px', justifyContent: 'center' }}
                >
                  {theme === 'dark' ? (
                    <>
                      <Moon size={16} />
                      Dark Mode
                    </>
                  ) : (
                    <>
                      <Sun size={16} style={{ color: 'var(--accent-warning)' }} />
                      Light Mode
                    </>
                  )}
                </button>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                ℹ️ Theme configurations are persisted locally in browser localStorage, automatically adjusting variable scopes and inline gradients upon reload.
              </div>
            </div>

            <button 
              className="btn btn-primary" 
              onClick={() => setConfigureFeature(null)}
              style={{ width: '100%', height: '36px', fontSize: '12px' }}
            >
              Finish Customization
            </button>
          </div>
        </div>
      )}

      {/* 7. Power Scheduling & ECO Mode Configuration Modal */}
      {configureFeature === 'power_schedule' && (
        <div className="setup-overlay" style={{ zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '560px', width: '100%', padding: '24px', position: 'relative' }}>
            <button 
              onClick={() => { setConfigureFeature(null); setShowConfirmAction(null); }}
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <XCircle size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                <Clock size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)' }}>Power Scheduling & ECO Mode</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Automate energy savings for your server.</p>
              </div>
            </div>

            {/* Admin Privilege Warning */}
            {!powerScheduleStatus?.isAdmin && (
              <div style={{ 
                background: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid rgba(239, 68, 68, 0.2)', 
                color: 'var(--color-danger)', 
                padding: '12px', 
                borderRadius: '8px', 
                fontSize: '12px', 
                marginBottom: '16px',
                lineHeight: 1.4
              }}>
                <strong>⚠️ Administrator Privileges Required:</strong> HomeServer is not running as Administrator. Windows Task Scheduler rules cannot be updated. Please run homeserver.exe as Administrator to configure ECO mode.
              </div>
            )}

            {/* Error Message */}
            {powerScheduleStatus?.error && (
              <div style={{ 
                background: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid rgba(239, 68, 68, 0.2)', 
                color: 'var(--color-danger)', 
                padding: '12px', 
                borderRadius: '8px', 
                fontSize: '12px', 
                marginBottom: '16px'
              }}>
                Error: {powerScheduleStatus.error}
              </div>
            )}

            <form onSubmit={handleSavePowerSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', padding: '12px 16px', borderRadius: '10px' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', display: 'block' }}>Enable Power Scheduling</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Automate daily power states</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={powerEnabled} 
                  onChange={(e) => setPowerEnabled(e.target.checked)} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Action Power State</label>
                <select 
                  className="form-input" 
                  value={powerAction} 
                  onChange={(e) => setPowerAction(e.target.value)}
                  style={{ height: '36px', fontSize: '13px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                >
                  <option value="sleep">Sleep (Standby) - Recommended</option>
                  <option value="hibernate">Hibernate - Maximum state-save</option>
                  <option value="shutdown">Full Shutdown - Hardware Dependent Wake</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Shutdown/Sleep Time</label>
                  <input 
                    type="time" 
                    className="form-input" 
                    value={shutdownTime} 
                    onChange={(e) => setShutdownTime(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Wake/Start Time</label>
                  <input 
                    type="time" 
                    className="form-input" 
                    value={startTime} 
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Informational Guidance */}
              <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', fontSize: '12px', lineHeight: '1.4' }}>
                {powerAction === 'shutdown' ? (
                  <span style={{ color: 'var(--accent-warning)' }}>
                    ⚠️ <strong>Notice:</strong> Fully shutting down the PC saves maximum energy, but Windows cannot automatically wake it back up via scheduled tasks. Motherboard RTC Alarms must be configured manually in UEFI/BIOS.
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    💡 <strong>Tip:</strong> Sleep and Hibernate modes are fully compatible with automatic waking. Make sure Windows power options allow "Wake Timers" to run.
                  </span>
                )}
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={powerLoading || (!powerScheduleStatus?.isAdmin && powerEnabled)}
                style={{ width: '100%', height: '38px' }}
              >
                {powerLoading ? <Loader2 className="animate-spin" size={14} /> : 'Save & Apply ECO Schedule'}
              </button>
            </form>

            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '20px', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '12px' }}>Immediate Power Controls</h4>
              
              {showConfirmAction ? (
                <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '16px', borderRadius: '10px', textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: 0, marginBottom: '12px' }}>
                    Are you sure you want to <strong>{showConfirmAction}</strong> the server now? You will lose connection to the dashboard.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button 
                      className="btn btn-primary" 
                      onClick={() => handleManualPowerAction(showConfirmAction)}
                      style={{ background: 'var(--color-danger)', border: 'none', height: '32px', padding: '0 16px', fontSize: '12px' }}
                    >
                      Yes, {showConfirmAction} now
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setShowConfirmAction(null)}
                      style={{ height: '32px', padding: '0 16px', fontSize: '12px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setShowConfirmAction('sleep')}
                    style={{ flex: 1, fontSize: '11px', height: '34px', borderColor: 'rgba(255,255,255,0.1)' }}
                  >
                    Sleep Now
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setShowConfirmAction('hibernate')}
                    style={{ flex: 1, fontSize: '11px', height: '34px', borderColor: 'rgba(255,255,255,0.1)' }}
                  >
                    Hibernate Now
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setShowConfirmAction('shutdown')}
                    style={{ flex: 1, fontSize: '11px', height: '34px', color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                  >
                    Shutdown Now
                  </button>
                </div>
              )}
            </div>

            <button 
              className="btn btn-secondary" 
              onClick={() => { setConfigureFeature(null); setShowConfirmAction(null); }}
              style={{ width: '100%', marginTop: '20px', height: '36px', fontSize: '12px' }}
            >
              Close Panel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FeatureHub;
