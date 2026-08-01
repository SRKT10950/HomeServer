import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  RadioTower, 
  StopCircle, 
  PlayCircle, 
  Terminal, 
  ExternalLink, 
  AlertCircle, 
  Loader2, 
  CheckCircle,
  HelpCircle,
  X
} from 'lucide-react';

function TunnelManager({ tunnels, servers, logs, API_BASE, setLogs }) {
  const [tunnelType, setTunnelType] = useState('cloudflare'); // 'cloudflare' or 'rathole'
  const [localPort, setLocalPort] = useState('8080');

  // Cloudflare Account fields
  const [cfMode, setCfMode] = useState('quick'); // 'quick' or 'named'
  const [cfToken, setCfToken] = useState('');
  const [cfCustomUrl, setCfCustomUrl] = useState('');

  // Rathole fields
  const [ratholeServer, setRatholeServer] = useState('');
  const [ratholeToken, setRatholeToken] = useState('');
  const [ratholeService, setRatholeService] = useState('web-service');
  const [ratholePublicUrl, setRatholePublicUrl] = useState('');

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedTunnelLogsId, setSelectedTunnelLogsId] = useState(null);

  const consoleEndRef = useRef(null);

  // Auto-scroll logs terminal
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, selectedTunnelLogsId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (tunnelType === 'rathole' || (tunnelType === 'cloudflare' && cfMode === 'quick')) {
      if (!localPort || parseInt(localPort) <= 0 || parseInt(localPort) > 65535) {
        setFormError('Please specify a valid local port (1-65535).');
        return;
      }
    }

    setLoading(true);

    try {
      if (tunnelType === 'cloudflare') {
        if (cfMode === 'named' && !cfToken.trim()) {
          throw new Error('Cloudflare Tunnel Token is required for Account Tunnels.');
        }

        const tunnelId = `cf_${Date.now()}`;
        const response = await fetch(`${API_BASE}/api/tunnels/start-cloudflare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: tunnelId,
            port: cfMode === 'quick' ? parseInt(localPort, 10) : 0,
            token: cfMode === 'named' ? cfToken.trim() : '',
            customPublicUrl: cfMode === 'named' ? cfCustomUrl.trim() : ''
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to start Cloudflare Tunnel.');
        
        if (cfMode === 'named') {
          setCfToken('');
          setCfCustomUrl('');
        }

        setSelectedTunnelLogsId(tunnelId);
      } else {
        // Rathole
        if (!ratholeServer.trim()) throw new Error('Rathole Server IP/Domain and Port are required (e.g. 1.2.3.4:2333).');
        if (!ratholeToken.trim()) throw new Error('Rathole default token is required.');
        if (!ratholeService.trim()) throw new Error('Rathole service name is required.');

        const tunnelId = `rh_${Date.now()}`;
        const response = await fetch(`${API_BASE}/api/tunnels/start-rathole`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: tunnelId,
            port: parseInt(localPort, 10),
            serverAddr: ratholeServer.trim(),
            defaultToken: ratholeToken.trim(),
            serviceName: ratholeService.trim(),
            customPublicUrl: ratholePublicUrl.trim()
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to start Rathole Client Tunnel.');
        
        // Auto-select logs for the new tunnel
        setSelectedTunnelLogsId(tunnelId);
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async (id) => {
    try {
      await fetch(`${API_BASE}/api/tunnels/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
    } catch (err) {
      console.error('Error stopping tunnel:', err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API_BASE}/api/tunnels/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (selectedTunnelLogsId === id) {
        setSelectedTunnelLogsId(null);
      }
    } catch (err) {
      console.error('Error deleting tunnel:', err);
    }
  };

  const handleRestart = async (tunnel) => {
    try {
      if (tunnel.type === 'cloudflare') {
        await fetch(`${API_BASE}/api/tunnels/start-cloudflare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: tunnel.id,
            port: tunnel.localPort
          })
        });
      } else {
        const c = tunnel.config;
        await fetch(`${API_BASE}/api/tunnels/start-rathole`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: tunnel.id,
            port: tunnel.localPort,
            serverAddr: c.serverAddr,
            defaultToken: c.defaultToken,
            serviceName: c.serviceName,
            customPublicUrl: c.customPublicUrl
          })
        });
      }
    } catch (err) {
      console.error('Error restarting tunnel:', err);
    }
  };

  const activeLogs = selectedTunnelLogsId ? (logs[selectedTunnelLogsId] || []) : [];
  const selectedTunnel = tunnels.find(t => t.id === selectedTunnelLogsId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Top Header */}
      <div className="header-container">
        <div>
          <h1 className="page-title">Tunnel Manager</h1>
          <p className="page-desc">Expose databases, websites, or local microservices to the public internet.</p>
        </div>
      </div>

      {/* Expose Port Panel */}
      <div className="grid-2">
        <div className="card">
          <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RadioTower size={20} style={{ color: 'var(--accent-primary)' }} />
            Expose a Port
          </h3>

          {/* Service Selector Tabs */}
          <div className="form-group">
            <label className="form-label">Tunneling Provider</label>
            <div className="tabs" style={{ marginBottom: '16px' }}>
              <button 
                type="button" 
                className={`tab ${tunnelType === 'cloudflare' ? 'active' : ''}`}
                onClick={() => setTunnelType('cloudflare')}
                style={{ flex: 1 }}
              >
                Cloudflare Tunnel (Zero-Config)
              </button>
              <button 
                type="button" 
                className={`tab ${tunnelType === 'rathole' ? 'active' : ''}`}
                onClick={() => setTunnelType('rathole')}
                style={{ flex: 1 }}
              >
                Rathole Client (Self-Hosted)
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {tunnelType === 'cloudflare' && (
              <div className="form-group">
                <label className="form-label">Cloudflare Setup Type</label>
                <div className="tabs" style={{ marginBottom: '16px', background: 'rgba(255,255,255,0.02)' }}>
                  <button 
                    type="button" 
                    className={`tab ${cfMode === 'quick' ? 'active' : ''}`}
                    onClick={() => setCfMode('quick')}
                    style={{ flex: 1 }}
                  >
                    Quick Tunnel (Free URL)
                  </button>
                  <button 
                    type="button" 
                    className={`tab ${cfMode === 'named' ? 'active' : ''}`}
                    onClick={() => setCfMode('named')}
                    style={{ flex: 1 }}
                  >
                    Account Token (Persistent)
                  </button>
                </div>
              </div>
            )}

            {/* Local Port Input */}
            <div className="form-group">
              <label className="form-label" htmlFor="localPort">
                {tunnelType === 'cloudflare' && cfMode === 'named' 
                  ? 'Local Port (Optional reference)' 
                  : 'Local Port to Expose'}
              </label>
              <input 
                type="number" 
                id="localPort"
                className="form-input" 
                placeholder="e.g. 8080, 5432"
                value={localPort}
                onChange={(e) => setLocalPort(e.target.value)}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {tunnelType === 'cloudflare' && cfMode === 'named'
                  ? 'Informational reference of your local service port. Note: actual routing is configured on dash.cloudflare.com.'
                  : 'Expose any local service running on this port (e.g. web host, React dev server, database).'}
              </div>
            </div>

            {/* Cloudflare Named Tunnel Fields */}
            {tunnelType === 'cloudflare' && cfMode === 'named' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '2px solid var(--accent-primary)', paddingLeft: '16px', margin: '4px 0' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="cfToken">Cloudflare Tunnel Token</label>
                  <textarea 
                    id="cfToken"
                    className="form-input" 
                    rows="3"
                    placeholder="Paste the tunnel token string from dash.cloudflare.com..."
                    value={cfToken}
                    onChange={(e) => setCfToken(e.target.value)}
                    style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Generate this token in your Cloudflare Zero Trust Dashboard (Access {"➜"} Tunnels {"➜"} Add a Tunnel).
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="cfCustomUrl">Public Hostname (Optional URL)</label>
                  <input 
                    type="text" 
                    id="cfCustomUrl"
                    className="form-input" 
                    placeholder="e.g. https://my-server.mydomain.com"
                    value={cfCustomUrl}
                    onChange={(e) => setCfCustomUrl(e.target.value)}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Enter the domain you mapped to this tunnel in Cloudflare so you can click it here.
                  </div>
                </div>
              </div>
            )}

            {/* Rathole Specific Config Inputs */}
            {tunnelType === 'rathole' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '2px solid var(--accent-secondary)', paddingLeft: '16px', margin: '4px 0' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="ratholeServer">Rathole Server Address (IP:Port)</label>
                  <input 
                    type="text" 
                    id="ratholeServer"
                    className="form-input" 
                    placeholder="e.g. 45.76.100.22:2333"
                    value={ratholeServer}
                    onChange={(e) => setRatholeServer(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="ratholeToken">Default Token</label>
                    <input 
                      type="password" 
                      id="ratholeToken"
                      className="form-input" 
                      placeholder="e.g. super_secret"
                      value={ratholeToken}
                      onChange={(e) => setRatholeToken(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ratholeService">Service Name</label>
                    <input 
                      type="text" 
                      id="ratholeService"
                      className="form-input" 
                      placeholder="e.g. web-app"
                      value={ratholeService}
                      onChange={(e) => setRatholeService(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ratholePublicUrl">Custom Public URL (Optional)</label>
                  <input 
                    type="text" 
                    id="ratholePublicUrl"
                    className="form-input" 
                    placeholder="e.g. http://my-site.com"
                    value={ratholePublicUrl}
                    onChange={(e) => setRatholePublicUrl(e.target.value)}
                  />
                </div>
              </div>
            )}

            {formError && (
              <div className="folder-validator invalid" style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <AlertCircle size={14} />
                <span>{formError}</span>
              </div>
            )}

            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading}
              style={{ marginTop: '8px' }}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={16} style={{ animation: 'spin 1.5s linear infinite' }} />
                  Establishing Tunnel Connection...
                </>
              ) : 'Open Public Tunnel'}
            </button>
          </form>
        </div>

        {/* Tip Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: 'fit-content' }}>
          <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HelpCircle size={20} style={{ color: 'var(--accent-secondary)' }} />
            Tunneling Operations
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
            Tunneling enables traffic from the public web to securely bypass local NAT routers and firewalls, reaching your computer without port forwarding.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <div>
              <strong style={{ color: '#f97316' }}>Cloudflare Quick Tunnels:</strong> Best for easy test links, demos, or sharing progress. Automatically hosts a random sub-domain over SSL completely free. No accounts needed!
            </div>
            <div>
              <strong style={{ color: '#06b6d4' }}>Rathole:</strong> Best for high-performance self-hosted networks. Relies on your own VPS server and doesn't route traffic through third-party services.
            </div>
          </div>
        </div>
      </div>

      {/* Active Tunnels List */}
      <div className="card">
        <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Active Tunnels ({tunnels.length})</h3>

        {tunnels.length > 0 ? (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Local Endpoint</th>
                  <th>Public Address</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tunnels.map((tunnel) => (
                  <tr key={tunnel.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td>
                      <span className={`badge ${tunnel.type === 'cloudflare' ? 'badge-cf' : 'badge-rh'}`}>
                        {tunnel.type === 'cloudflare' ? 'Cloudflare' : 'Rathole'}
                      </span>
                    </td>
                    <td className="mono-font" style={{ fontWeight: 600 }}>
                      127.0.0.1:{tunnel.localPort}
                    </td>
                    <td>
                      {tunnel.status === 'running' && tunnel.publicUrl ? (
                        <a 
                          href={tunnel.publicUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="link-text"
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {tunnel.publicUrl}
                          <ExternalLink size={12} />
                        </a>
                      ) : tunnel.status === 'starting' ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Generating link...</span>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${
                        tunnel.status === 'running' ? 'badge-active' : 
                        tunnel.status === 'starting' ? 'badge-starting' : 
                        tunnel.status === 'error' ? 'badge-error' : 'badge-stopped'
                      }`}>
                        {tunnel.status === 'running' ? 'Online' : 
                         tunnel.status === 'starting' ? 'Starting' : 
                         tunnel.status === 'error' ? 'Error' : 'Stopped'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {tunnel.status === 'running' || tunnel.status === 'starting' ? (
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleStop(tunnel.id)}
                            style={{ color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.1)' }}
                          >
                            <StopCircle size={14} />
                            Stop
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleRestart(tunnel)}
                            >
                              <PlayCircle size={14} />
                              Start
                            </button>
                            <button 
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleDelete(tunnel.id)}
                              style={{ color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.1)' }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                        
                        <button 
                          className={`btn btn-secondary btn-sm ${selectedTunnelLogsId === tunnel.id ? 'active' : ''}`}
                          onClick={() => setSelectedTunnelLogsId(selectedTunnelLogsId === tunnel.id ? null : tunnel.id)}
                          style={{ borderColor: selectedTunnelLogsId === tunnel.id ? 'var(--accent-primary)' : 'var(--border-color)' }}
                        >
                          <Terminal size={14} />
                          Logs
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Radio size={32} style={{ color: 'var(--text-muted)' }} />
            <p style={{ fontSize: '14px' }}>No tunnels are currently active. Open a port to share your local services.</p>
          </div>
        )}
      </div>

      {/* Connection Logs Panel */}
      {selectedTunnelLogsId && (
        <div className="card console-container" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="console-header">
            <span className="console-title">
              <span className={`console-dot`} style={{ background: selectedTunnel?.status === 'running' ? 'var(--color-success)' : 'var(--color-warning)' }}></span>
              Live Connection Logs: {selectedTunnel?.type === 'cloudflare' ? 'Cloudflare' : 'Rathole'} (port {selectedTunnel?.localPort})
            </span>
            <button 
              className="btn btn-secondary btn-icon"
              onClick={() => setSelectedTunnelLogsId(null)}
              style={{ padding: '4px', borderRadius: '4px' }}
            >
              <X size={14} />
            </button>
          </div>
          
          <div className="console-body">
            {activeLogs.length > 0 ? (
              activeLogs.map((log, index) => {
                const isError = log.toLowerCase().includes('err') || log.toLowerCase().includes('fail') || log.toLowerCase().includes('error');
                const isSys = log.includes('INF') || log.includes('DBUG') || log.includes('established') || log.includes('run client');
                
                return (
                  <div 
                    key={index} 
                    className={`console-line ${isError ? 'error' : isSys ? 'system' : ''}`}
                  >
                    {log}
                  </div>
                );
              })
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                Waiting for connection events to stream...
              </div>
            )}
            <div ref={consoleEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}

export default TunnelManager;
