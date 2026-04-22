import React, { useState, useEffect } from 'react';
import { Save, TestTube, Copy, Eye, EyeOff, CheckCircle, AlertCircle, RefreshCw, Download, ChevronRight, Zap, Wifi, WifiOff, Clock, ArrowRight, Sun, Moon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { sentryApi } from '../../lib/sentryApi';
import { getEdgeFunctionHeaders } from '../../lib/edgeHeaders';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import PayRatesSection from './PayRatesSection';
import { handleSupabaseError, toastError, toastSuccess } from '../../utils/errorHandler';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;
const CLOUD_PROVIDERS = [
  { id: 'aws', name: 'Amazon Web Services', icon: '☁️', desc: 'EC2, S3, Lambda, RDS', color: '#FF9900' },
  { id: 'gcp', name: 'Google Cloud Platform', icon: '🌐', desc: 'Compute, BigQuery, Maps', color: '#4285F4' },
  { id: 'azure', name: 'Microsoft Azure', icon: '🔷', desc: 'Functions, CosmosDB, AKS', color: '#0078D4' },
  { id: 'ibm', name: 'IBM Cloud', icon: '🔵', desc: 'Watson AI, OpenShift, Db2', color: '#1F70C1' },
];

const SYNC_STATUS_COLORS = { success: '#00e5a0', failed: '#ff4757', pending: '#c9a84c', skipped: 'rgba(255,255,255,0.3)' };

export default function SettingsPanel() {
  const { org, checkSentryHealth, sentryStatus, syncDriversFromSentry } = useApp();
  const { theme, toggle: toggleTheme } = useTheme();
  const [sentryForm, setSentryForm] = useState({ base_url: 'https://dsp-integration.test.sentryms.com', username: '', password_enc: '', api_key: '', auth_type: 'basic', sandbox: true, enabled: true });
  const [generalForm, setGeneralForm] = useState({ google_maps_key: 'AIzaSyD5sugXJ0HIUwkVlixF5qdoN-l0McgAQM4', revenue_target: 60, mile_threshold: 25, driver_wait_mins: 5 });
  const [cloudConfigs, setCloudConfigs] = useState({});
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [activeSection, setActiveSection] = useState('sentry');
  const [webhookKey] = useState(() => 'pds_' + Math.random().toString(36).slice(2, 18));
  const [syncLogs, setSyncLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [testDetail, setTestDetail] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (!org) return;
    setGeneralForm(prev => ({
      ...prev,
      google_maps_key: org.google_maps_key || prev.google_maps_key,
      revenue_target: org.revenue_target ?? prev.revenue_target,
      mile_threshold: org.mile_threshold ?? prev.mile_threshold,
      driver_wait_mins: org.driver_wait_mins ?? prev.driver_wait_mins,
    }));
  }, [org]);

  useEffect(() => {
    if (activeSection === 'sentry') loadSyncLogs();
  }, [activeSection]);

  async function loadSettings() {
    const { data: cfg, error } = await supabase
      .from('sentry_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) handleSupabaseError(error, 'SettingsPanel:loadSettings', { silent: true });
    if (cfg) setSentryForm(prev => ({ ...prev, ...cfg }));
  }

  async function loadSyncLogs() {
    setLoadingLogs(true);
    const { data, error } = await supabase.from('sentry_sync_log').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) handleSupabaseError(error, 'SettingsPanel:loadSyncLogs', { silent: true });
    setSyncLogs(data || []);
    setLoadingLogs(false);
  }

  async function saveSentry() {
    setSaving(true);
    try {
      const payload = { ...sentryForm, updated_at: new Date().toISOString() };
      const { error: upsertErr } = await supabase
        .from('sentry_config')
        .upsert(payload, { onConflict: 'id', ignoreDuplicates: false })
        .select();

      if (upsertErr) {
        const { data: existing } = await supabase
          .from('sentry_config')
          .select('id')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        let saveError;
        if (existing) {
          const { error } = await supabase.from('sentry_config').update(payload).eq('id', existing.id);
          saveError = error;
        } else {
          const { error } = await supabase.from('sentry_config').insert(sentryForm);
          saveError = error;
        }
        if (saveError) {
          handleSupabaseError(saveError, 'SettingsPanel:saveSentry', { fallback: 'Failed to save settings.' });
          return;
        }
      }

      sentryApi.configure({
        baseUrl: sentryForm.base_url,
        username: sentryForm.username,
        password: sentryForm.password_enc,
        apiKey: sentryForm.api_key,
        authType: sentryForm.auth_type,
        enabled: sentryForm.enabled,
      });
      toastSuccess('Settings saved.');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      handleSupabaseError(error, 'SettingsPanel:saveSentry:unexpected', { fallback: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestDetail(null);
    try {
      sentryApi.configure({
        baseUrl: sentryForm.base_url,
        username: sentryForm.username,
        password: sentryForm.password_enc,
        apiKey: sentryForm.api_key,
        authType: sentryForm.auth_type,
        enabled: true,
      });

      const url = `${sentryForm.base_url}/rest/transportation_provider_facade/v4.0/trips.json`;
      let detail = { url, status: null, latency: null, ok: false, error: null, hint: null };

      const res = await fetch(`${EDGE_BASE}/sentry-diagnostics/health-check`, {
        method: 'POST',
        headers: await getEdgeFunctionHeaders(),
        body: JSON.stringify({
          base_url: sentryForm.base_url,
          auth_type: sentryForm.auth_type,
          username: sentryForm.username,
          password_enc: sentryForm.password_enc,
          api_key: sentryForm.api_key,
        }),
      });

      const result = await res.json().catch(() => ({
        authenticated: false,
        error: 'Invalid diagnostics response',
      }));

      detail = {
        url,
        status: result.status ?? res.status ?? null,
        latency: result.latencyMs ?? null,
        ok: Boolean(result.authenticated),
        error: result.error || null,
        hint: result.hint || null,
      };
      setTestDetail(detail);
      await checkSentryHealth();
    } catch (error) {
      const message = error?.message || 'Connection test failed.';
      setTestDetail({
        url: `${sentryForm.base_url}/rest/transportation_provider_facade/v4.0/trips.json`,
        status: null,
        latency: null,
        ok: false,
        error: message,
        hint: `Connection error: ${message}`,
      });
      toastError(message);
    } finally {
      setTesting(false);
    }
  }

  async function handleSyncDrivers() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncDriversFromSentry();
      setSyncResult(result);
      await loadSyncLogs();
    } catch (error) {
      handleSupabaseError(error, 'SettingsPanel:handleSyncDrivers', { fallback: 'Failed to sync drivers.' });
    } finally {
      setSyncing(false);
    }
  }

  async function saveGeneralSettings() {
    if (org?.id) {
      const { error } = await supabase.from('organizations').update({
        revenue_target: parseFloat(generalForm.revenue_target) || 60,
        mile_threshold: parseFloat(generalForm.mile_threshold) || 25,
        google_maps_key: generalForm.google_maps_key,
        driver_wait_mins: Math.max(1, parseInt(generalForm.driver_wait_mins, 10) || 5),
      }).eq('id', org.id);
      if (error) { handleSupabaseError(error, 'SettingsPanel:saveGeneralSettings', { fallback: 'Failed to save general settings.' }); return; }
      toastSuccess('General settings saved.');
    }
  }

  async function saveCloudConfig(provider, config) {
    const { data: existing, error: lookupErr } = await supabase.from('cloud_integrations').select('id').eq('provider', provider).maybeSingle();
    if (lookupErr) { handleSupabaseError(lookupErr, 'SettingsPanel:saveCloudConfig:lookup', { silent: true }); return; }

    let saveErr;
    if (existing) {
      const { error } = await supabase.from('cloud_integrations').update({ config, enabled: config.enabled }).eq('id', existing.id);
      saveErr = error;
    } else {
      const { error } = await supabase.from('cloud_integrations').insert({ provider, config, enabled: config.enabled || false });
      saveErr = error;
    }
    if (saveErr) { handleSupabaseError(saveErr, 'SettingsPanel:saveCloudConfig', { fallback: 'Failed to save cloud config.' }); return; }
    setCloudConfigs(prev => ({ ...prev, [provider]: { config, enabled: config.enabled } }));
  }

  const sections = [
    { id: 'sentry', label: 'SentryMS API', icon: '🔌' },
    { id: 'payrates', label: 'Pay Rates', icon: '💵' },
    { id: 'cloud', label: 'Cloud Providers', icon: '☁️' },
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'saas', label: 'SaaS / Upgrade', icon: '🚀' },
  ];

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden" style={{ background: '#07090d' }}>
      <aside className="w-full md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r p-3 overflow-x-auto" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <p className="text-xs font-700 uppercase tracking-wider mb-3 px-1" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Settings</p>
        <div className="flex md:flex-col gap-2 md:space-y-1 min-w-max md:min-w-0">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-all"
              style={{
                background: activeSection === s.id ? 'rgba(201,168,76,0.1)' : 'transparent',
                color: activeSection === s.id ? '#c9a84c' : 'rgba(255,255,255,0.5)',
                fontWeight: activeSection === s.id ? 600 : 400,
                border: '1px solid',
                borderColor: activeSection === s.id ? 'rgba(201,168,76,0.2)' : 'transparent',
              }}
            >
              <span>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl">
        {activeSection === 'sentry' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-700 mb-1" style={{ fontWeight: 700 }}>SentryMS API Integration</h2>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Connect to your SentryMS sandbox or production environment</p>
            </div>

            <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 700 }}>Setup Checklist</p>
              {[
                { label: 'Base URL is set', done: !!sentryForm.base_url, hint: 'Should be: https://dsp-integration.test.sentryms.com' },
                { label: 'Username entered', done: !!sentryForm.username, hint: 'The username SentryMS emailed you' },
                { label: 'Password entered', done: !!sentryForm.password_enc, hint: 'The password SentryMS emailed you' },
                { label: 'Settings saved', done: saved, hint: 'Hit Save Settings below' },
                { label: 'Connection tested', done: !!(testDetail?.ok || sentryStatus.ok), hint: 'Hit Test Connection below' },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5" style={{
                    background: step.done ? 'rgba(0,229,160,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${step.done ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  }}>
                    {step.done
                      ? <CheckCircle className="w-3 h-3" style={{ color: '#00e5a0' }} />
                      : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'block' }} />
                    }
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: step.done ? '#e5e7eb' : 'rgba(255,255,255,0.45)', fontWeight: step.done ? 600 : 400 }}>{step.label}</p>
                    {!step.done && <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{step.hint}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-600" style={{
              background: sentryForm.sandbox ? 'rgba(201,168,76,0.08)' : 'rgba(255,71,87,0.08)',
              border: '1px solid',
              borderColor: sentryForm.sandbox ? 'rgba(201,168,76,0.25)' : 'rgba(255,71,87,0.25)',
              color: sentryForm.sandbox ? '#c9a84c' : '#ff4757',
              fontWeight: 600,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: sentryForm.sandbox ? '#c9a84c' : '#ff4757', flexShrink: 0, display: 'inline-block' }} />
              {sentryForm.sandbox ? 'SANDBOX MODE — safe to test' : 'PRODUCTION MODE — live data'}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Base URL</label>
                <input
                  type="url"
                  value={sentryForm.base_url}
                  onChange={e => setSentryForm({ ...sentryForm, base_url: e.target.value })}
                  className="w-full"
                />
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Sandbox: https://dsp-integration.test.sentryms.com</p>
              </div>

              <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {['basic', 'bearer'].map(t => (
                  <button
                    key={t}
                    onClick={() => setSentryForm({ ...sentryForm, auth_type: t })}
                    className="flex-1 py-1.5 rounded-lg text-xs capitalize transition-all"
                    style={{
                      background: sentryForm.auth_type === t ? 'rgba(201,168,76,0.15)' : 'transparent',
                      color: sentryForm.auth_type === t ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                      border: 'none',
                    }}
                  >
                    {t === 'basic' ? 'Basic Auth (username + password)' : 'API Key'}
                  </button>
                ))}
              </div>

              {sentryForm.auth_type === 'basic' ? (
                <>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Username <span style={{ color: 'rgba(255,255,255,0.25)' }}>— from SentryMS email</span></label>
                    <input type="text" value={sentryForm.username} onChange={e => setSentryForm({ ...sentryForm, username: e.target.value })} className="w-full" placeholder="e.g. CLJExpress2" />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Password <span style={{ color: 'rgba(255,255,255,0.25)' }}>— from SentryMS email</span></label>
                    <div className="relative">
                      <input type={showPass ? 'text' : 'password'} value={sentryForm.password_enc} onChange={e => setSentryForm({ ...sentryForm, password_enc: e.target.value })} className="w-full pr-10" placeholder="••••••••" />
                      <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)' }}>
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>API Key</label>
                  <input type={showPass ? 'text' : 'password'} value={sentryForm.api_key} onChange={e => setSentryForm({ ...sentryForm, api_key: e.target.value })} className="w-full" placeholder="sk_..." />
                </div>
              )}

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className="w-8 h-4 rounded-full relative" style={{ background: sentryForm.sandbox ? '#c9a84c' : 'rgba(255,255,255,0.1)' }} onClick={() => setSentryForm({ ...sentryForm, sandbox: !sentryForm.sandbox })}>
                    <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all" style={{ left: sentryForm.sandbox ? '17px' : '2px' }} />
                  </div>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Sandbox Mode</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={saveSentry} disabled={saving} className="btn-gold flex items-center gap-2 py-2.5 px-5 flex-1">
                {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
              </button>
              <button onClick={testConnection} disabled={testing} className="btn-ghost flex items-center gap-2 py-2.5 px-4 flex-1">
                <TestTube className="w-4 h-4" />
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>

            {testDetail && (
              <div className="rounded-xl p-4 space-y-3" style={{
                background: testDetail.ok ? 'rgba(0,229,160,0.05)' : 'rgba(255,71,87,0.05)',
                border: `1px solid ${testDetail.ok ? 'rgba(0,229,160,0.2)' : 'rgba(255,71,87,0.2)'}`,
              }}>
                <div className="flex items-center gap-2">
                  {testDetail.ok
                    ? <Wifi className="w-4 h-4 flex-shrink-0" style={{ color: '#00e5a0' }} />
                    : <WifiOff className="w-4 h-4 flex-shrink-0" style={{ color: '#ff4757' }} />
                  }
                  <p className="text-sm font-700" style={{ color: testDetail.ok ? '#00e5a0' : '#ff4757', fontWeight: 700 }}>
                    {testDetail.ok ? 'Connection Successful' : 'Connection Failed'}
                    {testDetail.latency && <span className="ml-2 text-xs font-400" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>{testDetail.latency}ms</span>}
                  </p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: testDetail.ok ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.6)' }}>
                  {testDetail.hint}
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                    HTTP {testDetail.status ?? 'ERR'}
                  </span>
                  {testDetail.error && (
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{testDetail.error}</span>
                  )}
                </div>
              </div>
            )}

            {(testDetail?.ok || sentryStatus.ok) && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.15)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4" style={{ color: '#00e5a0' }} />
                  <p className="text-sm font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>You are connected — what to do next</p>
                </div>
                {[
                  { action: 'Sync Drivers', desc: 'Pull all your drivers from SentryMS into the app', onClick: handleSyncDrivers, loading: syncing },
                  { action: 'Pull Trips', desc: 'Marketplace and assigned trips auto-refresh every 90 seconds — or go to Live Dispatch to see them now', onClick: null },
                  { action: 'Go to Live Dispatch', desc: 'Assign drivers to trips and accept/reject in real time', onClick: null },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2" style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div>
                      <p className="text-xs font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{item.action}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.desc}</p>
                    </div>
                    {item.onClick && (
                      <button onClick={item.onClick} disabled={item.loading} className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 flex-shrink-0">
                        {item.loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                        {item.loading ? 'Syncing...' : 'Do it'}
                      </button>
                    )}
                  </div>
                ))}
                {syncResult && (
                  <div className="text-xs px-3 py-2 rounded-lg mt-1" style={{
                    background: syncResult.error ? 'rgba(255,71,87,0.08)' : 'rgba(0,229,160,0.08)',
                    border: '1px solid',
                    borderColor: syncResult.error ? 'rgba(255,71,87,0.2)' : 'rgba(0,229,160,0.2)',
                    color: syncResult.error ? '#ff4757' : '#00e5a0',
                  }}>
                    {syncResult.error ? `Error: ${syncResult.error}` : `Drivers synced — ${syncResult.created} new, ${syncResult.updated} updated (${syncResult.total} total from SentryMS)`}
                  </div>
                )}
              </div>
            )}

            <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs font-600" style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Webhook URL (trips_receiver)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs p-2 rounded-lg truncate" style={{ background: 'rgba(255,255,255,0.05)', color: '#c9a84c', fontFamily: 'JetBrains Mono, monospace' }}>
                  {window.location.origin}/trips_receiver/?key={webhookKey}
                </code>
                <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/trips_receiver/?key=${webhookKey}`)} className="btn-ghost px-2 py-1.5 flex-shrink-0">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between pt-4 mb-3">
                <p className="text-sm font-600" style={{ fontWeight: 600 }}>Sync Log</p>
                <button onClick={loadSyncLogs} className="btn-ghost px-2 py-1 flex items-center gap-1 text-xs">
                  <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              {syncLogs.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>No sync events yet — test a connection or sync drivers to see activity here</p>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                        {['Time', 'Type', 'Dir', 'External ID', 'Status'].map(h => (
                          <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: 10 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {syncLogs.map(log => (
                        <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            {new Date(log.created_at).toLocaleTimeString()}
                          </td>
                          <td style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.6)' }}>{log.sync_type}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{
                              fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                              background: log.direction === 'import' ? 'rgba(59,130,246,0.15)' : 'rgba(201,168,76,0.15)',
                              color: log.direction === 'import' ? '#60a5fa' : '#c9a84c',
                            }}>{log.direction}</span>
                          </td>
                          <td style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.external_id || '—'}
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ color: SYNC_STATUS_COLORS[log.status] || 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'payrates' && <PayRatesSection />}

        {activeSection === 'cloud' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-700 mb-1" style={{ fontWeight: 700 }}>Cloud Provider Integrations</h2>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Connect cloud services for AI processing, storage, and analytics</p>
            </div>

            {CLOUD_PROVIDERS.map(provider => {
              const cfg = cloudConfigs[provider.id] || {};
              const enabled = cfg.enabled || false;
              return (
                <div key={provider.id} className="rounded-xl overflow-hidden" style={{ background: '#0d1117', border: `1px solid ${enabled ? provider.color + '30' : 'rgba(255,255,255,0.07)'}` }}>
                  <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{provider.icon}</span>
                      <div>
                        <p className="font-600 text-sm" style={{ color: '#e5e7eb', fontWeight: 600 }}>{provider.name}</p>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{provider.desc}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => saveCloudConfig(provider.id, { ...(cfg.config || {}), enabled: !enabled })}
                      className="w-10 h-5 rounded-full relative transition-all"
                      style={{ background: enabled ? provider.color : 'rgba(255,255,255,0.1)' }}
                    >
                      <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: enabled ? '22px' : '2px' }} />
                    </button>
                  </div>
                  {enabled && (
                    <div className="p-4 space-y-2">
                      {provider.id === 'aws' && (
                        <>
                          <input type="text" placeholder="AWS Access Key ID" className="w-full text-xs" value={cfg.config?.access_key || ''} onChange={e => setCloudConfigs(prev => ({ ...prev, [provider.id]: { ...prev[provider.id], config: { ...prev[provider.id]?.config, access_key: e.target.value } } }))} />
                          <input type="password" placeholder="AWS Secret Access Key" className="w-full text-xs" />
                          <input type="text" placeholder="Region (e.g. us-east-1)" className="w-full text-xs" />
                        </>
                      )}
                      {provider.id === 'gcp' && (
                        <>
                          <input type="text" placeholder="GCP Project ID" className="w-full text-xs" />
                          <textarea placeholder="Service Account JSON (paste here)" rows={3} className="w-full text-xs resize-none" style={{ fontSize: 11 }} />
                        </>
                      )}
                      {provider.id === 'azure' && (
                        <>
                          <input type="text" placeholder="Subscription ID" className="w-full text-xs" />
                          <input type="text" placeholder="Tenant ID" className="w-full text-xs" />
                          <input type="password" placeholder="Client Secret" className="w-full text-xs" />
                        </>
                      )}
                      {provider.id === 'ibm' && (
                        <>
                          <input type="password" placeholder="IBM Cloud API Key" className="w-full text-xs" />
                          <input type="text" placeholder="Resource Group" className="w-full text-xs" />
                        </>
                      )}
                      <button onClick={() => saveCloudConfig(provider.id, { ...cfg.config, enabled: true })} className="btn-gold text-xs px-4 py-2 mt-1 flex items-center gap-1.5">
                        <Save className="w-3 h-3" /> Save {provider.name}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeSection === 'general' && (
          <div className="space-y-5">
            <h2 className="text-base font-700 mb-1" style={{ fontWeight: 700 }}>General Settings</h2>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Google Maps API Key</label>
              <input type="text" value={generalForm.google_maps_key} onChange={e => setGeneralForm({ ...generalForm, google_maps_key: e.target.value })} className="w-full font-mono text-xs" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Revenue Target ($/hr)</label>
              <input type="number" value={generalForm.revenue_target} onChange={e => setGeneralForm({ ...generalForm, revenue_target: e.target.value })} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Max Trip Distance (miles)</label>
              <input type="number" value={generalForm.mile_threshold} onChange={e => setGeneralForm({ ...generalForm, mile_threshold: e.target.value })} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Driver No-Show Wait Time (mins)</label>
              <input type="number" min="1" max="60" value={generalForm.driver_wait_mins} onChange={e => setGeneralForm({ ...generalForm, driver_wait_mins: e.target.value })} className="w-full" />
              <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Drivers must wait this long at pickup before they can mark a rider as a no-show.
              </p>
            </div>
            <button onClick={saveGeneralSettings} className="btn-gold flex items-center gap-2 py-2.5 px-5">
              <Save className="w-4 h-4" /> Save General
            </button>
          </div>
        )}

        {activeSection === 'appearance' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-700 mb-1" style={{ fontWeight: 700 }}>Appearance</h2>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Customize how the app looks</p>
            </div>
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 700 }}>Color Theme</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>
                    {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {theme === 'dark' ? 'Dark backgrounds, reduced eye strain' : 'Light backgrounds, bright display'}
                  </p>
                </div>
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all"
                  style={{
                    background: theme === 'dark' ? 'rgba(201,168,76,0.1)' : 'rgba(0,0,0,0.08)',
                    border: `1px solid ${theme === 'dark' ? 'rgba(201,168,76,0.25)' : 'rgba(0,0,0,0.12)'}`,
                    color: theme === 'dark' ? '#c9a84c' : '#b8860b',
                  }}
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  <span className="text-sm font-600" style={{ fontWeight: 600 }}>
                    Switch to {theme === 'dark' ? 'Light' : 'Dark'}
                  </span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-xl p-3 cursor-pointer transition-all"
                  onClick={() => theme !== 'dark' && toggleTheme()}
                  style={{
                    background: theme === 'dark' ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${theme === 'dark' ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <div className="w-full h-12 rounded-lg mb-2" style={{ background: '#07090d', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div className="h-3 w-full rounded-t-lg" style={{ background: '#0d1117' }} />
                    <div className="flex gap-1 p-1">
                      <div className="h-1.5 rounded" style={{ background: '#c9a84c', width: 20 }} />
                      <div className="h-1.5 rounded" style={{ background: 'rgba(255,255,255,0.2)', flex: 1 }} />
                    </div>
                  </div>
                  <p className="text-xs text-center font-600" style={{ color: theme === 'dark' ? '#c9a84c' : 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                    Dark {theme === 'dark' && '(Active)'}
                  </p>
                </div>
                <div
                  className="rounded-xl p-3 cursor-pointer transition-all"
                  onClick={() => theme !== 'light' && toggleTheme()}
                  style={{
                    background: theme === 'light' ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${theme === 'light' ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <div className="w-full h-12 rounded-lg mb-2" style={{ background: '#f3f4f6', border: '1px solid rgba(0,0,0,0.1)' }}>
                    <div className="h-3 w-full rounded-t-lg" style={{ background: '#ffffff' }} />
                    <div className="flex gap-1 p-1">
                      <div className="h-1.5 rounded" style={{ background: '#b8860b', width: 20 }} />
                      <div className="h-1.5 rounded" style={{ background: 'rgba(0,0,0,0.15)', flex: 1 }} />
                    </div>
                  </div>
                  <p className="text-xs text-center font-600" style={{ color: theme === 'light' ? '#b8860b' : 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                    Light {theme === 'light' && '(Active)'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'saas' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-700 mb-1" style={{ fontWeight: 700 }}>SaaS Plans</h2>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Scale your dispatch operation with advanced features</p>
            </div>

            {[
              { name: 'Starter', price: 'Free', features: ['5 drivers', 'Basic dispatch', 'SentryMS API', 'Email support'], color: '#4b5563', current: true },
              { name: 'Pro', price: '$99/mo', features: ['25 drivers', 'AI scheduling', 'Full-day planner', 'Firebase sync', 'Priority support'], color: '#c9a84c', current: false },
              { name: 'Enterprise', price: '$299/mo', features: ['Unlimited drivers', 'All cloud integrations', 'Custom AI models', 'White-label', 'SLA + 24/7 support'], color: '#00e5a0', current: false },
            ].map(plan => (
              <div
                key={plan.name}
                className="rounded-xl p-5"
                style={{
                  background: plan.current ? 'rgba(201,168,76,0.04)' : '#0d1117',
                  border: `1px solid ${plan.current ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.07)'}`,
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-700 text-base" style={{ color: plan.color, fontWeight: 700 }}>{plan.name}</p>
                    <p className="text-xl font-800 mt-0.5" style={{ color: '#e5e7eb', fontWeight: 800 }}>{plan.price}</p>
                  </div>
                  {plan.current && <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c' }}>Current</span>}
                </div>
                <ul className="space-y-1.5 mb-4">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <CheckCircle className="w-3 h-3 flex-shrink-0" style={{ color: plan.color }} />
                      {f}
                    </li>
                  ))}
                </ul>
                {!plan.current && (
                  <button className="btn-gold w-full py-2.5 text-sm">
                    Upgrade to {plan.name}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
