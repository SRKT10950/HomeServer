import React, { useState } from 'react';
import { Play, Loader2, Code, Terminal, Copy, CheckCircle } from 'lucide-react';

function DbQueryConsole({ API_BASE, databaseStatus, authHeader }) {
  const [sqlQuery, setSqlQuery] = useState('SELECT version();');
  const [queryResult, setQueryResult] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [selectedTerminalDb, setSelectedTerminalDb] = useState(databaseStatus?.database || 'postgres');
  const [activeCodeTab, setActiveCodeTab] = useState('js');
  const [copiedCode, setCopiedCode] = useState(false);

  const databasesList = databaseStatus?.databasesList || ['postgres'];
  const globalApiKey = databaseStatus?.apiKey || 'hs_live_xxxxxxxx';

  const handleExecuteQuery = async () => {
    setQueryLoading(true);
    setQueryError('');
    setQueryResult(null);

    try {
      const endpoint = selectedTerminalDb 
        ? `${API_BASE}/api/db/${encodeURIComponent(selectedTerminalDb)}/query`
        : `${API_BASE}/api/db/query`;

      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': globalApiKey
      };
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: sqlQuery.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute query');
      }

      setQueryResult(data.rows);
    } catch (err) {
      setQueryError(err.message);
    } finally {
      setQueryLoading(false);
    }
  };

  const getCodeSnippet = (lang) => {
    const targetUrl = `${window.location.origin}/api/db/${selectedTerminalDb || 'postgres'}/query`;
    if (lang === 'js') {
      return `fetch('${targetUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': '${globalApiKey}',
    'x-app-name': 'MyWebClient'
  },
  body: JSON.stringify({
    query: '${sqlQuery.replace(/'/g, "\\'")}'
  })
})
.then(res => res.json())
.then(data => console.log(data));`;
    }
    if (lang === 'python') {
      return `import requests

url = '${targetUrl}'
headers = {
    'x-api-key': '${globalApiKey}',
    'x-app-name': 'MyPythonApp'
}
payload = {
    'query': '${sqlQuery.replace(/'/g, "\\'")}'
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`;
    }
    if (lang === 'curl') {
      return `curl -X POST '${targetUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-api-key: ${globalApiKey}' \\
  -d '{"query": "${sqlQuery.replace(/"/g, '\\"')}"}'`;
    }
    return '';
  };

  const handleCopyCode = (snippet) => {
    navigator.clipboard.writeText(snippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
            <Terminal size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">SQL Execution Console</h3>
            <p className="text-xs text-slate-400">Test queries & generate SDK integration code</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400">Target Database:</label>
          <select
            value={selectedTerminalDb}
            onChange={(e) => setSelectedTerminalDb(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {databasesList.map(db => (
              <option key={db} value={db}>{db}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <textarea
          value={sqlQuery}
          onChange={(e) => setSqlQuery(e.target.value)}
          rows={4}
          className="w-full bg-slate-950 font-mono text-sm border border-slate-800 text-indigo-300 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
          placeholder="ENTER SQL QUERY..."
        />

        <div className="flex justify-end">
          <button
            onClick={handleExecuteQuery}
            disabled={queryLoading || !sqlQuery.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20"
          >
            {queryLoading ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
            Run Query
          </button>
        </div>
      </div>

      {queryError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm font-mono">
          {queryError}
        </div>
      )}

      {queryResult && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Results ({Array.isArray(queryResult) ? queryResult.length : 0} rows)</span>
          </div>
          <div className="overflow-x-auto max-h-64 rounded-xl border border-slate-800 bg-slate-950">
            {Array.isArray(queryResult) && queryResult.length > 0 ? (
              <table className="w-full text-left font-mono text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 uppercase border-b border-slate-800 sticky top-0">
                  <tr>
                    {Object.keys(queryResult[0]).map(key => (
                      <th key={key} className="px-4 py-3 border-r border-slate-800/50 last:border-r-0">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {queryResult.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/50">
                      {Object.values(row).map((val, vIdx) => (
                        <td key={vIdx} className="px-4 py-2 border-r border-slate-800/50 last:border-r-0 max-w-xs truncate">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-4 text-xs text-slate-500 text-center">Query executed successfully (No rows returned).</div>
            )}
          </div>
        </div>
      )}

      {/* Code Generator Snippets */}
      <div className="pt-4 border-t border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <Code size={14} />
            <span>Client Integration Code</span>
          </div>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {['js', 'python', 'curl'].map(lang => (
              <button
                key={lang}
                onClick={() => setActiveCodeTab(lang)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                  activeCodeTab === lang
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto">
            {getCodeSnippet(activeCodeTab)}
          </pre>
          <button
            onClick={() => handleCopyCode(getCodeSnippet(activeCodeTab))}
            className="absolute top-3 right-3 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-all"
            title="Copy Code"
          >
            {copiedCode ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DbQueryConsole;
