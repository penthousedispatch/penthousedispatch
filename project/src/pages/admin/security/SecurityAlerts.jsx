import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle, AlertTriangle, Filter, Plus } from 'lucide-react';
import { useSecurity } from '../../../context/SecurityContext';

const SEV_COLOR = { critical: '#ff4757', high: '#f59e0b', medium: '#0ea5e9', low: '#00e5a0' };

export default function SecurityAlerts({ initialFilter = 'all' }) {
  const { alerts, acknowledgeAlert, ingestEvent } = useSecurity();
  const [filter, setFilter] = useState(initialFilter);
  const [showIngest, setShowIngest] = useState(false);
  const [eventType, setEventType] = useState('');
  const [desc, setDesc] = useState('');
  const [sev, setSev] = useState('medium');
  const [ingesting, setIngesting] = useState(false);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const filtered = alerts.filter(a => {
    if (filter === 'unacked') return !a.acknowledged;
    if (filter === 'acked') return a.acknowledged;
    if (filter === 'critical') return a.severity === 'critical';
    return true;
  });

  async function handleIngest() {
    if (!eventType.trim()) return;
    setIngesting(true);
    await ingestEvent(eventType.trim(), desc.trim(), sev, 'manual');
    setEventType('');
    setDesc('');
    setSev('medium');
    setShowIngest(false);
    setIngesting(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Security Alerts</h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {alerts.filter(a => !a.acknowledged).length} unacknowledged of {alerts.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIngest(!showIngest)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl"
            style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Ingest Event
          </button>
          {['all', 'unacked', 'acked', 'critical'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-xs px-2.5 py-1.5 rounded-lg capitalize"
              style={{
                background: filter === f ? 'rgba(14,165,233,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${filter === f ? 'rgba(14,165,233,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: filter === f ? '#0ea5e9' : 'rgba(255,255,255,0.4)',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {showIngest && (
        <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.15)' }}>
          <p className="text-xs font-600" style={{ color: '#c9a84c', fontWeight: 600 }}>INGEST SECURITY EVENT</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Event Type *</label>
              <input
                type="text"
                value={eventType}
                onChange={e => setEventType(e.target.value)}
                placeholder="e.g. brute_force, suspicious_login"
                className="w-full text-xs px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Severity</label>
              <select
                value={sev}
                onChange={e => setSev(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
              >
                {['low', 'medium', 'high', 'critical'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Description</label>
            <input
              type="text"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Describe the event..."
              className="w-full text-xs px-3 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowIngest(false)} className="text-xs px-3 py-1.5 rounded-lg btn-ghost">Cancel</button>
            <button
              onClick={handleIngest}
              disabled={!eventType.trim() || ingesting}
              className="text-xs px-4 py-1.5 rounded-lg font-600"
              style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontWeight: 600 }}
            >
              {ingesting ? 'Ingesting...' : 'Ingest'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Bell className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No alerts match filter</p>
          </div>
        ) : (
          <div className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.04)' }}>
            {filtered.map(a => (
              <div key={a.id} className="flex items-start gap-3 px-4 py-3" style={{ background: a.acknowledged ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <div
                  className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  style={{
                    background: a.acknowledged ? 'rgba(255,255,255,0.15)' : SEV_COLOR[a.severity] || '#888',
                    boxShadow: a.acknowledged ? 'none' : `0 0 6px ${SEV_COLOR[a.severity]}60`,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-500" style={{ color: a.acknowledged ? 'rgba(255,255,255,0.4)' : '#e5e7eb', fontWeight: 500 }}>{a.title}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ background: `${SEV_COLOR[a.severity]}10`, color: SEV_COLOR[a.severity] }}>
                      {a.severity}
                    </span>
                    {a.acknowledged && (
                      <span className="text-xs flex items-center gap-1" style={{ color: '#00e5a0' }}>
                        <CheckCircle className="w-3 h-3" /> ACK
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>{a.message}</p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>{new Date(a.created_at).toLocaleString()}</p>
                </div>
                {!a.acknowledged && (
                  <button
                    onClick={() => acknowledgeAlert(a.id)}
                    className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg"
                    style={{ background: 'rgba(0,229,160,0.07)', border: '1px solid rgba(0,229,160,0.15)', color: '#00e5a0' }}
                  >
                    ACK
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
