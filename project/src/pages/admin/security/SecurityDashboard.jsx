import React, { useState } from 'react';
import { Shield, AlertTriangle, Activity, Search, RefreshCw, Zap, ChevronRight, Clock, Target } from 'lucide-react';
import { useSecurity } from '../../../context/SecurityContext';

const SEV_COLOR = {
  critical: '#ff4757',
  high: '#f59e0b',
  medium: '#0ea5e9',
  low: '#00e5a0',
};
const SEV_BG = {
  critical: 'rgba(255,71,87,0.12)',
  high: 'rgba(245,158,11,0.12)',
  medium: 'rgba(14,165,233,0.12)',
  low: 'rgba(0,229,160,0.12)',
};
const STATUS_COLOR = {
  active: '#ff4757',
  investigating: '#f59e0b',
  mitigated: '#00e5a0',
  resolved: '#00e5a0',
  false_positive: 'rgba(255,255,255,0.3)',
};

export default function SecurityDashboard({ onViewThreat }) {
  const { threats, alerts, stats, scanning, runScan, acknowledgeAlert, unacknowledgedAlerts } = useSecurity();
  const [scanResult, setScanResult] = useState(null);

  async function handleScan() {
    const res = await runScan();
    setScanResult(res);
    setTimeout(() => setScanResult(null), 5000);
  }

  const recentThreats = threats.slice(0, 8);
  const unackAlerts = alerts.filter(a => !a.acknowledged).slice(0, 5);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Security Overview</h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            MITRE ATT&amp;CK-mapped threat intelligence &bull; AI-powered detection
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scanResult && (
            <span className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(0,229,160,0.1)', color: '#00e5a0', border: '1px solid rgba(0,229,160,0.2)' }}>
              Scan complete &mdash; {scanResult.threats_created || 0} new threats
            </span>
          )}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-600"
            style={{
              background: scanning ? 'rgba(14,165,233,0.1)' : 'rgba(14,165,233,0.15)',
              border: '1px solid rgba(14,165,233,0.3)',
              color: '#0ea5e9',
              fontWeight: 600,
              cursor: scanning ? 'not-allowed' : 'pointer',
            }}
          >
            {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {scanning ? 'Scanning...' : 'Run AI Scan'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { label: 'Critical', value: stats.critical, color: '#ff4757', bg: 'rgba(255,71,87,0.08)' },
          { label: 'High', value: stats.high, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
          { label: 'Active', value: stats.active, color: '#0ea5e9', bg: 'rgba(14,165,233,0.08)' },
          { label: 'Mitigated', value: stats.mitigated, color: '#00e5a0', bg: 'rgba(0,229,160,0.08)' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 flex flex-col gap-1" style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</p>
            <p className="text-2xl font-700" style={{ color: s.color, fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4" style={{ color: '#ff4757' }} />
              <span className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>Active Threats</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,71,87,0.1)', color: '#ff4757' }}>
              {stats.active}
            </span>
          </div>
          <div className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.04)' }}>
            {recentThreats.length === 0 ? (
              <div className="p-6 text-center">
                <Shield className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.15)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No threats detected</p>
              </div>
            ) : recentThreats.map(t => (
              <button
                key={t.id}
                onClick={() => onViewThreat && onViewThreat(t)}
                className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: SEV_COLOR[t.severity] || '#888' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-500 truncate" style={{ color: '#e5e7eb', fontWeight: 500 }}>{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs" style={{ color: SEV_COLOR[t.severity] }}>{t.severity}</span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{t.technique_id || t.mitre_technique}</span>
                    <span className="text-xs" style={{ color: STATUS_COLOR[t.status] || '#888' }}>{t.status}</span>
                  </div>
                </div>
                <ChevronRight className="w-3 h-3 flex-shrink-0 mt-1" style={{ color: 'rgba(255,255,255,0.2)' }} />
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" style={{ color: '#f59e0b' }} />
              <span className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>Unacknowledged Alerts</span>
            </div>
            {unacknowledgedAlerts > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                {unacknowledgedAlerts}
              </span>
            )}
          </div>
          <div className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.04)' }}>
            {unackAlerts.length === 0 ? (
              <div className="p-6 text-center">
                <Zap className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.15)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>All clear</p>
              </div>
            ) : unackAlerts.map(a => (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                <div
                  className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                  style={{ background: SEV_COLOR[a.severity] || '#888', boxShadow: `0 0 6px ${SEV_COLOR[a.severity]}80` }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-500 truncate" style={{ color: '#e5e7eb', fontWeight: 500 }}>{a.title}</p>
                  <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{a.message}</p>
                </div>
                <button
                  onClick={() => acknowledgeAlert(a.id)}
                  className="text-xs px-2 py-1 rounded-lg flex-shrink-0"
                  style={{ background: 'rgba(0,229,160,0.08)', color: '#00e5a0', border: '1px solid rgba(0,229,160,0.15)' }}
                >
                  ACK
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4" style={{ color: '#0ea5e9' }} />
          <span className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>Threat Severity Distribution</span>
        </div>
        <div className="flex gap-1 h-10 rounded-lg overflow-hidden">
          {['critical', 'high', 'medium', 'low'].map(sev => {
            const count = threats.filter(t => t.severity === sev).length;
            const pct = threats.length ? (count / threats.length) * 100 : 0;
            return pct > 0 ? (
              <div
                key={sev}
                style={{ width: `${pct}%`, background: SEV_BG[sev], border: `1px solid ${SEV_COLOR[sev]}33`, minWidth: 2 }}
                className="flex items-center justify-center"
                title={`${sev}: ${count}`}
              >
                {pct > 8 && <span className="text-xs font-600" style={{ color: SEV_COLOR[sev], fontWeight: 600 }}>{count}</span>}
              </div>
            ) : null;
          })}
          {threats.length === 0 && (
            <div className="flex-1 flex items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>No threat data yet</span>
            </div>
          )}
        </div>
        <div className="flex gap-4 mt-2">
          {['critical', 'high', 'medium', 'low'].map(sev => (
            <div key={sev} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: SEV_COLOR[sev] }} />
              <span className="text-xs capitalize" style={{ color: 'rgba(255,255,255,0.4)' }}>{sev}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
