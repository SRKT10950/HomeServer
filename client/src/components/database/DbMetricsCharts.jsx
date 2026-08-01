import React from 'react';
import { Database, Activity, CheckCircle, AlertCircle } from 'lucide-react';

const DbMetricsCharts = React.memo(({ databaseStatus }) => {
  const isConnected = databaseStatus?.status === 'connected';
  const metrics = databaseStatus?.metrics || { totalQueries: 0, successQueries: 0, errorQueries: 0, avgResponseTimeMs: 0 };
  const databasesCount = databaseStatus?.databasesList ? databaseStatus.databasesList.length : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
        <div className={`p-3 rounded-xl ${isConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
          {isConnected ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400">PostgreSQL Status</p>
          <h4 className="text-lg font-bold text-white capitalize">{databaseStatus?.status || 'Disconnected'}</h4>
          <p className="text-xs text-slate-500">{databaseStatus?.host}:{databaseStatus?.port}</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
        <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
          <Database size={24} />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400">Total Databases</p>
          <h4 className="text-xl font-bold text-white">{databasesCount}</h4>
          <p className="text-xs text-slate-500">Configured databases</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
        <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl">
          <Activity size={24} />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400">Total Executed Queries</p>
          <h4 className="text-xl font-bold text-white">{metrics.totalQueries}</h4>
          <p className="text-xs text-slate-500">{metrics.successQueries} success / {metrics.errorQueries} error</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
        <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
          <Activity size={24} />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400">Average Latency</p>
          <h4 className="text-xl font-bold text-white">{databaseStatus?.latency ? `${databaseStatus.latency} ms` : '0 ms'}</h4>
          <p className="text-xs text-slate-500">Ping duration</p>
        </div>
      </div>
    </div>
  );
});

export default DbMetricsCharts;
