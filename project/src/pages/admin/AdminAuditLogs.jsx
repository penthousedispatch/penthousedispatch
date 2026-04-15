import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, RefreshCw, Search } from 'lucide-react';

const TABS = ['api_logs', 'sentry_sync_log', 'webhook_logs'];

export default function AdminAuditLogs() {
  const [tab, setTab] = useState('api_logs');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { loadLogs(); }, [tab]);

  async function loadLogs() {
    setLoading(true);
    let query;
    if (tab === 'api_logs') {
      query = supabase.from('api_logs').select('*').order('created_at', { ascending: false }).limit(200);
    } else if (tab === 'sentry_sync_log') {
      query = supabase.from('sentry_sync_log').select('*').order('created_at', { ascending: false }).limit(200);
    } else {
      query = supabase.from('webhook_logs').select('*').order('received_at', { ascending: false }).limit(200);
    }
    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  }

  const filtered = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return JSON.stringify(l).toLowerCase().includes(q);
  });

  const levelColor = {
    info: '#0ea5e9',
    warn: '#f59e0b',
    warning: '#f59e0b',
    error: '#ff4757',
    success: '#00e5a0',
    failed: '#ff4757',
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ color: '#e5e7eb' }}>
      <div className="flex-shrink-0 px-6 pt-6 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-700" style={{ fontWeight: 700, color: '#c9a84c' }}>Audit Logs</h1>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <input placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 text-xs py-2" style={{ width: 220, fontSize: 12 }} />
            </div>
            <button onClick={loadLogs} className="btn-ghost px-3 py-2 flex items-center gap-1.5 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                background: tab === t ? 'rgba(201,168,76,0.12)' : 'transparent',
                border: `1px solid ${tab === t ? 'rgba(201,168,76,0.3)' : 'transparent'}`,
                color: tab === t ? '#c9a84c' : 'rgba(255,255,255,0.45)',
                fontWeight: tab === t ? 600 : 400,
              }}
            >
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <FileText className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No logs found</p>
          </div>
        ) : (
          <div className="space-y-1 font-mono text-xs">
            {filtered.map((log, i) => {
              const level = log.level || log.status || 'info';
              const color = levelColor[level] || 'rgba(255,255,255,0.5)';
              const ts = log.created_at || log.received_at || '';
              const msg = log.msg || log.sync_type || log.webhook_type || JSON.stringify(log).slice(0, 80);
              const detail = log.detail || log.error_message || '';
              return (
                <div key={log.id || i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-white/5 transition-colors">
                  <span className="flex-shrink-0 w-14 text-right" style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>
                    {ts ? new Date(ts).toLocaleTimeString() : '--:--'}
                  </span>
                  <span className="flex-shrink-0 w-14 font-700" style={{ color, fontWeight: 700, fontSize: 10 }}>{level.toUpperCase()}</span>
                  <span className="flex-1 min-w-0" style={{ color: '#e5e7eb' }}>{msg}</span>
                  {detail && <span className="flex-shrink-0 max-w-xs truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{detail}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
