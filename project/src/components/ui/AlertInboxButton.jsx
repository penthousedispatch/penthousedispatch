import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const SEVERITY_STYLES = {
  info: { color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  critical: { color: '#ff4757', bg: 'rgba(255,71,87,0.12)' },
};

export default function AlertInboxButton({ scope = 'admin', companyId = null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);

  async function loadAlerts() {
    setLoading(true);
    let query = supabase
      .from('supervisor_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (scope === 'company' && companyId) {
      query = query.contains('payload', { company_id: companyId });
    }

    const { data } = await query;
    setAlerts(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAlerts();
  }, [scope, companyId]);

  useEffect(() => {
    if (open) loadAlerts();
  }, [open]);

  async function resolveAlert(alertId) {
    await supabase
      .from('supervisor_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', alertId);
    setAlerts(prev => prev.map(alert => (
      alert.id === alertId
        ? { ...alert, resolved: true, resolved_at: new Date().toISOString() }
        : alert
    )));
  }

  const unreadCount = useMemo(
    () => alerts.filter(alert => !alert.resolved).length,
    [alerts]
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
        title={scope === 'company' ? 'Company alerts' : 'Admin alerts'}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center"
            style={{ background: '#ff4757', color: '#fff', fontWeight: 700 }}
          >
            {Math.min(unreadCount, 99)}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-32px)] rounded-2xl overflow-hidden z-50"
          style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <div>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>
                {scope === 'company' ? 'Company Trip Alerts' : 'Operations Alerts'}
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {unreadCount} unresolved
              </p>
            </div>
            <button
              onClick={loadAlerts}
              className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="p-5 flex items-center justify-center">
                <RefreshCw className="w-4 h-4 animate-spin" style={{ color: 'rgba(255,255,255,0.35)' }} />
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-5 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                No alerts yet.
              </div>
            ) : (
              alerts.map(alert => {
                const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.warning;
                return (
                  <div key={alert.id} className="px-4 py-3 border-b last:border-b-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: severity.bg, color: severity.color }}
                        >
                          {alert.severity === 'critical'
                            ? <AlertTriangle className="w-4 h-4" />
                            : <Bell className="w-4 h-4" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm" style={{ color: '#e5e7eb', lineHeight: 1.45 }}>{alert.message}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: severity.bg, color: severity.color, fontWeight: 700 }}>
                              {String(alert.alert_type || 'alert').replace(/_/g, ' ')}
                            </span>
                            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                              {alert.created_at ? new Date(alert.created_at).toLocaleString() : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      {!alert.resolved && (
                        <button
                          onClick={() => resolveAlert(alert.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] flex-shrink-0"
                          style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.18)', color: '#00e5a0', fontWeight: 600 }}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
