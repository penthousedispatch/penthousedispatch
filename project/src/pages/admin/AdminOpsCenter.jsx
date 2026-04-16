import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, ShieldAlert, Webhook, ServerCog, Activity, RadioTower } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { BUILD_INFO } from '../../lib/buildInfo';
import { APP_AUDIT_CHECKLIST } from '../../lib/appAuditChecklist';

function StatCard({ icon: Icon, label, value, tone = 'neutral', subtext }) {
  const tones = {
    neutral: { border: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.88)', glow: 'rgba(255,255,255,0.08)' },
    good: { border: 'rgba(0,229,160,0.25)', text: '#00e5a0', glow: 'rgba(0,229,160,0.12)' },
    warn: { border: 'rgba(245,158,11,0.25)', text: '#f59e0b', glow: 'rgba(245,158,11,0.12)' },
    bad: { border: 'rgba(255,71,87,0.25)', text: '#ff4757', glow: 'rgba(255,71,87,0.12)' },
  };
  const style = tones[tone] || tones.neutral;
  return (
    <div className="rounded-2xl p-4" style={{ background: '#0d1117', border: `1px solid ${style.border}`, boxShadow: `0 0 0 1px ${style.glow} inset` }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
        <Icon className="w-4 h-4" style={{ color: style.text }} />
      </div>
      <p className="text-2xl font-700" style={{ color: style.text, fontWeight: 700 }}>{value}</p>
      {subtext ? <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{subtext}</p> : null}
    </div>
  );
}

export default function AdminOpsCenter() {
  const { sentryStatus, sentryConfig, drivers } = useApp();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    companyCount: 0,
    platformUsers: 0,
    webhookFailures: 0,
    syncFailures: 0,
    securityAlerts: 0,
    sandboxActive: false,
    lastWebhookAt: '',
    lastSyncError: '',
  });

  async function loadStats() {
    setLoading(true);
    const [companyRes, profileRes, webhookRes, syncRes, securityRes, sandboxRes] = await Promise.all([
      supabase.from('companies').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase
        .from('webhook_logs')
        .select('id, received_at, processed', { count: 'exact' })
        .eq('processed', false)
        .order('received_at', { ascending: false })
        .limit(20),
      supabase
        .from('sentry_sync_log')
        .select('id, created_at, error_message, status', { count: 'exact' })
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('security_alerts')
        .select('id', { count: 'exact' })
        .eq('resolved', false),
      supabase
        .from('test_sandbox_sessions')
        .select('id, is_active, reset_at')
        .eq('is_active', true)
        .order('reset_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setStats({
      companyCount: companyRes.count || 0,
      platformUsers: profileRes.count || 0,
      webhookFailures: webhookRes.count || 0,
      syncFailures: syncRes.count || 0,
      securityAlerts: securityRes.count || 0,
      sandboxActive: !!sandboxRes.data?.is_active,
      lastWebhookAt: webhookRes.data?.[0]?.received_at || '',
      lastSyncError: syncRes.data?.[0]?.error_message || '',
    });
    setLoading(false);
  }

  useEffect(() => {
    loadStats();
  }, []);

  const webhookTone = stats.webhookFailures === 0 ? 'good' : 'bad';
  const syncTone = stats.syncFailures === 0 ? 'good' : 'warn';
  const securityTone = stats.securityAlerts === 0 ? 'good' : 'warn';
  const onlineDrivers = drivers.filter(driver => ['online', 'on_trip'].includes(driver.status)).length;

  return (
    <div className="h-full overflow-y-auto p-6" style={{ color: '#e5e7eb' }}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-700 mb-1" style={{ color: '#c9a84c', fontWeight: 700 }}>Ops Center</h1>
            <p style={{ color: 'rgba(255,255,255,0.45)' }}>One place to check Sentry, webhooks, sandbox health, security alerts, and deployment state.</p>
          </div>
          <button onClick={loadStats} className="btn-gold flex items-center gap-2 px-4 py-2 text-sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="rounded-2xl p-4 flex flex-wrap items-center gap-3" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.18)' }}>
          <Activity className="w-4 h-4" style={{ color: '#c9a84c' }} />
          <span className="text-sm" style={{ color: '#c9a84c', fontWeight: 600 }}>Build</span>
          <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)' }}>
            v{BUILD_INFO.version}
          </span>
          <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)' }}>
            {BUILD_INFO.releaseTag}
          </span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Use this badge to confirm Vercel is showing the latest deploy.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard icon={Activity} label="Subscriber Companies" value={String(stats.companyCount)} tone="neutral" subtext="Active companies managed on the platform" />
          <StatCard icon={RadioTower} label="Online Drivers" value={String(onlineDrivers)} tone={onlineDrivers > 0 ? 'good' : 'neutral'} subtext={`${stats.platformUsers} total platform users`} />
          <StatCard icon={RadioTower} label="Sentry API" value={sentryStatus.ok ? 'Live' : 'Offline'} tone={sentryStatus.ok ? 'good' : 'bad'} subtext={sentryConfig?.base_url || 'No base URL saved'} />
          <StatCard icon={Webhook} label="Webhook Failures" value={String(stats.webhookFailures)} tone={webhookTone} subtext={stats.lastWebhookAt ? `Latest at ${new Date(stats.lastWebhookAt).toLocaleString()}` : 'No failed webhook deliveries logged'} />
          <StatCard icon={ServerCog} label="Sync Failures" value={String(stats.syncFailures)} tone={syncTone} subtext={stats.lastSyncError || 'No recent Sentry sync errors'} />
          <StatCard icon={ShieldAlert} label="Security Alerts" value={String(stats.securityAlerts)} tone={securityTone} subtext={stats.sandboxActive ? 'Sandbox mode is active' : 'Sandbox mode is idle'} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4" style={{ color: '#00e5a0' }} />
              <p className="text-sm font-600" style={{ fontWeight: 600 }}>What’s Healthy</p>
            </div>
            <ul className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              <li>Sentry receiver/provider URLs are generated from your live Supabase project.</li>
              <li>Webhook bearer auth can be used from one shared secret in Sentry config.</li>
              <li>Admin testing, security, and sandbox tools are now grouped under operations-focused pages.</li>
            </ul>
          </div>

          <div className="rounded-2xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4" style={{ color: '#f59e0b' }} />
              <p className="text-sm font-600" style={{ fontWeight: 600 }}>What To Check Next</p>
            </div>
            <ul className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              <li>Confirm the visible build badge matches the latest deployment before testing new features.</li>
              <li>If webhook tests fail with 401, make sure the saved bearer secret matches the header sent by Sentry.</li>
              <li>Use sandbox mode before live routing changes so driver, map, billing, and AI behavior can be verified safely.</li>
            </ul>
          </div>
        </div>

        <div className="rounded-2xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-4 h-4" style={{ color: '#c9a84c' }} />
            <p className="text-sm font-600" style={{ fontWeight: 600 }}>Platform Audit Checklist</p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {APP_AUDIT_CHECKLIST.map(section => (
              <div key={section.section} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: '#c9a84c', fontWeight: 700 }}>
                  {section.section}
                </p>
                <ul className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {section.checks.map(check => (
                    <li key={check} className="flex items-start gap-2">
                      <span style={{ color: '#c9a84c' }}>•</span>
                      <span>{check}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
