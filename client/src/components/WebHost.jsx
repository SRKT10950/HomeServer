import React, { useState, useEffect } from 'react';
import { 
  FolderOpen, 
  Globe, 
  StopCircle, 
  PlayCircle, 
  ExternalLink, 
  Radio, 
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Settings,
  Check,
  RefreshCw
} from 'lucide-react';

function WebHost({ servers, tunnels, API_BASE, onExposeCloudflare }) {
  const [folderPath, setFolderPath] = useState('');
  const [port, setPort] = useState('8080');
  
  // PHP execution states
  const [phpStatus, setPhpStatus] = useState({ detected: false, phpPath: '', version: '', error: '', isCgi: false });
  const [customPhpPath, setCustomPhpPath] = useState('');
  const [phpLoading, setPhpLoading] = useState(false);
  const [phpSaveFeedback, setPhpSaveFeedback] = useState({ status: 'idle', message: '' });

  // Validation state
  const [pathValidation, setPathValidation] = useState({ status: 'idle', error: '' });
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const handleDelete = async (id) => {
    try {
      await fetch(`${API_BASE}/api/servers/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
    } catch (err) {
      console.error('Error deleting server:', err);
    }
  };

  const fetchPhpStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/php/status`);
      const data = await res.json();
      setPhpStatus(data);
      setCustomPhpPath(data.phpPath || '');
    } catch (err) {
      console.error('Error fetching PHP status:', err);
    }
  };

  const handleSavePhpSettings = async (e) => {
    e.preventDefault();
    setPhpLoading(true);
    setPhpSaveFeedback({ status: 'saving', message: 'Saving PHP settings...' });
    try {
      const res = await fetch(`${API_BASE}/api/php/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phpPath: customPhpPath.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPhpStatus(data.status);
        setCustomPhpPath(data.status.phpPath || '');
        setPhpSaveFeedback({ status: 'success', message: 'Settings saved and refreshed!' });
        setTimeout(() => setPhpSaveFeedback({ status: 'idle', message: '' }), 3000);
      } else {
        throw new Error(data.error || 'Failed to update PHP settings.');
      }
    } catch (err) {
      setPhpSaveFeedback({ status: 'error', message: err.message });
    } finally {
      setPhpLoading(false);
    }
  };

  useEffect(() => {
    fetchPhpStatus();
  }, [API_BASE]);

  // Validate folder path with debounce/effect
  useEffect(() => {
    if (!folderPath.trim()) {
      setPathValidation({ status: 'idle', error: '' });
      return;
    }

    const validate = async () => {
      setPathValidation({ status: 'checking', error: '' });
      try {
        const response = await fetch(`${API_BASE}/api/verify-path`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath })
        });
        const data = await response.json();
        
        if (data.exists && data.isDirectory) {
          setPathValidation({ status: 'valid', error: '' });
        } else if (data.exists && !data.isDirectory) {
          setPathValidation({ status: 'invalid', error: 'Path is a file, must be a directory.' });
        } else {
          setPathValidation({ status: 'invalid', error: data.error || 'Directory does not exist.' });
        }
      } catch (err) {
        setPathValidation({ status: 'invalid', error: 'Could not connect to backend validator.' });
      }
    };

    const timer = setTimeout(validate, 40000000000000000000); // We will call it manually or on blur, or with a standard 500ms debounce
    // Wait, let's do a 500ms debounce
    const actualTimer = setTimeout(validate, 500);

    return () => clearTimeout(actualTimer);
  }, [folderPath, API_BASE]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    
    if (!folderPath.trim()) {
      setFormError('Please specify a local folder path.');
      return;
    }
    if (!port || parseInt(port) <= 0 || parseInt(port) > 65535) {
      setFormError('Please specify a valid port number (1-65535).');
      return;
    }
    if (pathValidation.status !== 'valid') {
      setFormError('Please specify a valid, existing directory.');
      return;
    }

    setLoading(true);
    const siteId = `site_${Date.now()}`;

    try {
      const response = await fetch(`${API_BASE}/api/servers/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: siteId,
          path: folderPath.trim(),
          port: parseInt(port, 10)
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start website server.');
      }

      // Reset form on success
      setFolderPath('');
      setPort((prev) => (parseInt(prev) + 1).toString()); // increment port suggestion
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async (id) => {
    try {
      await fetch(`${API_BASE}/api/servers/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
    } catch (err) {
      console.error('Error stopping server:', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Top Header */}
      <div className="header-container">
        <div>
          <h1 className="page-title">Local Web Hosting</h1>
          <p className="page-desc">Serve directories from this Windows machine statically and share them instantly.</p>
        </div>
      </div>

      <div className="grid-2">
        {/* Form Card */}
        <div className="card" style={{ height: 'fit-content' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={20} style={{ color: 'var(--accent-primary)' }} />
            Host a New Website
          </h3>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="folderPath">Local Folder Path</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  id="folderPath"
                  className="form-input" 
                  placeholder="e.g. C:\project\my-website\dist"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  style={{ paddingRight: '40px' }}
                />
                <FolderOpen 
                  size={16} 
                  style={{ position: 'absolute', right: '16px', top: '14px', color: 'var(--text-muted)' }} 
                />
              </div>
              
              {/* Path Validator Feedback */}
              {pathValidation.status === 'checking' && (
                <div className="folder-validator checking">
                  <Loader2 size={12} style={{ animation: 'spin 1.5s linear infinite' }} />
                  <span>Validating folder path...</span>
                </div>
              )}
              {pathValidation.status === 'valid' && (
                <div className="folder-validator valid">
                  <CheckCircle2 size={12} />
                  <span>Path verified. Ready to host!</span>
                </div>
              )}
              {pathValidation.status === 'invalid' && (
                <div className="folder-validator invalid">
                  <AlertCircle size={12} />
                  <span>{pathValidation.error}</span>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="port">Target HTTP Port</label>
              <input 
                type="number" 
                id="port"
                className="form-input" 
                placeholder="e.g. 8080"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>

            {formError && (
              <div className="folder-validator invalid" style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <AlertCircle size={14} />
                <span>{formError}</span>
              </div>
            )}

            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading || pathValidation.status !== 'valid'}
              style={{ marginTop: '8px' }}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={16} style={{ animation: 'spin 1.5s linear infinite' }} />
                  Launching Server...
                </>
              ) : 'Start Web Server'}
            </button>
          </form>
        </div>

        {/* Right Column Stack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: 'fit-content' }}>
          {/* Info Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: 'fit-content' }}>
            <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HelpCircle size={20} style={{ color: 'var(--accent-secondary)' }} />
              Web Hosting & API Services Tips
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
              HomeServer hosts static folders, runs custom Node.js server scripts, or executes PHP websites from the directory you choose:
            </p>
            <ul style={{ color: 'var(--text-secondary)', fontSize: '13px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', lineHeight: 1.6 }}>
              <li>If a folder contains a <strong>server.js</strong> script, HomeServer executes it using Node (port is passed via <code>process.env.PORT</code>).</li>
              <li>If a folder contains an <strong>index.php</strong> or <code>.php</code> files, HomeServer executes them as a <strong>PHP Web Server</strong>.</li>
              <li>Otherwise, it hosts the folder statically. Make sure it contains an <strong>index.html</strong> landing file.</li>
              <li>Use the <strong>Expose to Web</strong> button on active sites to instantly generate a public HTTPS tunnel link.</li>
            </ul>
          </div>

          {/* PHP Settings Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: 'fit-content' }}>
            <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={20} style={{ color: 'var(--accent-primary)' }} />
              PHP Configuration
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>PHP Support:</span>
              {phpStatus.detected ? (
                <span className="badge badge-active" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                  Active ({phpStatus.version.split(' ')[1] || 'Detected'})
                </span>
              ) : (
                <span className="badge badge-stopped" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                  Not Found
                </span>
              )}
            </div>

            {phpStatus.detected && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.01)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', wordBreak: 'break-all', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>Path:</strong> <code style={{ color: 'var(--accent-secondary)' }}>{phpStatus.phpPath}</code></div>
                <div><strong>Type:</strong> {phpStatus.isCgi ? 'PHP-CGI (FastCGI compatible)' : 'PHP-CLI (CGI emulation fallback)'}</div>
              </div>
            )}

            {!phpStatus.detected && phpStatus.error && (
              <div style={{ fontSize: '12px', color: 'var(--color-warning)', background: 'rgba(245, 158, 11, 0.05)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.15)', lineHeight: 1.5 }}>
                {phpStatus.error}
              </div>
            )}

            <form onSubmit={handleSavePhpSettings} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="phpPath" style={{ fontSize: '12px', marginBottom: '6px', display: 'block' }}>Custom PHP CGI Path</label>
                <input 
                  type="text" 
                  id="phpPath"
                  className="form-input" 
                  style={{ fontSize: '13px', padding: '8px 12px' }}
                  placeholder="e.g. C:\xampp\php\php-cgi.exe"
                  value={customPhpPath}
                  onChange={(e) => setCustomPhpPath(e.target.value)}
                />
              </div>

              {phpSaveFeedback.message && (
                <div style={{ 
                  fontSize: '12px', 
                  color: phpSaveFeedback.status === 'success' ? 'var(--color-success)' : phpSaveFeedback.status === 'error' ? 'var(--color-danger)' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  {phpSaveFeedback.status === 'success' && <CheckCircle2 size={12} />}
                  {phpSaveFeedback.status === 'saving' && <Loader2 size={12} style={{ animation: 'spin 1.5s linear infinite' }} />}
                  <span>{phpSaveFeedback.message}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  type="submit" 
                  className="btn btn-secondary btn-sm"
                  disabled={phpLoading}
                  style={{ flex: 1, justifyContent: 'center', padding: '8px' }}
                >
                  Save & Validate
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm"
                  onClick={fetchPhpStatus}
                  disabled={phpLoading}
                  style={{ padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Refresh status"
                >
                  <RefreshCw size={14} className={phpLoading ? 'animate-spin' : ''} style={{ animation: phpLoading ? 'spin 1.5s linear infinite' : 'none' }} />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Hosted Folders & Services ({servers.length})</h3>

        {servers.length > 0 ? (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Folder Path</th>
                  <th>Type</th>
                  <th>Port</th>
                  <th>Status</th>
                  <th>Local Address</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => {
                  const hasActiveTunnel = tunnels.some(t => t.localPort === server.port && t.status === 'running');
                  
                  return (
                    <tr key={server.id}>
                      <td style={{ fontWeight: 500, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={server.path}>
                        {server.path}
                      </td>
                      <td>
                        <span className={`badge`} style={{ 
                          background: server.type === 'node' 
                            ? 'rgba(6, 182, 212, 0.1)' 
                            : server.type === 'php'
                            ? 'rgba(167, 139, 250, 0.1)' 
                            : 'rgba(255, 255, 255, 0.02)',
                          color: server.type === 'node' 
                            ? 'var(--accent-secondary)' 
                            : server.type === 'php'
                            ? '#a78bfa' 
                            : 'var(--text-secondary)',
                          borderColor: server.type === 'node' 
                            ? 'rgba(6, 182, 212, 0.2)' 
                            : server.type === 'php'
                            ? 'rgba(167, 139, 250, 0.2)'
                            : 'var(--border-color)',
                          fontSize: '11px',
                          fontWeight: 600
                        }}>
                          {server.type === 'node' 
                            ? 'Node.js Server' 
                            : server.type === 'php' 
                            ? 'PHP Web Server' 
                            : 'Static Folder'}
                        </span>
                      </td>
                      <td className="mono-font" style={{ fontWeight: 600 }}>{server.port}</td>
                      <td>
                        <span className={`badge ${
                          server.status === 'running' ? 'badge-active' : 
                          server.status === 'error' ? 'badge-error' : 'badge-stopped'
                        }`}>
                          {server.status === 'running' ? 'Active' : 
                           server.status === 'error' ? 'Port Error' : 'Stopped'}
                        </span>
                        {server.error && (
                          <div style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '4px', maxWidth: '200px' }}>
                            {server.error}
                          </div>
                        )}
                      </td>
                      <td>
                        {server.status === 'running' ? (
                          <a 
                            href={`http://localhost:${server.port}`} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="link-text"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            localhost:{server.port}
                            <ExternalLink size={12} />
                          </a>
                        ) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {server.status === 'running' ? (
                            <>
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleStop(server.id)}
                                style={{ color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.1)' }}
                              >
                                <StopCircle size={14} />
                                Stop
                              </button>
                              
                              <button 
                                className="btn btn-primary btn-sm"
                                onClick={() => onExposeCloudflare(server.port)}
                                style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)', boxShadow: 'none' }}
                              >
                                <Radio size={14} />
                                Expose to Web
                              </button>
                            </>
                          ) : (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  // Re-run server
                                  fetch(`${API_BASE}/api/servers/start`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      id: server.id,
                                      path: server.path,
                                      port: server.port
                                    })
                                  });
                                }}
                              >
                                <PlayCircle size={14} />
                                Start
                              </button>
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleDelete(server.id)}
                                style={{ color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.1)' }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <FolderOpen size={32} style={{ color: 'var(--text-muted)' }} />
            <p style={{ fontSize: '14px' }}>No directories are currently hosted. Start by choosing a folder path above.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default WebHost;
