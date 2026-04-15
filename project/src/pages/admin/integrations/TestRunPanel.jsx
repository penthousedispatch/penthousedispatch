import React, { useState } from 'react';
import { CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronRight, Clock, Zap, TerminalSquare } from 'lucide-react';

const LOG_COLOR = { info: 'rgba(255,255,255,0.5)', success: '#00e5a0', error: '#ff4757', warn: '#f59e0b', step: '#0ea5e9' };
const STATUS_CFG = {
  running: { color: '#0ea5e9', icon: RefreshCw, spin: true, label: 'Running…' },
  pass:    { color: '#00e5a0', icon: CheckCircle, spin: false, label: 'Passed' },
  fail:    { color: '#ff4757', icon: XCircle, spin: false, label: 'Failed' },
  partial: { color: '#f59e0b', icon: Clock, spin: false, label: 'Partial' },
};

export default function TestRunPanel({ runs, activePartner }) {
  const [expanded, setExpanded] = useState(null);

  const partnerRuns = activePartner
    ? runs.filter(r => r.partner_id === activePartner.id)
    : runs;

  if (partnerRuns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 rounded-2xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
        <TerminalSquare className="w-10 h-10 mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No test runs yet</p>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Click Test on any partner to start</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-600" style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
        {partnerRuns.length} test run{partnerRuns.length !== 1 ? 's' : ''}{activePartner ? ` for ${activePartner.name}` : ''}
      </p>
      {partnerRuns.map(run => {
        const cfg = STATUS_CFG[run.status] || STATUS_CFG.running;
        const Icon = cfg.icon;
        const isExpanded = expanded === run.id;
        const logs = Array.isArray(run.log_lines) ? run.log_lines : [];

        return (
          <div
            key={run.id}
            className="rounded-xl overflow-hidden"
            style={{ background: '#0d1117', border: `1px solid ${cfg.color}22` }}
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : run.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.spin ? 'animate-spin' : ''}`} style={{ color: cfg.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-500" style={{ color: '#e5e7eb', fontWeight: 500 }}>
                    {run.test_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                  <span className="text-xs" style={{ color: cfg.color }}>{cfg.label}</span>
                  {run.latency_ms > 0 && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{run.latency_ms}ms</span>}
                  {run.http_status && (
                    <span className="text-xs font-mono px-1.5 rounded" style={{ background: run.http_status < 400 ? 'rgba(0,229,160,0.1)' : 'rgba(255,71,87,0.1)', color: run.http_status < 400 ? '#00e5a0' : '#ff4757' }}>
                      HTTP {run.http_status}
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {run.environment} &bull; {new Date(run.created_at).toLocaleString()}
                </p>
              </div>
              {logs.length > 0 && (
                isExpanded
                  ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} />
                  : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} />
              )}
            </button>

            {isExpanded && logs.length > 0 && (
              <div className="border-t px-4 py-3 max-h-52 overflow-y-auto" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.35)' }}>
                <div className="space-y-1 font-mono text-xs">
                  {logs.map((log, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {log.ts && (
                        <span className="flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}>
                          {new Date(log.ts).toLocaleTimeString()}
                        </span>
                      )}
                      <span style={{ color: LOG_COLOR[log.level] || 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{log.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isExpanded && run.error_message && (
              <div className="border-t px-4 py-2" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,71,87,0.04)' }}>
                <p className="text-xs font-mono" style={{ color: '#ff4757' }}>{run.error_message}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
