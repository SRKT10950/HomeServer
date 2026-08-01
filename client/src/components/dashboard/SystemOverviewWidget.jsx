import React from 'react';
import { Cpu, HardDrive, Network, Server, Activity } from 'lucide-react';

const formatBytes = (bytes, decimals = 1) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

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

const MiniLineChart = React.memo(({ history, maxVal = 100, colorClass = "" }) => {
  const width = 300;
  const height = 100;
  
  if (!history || history.length === 0) {
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
        
        <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} className="chart-grid-line" />
        <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} className="chart-grid-line" />
        <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} className="chart-grid-line" />

        <path d={areaD} className={`chart-area-path ${colorClass}`} />
        <path d={pathD} className={`chart-line-path ${colorClass}`} />
      </svg>
    </div>
  );
});

const SystemOverviewWidget = React.memo(({ telemetry, cpuHistory, ramHistory }) => {
  const cpuPercent = telemetry?.cpu?.current || 0;
  const ramPercent = telemetry?.ram?.percent || 0;
  const ramUsed = telemetry?.ram?.used || 0;
  const ramTotal = telemetry?.ram?.total || 0;
  const uptime = telemetry?.system?.uptime || 0;
  const hostname = telemetry?.system?.hostname || 'HomeServer';
  const distro = telemetry?.system?.distro || 'Windows';

  return (
    <div className="telemetry-grid">
      {/* CPU Card */}
      <div className="dashboard-card card-glow">
        <div className="card-header">
          <div className="card-title-group">
            <div className="icon-wrapper icon-indigo">
              <Cpu size={20} />
            </div>
            <div>
              <h3 className="card-title">CPU Utilization</h3>
              <p className="card-subtitle">{hostname} ({distro})</p>
            </div>
          </div>
          <span className="metric-badge badge-indigo">{cpuPercent}%</span>
        </div>

        <div className="card-body">
          <MiniLineChart history={cpuHistory} maxVal={100} colorClass="chart-indigo" />
        </div>
      </div>

      {/* RAM Card */}
      <div className="dashboard-card card-glow">
        <div className="card-header">
          <div className="card-title-group">
            <div className="icon-wrapper icon-cyan">
              <HardDrive size={20} />
            </div>
            <div>
              <h3 className="card-title">Memory Usage</h3>
              <p className="card-subtitle">{formatBytes(ramUsed)} / {formatBytes(ramTotal)}</p>
            </div>
          </div>
          <span className="metric-badge badge-cyan">{ramPercent}%</span>
        </div>

        <div className="card-body">
          <MiniLineChart history={ramHistory} maxVal={100} colorClass="chart-cyan" />
        </div>
      </div>

      {/* Network / System Quick Summary */}
      <div className="dashboard-card card-glow">
        <div className="card-header">
          <div className="card-title-group">
            <div className="icon-wrapper icon-amber">
              <Activity size={20} />
            </div>
            <div>
              <h3 className="card-title">System Status</h3>
              <p className="card-subtitle">Uptime & Network activity</p>
            </div>
          </div>
        </div>

        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>System Uptime</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{formatUptime(uptime)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Network Download</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-secondary)' }}>
              {formatBytes(telemetry?.network?.rx || 0)}/s
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Network Upload</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
              {formatBytes(telemetry?.network?.tx || 0)}/s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default SystemOverviewWidget;
