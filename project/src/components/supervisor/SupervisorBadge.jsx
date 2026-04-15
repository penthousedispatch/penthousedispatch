import React, { useState, useEffect, useRef } from 'react';
import { Bot, RefreshCw, X, AlertTriangle, WifiOff, MessageSquare, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { fbListen, fbSet } from '../../lib/firebase';

const ALERT_EXPIRY_MS = 30 * 60 * 1000;

export default function SupervisorBadge() {
  const { sentryStatus, drivers, trips } = useApp();
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState('alerts');
  const sosUnsubRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(runChecks, 120000);
    setTimeout(runChecks, 3000);

    sosUnsubRef.current = fbListen('sos_alerts', (data) => {
      if (!data) return;
      Object.entries(data).forEach(([driverId, alert]) => {
        if (alert.status === 'active' && Date.now() - alert.triggeredAt < ALERT_EXPIRY_MS) {
          addAlert({
            id: `sos_${driverId}`,
            type: 'sos',
            severity: 'critical',
            title: 'SOS Alert',
            message: `${alert.driverName || 'Driver'} triggered emergency`,
            action: async () => {
              await fbSet(`sos_alerts/${driverId}/status`, 'acknowledged');
              removeAlert(`sos_${driverId}`);
            },
            actionLabel: 'Acknowledge',
            ts: alert.triggeredAt,
          });
        }
      });
    });

    return () => {
      clearInterval(interval);
      if (sosUnsubRef.current) sosUnsubRef.current();
    };
  }, [drivers, trips, sentryStatus]);

  function addAlert(alert) {
    setAlerts(prev => {
      const exists = prev.find(a => a.id === alert.id);
      if (exists) return prev;
      return [alert, ...prev];
    });
    if (!open) {
      if (navigator.vibrate) navigator.vibrate(200);
    }
  }

  function removeAlert(id) {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  async function runChecks() {
    setRunning(true);
    const newLogs = [];
    const addLog = (bot, msg, level = 'info') => {
      newLogs.push({ bot, msg, level, time: new Date().toLocaleTimeString() });
    };

    const now = Date.now();

    addLog('ALPHA', `Checking ${trips.length} trips, ${drivers.length} drivers...`);

    if (trips.length === 0) {
      addLog('ALPHA', 'No trips loaded — click Refresh in Live Dispatch', 'error');
    } else {
      addLog('ALPHA', `${trips.length} trips available`);
    }

    if (!sentryStatus.ok && sentryStatus.checked) {
      addLog('GAMMA', `Sentry API offline: ${sentryStatus.error || 'Auth failed'}`, 'error');
    } else if (sentryStatus.ok) {
      addLog('GAMMA', `Sentry API connected — ${sentryStatus.latency}ms`);
    }

    const onlineDrivers = drivers.filter(d => d.status === 'online' || d.status === 'on_trip');
    addLog('BETA', `${onlineDrivers.length}/${drivers.length} drivers online`);

    drivers.forEach(driver => {
      if (driver.status === 'online' || driver.status === 'on_trip') {
        const lastUpdate = driver.last_location_update ? new Date(driver.last_location_update).getTime() : 0;
        if (lastUpdate > 0 && now - lastUpdate > 10 * 60 * 1000) {
          const mins = Math.floor((now - lastUpdate) / 60000);
          const alertId = `gps_stale_${driver.id}`;
          addLog('BETA', `${driver.full_name} — GPS not updated ${mins}m`, 'error');
          addAlert({
            id: alertId,
            type: 'gps',
            severity: 'warning',
            title: 'GPS Not Moving',
            message: `${driver.full_name} — no GPS update for ${mins} min`,
            action: () => removeAlert(alertId),
            actionLabel: 'Dismiss',
            ts: now,
          });
        }

        const lastSeenStr = driver.last_location_update;
        if (!lastSeenStr) return;
        const lastSeen = new Date(lastSeenStr).getTime();
        if (now - lastSeen > 15 * 60 * 1000) {
          const mins = Math.floor((now - lastSeen) / 60000);
          const alertId = `offline_${driver.id}`;
          addAlert({
            id: alertId,
            type: 'offline',
            severity: 'warning',
            title: 'Driver Offline',
            message: `${driver.full_name} — offline for ${mins} min`,
            action: () => removeAlert(alertId),
            actionLabel: 'Dismiss',
            ts: now,
          });
        }
      }
    });

    const { data: stuck } = await supabase
      .from('trip_assignments')
      .select('trip_id, assigned_at')
      .eq('status', 'pending')
      .lt('assigned_at', new Date(now - 30 * 60000).toISOString());

    if (stuck?.length > 0) {
      addLog('BETA', `${stuck.length} trips stuck in pending >30min`, 'error');
      addAlert({
        id: `stuck_trips_${now}`,
        type: 'trip',
        severity: 'warning',
        title: 'Stuck Trips',
        message: `${stuck.length} trips pending >30 min — reassign needed`,
        action: () => removeAlert(`stuck_trips_${now}`),
        actionLabel: 'Dismiss',
        ts: now,
      });
    } else {
      addLog('BETA', 'No stuck trips');
    }

    const { data: unanswered } = await supabase
      .from('chat_threads')
      .select('id, driver_id, last_message_at, drivers(full_name)')
      .lt('last_message_at', new Date(now - 5 * 60000).toISOString())
      .order('last_message_at', { ascending: false })
      .limit(5);

    if (unanswered?.length > 0) {
      unanswered.forEach(thread => {
        const alertId = `chat_${thread.id}`;
        const mins = Math.floor((now - new Date(thread.last_message_at).getTime()) / 60000);
        if (mins >= 5) {
          addAlert({
            id: alertId,
            type: 'chat',
            severity: 'info',
            title: 'Unanswered Chat',
            message: `${thread.drivers?.full_name || 'Driver'} — no reply for ${mins} min`,
            action: () => removeAlert(alertId),
            actionLabel: 'Dismiss',
            ts: now,
          });
        }
      });
    }

    setAlerts(prev => prev.filter(a => now - (a.ts || 0) < ALERT_EXPIRY_MS));
    setLogs(prev => [...newLogs, ...prev].slice(0, 30));
    setRunning(false);
  }

  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const hasAlerts = alerts.length > 0;
  const statusColor = criticalAlerts.length > 0 ? '#ff4757' : hasAlerts ? '#f59e0b' : '#00e5a0';

  const alertIcon = (type) => {
    switch (type) {
      case 'sos': return <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#ff4757' }} />;
      case 'gps': return <WifiOff className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />;
      case 'offline': return <WifiOff className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />;
      case 'chat': return <MessageSquare className="w-3.5 h-3.5" style={{ color: '#0ea5e9' }} />;
      case 'trip': return <Clock className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />;
      default: return <Bot className="w-3.5 h-3.5" style={{ color: '#c9a84c' }} />;
    }
  };

  const severityBg = (sev) => {
    switch (sev) {
      case 'critical': return 'rgba(255,71,87,0.08)';
      case 'warning': return 'rgba(245,158,11,0.06)';
      default: return 'rgba(14,165,233,0.06)';
    }
  };

  const severityBorder = (sev) => {
    switch (sev) {
      case 'critical': return 'rgba(255,71,87,0.25)';
      case 'warning': return 'rgba(245,158,11,0.2)';
      default: return 'rgba(14,165,233,0.2)';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="absolute bottom-12 right-0 w-80 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(13,17,23,0.98)', border: `1px solid ${statusColor}30`, backdropFilter: 'blur(16px)', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4" style={{ color: '#c9a84c' }} />
              <span className="text-sm font-700" style={{ fontWeight: 700, color: '#e5e7eb' }}>Supervisor Bots</span>
              {alerts.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-700"
                  style={{ background: `${statusColor}20`, color: statusColor, fontWeight: 700 }}>
                  {alerts.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={runChecks} disabled={running} className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost">
                <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            {['alerts', 'logs'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="flex-1 py-2 text-xs font-600 capitalize transition-all"
                style={{ fontWeight: 600, color: tab === t ? '#c9a84c' : 'rgba(255,255,255,0.4)', background: tab === t ? 'rgba(201,168,76,0.06)' : 'transparent', borderBottom: tab === t ? '2px solid #c9a84c' : '2px solid transparent' }}>
                {t} {t === 'alerts' && alerts.length > 0 ? `(${alerts.length})` : ''}
              </button>
            ))}
          </div>

          <div className="max-h-72 overflow-y-auto p-2 space-y-1.5">
            {tab === 'alerts' ? (
              alerts.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: 'rgba(0,229,160,0.1)' }}>
                    <Bot className="w-4 h-4" style={{ color: '#00e5a0' }} />
                  </div>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>All clear — no alerts</p>
                </div>
              ) : (
                alerts.map(alert => (
                  <div key={alert.id} className="rounded-xl p-3"
                    style={{ background: severityBg(alert.severity), border: `1px solid ${severityBorder(alert.severity)}` }}>
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">{alertIcon(alert.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-700" style={{ fontWeight: 700, color: '#e5e7eb' }}>{alert.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{alert.message}</p>
                      </div>
                    </div>
                    {alert.action && (
                      <button onClick={alert.action}
                        className="mt-2 w-full py-1 rounded-lg text-xs font-600"
                        style={{ fontWeight: 600, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}>
                        {alert.actionLabel}
                      </button>
                    )}
                  </div>
                ))
              )
            ) : (
              logs.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Running checks...</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg"
                    style={{ background: log.level === 'error' ? 'rgba(255,71,87,0.05)' : 'transparent' }}>
                    <span className="text-xs font-700 w-10 flex-shrink-0"
                      style={{ color: log.bot === 'ALPHA' ? '#0ea5e9' : log.bot === 'BETA' ? '#00e5a0' : '#c9a84c', fontWeight: 700 }}>
                      {log.bot}
                    </span>
                    <span className="text-xs flex-1" style={{ color: log.level === 'error' ? '#ff4757' : 'rgba(255,255,255,0.6)' }}>{log.msg}</span>
                    <span className="text-xs flex-shrink-0 font-mono" style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>{log.time}</span>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
        style={{ background: 'rgba(13,17,23,0.95)', border: `1px solid ${statusColor}40`, backdropFilter: 'blur(8px)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
      >
        <Bot className="w-4 h-4" style={{ color: '#c9a84c' }} />
        <span className="text-xs font-700" style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>Supervisors</span>
        {alerts.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-xs font-700"
            style={{ background: `${statusColor}20`, color: statusColor, fontWeight: 700, fontSize: 10 }}>
            {alerts.length}
          </span>
        )}
        <div className="w-2 h-2 rounded-full" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
      </button>
    </div>
  );
}
