import React from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, Zap, Settings, ChevronRight } from 'lucide-react';

const STATUS_CONFIG = {
  pass:     { color: '#00e5a0', bg: 'rgba(0,229,160,0.1)',  border: 'rgba(0,229,160,0.2)',  label: 'Healthy' },
  fail:     { color: '#ff4757', bg: 'rgba(255,71,87,0.1)',  border: 'rgba(255,71,87,0.2)',  label: 'Failed'  },
  partial:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', label: 'Partial' },
  untested: { color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', label: 'Untested' },
  running:  { color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)', border: 'rgba(14,165,233,0.2)', label: 'Testing…' },
};

const CATEGORY_COLOR = {
  dispatch: '#c9a84c', billing: '#0ea5e9', mapping: '#00e5a0',
  analytics: '#f59e0b', communication: '#a78bfa', compliance: '#ff4757', custom: 'rgba(255,255,255,0.4)',
};

export default function PartnerCard({ partner, testing, onTest, onEdit }) {
  const status = testing ? 'running' : (partner.last_test_status || 'untested');
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.untested;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{ background: '#0d1117', border: `1px solid ${cfg.border}` }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-700 flex-shrink-0"
            style={{ background: `${partner.logo_color || '#c9a84c'}18`, border: `1px solid ${partner.logo_color || '#c9a84c'}30`, color: partner.logo_color || '#c9a84c', fontWeight: 700, fontSize: 15 }}
          >
            {partner.logo_initial || partner.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{partner.name}</p>
              <span
                className="text-xs px-1.5 py-0.5 rounded capitalize"
                style={{ background: `${CATEGORY_COLOR[partner.category] || '#888'}15`, color: CATEGORY_COLOR[partner.category] || '#888' }}
              >
                {partner.category}
              </span>
              {partner.sandbox_enabled && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>
                  sandbox
                </span>
              )}
              {partner.prod_enabled && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,229,160,0.1)', color: '#00e5a0' }}>
                  production
                </span>
              )}
            </div>
            <p className="text-xs mt-1 line-clamp-2" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{partner.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
          >
            {testing ? (
              <RefreshCw className="w-3 h-3 animate-spin" style={{ color: cfg.color }} />
            ) : status === 'pass' ? (
              <CheckCircle className="w-3 h-3" style={{ color: cfg.color }} />
            ) : status === 'fail' ? (
              <XCircle className="w-3 h-3" style={{ color: cfg.color }} />
            ) : (
              <Clock className="w-3 h-3" style={{ color: cfg.color }} />
            )}
            <span className="text-xs font-500" style={{ color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
            {partner.last_test_latency > 0 && !testing && (
              <span className="text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>{partner.last_test_latency}ms</span>
            )}
          </div>

          <button
            onClick={() => onTest(partner)}
            disabled={testing}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: testing ? 'rgba(14,165,233,0.05)' : 'rgba(14,165,233,0.1)',
              border: '1px solid rgba(14,165,233,0.2)',
              color: testing ? 'rgba(14,165,233,0.4)' : '#0ea5e9',
              cursor: testing ? 'not-allowed' : 'pointer',
            }}
          >
            <Zap className="w-3 h-3" />
            Test
          </button>

          <button
            onClick={() => onEdit(partner)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
          >
            <Settings className="w-3 h-3" />
            Config
          </button>
        </div>

        {partner.last_test_at && (
          <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Last tested {new Date(partner.last_test_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
