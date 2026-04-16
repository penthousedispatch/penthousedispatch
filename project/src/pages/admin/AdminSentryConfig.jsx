import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { sentryApi } from '../../lib/sentryApi';
import { useApp } from '../../context/AppContext';
import {
  Settings, RefreshCw, CheckCircle, XCircle, Zap, Database,
  ToggleLeft, ToggleRight, BookOpen, Copy, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Key, Webhook,
} from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

const FEATURE_DEFS = [
  { key: 'feat_assigned_trips',    label: 'Assigned Trips Polling',  desc: 'Poll /trips.json for new & modified trips' },
  { key: 'feat_marketplace_trips', label: 'Marketplace Trips',       desc: 'Poll & take unassigned marketplace trips' },
  { key: 'feat_trip_accept_reject',label: 'Trip Accept / Reject',    desc: 'Send accept/reject responses to Sentry' },
  { key: 'feat_trip_status_update',label: 'Trip Status Updates',     desc: 'Push status changes (en route, completed, etc.)' },
  { key: 'feat_drivers',           label: 'Driver Sync',             desc: 'Create, update & pull drivers from Sentry' },
  { key: 'feat_vehicles',          label: 'Vehicle Sync',            desc: 'Create, update & pull vehicles from Sentry' },
  { key: 'feat_vehicle_locations', label: 'Vehicle GPS Push',        desc: 'Periodically push fleet locations to Sentry' },
  { key: 'feat_waypoint_etas',     label: 'Waypoint ETAs',          desc: 'Exchange vehicle waypoint ETA data' },
  { key: 'feat_driver_work_shifts',label: 'Driver Work Shifts',      desc: 'Pull driver work shift schedules from Sentry' },
  { key: 'feat_retrieve_trips',    label: 'Retrieve TP Trips',       desc: 'Expose TP-side trip data via /gc/retrieve_trips.json' },
];

const DEFAULT_FEATURES = Object.fromEntries(FEATURE_DEFS.map(f => [f.key, true]));

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs btn-ghost px-2 py-1 flex-shrink-0"
      style={{ color: copied ? '#00e5a0' : 'rgba(255,255,255,0.4)' }}
    >
      {copied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function UrlRow({ label, url }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{label}</p>
      <div className="flex items-center gap-2">
        <Database className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
        <p className="text-xs font-mono flex-1 truncate" style={{ color: '#c9a84c' }}>{url}</p>
        <CopyButton text={url} />
      </div>
    </div>
  );
}

function HeaderRow({ label, value }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{label}</p>
      <div className="flex items-center gap-2">
        <Key className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
        <p className="text-xs font-mono flex-1 truncate" style={{ color: '#c9a84c' }}>{value}</p>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

export default function AdminSentryConfig() {
  const { sentryConfig, setSentryConfig } = useApp();

  const [form, setForm] = useState({
    id: null,
    base_url: 'https://dsp-integration.test.sentryms.com',
    auth_type: 'basic',
    username: '',
    password_enc: '',
    api_key: '',
    sandbox: true,
    enabled: true,
    max_trips_per_pull: 150,
    pull_interval_mins: 5,
    webhook_secret: '',
    ...DEFAULT_FEATURES,
  });

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [generatingSecret, setGeneratingSecret] = useState(false);

  useEffect(() => {
    if (sentryConfig) {
      setForm(prev => ({
        ...prev,
        id: sentryConfig.id || null,
        base_url: sentryConfig.base_url || 'https://dsp-integration.test.sentryms.com',
        auth_type: sentryConfig.auth_type || 'basic',
        username: sentryConfig.username || '',
        password_enc: sentryConfig.password_enc || '',
        api_key: sentryConfig.api_key || '',
        sandbox: sentryConfig.sandbox !== false,
        enabled: sentryConfig.enabled !== false,
        max_trips_per_pull: sentryConfig.max_trips_per_pull || 150,
        pull_interval_mins: sentryConfig.pull_interval_mins || 5,
        webhook_secret: sentryConfig.webhook_secret || '',
        ...Object.fromEntries(FEATURE_DEFS.map(f => [f.key, sentryConfig[f.key] !== false])),
      }));
    }
  }, [sentryConfig]);

  useEffect(() => {
    if (logsExpanded) loadWebhookLogs();
  }, [logsExpanded]);

  async function loadWebhookLogs() {
    setLogsLoading(true);
    const { data } = await supabase
      .from('webhook_logs')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(50);
    setWebhookLogs(data || []);
    setLogsLoading(false);
  }

  function generateSecret() {
    setGeneratingSecret(true);
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    const secret = btoa(String.fromCharCode(...arr))
      .replace(/[+/=]/g, '')
      .slice(0, 32);
    setForm(prev => ({ ...prev, webhook_secret: secret }));
    setGeneratingSecret(false);
  }

  function buildFeaturesForClient() {
    return {
      assignedTrips:    form.feat_assigned_trips,
      marketplaceTrips: form.feat_marketplace_trips,
      tripAcceptReject: form.feat_trip_accept_reject,
      tripStatusUpdate: form.feat_trip_status_update,
      drivers:          form.feat_drivers,
      vehicles:         form.feat_vehicles,
      vehicleLocations: form.feat_vehicle_locations,
      vehicleWaypointEtas: form.feat_waypoint_etas,
      driverWorkShifts: form.feat_driver_work_shifts,
      retrieveTrips:    form.feat_retrieve_trips,
    };
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setTestResult(null);

    sentryApi.configure({
      baseUrl: form.base_url,
      username: form.username,
      password: form.password_enc,
      apiKey: form.api_key,
      authType: form.auth_type,
      enabled: form.enabled,
      features: buildFeaturesForClient(),
    });

    const payload = {
      ...form,
      webhook_secret: (form.webhook_secret || '').trim(),
      updated_at: new Date().toISOString(),
    };

    let configId = form.id;
    if (!configId) {
      const { data: existing } = await supabase
        .from('sentry_config')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      configId = existing?.id || null;
    }

    const saveQuery = configId
      ? supabase
          .from('sentry_config')
          .update(payload)
          .eq('id', configId)
          .select()
          .maybeSingle()
      : supabase
          .from('sentry_config')
          .insert(payload)
          .select()
          .maybeSingle();

    const { data, error } = await saveQuery;

    if (error) {
      setSaving(false);
      setTestResult({
        authenticated: false,
        error: `Save failed: ${error.message}`,
      });
      return;
    }

    let persisted = data;
    if (!persisted) {
      const { data: refreshed } = await supabase
        .from('sentry_config')
        .select('*')
        .eq('id', configId)
        .maybeSingle();
      persisted = refreshed;
    }

    persisted = persisted || {
      ...(sentryConfig || {}),
      ...payload,
      id: configId || sentryConfig?.id || null,
    };

    setSentryConfig(persisted);
    setForm(prev => ({
      ...prev,
      id: persisted.id || prev.id,
      webhook_secret: persisted.webhook_secret || '',
    }));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    sentryApi.configure({
      baseUrl: form.base_url,
      username: form.username,
      password: form.password_enc,
      apiKey: form.api_key,
      authType: form.auth_type,
      enabled: true,
      features: buildFeaturesForClient(),
    });
    const result = await sentryApi.healthCheck();
    setTestResult(result);
    setTesting(false);
  }

  function Toggle({ field }) {
    const on = !!form[field];
    return (
      <button
        type="button"
        onClick={() => setForm(prev => ({ ...prev, [field]: !prev[field] }))}
        className="flex-shrink-0"
        aria-label={on ? 'Disable' : 'Enable'}
      >
        {on
          ? <ToggleRight className="w-6 h-6" style={{ color: '#00e5a0' }} />
          : <ToggleLeft className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.2)' }} />
        }
      </button>
    );
  }

  const secretUrl = form.webhook_secret
    ? `?secret=${encodeURIComponent(form.webhook_secret)}`
    : '';

  const receiverEndpoints = [
    { label: 'Trips Receiver', url: `${EDGE_BASE}/sentry-receivers/trips_receiver${secretUrl}` },
    { label: 'Drivers Receiver', url: `${EDGE_BASE}/sentry-receivers/drivers_receiver${secretUrl}` },
    { label: 'Vehicles Receiver', url: `${EDGE_BASE}/sentry-receivers/vehicles_receiver${secretUrl}` },
  ];

  const providerEndpoints = [
    { label: 'Fleet Vehicle Locations', url: `${EDGE_BASE}/sentry-provider/rest/gc/vehicle_locations.json` },
    { label: 'Vehicle Location', url: `${EDGE_BASE}/sentry-provider/rest/gc/vehicle_location.json?vehicle_id=ID` },
    { label: 'Vehicle Waypoint ETAs', url: `${EDGE_BASE}/sentry-provider/rest/gc/vehicle_waypoint_etas.json` },
    { label: 'Retrieve TP Trips', url: `${EDGE_BASE}/sentry-provider/rest/gc/retrieve_trips.json` },
    { label: 'Driver Work Shifts', url: `${EDGE_BASE}/sentry-provider/rest/transportation_provider_facade/v4.0/driver_work_shifts.json` },
  ];

  return (
    <div className="h-full overflow-y-auto p-6" style={{ color: '#e5e7eb' }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-700 mb-1" style={{ fontWeight: 700, color: '#c9a84c' }}>Sentry Integration</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>SentryMS API configuration and feature controls</p>
          <Link
            to="/admin/sentry-guide"
            className="inline-flex items-center gap-1.5 mt-2 text-xs font-600"
            style={{ color: '#c9a84c', fontWeight: 600 }}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Step-by-step sandbox setup guide
          </Link>
        </div>

        <form onSubmit={handleSave} className="space-y-4">

          {/* Connection */}
          <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Connection</p>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Integration</span>
                <Toggle field="enabled" />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Base URL</label>
                <input type="url" value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} className="w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Auth Type</label>
                  <select
                    value={form.auth_type}
                    onChange={e => setForm({ ...form, auth_type: e.target.value })}
                    className="w-full"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb' }}
                  >
                    <option value="basic">Basic Auth</option>
                    <option value="bearer">Bearer Token</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      className="relative w-9 h-5 rounded-full transition-colors"
                      style={{ background: form.sandbox ? '#c9a84c' : 'rgba(255,255,255,0.15)' }}
                      onClick={() => setForm({ ...form, sandbox: !form.sandbox })}
                    >
                      <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: form.sandbox ? '18px' : '2px' }} />
                    </div>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Sandbox Mode</span>
                  </label>
                </div>
              </div>
              {form.auth_type === 'basic' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Username</label>
                    <input type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="w-full" placeholder="API username" />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Password</label>
                    <input type="password" value={form.password_enc} onChange={e => setForm({ ...form, password_enc: e.target.value })} className="w-full" placeholder="API password" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>API Key</label>
                  <input type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} className="w-full" placeholder="Bearer token" />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Webhook className="w-4 h-4" style={{ color: '#c9a84c' }} />
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Sentry Auth Header</p>
            </div>
            <div className="space-y-3">
              <HeaderRow label="Authorization Header" value={`Bearer ${form.webhook_secret || 'YOUR_WEBHOOK_SECRET'}`} />
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Send this header to Sentry for both receiver and provider endpoints. Query-string secret support is still available, but header auth is cleaner for production.
              </p>
            </div>
          </div>

          {/* Pull Settings */}
          <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-700 uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Pull Settings</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Max Trips per Pull</label>
                <input
                  type="number" min="1" max="500"
                  value={form.max_trips_per_pull}
                  onChange={e => setForm({ ...form, max_trips_per_pull: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Pull Interval (mins)</label>
                <input
                  type="number" min="1" max="60"
                  value={form.pull_interval_mins}
                  onChange={e => setForm({ ...form, pull_interval_mins: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Feature Toggles */}
          <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-700 uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>API Feature Controls</p>
            <div className="space-y-1">
              {FEATURE_DEFS.map(f => (
                <div
                  key={f.key}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-600" style={{ fontWeight: 600, color: form[f.key] ? '#e5e7eb' : 'rgba(255,255,255,0.3)' }}>{f.label}</p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{f.desc}</p>
                  </div>
                  <Toggle field={f.key} />
                </div>
              ))}
            </div>
          </div>

          {/* Webhook Secret */}
          <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Key className="w-4 h-4" style={{ color: '#c9a84c' }} />
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Bearer Webhook Secret</p>
            </div>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
              Generate or paste the secret Sentry should send in the header:
              <span style={{ color: '#c9a84c' }}> Authorization: Bearer &lt;secret&gt;</span>
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.webhook_secret}
                onChange={e => setForm({ ...form, webhook_secret: e.target.value })}
                className="flex-1 font-mono text-xs"
                placeholder="Paste or generate your bearer webhook secret"
                style={{ fontSize: 12 }}
              />
              <button
                type="button"
                onClick={generateSecret}
                disabled={generatingSecret}
                className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs flex-shrink-0"
              >
                <Zap className="w-3.5 h-3.5" />
                Generate
              </button>
            </div>
          </div>

          {/* Inbound Webhook URLs (push FROM SentryMS TO you) */}
          <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Webhook className="w-4 h-4" style={{ color: '#00e5a0' }} />
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Inbound Webhook URLs</p>
            </div>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
              Give these to SentryMS. They push trips, driver credentials, and vehicle credentials to these live endpoints.
            </p>
            <div className="space-y-2">
              {receiverEndpoints.map(ep => (
                <UrlRow key={ep.label} label={ep.label} url={ep.url} />
              ))}
            </div>
          </div>

          {/* TP-Side Provider URLs (SentryMS queries FROM their side) */}
          <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4" style={{ color: '#0ea5e9' }} />
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>TP Provider URLs</p>
            </div>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
              Configure these in SentryMS as your TP-side endpoints. Sentry will call these to query your vehicle locations, trip data, and ETAs.
            </p>
            <div className="space-y-2">
              {providerEndpoints.map(ep => (
                <UrlRow key={ep.label} label={ep.label} url={ep.url} />
              ))}
            </div>
          </div>

          {testResult && (
            <div
              className="flex items-center gap-3 p-4 rounded-xl"
              style={{
                background: testResult.authenticated ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)',
                border: `1px solid ${testResult.authenticated ? 'rgba(0,229,160,0.2)' : 'rgba(255,71,87,0.2)'}`,
              }}
            >
              {testResult.authenticated
                ? <CheckCircle className="w-5 h-5" style={{ color: '#00e5a0' }} />
                : <XCircle className="w-5 h-5" style={{ color: '#ff4757' }} />
              }
              <div>
                <p className="text-sm font-600" style={{ color: testResult.authenticated ? '#00e5a0' : '#ff4757', fontWeight: 600 }}>
                  {testResult.authenticated ? 'Connected successfully' : 'Connection failed'}
                </p>
                {testResult.latencyMs && (
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{testResult.latencyMs}ms latency</p>
                )}
                {testResult.error && (
                  <p className="text-xs mt-0.5" style={{ color: '#ff4757' }}>{testResult.error}</p>
                )}
                {testResult.hint && (
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{testResult.hint}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="btn-ghost flex items-center gap-2 px-5 py-2.5 text-sm"
            >
              {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Test Connection
            </button>
            <button type="submit" disabled={saving} className="btn-gold flex items-center gap-2 px-5 py-2.5 text-sm">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
              {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Config'}
            </button>
          </div>
        </form>

        {/* Webhook Logs */}
        <div className="mt-4 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            type="button"
            onClick={() => setLogsExpanded(p => !p)}
            className="w-full flex items-center justify-between px-5 py-4"
            style={{ background: '#0d1117' }}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                Inbound Webhook Log
              </p>
              {webhookLogs.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
                  {webhookLogs.length}
                </span>
              )}
            </div>
            {logsExpanded ? <ChevronUp className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />}
          </button>

          {logsExpanded && (
            <div style={{ background: '#080c12', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {logsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-4 h-4 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
                </div>
              ) : webhookLogs.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-2">
                  <AlertTriangle className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.2)' }} />
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>No webhook calls received yet</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  {webhookLogs.map(log => (
                    <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {log.processed
                          ? <CheckCircle className="w-3.5 h-3.5" style={{ color: '#00e5a0' }} />
                          : <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#ff4757' }} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-600" style={{ color: '#c9a84c', fontWeight: 600 }}>
                            {log.endpoint || log.webhook_type || 'inbound'}
                          </span>
                          {log.trip_ids_accepted?.length > 0 && (
                            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                              {log.trip_ids_accepted.length} trip(s) accepted
                            </span>
                          )}
                        </div>
                        {log.error_message && (
                          <p className="text-xs" style={{ color: '#ff4757', fontSize: 11 }}>{log.error_message}</p>
                        )}
                      </div>
                      <span className="text-xs flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
                        {log.received_at ? new Date(log.received_at).toLocaleTimeString() : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="px-5 py-3 flex justify-end" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <button
                  type="button"
                  onClick={loadWebhookLogs}
                  className="flex items-center gap-1.5 text-xs btn-ghost px-3 py-1.5"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
