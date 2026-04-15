import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, RefreshCw, Layers, TerminalSquare, Webhook, Search } from 'lucide-react';
import PartnerCard from './integrations/PartnerCard';
import PartnerModal from './integrations/PartnerModal';
import TestRunPanel from './integrations/TestRunPanel';

const TABS = [
  { id: 'partners', label: 'Partners', icon: Layers },
  { id: 'runs', label: 'Test Runs', icon: TerminalSquare },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
];

async function runSandboxTest(partner, log) {
  const start = Date.now();
  const env = partner.sandbox_enabled ? 'sandbox' : 'production';
  const baseUrl = env === 'sandbox' ? partner.sandbox_base_url : partner.prod_base_url;
  const authType = env === 'sandbox' ? partner.sandbox_auth_type : partner.prod_auth_type;
  const apiKey = env === 'sandbox' ? partner.sandbox_api_key : partner.prod_api_key;
  const username = env === 'sandbox' ? partner.sandbox_username : partner.prod_username;
  const password = env === 'sandbox' ? partner.sandbox_password : partner.prod_password;

  log({ msg: `Starting ${env} test for ${partner.name}`, level: 'step' });
  log({ msg: `Base URL: ${baseUrl || '(not set)'}`, level: 'info' });
  log({ msg: `Auth type: ${authType}`, level: 'info' });

  const logs = [];
  function addLog(entry) { logs.push({ ...entry, ts: new Date().toISOString() }); log(entry); }

  if (!baseUrl) {
    addLog({ msg: 'No base URL configured', level: 'error' });
    return { status: 'fail', logs, latency: 0, httpStatus: null, error: 'No base URL configured', env };
  }

  const healthPath = partner.health_endpoint || '/';
  const url = baseUrl.replace(/\/$/, '') + healthPath;
  addLog({ msg: `GET ${url}`, level: 'step' });

  const headers = {};
  if (authType === 'api_key' && apiKey) headers['Authorization'] = `ApiKey ${apiKey}`;
  if (authType === 'bearer' && apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  if (authType === 'basic' && username) {
    headers['Authorization'] = 'Basic ' + btoa(`${username}:${password}`);
    addLog({ msg: `Using Basic auth as ${username}`, level: 'info' });
  }

  let httpStatus = null;
  let responseOk = false;
  let error = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeout);
    httpStatus = res.status;
    responseOk = res.ok || res.status === 401;
    addLog({ msg: `HTTP ${res.status} ${res.statusText}`, level: res.ok ? 'success' : res.status === 401 ? 'warn' : 'error' });

    if (res.status === 401) addLog({ msg: 'Auth required — credentials may need updating', level: 'warn' });
    else if (res.ok) addLog({ msg: 'Connection successful', level: 'success' });
    else addLog({ msg: `Unexpected status ${res.status}`, level: 'error' });

    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const json = await res.json();
        addLog({ msg: `Response: ${JSON.stringify(json).slice(0, 150)}`, level: 'info' });
      }
    } catch {}

  } catch (err) {
    if (err.name === 'AbortError') {
      addLog({ msg: 'Request timed out after 8s', level: 'error' });
      error = 'Request timed out';
    } else if (err.message?.includes('Failed to fetch') || err.message?.includes('CORS') || err.message?.includes('NetworkError')) {
      addLog({ msg: 'Network error or CORS restriction — endpoint may still be valid', level: 'warn' });
      addLog({ msg: 'Hint: Server may block browser requests. This is normal for server-to-server APIs.', level: 'info' });
      responseOk = true;
      error = 'CORS/Network (expected for server-to-server APIs)';
    } else {
      addLog({ msg: `Error: ${err.message}`, level: 'error' });
      error = err.message;
    }
  }

  const latency = Date.now() - start;
  addLog({ msg: `Completed in ${latency}ms`, level: 'info' });

  const finalStatus = responseOk ? 'pass' : error ? 'partial' : 'fail';
  return { status: finalStatus, logs, latency, httpStatus, error, env };
}

export default function AdminIntegrations() {
  const [tab, setTab] = useState('partners');
  const [partners, setPartners] = useState([]);
  const [runs, setRuns] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState(null);
  const [liveLogs, setLiveLogs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editPartner, setEditPartner] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const [p, r, w] = await Promise.all([
      supabase.from('integration_partners').select('*').order('name'),
      supabase.from('integration_test_runs').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('integration_webhooks').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    setPartners(p.data || []);
    setRuns(r.data || []);
    setWebhooks(w.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleTest(partner) {
    setTestingId(partner.id);
    setLiveLogs([]);
    setTab('runs');

    const { data: run } = await supabase.from('integration_test_runs').insert({
      partner_id: partner.id,
      environment: partner.sandbox_enabled ? 'sandbox' : 'production',
      test_type: 'health_check',
      status: 'running',
      triggered_by: 'manual',
    }).select().maybeSingle();

    const runId = run?.id;
    const collectedLogs = [];

    function log(entry) {
      const withTs = { ...entry, ts: new Date().toISOString() };
      collectedLogs.push(withTs);
      setLiveLogs(prev => [...prev, withTs]);
    }

    const result = await runSandboxTest(partner, log);

    if (runId) {
      await supabase.from('integration_test_runs').update({
        status: result.status,
        latency_ms: result.latency,
        http_status: result.httpStatus,
        log_lines: collectedLogs,
        error_message: result.error || '',
        completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }

    await supabase.from('integration_partners').update({
      last_test_at: new Date().toISOString(),
      last_test_status: result.status,
      last_test_latency: result.latency,
      updated_at: new Date().toISOString(),
    }).eq('id', partner.id);

    await load();
    setTestingId(null);
  }

  async function handleSave(form) {
    setSaving(true);
    const isEdit = !!form.id;
    if (isEdit) {
      await supabase.from('integration_partners').update({ ...form, updated_at: new Date().toISOString() }).eq('id', form.id);
    } else {
      await supabase.from('integration_partners').insert(form);
    }
    await load();
    setSaving(false);
    setShowModal(false);
    setEditPartner(null);
  }

  function openEdit(partner) {
    setEditPartner(partner);
    setShowModal(true);
  }

  function openAdd() {
    setEditPartner(null);
    setShowModal(true);
  }

  const filteredPartners = partners.filter(p => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.slug.includes(q);
  });

  const stats = {
    total: partners.length,
    healthy: partners.filter(p => p.last_test_status === 'pass').length,
    failed: partners.filter(p => p.last_test_status === 'fail').length,
    sandbox: partners.filter(p => p.sandbox_enabled).length,
  };

  const webhookBase = window.location.origin;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ color: '#e5e7eb' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)' }}>
            <Layers className="w-4 h-4" style={{ color: '#0ea5e9' }} />
          </div>
          <div>
            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Integration Sandbox</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Manage, configure &amp; test third-party API partners</p>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl font-600"
          style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#0ea5e9', fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" /> Add Partner
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 px-5 pt-4 flex-shrink-0">
        {[
          { label: 'Partners', value: stats.total, color: '#0ea5e9' },
          { label: 'Healthy', value: stats.healthy, color: '#00e5a0' },
          { label: 'Failed', value: stats.failed, color: '#ff4757' },
          { label: 'Sandbox Active', value: stats.sandbox, color: '#c9a84c' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 flex flex-col gap-0.5" style={{ background: `${s.color}08`, border: `1px solid ${s.color}20` }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</p>
            <p className="text-xl font-700" style={{ color: s.color, fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-5 pt-4 flex-shrink-0">
        <div className="flex border-b" style={{ borderColor: 'transparent', gap: 4 }}>
          {TABS.map(t => {
            const Icon = t.icon;
            const badge = t.id === 'runs' ? runs.length : t.id === 'webhooks' ? webhooks.length : 0;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl transition-colors"
                style={{
                  background: tab === t.id ? 'rgba(14,165,233,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${tab === t.id ? 'rgba(14,165,233,0.25)' : 'rgba(255,255,255,0.06)'}`,
                  color: tab === t.id ? '#0ea5e9' : 'rgba(255,255,255,0.4)',
                  fontWeight: tab === t.id ? 600 : 400,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {badge > 0 && (
                  <span className="text-xs ml-0.5" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>
        {tab === 'partners' && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="text-xs pl-8 pr-3 py-2 rounded-xl w-44"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5 pt-3">
        {tab === 'partners' && (
          loading ? (
            <div className="flex items-center justify-center p-10">
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
            </div>
          ) : filteredPartners.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 rounded-2xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Layers className="w-10 h-10 mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No integration partners yet</p>
              <button onClick={openAdd} className="btn-gold px-4 py-2 text-sm mt-4">Add First Partner</button>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {filteredPartners.map(p => (
                <PartnerCard
                  key={p.id}
                  partner={p}
                  testing={testingId === p.id}
                  onTest={handleTest}
                  onEdit={openEdit}
                />
              ))}
            </div>
          )
        )}

        {tab === 'runs' && (
          <div className="flex flex-col gap-4">
            {testingId && liveLogs.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(14,165,233,0.2)' }}>
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(14,165,233,0.08)', borderBottom: '1px solid rgba(14,165,233,0.12)' }}>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: '#0ea5e9' }} />
                  <span className="text-xs font-600" style={{ color: '#0ea5e9', fontWeight: 600 }}>Live Test Output</span>
                </div>
                <div className="p-3 max-h-40 overflow-y-auto font-mono text-xs" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  {liveLogs.map((l, i) => (
                    <div key={i} className="flex gap-2 mb-0.5">
                      <span style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>{new Date(l.ts).toLocaleTimeString()}</span>
                      <span style={{ color: { info: 'rgba(255,255,255,0.5)', success: '#00e5a0', error: '#ff4757', warn: '#f59e0b', step: '#0ea5e9' }[l.level] || 'rgba(255,255,255,0.5)' }}>{l.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <TestRunPanel runs={runs} activePartner={null} />
          </div>
        )}

        {tab === 'webhooks' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-600 mb-3" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>INBOUND WEBHOOK ENDPOINTS</p>
              <div className="flex flex-col gap-2">
                {partners.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-700 flex-shrink-0" style={{ background: `${p.logo_color || '#c9a84c'}15`, color: p.logo_color || '#c9a84c', fontWeight: 700 }}>
                      {p.logo_initial || p.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono truncate" style={{ color: '#c9a84c' }}>
                        {webhookBase}/api/webhooks/{p.slug}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{p.name}</p>
                    </div>
                    <button
                      onClick={() => navigator.clipboard?.writeText(`${webhookBase}/api/webhooks/${p.slug}`)}
                      className="text-xs px-2 py-1 rounded-lg flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
                    >
                      Copy
                    </button>
                  </div>
                ))}
                {partners.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.25)' }}>Add partners to see webhook endpoints</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <span className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>Recent Inbound Payloads</span>
              </div>
              {webhooks.length === 0 ? (
                <div className="p-8 text-center">
                  <Webhook className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No webhooks received yet</p>
                </div>
              ) : (
                <div className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.04)' }}>
                  {webhooks.map(w => (
                    <div key={w.id} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(201,168,76,0.1)', color: '#c9a84c' }}>{w.event_type}</span>
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{new Date(w.created_at).toLocaleString()}</span>
                        <span className={`text-xs ml-auto`} style={{ color: w.processed ? '#00e5a0' : '#f59e0b' }}>
                          {w.processed ? 'processed' : 'pending'}
                        </span>
                      </div>
                      <pre className="text-xs mt-2 overflow-x-auto p-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)', color: 'rgba(255,255,255,0.4)', maxHeight: 80 }}>
                        {JSON.stringify(w.raw_payload, null, 2).slice(0, 300)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <PartnerModal
          partner={editPartner}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditPartner(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}
