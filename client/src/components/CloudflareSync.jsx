import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Settings, 
  Plus, 
  Trash2, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle,
  Loader2, 
  HelpCircle,
  Link,
  RefreshCw
} from 'lucide-react';

function CloudflareSync({ API_BASE, servers }) {
  // Settings Form State
  const [accountId, setAccountId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [tunnelId, setTunnelId] = useState('');
  const [domainName, setDomainName] = useState('');
  
  // Settings Status
  const [isConfigured, setIsConfigured] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');

  // Routes List State
  const [routes, setRoutes] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState('');

  // Add Route Form State
  const [subdomain, setSubdomain] = useState('');
  const [targetPort, setTargetPort] = useState('8080');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  // Load saved credentials
  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cloudflare/settings`);
      const data = await res.json();
      
      setAccountId(data.accountId || '');
      setTunnelId(data.tunnelId || '');
      setDomainName(data.domainName || '');
      if (data.hasToken) {
        setApiToken('******'); // Mask token
      }
      
      if (data.accountId && data.hasToken && data.tunnelId) {
        setIsConfigured(true);
        fetchRoutes(); // Load routes if configured
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  };

  // Fetch routes from Cloudflare API
  const fetchRoutes = async () => {
    setRoutesLoading(true);
    setRoutesError('');
    try {
      const res = await fetch(`${API_BASE}/api/cloudflare/routes`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setRoutes(data.routes || []);
    } catch (err) {
      setRoutesError(err.message);
    } finally {
      setRoutesLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [API_BASE]);

  // Save credentials
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsError('');
    setSettingsSuccess('');
    
    if (!accountId.trim() || !apiToken.trim() || !tunnelId.trim() || !domainName.trim()) {
      setSettingsError('All settings fields are required.');
      return;
    }

    setSettingsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cloudflare/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          apiToken: apiToken.trim(),
          tunnelId: tunnelId.trim(),
          domainName: domainName.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings.');
      
      setSettingsSuccess('Cloudflare integration settings saved.');
      setIsConfigured(true);
      if (apiToken !== '******') {
        setApiToken('******');
      }
      // Fetch routes using new config
      setTimeout(fetchRoutes, 500);
    } catch (err) {
      setSettingsError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  // Add a new route
  const handleAddRoute = async (e) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');

    if (!targetPort || parseInt(targetPort) <= 0 || parseInt(targetPort) > 65535) {
      setAddError('Please specify a valid port number.');
      return;
    }

    setAddLoading(true);
    
    // Construct full hostname
    const fullHostname = subdomain.trim() 
      ? `${subdomain.trim()}.${domainName}` 
      : domainName;
      
    const serviceUrl = `http://127.0.0.1:${targetPort}`;

    try {
      const res = await fetch(`${API_BASE}/api/cloudflare/routes/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostname: fullHostname,
          service: serviceUrl
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add route to Cloudflare.');
      
      setAddSuccess(`Route mapped successfully! Created DNS for ${fullHostname}`);
      setSubdomain('');
      fetchRoutes(); // Refresh list
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  // Delete a route
  const handleDeleteRoute = async (hostname) => {
    if (!window.confirm(`Are you sure you want to delete route mapping for ${hostname}? This will also delete its CNAME DNS record from your account.`)) {
      return;
    }

    setRoutesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cloudflare/routes/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete route.');
      
      fetchRoutes(); // Refresh list
    } catch (err) {
      setRoutesError(err.message);
      setRoutesLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Top Header */}
      <div className="header-container">
        <div>
          <h1 className="page-title">Cloudflare Sync</h1>
          <p className="page-desc">Manage your custom domain routes and DNS hostnames directly from this dashboard.</p>
        </div>
      </div>

      <div className="grid-2">
        {/* Settings Form */}
        <div className="card">
          <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={20} style={{ color: 'var(--accent-primary)' }} />
            API Connection Settings
          </h3>

          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="cfAccount">Cloudflare Account ID</label>
              <input 
                type="text" 
                id="cfAccount"
                className="form-input" 
                placeholder="Find in domain overview (32 character hash)"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="cfApiToken">Cloudflare API Token</label>
              <input 
                type="password" 
                id="cfApiToken"
                className="form-input" 
                placeholder="Zero Trust / DNS Write permissions token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="cfTunnelId">Tunnel ID</label>
                <input 
                  type="text" 
                  id="cfTunnelId"
                  className="form-input" 
                  placeholder="UUID of active tunnel"
                  value={tunnelId}
                  onChange={(e) => setTunnelId(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="cfDomain">Domain Name</label>
                <input 
                  type="text" 
                  id="cfDomain"
                  className="form-input" 
                  placeholder="e.g. mhservice.co.in"
                  value={domainName}
                  onChange={(e) => setDomainName(e.target.value)}
                />
              </div>
            </div>

            {settingsError && (
              <div className="folder-validator invalid" style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <AlertCircle size={14} />
                <span>{settingsError}</span>
              </div>
            )}

            {settingsSuccess && (
              <div className="folder-validator valid" style={{ padding: '8px 12px', background: 'var(--color-success-glow)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <CheckCircle size={14} />
                <span>{settingsSuccess}</span>
              </div>
            )}

            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={settingsLoading}
            >
              {settingsLoading ? (
                <>
                  <Loader2 className="animate-spin" size={16} style={{ animation: 'spin 1.5s linear infinite' }} />
                  Saving settings...
                </>
              ) : 'Verify & Save Connection'}
            </button>
          </form>
        </div>

        {/* Add New Route Form */}
        <div className="card" style={{ height: 'fit-content' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={20} style={{ color: 'var(--accent-secondary)' }} />
            Map a New Subdomain
          </h3>

          {!isConfigured ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', padding: '20px 0', textAlign: 'center' }}>
              Configure and save API settings on the left to start adding domain routes.
            </div>
          ) : (
            <form onSubmit={handleAddRoute} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="cfSubdomain">Subdomain</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="text" 
                    id="cfSubdomain"
                    className="form-input" 
                    placeholder="e.g. admin or dev (leave blank for root)"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    style={{ textAlign: 'right' }}
                  />
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>.{domainName}</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="cfTargetPort">Local NAS Port</label>
                <input 
                  type="number" 
                  id="cfTargetPort"
                  className="form-input" 
                  placeholder="e.g. 5000 (app control) or 8080"
                  value={targetPort}
                  onChange={(e) => setTargetPort(e.target.value)}
                />
              </div>

              {/* Quick autofill helper */}
              {servers.length > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                    Quick Autofill from Active Servers:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {servers.map((s, idx) => (
                      <button 
                        key={idx}
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        onClick={() => setTargetPort(s.port.toString())}
                      >
                        Port {s.port}
                      </button>
                    ))}
                    <button 
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '11px', padding: '4px 8px', color: 'var(--accent-primary)' }}
                      onClick={() => setTargetPort('5000')}
                    >
                      Port 5000 (Admin Control)
                    </button>
                  </div>
                </div>
              )}

              {addError && (
                <div className="folder-validator invalid" style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <AlertCircle size={14} />
                  <span>{addError}</span>
                </div>
              )}

              {addSuccess && (
                <div className="folder-validator valid" style={{ padding: '8px 12px', background: 'var(--color-success-glow)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <CheckCircle size={14} />
                  <span>{addSuccess}</span>
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={addLoading}
              >
                {addLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} style={{ animation: 'spin 1.5s linear infinite' }} />
                    Configuring Cloudflare...
                  </>
                ) : (
                  <>
                    <Link size={14} />
                    Map Subdomain Route
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Cloudflare Routes List */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px' }}>Active Hostname Mappings on Cloudflare</h3>
          {isConfigured && (
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={fetchRoutes}
              disabled={routesLoading}
              style={{ display: 'inline-flex', gap: '6px' }}
            >
              <RefreshCw size={12} className={routesLoading ? 'animate-spin' : ''} style={{ animation: routesLoading ? 'spin 1.5s linear infinite' : 'none' }} />
              Refresh
            </button>
          )}
        </div>

        {!isConfigured ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
            Please verify and save your Cloudflare API connection settings above to load active routes.
          </div>
        ) : routesLoading && routes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Loader2 size={24} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent-primary)' }} />
            <span>Fetching routes config from Cloudflare edge...</span>
          </div>
        ) : routesError ? (
          <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', color: 'var(--color-danger)', fontSize: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <AlertCircle size={18} />
            <span>Error loading routes: {routesError}</span>
          </div>
        ) : routes.length > 0 ? (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Public Hostname</th>
                  <th>DNS Target Connection</th>
                  <th>Local Service Mapping</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ fontWeight: 600 }}>
                      <a 
                        href={`https://${route.hostname}`} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="link-text"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        {route.hostname}
                        <ExternalLink size={12} />
                      </a>
                    </td>
                    <td className="mono-font" style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      Proxied CNAME ➜ Tunnel Edge
                    </td>
                    <td className="mono-font" style={{ fontWeight: 600, color: 'var(--accent-secondary)' }}>
                      {route.service}
                    </td>
                    <td>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleDeleteRoute(route.hostname)}
                        style={{ color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.1)' }}
                      >
                        <Trash2 size={12} />
                        Delete Route
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
            No public hostname routes are currently configured on this tunnel. Add one above!
          </div>
        )}
      </div>
    </div>
  );
}

export default CloudflareSync;
