import React, { useState, useEffect } from 'react';
import { 
  Database,
  Play,
  ShieldAlert,
  Settings,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  Eye,
  EyeOff,
  Code,
  Terminal,
  Activity,
  Trash2,
  Plus,
  Lock,
  Globe,
  RefreshCw
} from 'lucide-react';

function DatabaseMonitor({ API_BASE, databaseStatus }) {
  // Config Form State for Global Connection
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('5432');
  const [user, setUser] = useState('postgres');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('postgres');
  const [ssl, setSsl] = useState(false);

  // Database-Specific Configuration State
  const [editingDb, setEditingDb] = useState(null); // name of db currently being configured
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [dbApiKey, setDbApiKey] = useState('');
  const [dbReadOnly, setDbReadOnly] = useState(true);
  const [allowSelect, setAllowSelect] = useState(true);
  const [allowInsert, setAllowInsert] = useState(false);
  const [allowUpdate, setAllowUpdate] = useState(false);
  const [allowDelete, setAllowDelete] = useState(false);
  const [allowDDL, setAllowDDL] = useState(false);
  const [dbRateLimit, setDbRateLimit] = useState(true);
  const [dbSsl, setDbSsl] = useState(false);
  const [useCustomCreds, setUseCustomCreds] = useState(false);

  // UI status states
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');

  const [dbSaveLoading, setDbSaveLoading] = useState(false);
  const [dbSaveSuccess, setDbSaveSuccess] = useState('');
  const [dbSaveError, setDbSaveError] = useState('');

  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(''); // holds key identifier when copied
  const [activeCodeTab, setActiveCodeTab] = useState('js');

  // Test SQL query tool state
  const [sqlQuery, setSqlQuery] = useState('SELECT version();');
  const [queryResult, setQueryResult] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [selectedTerminalDb, setSelectedTerminalDb] = useState('postgres');

  // Sync state from WebSocket status
  useEffect(() => {
    if (databaseStatus) {
      setHost(databaseStatus.host || '127.0.0.1');
      setPort((databaseStatus.port || 5432).toString());
      setUser(databaseStatus.user || 'postgres');
      setDatabase(databaseStatus.database || 'postgres');
      setSsl(databaseStatus.ssl || false);
      
      if (!selectedTerminalDb || selectedTerminalDb === 'postgres') {
        setSelectedTerminalDb(databaseStatus.database || 'postgres');
      }
    }
  }, [databaseStatus]);

  // Save Settings (Global Default)
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaveSuccess('');
    setSaveLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/database/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: host.trim(),
          port: parseInt(port, 10),
          user: user.trim(),
          password: password,
          database: database.trim(),
          ssl: ssl
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save PG settings.');
      
      setSaveSuccess('Default connection settings updated successfully.');
      setPassword('');
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  // Open configuration for specific database
  const handleConfigureDb = (dbName) => {
    const dbConf = databaseStatus?.databasesConfigs?.[dbName];
    setEditingDb(dbName);
    setDbSaveError('');
    setDbSaveSuccess('');
    
    if (dbConf) {
      setDbHost(dbConf.host || '');
      setDbPort(dbConf.port ? dbConf.port.toString() : '');
      setDbUser(dbConf.user || '');
      setDbPassword(''); // password is masked/write-only
      setDbApiKey(dbConf.apiKey || '');
      const isRo = dbConf.readOnly !== false;
      setDbReadOnly(isRo);
      setAllowSelect(dbConf.allowSelect !== false);
      setAllowInsert(dbConf.allowInsert !== undefined ? dbConf.allowInsert : !isRo);
      setAllowUpdate(dbConf.allowUpdate !== undefined ? dbConf.allowUpdate : !isRo);
      setAllowDelete(dbConf.allowDelete !== undefined ? dbConf.allowDelete : !isRo);
      setAllowDDL(!!dbConf.allowDDL);
      setDbRateLimit(dbConf.rateLimit !== false);
      setDbSsl(!!dbConf.ssl);
      setUseCustomCreds(!!dbConf.user);
    } else {
      setDbHost('');
      setDbPort('');
      setDbUser('');
      setDbPassword('');
      setDbApiKey(generateClientApiKey());
      setDbReadOnly(true);
      setAllowSelect(true);
      setAllowInsert(false);
      setAllowUpdate(false);
      setAllowDelete(false);
      setAllowDDL(false);
      setDbRateLimit(true);
      setDbSsl(false);
      setUseCustomCreds(false);
    }
  };

  const generateClientApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = 'hs_live_';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  };

  // Save specific database configuration
  const handleSaveDbConfig = async (e) => {
    e.preventDefault();
    setDbSaveError('');
    setDbSaveSuccess('');
    setDbSaveLoading(true);

    try {
      const configPayload = {
        readOnly: dbReadOnly,
        allowSelect: allowSelect,
        allowInsert: dbReadOnly ? false : allowInsert,
        allowUpdate: dbReadOnly ? false : allowUpdate,
        allowDelete: dbReadOnly ? false : allowDelete,
        allowDDL: dbReadOnly ? false : allowDDL,
        rateLimit: dbRateLimit,
        apiKey: dbApiKey
      };

      if (useCustomCreds) {
        if (!dbUser.trim()) throw new Error('Database username is required for custom credentials.');
        configPayload.host = dbHost.trim();
        configPayload.port = dbPort ? parseInt(dbPort, 10) : 0;
        configPayload.user = dbUser.trim();
        configPayload.password = dbPassword;
        configPayload.ssl = dbSsl;
      } else {
        // Clear custom credentials so it falls back to default
        configPayload.host = '';
        configPayload.port = 0;
        configPayload.user = '';
        configPayload.password = '';
        configPayload.ssl = false;
      }

      const res = await fetch(`${API_BASE}/api/database/configs/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dbName: editingDb,
          config: configPayload
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save database config.');

      setDbSaveSuccess(`Exposure settings saved for database: ${editingDb}`);
      setDbPassword('');
      setTimeout(() => setEditingDb(null), 1500); // Close editor after delay
    } catch (err) {
      setDbSaveError(err.message);
    } finally {
      setDbSaveLoading(false);
    }
  };

  // Delete/Disable exposure for a database
  const handleDeleteDbConfig = async (dbName) => {
    if (!window.confirm(`Are you sure you want to disable API access for database "${dbName}"?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/database/configs/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbName })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove exposure.');
      }
      alert(`API Access disabled for database "${dbName}".`);
      if (editingDb === dbName) setEditingDb(null);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  // Run a test query in the terminal box
  const handleRunQuery = async () => {
    if (!sqlQuery.trim()) return;
    setQueryError('');
    setQueryResult(null);
    setQueryLoading(true);

    // Use specific database key if available, otherwise fallback to global API key
    const dbConf = databaseStatus?.databasesConfigs?.[selectedTerminalDb];
    const apiKey = dbConf?.apiKey || databaseStatus?.apiKey;

    try {
      const res = await fetch(`${API_BASE}/api/db/${selectedTerminalDb}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'x-app-name': 'SQL Terminal Test'
        },
        body: JSON.stringify({
          query: sqlQuery.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Query failed to execute.');
      
      setQueryResult(data.rows || []);
    } catch (err) {
      setQueryError(err.message);
    } finally {
      setQueryLoading(false);
    }
  };

  const handleCopyKeyText = (keyText, id) => {
    if (!keyText) return;
    navigator.clipboard.writeText(keyText);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // Configured database selection for code snippets
  const [snippetDb, setSnippetDb] = useState('');
  useEffect(() => {
    const exposedDbs = Object.keys(databaseStatus?.databasesConfigs || {});
    if (exposedDbs.length > 0 && !snippetDb) {
      setSnippetDb(exposedDbs[0]);
    } else if (exposedDbs.length === 0) {
      setSnippetDb('');
    }
  }, [databaseStatus?.databasesConfigs]);

  const activeSnippetKey = snippetDb ? databaseStatus?.databasesConfigs?.[snippetDb]?.apiKey : databaseStatus?.apiKey;
  const publicApiUrl = snippetDb 
    ? `https://db.mhservice.co.in/api/db/${snippetDb}/query` 
    : `https://db.mhservice.co.in/api/db/query`;

  const codeSnippets = {
    js: `// Fetch request from React Native / Mobile Javascript
fetch('${publicApiUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': '${activeSnippetKey || 'YOUR_DATABASE_API_KEY'}',
    'x-app-name': 'MyMobileApp', // Monitors your client app name
    'x-device-id': 'unique-installation-device-id' // Optional installation device ID
  },
  body: JSON.stringify({
    query: 'SELECT * FROM users WHERE status = $1',
    params: ['active']
  })
})
.then(res => res.json())
.then(data => console.log('Rows:', data.rows))
.catch(err => console.error(err));`,
    
    swift: `// Swift (iOS) URLRequest Example
var request = URLRequest(url: URL(string: "${publicApiUrl}")!)
request.httpMethod = "POST"
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.setValue("MyMobileApp", forHTTPHeaderField: "x-app-name")
request.setValue("${activeSnippetKey || "YOUR_DATABASE_API_KEY"}", forHTTPHeaderField: "x-api-key")
request.setValue("unique-installation-device-id", forHTTPHeaderField: "x-device-id") // Optional installation device ID

let json: [String: Any] = [
    "query": "SELECT * FROM users WHERE id = $1",
    "params": [42]
]
request.httpBody = try? JSONSerialization.data(withJSONObject: json)

let task = URLSession.shared.dataTask(with: request) { data, response, error in
    // Process JSON result
}`,
    
    kotlin: `// Kotlin (Android okhttp) Example
val mediaType = "application/json; charset=utf-8".toMediaType()
val jsonBody = """
    {
      "query": "SELECT * FROM users LIMIT 10",
      "params": []
    }
""".trimIndent()

val request = Request.Builder()
  .url("${publicApiUrl}")
  .post(jsonBody.toRequestBody(mediaType))
  .addHeader("x-api-key", "${activeSnippetKey || "YOUR_DATABASE_API_KEY"}")
  .addHeader("x-app-name", "MyMobileApp")
  .addHeader("x-device-id", "unique-installation-device-id") // Optional installation device ID
  .build()

client.newCall(request).execute().use { response ->
  println(response.body?.string())
}`
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Top Header */}
      <div className="header-container">
        <div>
          <h1 className="page-title">Database Monitor</h1>
          <p className="page-desc">Expose individual PostgreSQL databases securely with encrypted credentials, database-specific access keys, and client audit logging.</p>
        </div>
      </div>

      {/* Connection & Status Grid */}
      <div className="grid-3">
        {/* Status Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '220px' }}>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Default Server Status
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', marginBottom: '16px' }}>
              <span className={`status-indicator ${databaseStatus?.status === 'connected' ? 'ready' : databaseStatus?.status === 'error' ? 'offline' : 'starting'}`} style={{ width: '12px', height: '12px' }}></span>
              <span style={{ fontSize: '20px', fontWeight: 700, textTransform: 'capitalize' }}>
                {databaseStatus?.status || 'disconnected'}
              </span>
            </div>
            
            {databaseStatus?.status === 'connected' && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>Ping Latency: <strong>{databaseStatus.latency} ms</strong></div>
                <div>Default Database: <strong>{databaseStatus.database}</strong></div>
              </div>
            )}
            
            {databaseStatus?.status === 'error' && (
              <div style={{ fontSize: '13px', color: 'var(--color-danger)', background: 'rgba(239, 68, 68, 0.05)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.1)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebKitLineClamp: 3, WebKitBoxOrient: 'vertical' }}>
                <strong>Error:</strong> {databaseStatus.error}
              </div>
            )}
          </div>
          
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
            Connection: <code>{databaseStatus?.host || '127.0.0.1'}:{databaseStatus?.port || 5432}</code>
          </div>
        </div>

        {/* API Statistics */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: '220px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            API Request Traffic
          </span>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '20px', flexGrow: 1 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Total Requests</span>
              <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {databaseStatus?.metrics?.totalQueries || 0}
              </span>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Avg Execution</span>
              <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-secondary)' }}>
                {databaseStatus?.metrics?.avgResponseTimeMs || 0} <span style={{ fontSize: '12px' }}>ms</span>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
            <span>Success: <strong style={{ color: 'var(--color-success)' }}>{databaseStatus?.metrics?.successQueries || 0}</strong></span>
            <span>Failed: <strong style={{ color: 'var(--color-danger)' }}>{databaseStatus?.metrics?.errorQueries || 0}</strong></span>
          </div>
        </div>

        {/* Global Security Summary */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: '220px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Encryption & API Security
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px', flexGrow: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
              <span>Credentials Storage: <strong style={{ color: 'var(--color-success)' }}>AES-256 Encrypted</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
              <span>Encryption Key: <code>db_master.key</code> local</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <Lock size={14} style={{ color: 'var(--accent-secondary)' }} />
              <span>Exposed databases: <strong>{Object.keys(databaseStatus?.databasesConfigs || {}).length} configured</strong></span>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
            Passwords and usernames are fully encrypted at rest.
          </div>
        </div>
      </div>

      {/* Main Configurations Section */}
      <div className="grid-2">
        {/* PostgreSQL Server Settings */}
        <div className="card">
          <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={20} style={{ color: 'var(--accent-primary)' }} />
            PG Default Connection Settings
          </h3>

          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label" htmlFor="pgHost">Server Host</label>
                <input 
                  type="text" 
                  id="pgHost"
                  className="form-input" 
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" htmlFor="pgPort">Port</label>
                <input 
                  type="number" 
                  id="pgPort"
                  className="form-input" 
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="pgUser">User</label>
                <input 
                  type="text" 
                  id="pgUser"
                  className="form-input" 
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pgPassword">Password</label>
                <input 
                  type="password" 
                  id="pgPassword"
                  className="form-input" 
                  placeholder={databaseStatus?.hasPassword ? "•••••••• (Saved)" : "Enter password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pgDb">Default Database</label>
              <input 
                type="text" 
                id="pgDb"
                className="form-input" 
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input 
                type="checkbox" 
                id="pgSsl" 
                checked={ssl}
                onChange={(e) => setSsl(e.target.checked)}
                style={{ width: 'auto', cursor: 'pointer' }}
              />
              <label htmlFor="pgSsl" style={{ margin: 0, cursor: 'pointer', fontSize: '13px' }}>
                Require SSL (Decrypted Connection)
              </label>
            </div>

            {saveError && (
              <div className="folder-validator invalid" style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <AlertCircle size={14} />
                <span>{saveError}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="folder-validator valid" style={{ padding: '8px 12px', background: 'var(--color-success-glow)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <CheckCircle size={14} />
                <span>{saveSuccess}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={saveLoading}>
              {saveLoading ? 'Saving...' : 'Save & Encrypt Server Settings'}
            </button>
          </form>
        </div>

        {/* Database-Specific API Exposure */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={20} style={{ color: 'var(--accent-secondary)' }} />
            Database Exposure Control
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1 }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Enable access to specific databases by configuring database-specific connection settings and unique API keys.
            </span>

            {/* List of active databases on server */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {databaseStatus?.databases && databaseStatus.databases.length > 0 ? (
                databaseStatus.databases.map((dbName, idx) => {
                  const dbConf = databaseStatus.databasesConfigs?.[dbName];
                  const isExposed = !!dbConf;

                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Database size={16} style={{ color: isExposed ? 'var(--accent-primary)' : 'var(--text-secondary)' }} />
                          <strong style={{ fontSize: '14px' }}>{dbName}</strong>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            onClick={() => handleConfigureDb(dbName)}
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                          >
                            {isExposed ? 'Manage API' : 'Enable API'}
                          </button>
                          {isExposed && (
                            <button 
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleDeleteDbConfig(dbName)}
                              style={{ padding: '4px', borderColor: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)' }}
                              title="Disable public API access"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {isExposed && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                          <div>Creds: <strong>{dbConf.user ? 'Custom (Encrypted)' : 'Shared default'}</strong></div>
                          <div>Access: <strong>{dbConf.readOnly ? 'Read-Only' : ([
                            dbConf.allowSelect !== false && 'SEL',
                            dbConf.allowInsert && 'INS',
                            dbConf.allowUpdate && 'UPD',
                            dbConf.allowDelete && 'DEL',
                            dbConf.allowDDL && 'DDL'
                          ].filter(Boolean).join('/') || 'Custom')}</strong></div>
                          <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <span>Key: <code>{dbConf.apiKey.substring(0, 15)}...</code></span>
                            <button 
                              onClick={() => handleCopyKeyText(dbConf.apiKey, dbName)}
                              style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '10px', padding: 0 }}
                            >
                              {copiedKey === dbName ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                  Please connect to the PostgreSQL server first.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Editing Specific Database Config Modal/Panel Overlay */}
      {editingDb && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '28px', maxHeight: '90%', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={20} style={{ color: 'var(--accent-secondary)' }} />
              API Settings for "{editingDb}"
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '20px' }}>
              Configure API keys, custom database user credentials, and request rate-limiting.
            </span>

            <form onSubmit={handleSaveDbConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Security Toggles & Granular Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="dbReadOnly" style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Enforce Read-Only Access</label>
                  <input 
                    type="checkbox" 
                    id="dbReadOnly" 
                    checked={dbReadOnly} 
                    onChange={(e) => {
                      const isRo = e.target.checked;
                      setDbReadOnly(isRo);
                      if (isRo) {
                        setAllowSelect(true);
                        setAllowInsert(false);
                        setAllowUpdate(false);
                        setAllowDelete(false);
                        setAllowDDL(false);
                      } else {
                        setAllowSelect(true);
                        setAllowInsert(true);
                        setAllowUpdate(true);
                        setAllowDelete(true);
                        setAllowDDL(false);
                      }
                    }} 
                    style={{ width: 'auto', cursor: 'pointer' }}
                  />
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Blocks modifying commands (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, etc.). Recommended for public APIs.
                </span>

                {/* Granular Permissions Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Granular Operation Permissions</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={allowSelect} 
                        onChange={(e) => setAllowSelect(e.target.checked)} 
                        style={{ width: 'auto', cursor: 'pointer' }} 
                      />
                      <span>SELECT (Read)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: dbReadOnly ? 'not-allowed' : 'pointer', opacity: dbReadOnly ? 0.5 : 1 }}>
                      <input 
                        type="checkbox" 
                        checked={dbReadOnly ? false : allowInsert} 
                        disabled={dbReadOnly} 
                        onChange={(e) => {
                          setAllowInsert(e.target.checked);
                          if (e.target.checked) setDbReadOnly(false);
                        }} 
                        style={{ width: 'auto', cursor: dbReadOnly ? 'not-allowed' : 'pointer' }} 
                      />
                      <span>INSERT (Create)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: dbReadOnly ? 'not-allowed' : 'pointer', opacity: dbReadOnly ? 0.5 : 1 }}>
                      <input 
                        type="checkbox" 
                        checked={dbReadOnly ? false : allowUpdate} 
                        disabled={dbReadOnly} 
                        onChange={(e) => {
                          setAllowUpdate(e.target.checked);
                          if (e.target.checked) setDbReadOnly(false);
                        }} 
                        style={{ width: 'auto', cursor: dbReadOnly ? 'not-allowed' : 'pointer' }} 
                      />
                      <span>UPDATE (Modify)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: dbReadOnly ? 'not-allowed' : 'pointer', opacity: dbReadOnly ? 0.5 : 1 }}>
                      <input 
                        type="checkbox" 
                        checked={dbReadOnly ? false : allowDelete} 
                        disabled={dbReadOnly} 
                        onChange={(e) => {
                          setAllowDelete(e.target.checked);
                          if (e.target.checked) setDbReadOnly(false);
                        }} 
                        style={{ width: 'auto', cursor: dbReadOnly ? 'not-allowed' : 'pointer' }} 
                      />
                      <span>DELETE (Remove)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', gridColumn: 'span 2', cursor: dbReadOnly ? 'not-allowed' : 'pointer', opacity: dbReadOnly ? 0.5 : 1 }}>
                      <input 
                        type="checkbox" 
                        checked={dbReadOnly ? false : allowDDL} 
                        disabled={dbReadOnly} 
                        onChange={(e) => {
                          setAllowDDL(e.target.checked);
                          if (e.target.checked) setDbReadOnly(false);
                        }} 
                        style={{ width: 'auto', cursor: dbReadOnly ? 'not-allowed' : 'pointer' }} 
                      />
                      <span>DDL (Schema: CREATE, ALTER, DROP)</span>
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <label htmlFor="dbRateLimit" style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Enable Rate Limiting</label>
                  <input 
                    type="checkbox" 
                    id="dbRateLimit" 
                    checked={dbRateLimit} 
                    onChange={(e) => setDbRateLimit(e.target.checked)} 
                    style={{ width: 'auto', cursor: 'pointer' }}
                  />
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Limits clients to maximum 60 requests per minute from a single IP to protect resources.
                </span>
              </div>

              {/* API Access Key */}
              <div className="form-group">
                <label className="form-label">Database API Access Key</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    className="form-input mono-font" 
                    value={dbApiKey} 
                    onChange={(e) => setDbApiKey(e.target.value)} 
                    required 
                    placeholder="Enter API key"
                  />
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setDbApiKey(generateClientApiKey())}
                    style={{ padding: '0 10px', fontSize: '12px' }}
                  >
                    Generate
                  </button>
                </div>
              </div>

              {/* Custom Credentials Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="useCustomCreds" 
                  checked={useCustomCreds} 
                  onChange={(e) => setUseCustomCreds(e.target.checked)}
                  style={{ width: 'auto', cursor: 'pointer' }}
                />
                <label htmlFor="useCustomCreds" style={{ margin: 0, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  Use separate custom credentials for this database
                </label>
              </div>

              {/* Custom Credentials form fields */}
              {useCustomCreds && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '16px', borderLeft: '2px solid var(--accent-secondary)' }}>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label">Custom Host</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. 127.0.0.1" 
                        value={dbHost} 
                        onChange={(e) => setDbHost(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Custom Port</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        placeholder="e.g. 5432" 
                        value={dbPort} 
                        onChange={(e) => setDbPort(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Custom Username</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Database user name" 
                        value={dbUser} 
                        onChange={(e) => setDbUser(e.target.value)}
                        required={useCustomCreds}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Custom Password</label>
                      <input 
                        type="password" 
                        className="form-input" 
                        placeholder={databaseStatus?.databasesConfigs?.[editingDb]?.hasPassword ? "•••••••• (Saved)" : "Enter password"} 
                        value={dbPassword} 
                        onChange={(e) => setDbPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="checkbox" 
                      id="dbSsl" 
                      checked={dbSsl} 
                      onChange={(e) => setDbSsl(e.target.checked)} 
                      style={{ width: 'auto', cursor: 'pointer' }}
                    />
                    <label htmlFor="dbSsl" style={{ margin: 0, cursor: 'pointer', fontSize: '12px' }}>
                      Require SSL
                    </label>
                  </div>
                </div>
              )}

              {dbSaveError && (
                <div className="folder-validator invalid" style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <AlertCircle size={14} />
                  <span>{dbSaveError}</span>
                </div>
              )}

              {dbSaveSuccess && (
                <div className="folder-validator valid" style={{ padding: '8px 12px', background: 'var(--color-success-glow)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <CheckCircle size={14} />
                  <span>{dbSaveSuccess}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditingDb(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={dbSaveLoading}>
                  {dbSaveLoading ? 'Saving...' : 'Save Config & Encrypt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Code Snippets & Test Query Tool */}
      <div className="grid-2">
        {/* Snippet Tabs */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Code size={20} style={{ color: 'var(--accent-primary)' }} />
              API Code Integration Templates
            </h3>
            
            {/* Exposed DB dropdown selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Code for:</span>
              <select
                className="form-input"
                value={snippetDb}
                onChange={(e) => setSnippetDb(e.target.value)}
                style={{ width: 'auto', padding: '4px 8px', fontSize: '11px', height: 'auto', border: '1px solid var(--border-color)', margin: 0 }}
              >
                <option value="">Default (Global Key)</option>
                {databaseStatus?.databasesConfigs && Object.keys(databaseStatus.databasesConfigs).map((db, idx) => (
                  <option key={idx} value={db}>{db} (API key)</option>
                ))}
              </select>
            </div>
          </div>

          <div className="tabs" style={{ marginBottom: '12px', background: 'rgba(255,255,255,0.01)', padding: '2px' }}>
            <button 
              className={`tab ${activeCodeTab === 'js' ? 'active' : ''}`}
              onClick={() => setActiveCodeTab('js')}
              style={{ flex: 1 }}
            >
              Javascript
            </button>
            <button 
              className={`tab ${activeCodeTab === 'swift' ? 'active' : ''}`}
              onClick={() => setActiveCodeTab('swift')}
              style={{ flex: 1 }}
            >
              iOS (Swift)
            </button>
            <button 
              className={`tab ${activeCodeTab === 'kotlin' ? 'active' : ''}`}
              onClick={() => setActiveCodeTab('kotlin')}
              style={{ flex: 1 }}
            >
              Android (Kotlin)
            </button>
          </div>

          <pre style={{ 
            background: 'var(--terminal-bg)', 
            padding: '16px', 
            borderRadius: '12px', 
            fontSize: '12px', 
            color: '#a9b1d6', 
            fontFamily: 'monospace', 
            overflowX: 'auto', 
            flexGrow: 1,
            lineHeight: 1.6,
            border: '1px solid var(--border-color)',
            maxHeight: '280px'
          }}>
            <code>{codeSnippets[activeCodeTab]}</code>
          </pre>
        </div>

        {/* Live SQL Terminal Box */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={20} style={{ color: 'var(--accent-secondary)' }} />
            SQL Terminal Test Client
          </h3>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>DB:</span>
            <select 
              className="form-input" 
              value={selectedTerminalDb} 
              onChange={(e) => setSelectedTerminalDb(e.target.value)}
              style={{ width: 'auto', padding: '6px 12px', height: 'auto', flexShrink: 0 }}
            >
              {databaseStatus?.databases && databaseStatus.databases.length > 0 ? (
                databaseStatus.databases.map((db, idx) => (
                  <option key={idx} value={db}>{db}</option>
                ))
              ) : (
                <option value="postgres">postgres</option>
              )}
            </select>
            <input 
              type="text" 
              className="form-input mono-font" 
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder="e.g. SELECT * FROM users LIMIT 5;"
            />
            <button 
              className="btn btn-primary"
              disabled={queryLoading || databaseStatus?.status !== 'connected'}
              onClick={handleRunQuery}
              style={{ display: 'inline-flex', gap: '6px' }}
            >
              {queryLoading ? <Loader2 className="animate-spin" size={14} style={{ animation: 'spin 1.5s linear infinite' }} /> : <Play size={14} />}
              Run
            </button>
          </div>

          {queryError && (
            <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: '8px', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
              {queryError}
            </div>
          )}

          {/* Results terminal display */}
          <div style={{ 
            background: 'var(--terminal-bg)', 
            padding: '16px', 
            borderRadius: '12px', 
            fontSize: '12px', 
            color: '#9ece6a', 
            fontFamily: 'monospace', 
            overflow: 'auto', 
            flexGrow: 1,
            maxHeight: '230px',
            border: '1px solid var(--border-color)'
          }}>
            {queryLoading ? (
              <span style={{ color: 'var(--text-secondary)' }}>Executing database query...</span>
            ) : queryResult ? (
              queryResult.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#c0caf5' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {Object.keys(queryResult[0]).map((key, i) => (
                        <th key={i} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--accent-secondary)' }}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.map((row, rIdx) => (
                      <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        {Object.values(row).map((val, cIdx) => (
                          <td key={cIdx} style={{ padding: '6px 8px' }}>
                            {val === null ? 'NULL' : typeof val === 'object' ? JSON.stringify(val) : val.toString()}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>Query executed successfully. 0 rows returned.</span>
              )
            ) : (
              <span style={{ color: 'var(--text-secondary)' }}>SQL terminal ready. Enter a query and click "Run".</span>
            )}
          </div>
        </div>
      </div>

      {/* Live Database API Audit Log */}
      <div className="card">
        <h3 style={{ fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={20} style={{ color: 'var(--accent-primary)' }} />
          Live Database API Audit Log
        </h3>
        
        {databaseStatus?.auditLog && databaseStatus.auditLog.length > 0 ? (
          <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table className="custom-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Timestamp</th>
                  <th style={{ textAlign: 'left' }}>Database</th>
                  <th style={{ textAlign: 'left' }}>Client IP</th>
                  <th style={{ textAlign: 'left' }}>App Name</th>
                  <th style={{ textAlign: 'left' }}>Device ID</th>
                  <th style={{ textAlign: 'left' }}>Query executed</th>
                  <th style={{ textAlign: 'left' }}>Status</th>
                  <th style={{ textAlign: 'left' }}>Latency</th>
                </tr>
              </thead>
              <tbody>
                {databaseStatus.auditLog.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}>
                    <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td style={{ fontWeight: 600 }}>{log.database}</td>
                    <td><code>{log.ip}</code></td>
                    <td>
                      <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                        {log.appName}
                      </span>
                    </td>
                    <td>
                      {log.deviceId ? (
                        <code style={{ fontSize: '11px', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent-secondary)' }}>
                          {log.deviceId}
                        </code>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>—</span>
                      )}
                    </td>
                    <td className="mono-font" style={{ fontSize: '12px', color: 'var(--text-secondary)', maxInlineSize: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.query}>
                      {log.query}
                    </td>
                    <td>
                      {log.success ? (
                        <span style={{ color: 'var(--color-success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={12} /> Success
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-danger)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }} title={log.errorMessage}>
                          <AlertCircle size={12} /> Failed
                        </span>
                      )}
                    </td>
                    <td>
                      <strong style={{ color: log.duration > 200 ? 'var(--color-warning)' : 'var(--text-primary)' }}>
                        {log.duration} ms
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
            No public API access attempts logged yet. Call the REST API from your mobile app to trigger audit logs.
          </div>
        )}
      </div>
    </div>
  );
}

export default DatabaseMonitor;
