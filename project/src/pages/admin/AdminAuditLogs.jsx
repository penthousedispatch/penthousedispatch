import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getEdgeFunctionHeaders } from '../../lib/edgeHeaders';
import { useApp } from '../../context/AppContext';
import { getAiSettings, requestAIStructuredPlan } from '../../utils/aiMotivation';
import { resolveOrgIdForAdmin } from '../../lib/resolveOrgId';
import { FileText, RefreshCw, Search, Sparkles, Wrench, ExternalLink } from 'lucide-react';
import { logFailure, toastError } from '../../utils/errorHandler';

const TABS = ['api_logs', 'sentry_sync_log', 'webhook_logs'];
const TAB_LABELS = {
  api_logs: 'api logs',
  sentry_sync_log: 'sentry sync log',
  webhook_logs: 'webhook logs',
};

function deriveErrorCode(log) {
  const raw = String(log?.error_code || log?.status_code || log?.http_status || log?.error_message || '');
  const match = raw.match(/(?:HTTP|status(?:_id)?)[^\d]*(\d{3})/i) || raw.match(/\b(\d{3})\b/);
  return match?.[1] || '';
}

function extractLogType(log) {
  return log?.sync_type || log?.webhook_type || log?.endpoint || log?.msg || 'log_entry';
}

function buildLocalDiagnosis(tab, rows) {
  const findings = [];
  const suggestedActions = [];
  const authLikeFailure = rows.some(row => /401|403|auth|unauthorized|forbidden|token|credential|secret/i.test(String(row?.error_message || row?.detail || row?.msg || '')));
  const webhookRows = tab === 'webhook_logs' ? rows.filter(row => row.processed === false) : [];
  const syncTypes = Array.from(new Set(rows.map(row => String(row?.sync_type || '').toLowerCase()).filter(Boolean)));
  const hasDriverFailures = syncTypes.some(type => type.includes('driver'));
  const hasTripFailures = syncTypes.some(type => type.includes('marketplace') || type.includes('trip') || type.includes('retrieve'));

  if (rows.length === 0) {
    findings.push('No matching log rows are loaded right now.');
  }

  if (webhookRows.length > 0) {
    findings.push(`${webhookRows.length} webhook deliveries are still marked unprocessed.`);
    suggestedActions.push({ action_type: 'replay_recent_webhooks', reason: 'Replay recent unprocessed webhook deliveries through the saved receiver config.' });
  }

  if (authLikeFailure) {
    findings.push('Some failures look like auth or credential problems.');
    suggestedActions.push({ action_type: 'check_sentry_health', reason: 'Re-check the live Sentry connection and auth path before retrying sync work.' });
  }

  if (hasDriverFailures) {
    findings.push('Driver sync rows are failing, which usually means stale driver data or provider auth drift.');
    suggestedActions.push({ action_type: 'sync_drivers', reason: 'Pull driver records from Sentry again and refresh local driver state.' });
  }

  if (hasTripFailures) {
    findings.push('Trip-related sync rows are failing, so marketplace data should be refreshed before more testing.');
    suggestedActions.push({ action_type: 'refresh_marketplace_trips', reason: 'Refresh assigned and marketplace trips from Sentry and reload local trip state.' });
  }

  if (findings.length === 0 && rows.length > 0) {
    findings.push(`Reviewed ${rows.length} log rows with no single dominant failure pattern.`);
    suggestedActions.push({ action_type: 'refresh_core_data', reason: 'Refresh core dispatch data so the admin surface reflects current backend state.' });
  }

  const dedupedActions = suggestedActions.filter((action, index, list) => (
    list.findIndex(candidate => candidate.action_type === action.action_type) === index
  ));

  return {
    summary: findings[0] || `Reviewed ${rows.length} ${TAB_LABELS[tab]} rows.`,
    findings,
    suggestedActions: dedupedActions,
  };
}

export default function AdminAuditLogs() {
  const {
    org,
    user,
    role,
    isPlatformOwner,
    loadDrivers,
    loadTrips,
    loadAssignments,
    checkSentryHealth,
    refreshTripsFromSentry,
    syncDriversFromSentry,
  } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const requestedSearch = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const processedFilter = searchParams.get('processed') || '';
  const syncTypeFilter = searchParams.get('sync_type') || '';
  const [tab, setTab] = useState(TABS.includes(requestedTab) ? requestedTab : 'api_logs');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(requestedSearch);
  const [selectedLog, setSelectedLog] = useState(null);
  const [aiReview, setAiReview] = useState(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [resolvedOrgId, setResolvedOrgId] = useState(org?.id || null);

  useEffect(() => {
    if (TABS.includes(requestedTab) && requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [requestedTab, tab]);

  useEffect(() => {
    if (requestedSearch !== search) {
      setSearch(requestedSearch);
    }
  }, [requestedSearch]);

  useEffect(() => {
    let mounted = true;

    async function resolveOrgId() {
      const nextOrgId = await resolveOrgIdForAdmin({
        orgId: org?.id || null,
        user,
        isPlatformOwner,
        role,
      });
      if (mounted) setResolvedOrgId(nextOrgId);
    }

    resolveOrgId();
    return () => {
      mounted = false;
    };
  }, [org?.id, user?.id, isPlatformOwner, role]);

  useEffect(() => { loadLogs(); }, [tab]);

  useEffect(() => {
    const tabOutOfSync = (requestedTab || '') !== tab;
    const searchOutOfSync = (requestedSearch || '') !== search;
    if (!tabOutOfSync && !searchOutOfSync) return;

    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    if (search) next.set('search', search);
    else next.delete('search');
    setSearchParams(next, { replace: true });
  }, [tab, search, requestedTab, requestedSearch, searchParams, setSearchParams]);

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
    const { data, error } = await query;
    if (error) {
      setLogs([]);
      setSelectedLog(null);
      setLoading(false);
      setAiReview({
        summary: 'The log query failed.',
        findings: [error.message || 'Could not fetch log rows.'],
        actions: [],
        executed: [],
      });
      return;
    }
    const rows = data || [];
    setLogs(rows);
    setSelectedLog(current => {
      if (!current?.id) return rows[0] || null;
      return rows.find(row => row.id === current.id) || rows[0] || null;
    });
    setLoading(false);
  }

  function refreshErrorCodes() {
    const refreshed = logs.map(row => ({
      ...row,
      __derived_error_code: deriveErrorCode(row),
    }));
    setLogs(refreshed);
    setAiReview({
      summary: `Refreshed derived error codes for ${refreshed.length} log row${refreshed.length === 1 ? '' : 's'}.`,
      findings: [
        'Error code badges now reflect the latest parsed values from each row payload/message.',
      ],
      actions: [],
      executed: ['Recomputed derived error codes in the current log view.'],
    });
  }

  const filtered = useMemo(() => logs.filter(l => {
    if (statusFilter && String(l.status || '').toLowerCase() !== statusFilter.toLowerCase()) return false;
    if (processedFilter) {
      const expected = processedFilter === 'true';
      if (Boolean(l.processed) !== expected) return false;
    }
    if (syncTypeFilter && String(l.sync_type || '').toLowerCase() !== syncTypeFilter.toLowerCase()) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return JSON.stringify(l).toLowerCase().includes(q);
  }), [logs, search, statusFilter, processedFilter, syncTypeFilter]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedLog(null);
      return;
    }
    if (!selectedLog?.id) {
      setSelectedLog(filtered[0]);
      return;
    }
    const nextSelected = filtered.find(row => row.id === selectedLog.id);
    if (!nextSelected) {
      setSelectedLog(filtered[0]);
    }
  }, [filtered, selectedLog?.id]);

  async function loadLatestSentryConfig() {
    const { data, error } = await supabase
      .from('sentry_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function replayWebhookLog(log) {
    const cfg = await loadLatestSentryConfig();
    const secret = cfg?.webhook_secret || '';
    const authMode = cfg?.webhook_auth_mode || 'bearer';
    const edgeBase = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1`;
    const webhookType = log.endpoint || log.webhook_type || '';
    if (!webhookType) return { ok: false, status: 0 };
    const url = `${edgeBase}/sentry-receivers/${webhookType}${secret && authMode === 'query' ? `?secret=${encodeURIComponent(secret)}` : ''}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...(await getEdgeFunctionHeaders()),
        ...(secret && authMode === 'bearer' ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(log.raw_payload || {}),
    });

    return { ok: res.ok, status: res.status };
  }

  async function runInternalFixes(actions, rows) {
    const executed = [];
    const filteredWebhookRows = rows.filter(row => row.processed === false && (row.endpoint || row.webhook_type));

    for (const action of actions) {
      try {
        if (action.action_type === 'check_sentry_health') {
          const result = await checkSentryHealth();
          executed.push(`Ran Sentry health check${result?.status ? ` (HTTP ${result.status})` : ''}.`);
        }

        if (action.action_type === 'refresh_marketplace_trips') {
          const result = await refreshTripsFromSentry();
          await loadTrips();
          executed.push(`Refreshed marketplace trips${result?.count !== undefined ? ` (${result.count} rows touched)` : ''}.`);
        }

        if (action.action_type === 'sync_drivers') {
          const result = await syncDriversFromSentry();
          executed.push(`Synced drivers${result?.total !== undefined ? ` (${result.total} checked)` : ''}.`);
        }

        if (action.action_type === 'refresh_core_data') {
          await Promise.all([loadDrivers(), loadTrips(), loadAssignments()]);
          executed.push('Refreshed drivers, trips, and assignments.');
        }

        if (action.action_type === 'replay_recent_webhooks' && filteredWebhookRows.length > 0) {
          const targets = filteredWebhookRows.slice(0, 3);
          let passed = 0;
          for (const row of targets) {
            const result = await replayWebhookLog(row);
            if (result.ok) passed += 1;
          }
          executed.push(`Replayed ${targets.length} webhook log${targets.length === 1 ? '' : 's'} and ${passed} returned success.`);
        }
      } catch (error) {
        executed.push(
          `Action ${action.action_type} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return executed;
  }

  async function runAIDiagnosis(mode = 'diagnose') {
    setAiRunning(true);
    setAiReview(null);

    try {
      const snapshot = filtered.slice(0, 12).map(row => ({
        id: row.id,
        timestamp: row.created_at || row.received_at || null,
        level: row.level || row.status || (row.processed === false ? 'failed' : 'info'),
        type: extractLogType(row),
        error_code: deriveErrorCode(row),
        error_message: row.error_message || row.detail || row.msg || '',
        external_id: row.external_id || null,
      }));
      const localReview = buildLocalDiagnosis(tab, filtered);
      let finalReview = {
        summary: localReview.summary,
        findings: localReview.findings,
        recommended_actions: localReview.suggestedActions,
      };

      if (resolvedOrgId) {
        const aiSettings = await getAiSettings(resolvedOrgId);
        if (aiSettings?.provider && aiSettings.provider !== 'disabled' && aiSettings.api_key) {
          const result = await requestAIStructuredPlan(aiSettings, {
            systemPrompt: `You are an internal operations diagnosis bot for a transportation platform.
Return strict JSON only in this shape:
{
  "summary": "short diagnosis",
  "findings": ["short finding"],
  "recommended_actions": [
    {
      "action_type": "refresh_core_data|check_sentry_health|refresh_marketplace_trips|sync_drivers|replay_recent_webhooks",
      "reason": "short reason",
      "risk_level": "low|medium|high"
    }
  ]
}
Only use the allowed action_type values above. Keep actions low-risk and never invent unsupported actions.`,
            userPrompt: `Review this ${TAB_LABELS[tab]} snapshot and identify the most likely issue pattern.

Mode: ${mode}
Current filters:
${JSON.stringify({
            tab,
            status: statusFilter,
            processed: processedFilter,
            sync_type: syncTypeFilter,
            search: search || '',
          }, null, 2)}

Rows:
${JSON.stringify(snapshot, null, 2)}

Local review:
${JSON.stringify(localReview, null, 2)}

If mode is "fix", prefer low-risk internal recovery actions that can safely be run from the admin panel.`,
          });

          if (result?.json) {
            finalReview = {
              summary: result.json.summary || localReview.summary,
              findings: Array.isArray(result.json.findings) && result.json.findings.length ? result.json.findings : localReview.findings,
              recommended_actions: Array.isArray(result.json.recommended_actions) && result.json.recommended_actions.length
                ? result.json.recommended_actions
                : localReview.suggestedActions,
            };
          }
        }
      }

      let executed = [];
      if (mode === 'fix') {
        executed = await runInternalFixes(finalReview.recommended_actions || [], filtered);
        if (executed.length === 0) {
          executed = await runInternalFixes(localReview.suggestedActions || [], filtered);
        }
        await loadLogs();
      }

      setAiReview({
        summary: finalReview.summary || 'Internal diagnosis completed.',
        findings: Array.isArray(finalReview.findings) ? finalReview.findings : [],
        actions: Array.isArray(finalReview.recommended_actions) ? finalReview.recommended_actions : [],
        executed,
      });
    } catch (error) {
      logFailure('AdminAuditLogs:runAIDiagnosis', error);
      toastError(error instanceof Error ? error.message : 'AI diagnosis failed.');
      setAiReview({
        summary: 'AI diagnosis encountered an error.',
        findings: [error instanceof Error ? error.message : String(error)],
        actions: [],
        executed: [],
      });
    } finally {
      setAiRunning(false);
    }
  }

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
          <div>
            <h1 className="text-xl font-700" style={{ fontWeight: 700, color: '#c9a84c' }}>Audit Logs</h1>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Open a log type, filter it, click a row, and inspect the full error payload before testing a fix.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <input placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 text-xs py-2" style={{ width: 220, fontSize: 12 }} />
            </div>
            <button onClick={loadLogs} className="btn-ghost px-3 py-2 flex items-center gap-1.5 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={refreshErrorCodes} className="btn-ghost px-3 py-2 flex items-center gap-1.5 text-xs" title="Refresh derived error codes from row payloads">
              <RefreshCw className="w-3.5 h-3.5" />
              Error Codes
            </button>
            <button onClick={() => runAIDiagnosis('diagnose')} className="btn-ghost px-3 py-2 flex items-center gap-1.5 text-xs" disabled={aiRunning}>
              <Sparkles className={`w-3.5 h-3.5 ${aiRunning ? 'animate-pulse' : ''}`} />
              AI Diagnose
            </button>
            <button onClick={() => runAIDiagnosis('fix')} className="btn-gold px-3 py-2 flex items-center gap-1.5 text-xs" disabled={aiRunning}>
              <Wrench className="w-3.5 h-3.5" />
              AI Fix Internally
            </button>
          </div>
        </div>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setAiReview(null);
                setSelectedLog(null);
              }}
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

      {aiReview ? (
        <div className="flex-shrink-0 px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="rounded-2xl p-4" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.18)' }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>AI Review</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.72)' }}>{aiReview.summary}</p>
              </div>
              <Link to="/admin/bots" className="text-xs flex items-center gap-1" style={{ color: '#c9a84c', textDecoration: 'none' }}>
                Open Bot Team
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            {aiReview.findings?.length ? (
              <div className="mt-3 space-y-1">
                {aiReview.findings.map((finding, index) => (
                  <p key={`${finding}-${index}`} className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {index + 1}. {finding}
                  </p>
                ))}
              </div>
            ) : null}
            {aiReview.actions?.length ? (
              <div className="mt-3 space-y-1">
                {aiReview.actions.map((action, index) => (
                  <p key={`${action.action_type}-${index}`} className="text-xs" style={{ color: '#00e5a0' }}>
                    {action.action_type}: {action.reason}
                  </p>
                ))}
              </div>
            ) : null}
            {aiReview.executed?.length ? (
              <div className="mt-3 space-y-1">
                {aiReview.executed.map((line, index) => (
                  <p key={`${line}-${index}`} className="text-xs" style={{ color: '#00e5a0' }}>
                    Executed: {line}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-hidden p-4">
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
          <div className="h-full grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)] gap-4">
            <div className="overflow-y-auto space-y-1 font-mono text-xs">
              {filtered.map((log, i) => {
                const level = log.level || log.status || (log.processed === false ? 'failed' : 'info');
                const color = levelColor[level] || 'rgba(255,255,255,0.5)';
                const ts = log.created_at || log.received_at || '';
                const msg = log.msg || log.sync_type || log.webhook_type || log.endpoint || JSON.stringify(log).slice(0, 80);
                const detail = log.detail || log.error_message || '';
                const errorCode = deriveErrorCode(log);
                const active = selectedLog?.id === log.id;
                return (
                  <button
                    type="button"
                    key={log.id || i}
                    onClick={() => setSelectedLog(log)}
                    className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-white/5 transition-colors text-left"
                    style={{ background: active ? 'rgba(201,168,76,0.08)' : 'transparent', border: active ? '1px solid rgba(201,168,76,0.18)' : '1px solid transparent' }}
                  >
                    <span className="flex-shrink-0 w-16 text-right" style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>
                      {ts ? new Date(ts).toLocaleTimeString() : '--:--'}
                    </span>
                    <span className="flex-shrink-0 w-16 font-700" style={{ color, fontWeight: 700, fontSize: 10 }}>{String(level).toUpperCase()}</span>
                    <span className="flex-1 min-w-0">
                      <span style={{ color: '#e5e7eb' }}>{msg}</span>
                      {detail ? <span className="block mt-1 truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{detail}</span> : null}
                    </span>
                    {errorCode ? <span className="flex-shrink-0 text-[10px]" style={{ color: '#ff4757' }}>HTTP {errorCode}</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="overflow-y-auto rounded-2xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
              {selectedLog ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>Selected Entry</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
                      {new Date(selectedLog.created_at || selectedLog.received_at || Date.now()).toLocaleString()}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p style={{ color: 'rgba(255,255,255,0.35)' }}>Type</p>
                      <p style={{ color: '#e5e7eb' }}>{selectedLog.sync_type || selectedLog.webhook_type || selectedLog.endpoint || selectedLog.msg || 'log_entry'}</p>
                    </div>
                    <div>
                      <p style={{ color: 'rgba(255,255,255,0.35)' }}>Error Code</p>
                      <p style={{ color: deriveErrorCode(selectedLog) ? '#ff4757' : '#e5e7eb' }}>{deriveErrorCode(selectedLog) || 'Not saved'}</p>
                    </div>
                    <div>
                      <p style={{ color: 'rgba(255,255,255,0.35)' }}>Status</p>
                      <p style={{ color: '#e5e7eb' }}>{selectedLog.status || (selectedLog.processed ? 'processed' : 'failed')}</p>
                    </div>
                    <div>
                      <p style={{ color: 'rgba(255,255,255,0.35)' }}>External ID</p>
                      <p style={{ color: '#e5e7eb' }}>{selectedLog.external_id || 'Not saved'}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-700 mb-2" style={{ color: '#c9a84c', fontWeight: 700 }}>Error Message</p>
                    <div className="rounded-xl p-3 text-xs whitespace-pre-wrap" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#e5e7eb' }}>
                      {selectedLog.error_message || selectedLog.detail || selectedLog.msg || 'No error message saved.'}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-700 mb-2" style={{ color: '#c9a84c', fontWeight: 700 }}>Raw Record</p>
                    <pre className="rounded-xl p-3 text-xs overflow-x-auto" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.72)' }}>
                      {JSON.stringify(selectedLog, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>Pick a log entry to inspect its payload and error details.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
