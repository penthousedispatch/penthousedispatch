import React, { useState } from 'react';
import { Search, Filter, Target, ChevronRight } from 'lucide-react';
import { useSecurity } from '../../../context/SecurityContext';

const SEV_COLOR = { critical: '#ff4757', high: '#f59e0b', medium: '#0ea5e9', low: '#00e5a0' };
const STATUS_COLOR = {
  active: '#ff4757', investigating: '#f59e0b',
  mitigated: '#00e5a0', resolved: '#00e5a0', false_positive: 'rgba(255,255,255,0.25)',
};

export default function ThreatsList({ onViewThreat }) {
  const { threats } = useSecurity();
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = threats.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.title.toLowerCase().includes(q) || (t.mitre_tactic || '').toLowerCase().includes(q) || (t.technique_id || '').toLowerCase().includes(q);
    const matchSev = sevFilter === 'all' || t.severity === sevFilter;
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchSev && matchStatus;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 180 }}>
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search threats..."
            className="w-full text-xs pl-8 pr-3 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
          />
        </div>
        <div className="flex gap-1.5">
          {['all', 'critical', 'high', 'medium', 'low'].map(s => (
            <button
              key={s}
              onClick={() => setSevFilter(s)}
              className="text-xs px-2.5 py-1.5 rounded-lg capitalize"
              style={{
                background: sevFilter === s ? `${SEV_COLOR[s] || 'rgba(255,255,255,0.08)'}18` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${sevFilter === s ? `${SEV_COLOR[s] || 'rgba(255,255,255,0.3)'}40` : 'rgba(255,255,255,0.06)'}`,
                color: sevFilter === s ? (SEV_COLOR[s] || '#e5e7eb') : 'rgba(255,255,255,0.4)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {['all', 'active', 'investigating', 'mitigated', 'resolved'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="text-xs px-2.5 py-1.5 rounded-lg capitalize"
              style={{
                background: statusFilter === s ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${statusFilter === s ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.06)'}`,
                color: statusFilter === s ? '#c9a84c' : 'rgba(255,255,255,0.4)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <span className="text-xs font-600" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
            {filtered.length} threat{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Target className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No threats found</p>
          </div>
        ) : (
          <div className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.04)' }}>
            {filtered.map(t => (
              <button
                key={t.id}
                onClick={() => onViewThreat && onViewThreat(t)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SEV_COLOR[t.severity] || '#888' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-500 truncate" style={{ color: '#e5e7eb', fontWeight: 500 }}>{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs capitalize" style={{ color: SEV_COLOR[t.severity] }}>{t.severity}</span>
                    {t.technique_id && (
                      <span className="text-xs font-mono" style={{ color: 'rgba(14,165,233,0.7)' }}>{t.technique_id}</span>
                    )}
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{t.mitre_tactic}</span>
                    <span className="text-xs capitalize" style={{ color: STATUS_COLOR[t.status] || '#888' }}>{t.status?.replace('_', ' ')}</span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>conf: {t.confidence}%</span>
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.2)' }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
