import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle, RefreshCw, ShieldAlert, Webhook, ServerCog, Activity, RadioTower, Home, Building2, Wrench } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { BUILD_INFO } from '../../lib/buildInfo';
import { APP_AUDIT_CHECKLIST } from '../../lib/appAuditChecklist';

function StatCard({ icon: Icon, label, value, tone = 'neutral', subtext, to, onClick, actionLabel }) {
  const tones = {
    neutral: { border: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.88)', glow: 'rgba(255,255,255,0.08)' },
    good: { border: 'rgba(0,229,160,0.25)', text: '#00e5a0', glow: 'rgba(0,229,160,0.12)' },
    warn: { border: 'rgba(245,158,11,0.25)', text: '#f59e0b', glow: 'rgba(245,158,11,0.12)' },
    bad: { border: 'rgba(255,71,87,0.25)', text: '#ff4757', glow: 'rgba(255,71,87,0.12)' },
  };
  const style = tones[tone] || tones.neutral;

  const cardContent = (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
        <Icon className="w-4 h-4" style={{ color: style.text }} />
      </div>
      <p className="text-2xl font-700" style={{ color: style.text, fontWeight: 700 }}>{value}</p>
      {subtext ? <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{subtext}</p> : null}
      {(to || onClick) ? (
        <div className="mt-4 flex items-center justify-between text-xs" style={{ color: style.text }}>
          <span>{actionLabel || 'Open details'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      ) : null}
    </>
  );

  const sharedProps = {
    className: 'rounded-2xl p-4 transition-all text-left',
    style: {
      background: '#0d1117',
      border: `1px solid ${style.border}`,
      boxShadow: `0 0 0 1px ${style.glow} inset`,
      textDecoration: 'none',
    },
  };

  if (to) {
    return <Link to={to} {...sharedProps}>{cardContent}</Link>;
  }

  if (onClick) {
    return <button type="button" onClick={onClick} {...sharedProps}>{cardContent}</button>;
  }

  return (
    <div {...sharedProps}>
      {cardContent}
    </div>
  );
}

export default function AdminOpsCenter() {
  const { sentryStatus, sentryConfig } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    companyCount: 0,
    platformUsers: 0,
    webhookFailures: 0,
    syncFailures: 0,
    securityAlerts: 0,
    onlineDrivers: 0,
    sandboxActive: false,
    lastWebhookAt: '',
    lastSyncError: '',
  });
  const [recentCompanies, setRecentCompanies] = useState([]);
  const [onlineDriverRows, setOnlineDriverRows] = useState([]);
  const [pendingWebhookRows, setPendingWebhookRows] = useState([]);
  const [failedSyncRows, setFailedSyncRows] = useState([]);

  async function loadStats() {
    setLoading(true);
    const [companyRes, companyListRes, profileRes, webhookRes, syncRes, securityRes, sandboxRes, onlineDriversRes] = await Promise.all([
      supabase.from('companies').select('id', { count: 'exact', head: true }),
      supabase
        .from('companies')
        .select('id, company_name, onboarding_status, is_approved, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(6),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase
        .from('webhook_logs')
        .select('id, received_at, processed, webhook_type, error_message, raw_payload', { count: 'exact' })
        .eq('processed', false)
        .order('received_at', { ascending: false })
        .limit(20),
      supabase
        .from('sentry_sync_log')
        .select('id, created_at, error_message, status, sync_type, external_id', { count: 'exact' })
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
      supabase
        .from('drivers')
        .select('id, full_name, status, phone, company_id, company_name', { count: 'exact' })
        .in('status', ['online', 'on_trip'])
        .order('updated_at', { ascending: false })
        .limit(12),
    ]);

    setStats({
      companyCount: companyRes.count || 0,
      platformUsers: profileRes.count || 0,
      webhookFailures: webhookRes.count || 0,
      syncFailures: syncRes.count || 0,
      securityAlerts: securityRes.count || 0,
      onlineDrivers: onlineDriversRes.count || 0,
      sandboxActive: !!sandboxRes.data?.is_active,
      lastWebhookAt: webhookRes.data?.[0]?.received_at || '',
      lastSyncError: syncRes.data?.[0]?.error_message || '',
    });
    setRecentCompanies(companyListRes.data || []);
    setOnlineDriverRows(onlineDriversRes.data || []);
    setPendingWebhookRows(webhookRes.data || []);
    setFailedSyncRows(syncRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadStats();
  }, []);

  const webhookTone = stats.webhookFailures === 0 ? 'good' : 'bad';
  const syncTone = stats.syncFailures === 0 ? 'good' : 'warn';
  const securityTone = stats.securityAlerts === 0 ? 'good' : 'warn';
  const focusedPanel = searchParams.get('focus') || '';

  const focusedPanelMeta = useMemo(() => {
    if (focusedPanel === 'drivers') {
      return {
        title: 'Online Drivers',
        description: 'These are the drivers who are active right now. Use this list before dispatching or troubleshooting map coverage.',
      };
    }
    if (focusedPanel === 'companies') {
      return {
        title: 'Subscriber Companies',
        description: 'These are the most recent company records on the platform, so you can quickly check approval and onboarding state.',
      };
    }
    return null;
  }, [focusedPanel]);

  function openFocusPanel(nextFocus) {
    const next = new URLSearchParams(searchParams);
    next.set('focus', nextFocus);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="h-full overflow-y-auto p-6" style={{ color: '#e5e7eb' }}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-700 mb-1" style={{ color: '#c9a84c', fontWeight: 700 }}>Ops Center</h1>
            <p style={{ color: 'rgba(255,255,255,0.45)' }}>One place to check Sentry, webhooks, sandbox health, security alerts, and deployment state.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/admin/platform"
              className="btn-ghost flex items-center gap-2 px-4 py-2 text-sm"
              style={{ textDecoration: 'none' }}
            >
              <Home className="w-4 h-4" />
              Home
            </Link>
            <button onClick={loadStats} className="btn-gold flex items-center gap-2 px-4 py-2 text-sm" disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
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
          <StatCard
            icon={Building2}
            label="Subscriber Companies"
            value={String(stats.companyCount)}
            tone="neutral"
            subtext="Active companies managed on the platform"
            onClick={() => openFocusPanel('companies')}
            actionLabel="Open company summary"
          />
          <StatCard
            icon={RadioTower}
            label="Online Drivers"
            value={String(stats.onlineDrivers)}
            tone={stats.onlineDrivers > 0 ? 'good' : 'neutral'}
            subtext={`${stats.platformUsers} total platform users`}
            onClick={() => openFocusPanel('drivers')}
            actionLabel="Open live driver list"
          />
          <StatCard
            icon={RadioTower}
            label="Sentry API"
            value={sentryStatus.ok ? 'Live' : 'Offline'}
            tone={sentryStatus.ok ? 'good' : 'bad'}
            subtext={sentryConfig?.base_url || 'No base URL saved'}
            to="/admin/sentry"
            actionLabel="Open Sentry config"
          />
          <StatCard
            icon={Webhook}
            label="Webhook Failures"
            value={String(stats.webhookFailures)}
            tone={webhookTone}
            subtext={stats.lastWebhookAt ? `Latest at ${new Date(stats.lastWebhookAt).toLocaleString()}` : 'No failed webhook deliveries logged'}
            to="/admin/logs?tab=webhook_logs&processed=false"
            actionLabel="Open webhook failure log"
          />
          <StatCard
            icon={ServerCog}
            label="Sync Failures"
            value={String(stats.syncFailures)}
            tone={syncTone}
            subtext={stats.lastSyncError || 'No recent Sentry sync errors'}
            to="/admin/logs?tab=sentry_sync_log&status=failed"
            actionLabel="Open sync failure log"
          />
          <StatCard
            icon={ShieldAlert}
            label="Security Alerts"
            value={String(stats.securityAlerts)}
            tone={securityTone}
            subtext={stats.sandboxActive ? 'Sandbox mode is active' : 'Sandbox mode is idle'}
            to="/admin/security?tab=alerts&filter=unacked"
            actionLabel="Open security alerts"
          />
        </div>

        {focusedPanelMeta ? (
          <div className="rounded-2xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>{focusedPanelMeta.title}</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{focusedPanelMeta.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {focusedPanel === 'drivers' ? (
                  <Link to="/" className="btn-ghost px-3 py-2 text-xs" style={{ textDecoration: 'none' }}>
                    Open dispatch map
                  </Link>
                ) : null}
                {focusedPanel === 'companies' ? (
                  <Link to="/admin/companies" className="btn-ghost px-3 py-2 text-xs" style={{ textDecoration: 'none' }}>
                    Open companies page
                  </Link>
                ) : null}
                <button type="button" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })} className="btn-ghost px-3 py-2 text-xs">
                  Close
                </button>
              </div>
            </div>

            {focusedPanel === 'drivers' ? (
              onlineDriverRows.length === 0 ? (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>No drivers are online right now.</p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {onlineDriverRows.map(driver => (
                    <div key={driver.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{driver.full_name || 'Unnamed driver'}</p>
                          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>{driver.phone || 'No phone saved'}</p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-lg capitalize" style={{ background: driver.status === 'on_trip' ? 'rgba(201,168,76,0.12)' : 'rgba(0,229,160,0.12)', color: driver.status === 'on_trip' ? '#c9a84c' : '#00e5a0' }}>
                          {driver.status === 'on_trip' ? 'On trip' : 'Online'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}

            {focusedPanel === 'companies' ? (
              recentCompanies.length === 0 ? (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>No companies are loaded yet.</p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {recentCompanies.map(company => {
                    const approved = Boolean(company.is_approved || String(company.onboarding_status || '').toLowerCase() === 'approved');
                    return (
                      <div key={company.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{company.company_name || 'Unnamed company'}</p>
                            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
                              Updated {new Date(company.updated_at || company.created_at || Date.now()).toLocaleString()}
                            </p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-lg" style={{ background: approved ? 'rgba(0,229,160,0.12)' : 'rgba(245,158,11,0.12)', color: approved ? '#00e5a0' : '#f59e0b' }}>
                            {approved ? 'Approved' : (company.onboarding_status || 'Pending')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : null}
          </div>
        ) : null}

        {(pendingWebhookRows.length > 0 || failedSyncRows.length > 0) ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>Sync Failure Preview</p>
                <Link to="/admin/logs?tab=sentry_sync_log&status=failed" className="text-xs" style={{ color: '#c9a84c', textDecoration: 'none' }}>
                  Open full log
                </Link>
              </div>
              <div className="space-y-2">
                {failedSyncRows.slice(0, 4).map(row => (
                  <div key={row.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs font-700" style={{ color: '#ff4757', fontWeight: 700 }}>{row.sync_type || 'sync failure'}</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>{row.error_message || 'No error message saved'}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>Webhook Failure Preview</p>
                <Link to="/admin/logs?tab=webhook_logs&processed=false" className="text-xs" style={{ color: '#c9a84c', textDecoration: 'none' }}>
                  Open full log
                </Link>
              </div>
              <div className="space-y-2">
                {pendingWebhookRows.slice(0, 4).map(row => (
                  <div key={row.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs font-700" style={{ color: '#f59e0b', fontWeight: 700 }}>{row.webhook_type || row.endpoint || 'Webhook endpoint'}</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>{row.error_message || 'Pending delivery or no explicit error saved yet'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

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
