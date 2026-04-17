import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Zap, Shield, Activity, Radio, Play, Pause, RefreshCw,
  CheckCircle, AlertTriangle, Clock, TrendingUp, Users, Navigation,
  ToggleRight, ToggleLeft, ChevronDown, ChevronUp, Terminal,
  Sliders, AlertCircle, Lock, Info, Bell
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { sentryApi } from '../../lib/sentryApi';
import { runAutoScheduler } from '../../utils/autoScheduler';
import { getAiSettings, getBotRuntimeSettings, requestAIStructuredPlan } from '../../utils/aiMotivation';
import { ensurePlatformAdminOrg } from '../../lib/platformAdminOrg';

const SECURITY_EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-threat-research`;
const SECURITY_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const RISK_WEIGHT = { low: 1, medium: 2, high: 3, critical: 4 };

const BOT_DEFS = [
  {
    id: 'sentry_bot',
    name: 'SentryBot',
    role: 'Marketplace Trip Puller',
    desc: 'Automatically pulls trips from the SentryMS marketplace on a configurable interval.',
    icon: Radio,
    color: '#00e5a0',
    defaultInterval: 60,
    intervalUnit: 'seconds',
    defaultAllowedActions: ['pull_trips', 'refresh_data'],
    defaultAutonomyLevel: 'act',
    defaultRiskThreshold: 'low',
    availableActions: [
      { key: 'pull_trips', label: 'Pull trips from marketplace' },
      { key: 'refresh_data', label: 'Refresh local data cache' },
      { key: 'alert_admin', label: 'Alert admin on errors' },
    ],
  },
  {
    id: 'scheduler_bot',
    name: 'SchedulerBot',
    role: 'Auto-Assignment Engine',
    desc: 'Runs the AI scheduler periodically to route trips to the best available drivers.',
    icon: Zap,
    color: '#c9a84c',
    defaultInterval: 5,
    intervalUnit: 'minutes',
    defaultAllowedActions: ['dry_run_schedule', 'auto_assign', 'alert_admin'],
    defaultAutonomyLevel: 'act',
    defaultRiskThreshold: 'medium',
    availableActions: [
      { key: 'dry_run_schedule', label: 'Run schedule (dry-run, no assignments)' },
      { key: 'auto_assign', label: 'Auto-assign trips to drivers' },
      { key: 'alert_admin', label: 'Alert admin on anomalies' },
    ],
  },
  {
    id: 'health_bot',
    name: 'HealthBot',
    role: 'System Monitor',
    desc: 'Monitors Sentry API health, driver connectivity, and data freshness.',
    icon: Activity,
    color: '#0ea5e9',
    defaultInterval: 2,
    intervalUnit: 'minutes',
    defaultAllowedActions: ['check_health', 'alert_admin', 'restart_connections'],
    defaultAutonomyLevel: 'act',
    defaultRiskThreshold: 'medium',
    availableActions: [
      { key: 'check_health', label: 'Check system health' },
      { key: 'alert_admin', label: 'Alert admin on issues' },
      { key: 'restart_connections', label: 'Restart stale connections' },
    ],
  },
  {
    id: 'security_bot',
    name: 'SecurityBot',
    role: 'Policy Enforcer',
    desc: 'Runs threat scans, maps events to MITRE ATT&CK, and mitigates safe issues while escalating higher-risk threats.',
    icon: Shield,
    color: '#f59e0b',
    defaultInterval: 10,
    intervalUnit: 'minutes',
    defaultAllowedActions: ['scan_policies', 'flag_anomalies', 'cancel_duplicates', 'investigate_threat', 'mitigate_threat', 'acknowledge_alert', 'alert_admin'],
    defaultAutonomyLevel: 'suggest',
    defaultRiskThreshold: 'medium',
    availableActions: [
      { key: 'scan_policies', label: 'Scan for policy violations' },
      { key: 'alert_admin', label: 'Alert admin on violations' },
      { key: 'flag_anomalies', label: 'Flag anomalous records' },
      { key: 'cancel_duplicates', label: 'Cancel duplicate assignments' },
      { key: 'investigate_threat', label: 'Mark active threats as investigating' },
      { key: 'mitigate_threat', label: 'Mitigate lower-risk threats with known steps' },
      { key: 'acknowledge_alert', label: 'Acknowledge low-risk alerts' },
    ],
  },
  {
    id: 'codex_bot',
    name: 'Frank',
    role: 'Fix & Investigation Worker',
    desc: 'Codex-powered implementer bot for operational issue diagnosis, safe fix plans, and controlled automation proposals.',
    icon: Bot,
    color: '#7dd3fc',
    defaultInterval: 15,
    intervalUnit: 'minutes',
    defaultAllowedActions: ['refresh_data', 'check_health', 'restart_connections', 'flag_anomalies', 'auto_assign', 'alert_admin'],
    defaultAutonomyLevel: 'suggest',
    defaultRiskThreshold: 'medium',
    defaultEnabled: false,
    availableActions: [
      { key: 'refresh_data', label: 'Refresh local data cache' },
      { key: 'check_health', label: 'Run health diagnostics' },
      { key: 'restart_connections', label: 'Reload stale connections' },
      { key: 'flag_anomalies', label: 'Flag suspicious assignments' },
      { key: 'auto_assign', label: 'Trigger auto-assignment' },
      { key: 'alert_admin', label: 'Alert admin on serious findings' },
    ],
  },
  {
    id: 'claude_bot',
    name: 'Darius',
    role: 'Reviewer & Second Opinion',
    desc: 'Claude-powered reviewer bot for second opinions, threat review, and risk-focused approval guidance.',
    icon: Bot,
    color: '#c084fc',
    defaultInterval: 20,
    intervalUnit: 'minutes',
    defaultAllowedActions: ['flag_anomalies', 'investigate_threat', 'mitigate_threat', 'acknowledge_alert', 'alert_admin'],
    defaultAutonomyLevel: 'suggest',
    defaultRiskThreshold: 'high',
    defaultEnabled: false,
    availableActions: [
      { key: 'flag_anomalies', label: 'Flag risky records for review' },
      { key: 'investigate_threat', label: 'Move threats to investigating' },
      { key: 'mitigate_threat', label: 'Mitigate lower-risk threats with clear steps' },
      { key: 'acknowledge_alert', label: 'Acknowledge noise-level alerts' },
      { key: 'alert_admin', label: 'Escalate to admin for final review' },
    ],
  },
];

function getDefaultBotConfig(def, orgId) {
  return {
    org_id: orgId,
    bot_id: def.id,
    bot_name: def.name,
    autonomy_level: def.defaultAutonomyLevel || 'observe',
    risk_threshold: def.defaultRiskThreshold || 'low',
    allowed_actions: def.defaultAllowedActions,
    payout_protection: true,
    kill_switch: def.defaultEnabled === false,
    updated_at: new Date().toISOString(),
  };
}

const RISK_LEVELS = [
  { key: 'low', label: 'Low', color: '#00e5a0', desc: 'Only monitor and alert — no automatic actions' },
  { key: 'medium', label: 'Medium', color: '#f59e0b', desc: 'Auto-run safe actions; escalate risky ones' },
  { key: 'high', label: 'High', color: '#ff4757', desc: 'Execute most actions automatically; escalate critical only' },
];

const AUTONOMY_LEVELS = [
  { key: 'observe', label: 'Observe', desc: 'Log and alert only — no automatic actions taken' },
  { key: 'suggest', label: 'Suggest', desc: 'Queue suggested actions for admin approval' },
  { key: 'act', label: 'Act', desc: 'Execute approved actions automatically within threshold' },
];

function riskAtOrBelow(level, threshold) {
  return (RISK_WEIGHT[level] || 99) <= (RISK_WEIGHT[threshold] || 0);
}

function useBot(botId, intervalSecs, enabled, runFn) {
  const timerRef = useRef(null);
  const [lastRun, setLastRun] = useState(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('idle');
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!enabled) { setStatus('stopped'); return; }

    async function tick() {
      setRunning(true);
      setStatus('running');
      try {
        const result = await runFn();
        setLastRun(new Date());
        setLastResult(result);
        setStatus(result?.error ? 'error' : 'ok');
      } catch (error) {
        setLastRun(new Date());
        setLastResult({ error: error.message || `Bot ${botId} failed`, summary: error.message || `Bot ${botId} failed` });
        setStatus('error');
      } finally {
        setRunning(false);
      }
    }

    tick();
    timerRef.current = setInterval(tick, intervalSecs * 1000);
    return () => clearInterval(timerRef.current);
  }, [enabled, intervalSecs]);

  return { lastRun, running, status, lastResult };
}

function BotLog({ logs }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  if (!logs.length) return <p className="text-xs py-3 text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>No activity yet</p>;
  return (
    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
      {logs.map((l, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span className="font-mono flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>
            {new Date(l.time).toLocaleTimeString()}
          </span>
          <span style={{ color: l.ok ? 'rgba(255,255,255,0.6)' : '#f87171' }}>{l.msg}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function RiskSettingsPanel({ def, config, onSave }) {
  const [local, setLocal] = useState({ ...config });
  const [dirty, setDirty] = useState(false);

  function update(key, val) {
    setLocal(p => ({ ...p, [key]: val }));
    setDirty(true);
  }

  function toggleAction(key) {
    const current = local.allowed_actions || [];
    const next = current.includes(key) ? current.filter(a => a !== key) : [...current, key];
    update('allowed_actions', next);
  }

  const riskColor = RISK_LEVELS.find(r => r.key === local.risk_threshold)?.color || '#00e5a0';

  return (
    <div className="space-y-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
        Risk Settings
      </p>

      <div>
        <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>Autonomy Level</p>
        <div className="grid grid-cols-3 gap-1.5">
          {AUTONOMY_LEVELS.map(a => (
            <button
              key={a.key}
              onClick={() => update('autonomy_level', a.key)}
              className="px-2 py-2 rounded-xl text-xs text-left transition-all"
              style={{
                background: local.autonomy_level === a.key ? `${def.color}15` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${local.autonomy_level === a.key ? def.color + '40' : 'rgba(255,255,255,0.07)'}`,
                color: local.autonomy_level === a.key ? def.color : 'rgba(255,255,255,0.4)',
                fontWeight: local.autonomy_level === a.key ? 600 : 400,
              }}
            >
              <div className="font-600">{a.label}</div>
              <div className="text-xs mt-0.5 leading-tight" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{a.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>Risk Threshold</p>
        <div className="flex gap-2">
          {RISK_LEVELS.map(r => (
            <button
              key={r.key}
              onClick={() => update('risk_threshold', r.key)}
              className="flex-1 px-2 py-2 rounded-xl text-xs transition-all"
              style={{
                background: local.risk_threshold === r.key ? `${r.color}15` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${local.risk_threshold === r.key ? r.color + '40' : 'rgba(255,255,255,0.07)'}`,
                color: local.risk_threshold === r.key ? r.color : 'rgba(255,255,255,0.35)',
                fontWeight: local.risk_threshold === r.key ? 600 : 400,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {RISK_LEVELS.find(r => r.key === local.risk_threshold)?.desc}
        </p>
      </div>

      <div>
        <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>Allowed Actions</p>
        <div className="space-y-1.5">
          {def.availableActions.map(action => {
            const isAllowed = (local.allowed_actions || []).includes(action.key);
            const isPayout = action.key.includes('payout') || action.key.includes('payment');
            return (
              <div
                key={action.key}
                className="flex items-center justify-between px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center gap-2">
                  {isPayout && <Lock className="w-3 h-3" style={{ color: '#ff4757' }} />}
                  <span className="text-xs" style={{ color: isPayout ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.5)' }}>
                    {action.label}
                  </span>
                  {isPayout && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,71,87,0.1)', color: '#ff4757', fontSize: 9 }}>ALWAYS REQUIRES ADMIN</span>}
                </div>
                <button
                  onClick={() => !isPayout && toggleAction(action.key)}
                  disabled={isPayout}
                  className="w-7 h-4 rounded-full relative transition-all"
                  style={{
                    background: isPayout ? 'rgba(255,71,87,0.2)' : isAllowed ? def.color : 'rgba(255,255,255,0.1)',
                    opacity: isPayout ? 0.5 : 1,
                    cursor: isPayout ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div
                    className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                    style={{
                      background: '#fff',
                      left: isAllowed && !isPayout ? 'calc(100% - 14px)' : '2px',
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.15)' }}>
        <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#ff4757' }} />
        <p className="text-xs" style={{ color: 'rgba(255,150,150,0.8)', lineHeight: 1.5 }}>
          Payout initiation is permanently blocked from autonomous action. Bots will flag anomalies and prompt admin for approval.
        </p>
      </div>

      {dirty && (
        <button
          onClick={() => { onSave(local); setDirty(false); }}
          className="w-full py-2 rounded-xl text-xs font-600 transition-all"
          style={{ background: `${def.color}15`, border: `1px solid ${def.color}30`, color: def.color, fontWeight: 600 }}
        >
          Save Risk Settings
        </button>
      )}
    </div>
  );
}

function BotCard({ def, botState, enabled, onToggle, intervalSecs, onIntervalChange, config, onConfigSave }) {
  const [expanded, setExpanded] = useState(false);
  const [showRisk, setShowRisk] = useState(false);
  const [logs, setLogs] = useState([]);
  const Icon = def.icon;

  useEffect(() => {
    if (!botState.lastResult) return;
    const entry = {
      time: new Date().toISOString(),
      ok: !botState.lastResult.error,
      msg: botState.lastResult.summary || (botState.lastResult.error ? `Error: ${botState.lastResult.error}` : 'Run complete'),
    };
    setLogs(prev => [...prev.slice(-49), entry]);
  }, [botState.lastResult]);

  const statusColors = { idle: 'rgba(255,255,255,0.2)', ok: '#00e5a0', error: '#ff4757', running: def.color, stopped: 'rgba(255,255,255,0.2)' };
  const statusLabel = { idle: 'Idle', ok: 'OK', error: 'Error', running: 'Running', stopped: 'Stopped' };
  const riskColor = RISK_LEVELS.find(r => r.key === config?.risk_threshold)?.color || 'rgba(255,255,255,0.2)';
  const autonomy = config?.autonomy_level || 'observe';

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: '#0d1117',
        border: `1px solid ${enabled ? def.color + '25' : 'rgba(255,255,255,0.07)'}`,
      }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${def.color}15`, border: `1px solid ${def.color}30` }}
            >
              <Icon className="w-5 h-5" style={{ color: def.color }} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{def.name}</p>
                <div className="flex items-center gap-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: statusColors[botState.status],
                      boxShadow: botState.status === 'running' ? `0 0 6px ${def.color}` : botState.status === 'ok' ? '0 0 4px #00e5a0' : 'none',
                    }}
                  />
                  <span className="text-xs" style={{ color: statusColors[botState.status] }}>{statusLabel[botState.status]}</span>
                </div>
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: `${riskColor}15`, color: riskColor, fontSize: 9, border: `1px solid ${riskColor}25` }}
                >
                  {(config?.risk_threshold || 'low').toUpperCase()}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', fontSize: 9 }}
                >
                  {autonomy.toUpperCase()}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{def.role}</p>
            </div>
          </div>
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-600 flex-shrink-0 transition-all"
            style={{
              background: enabled ? `${def.color}15` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${enabled ? def.color + '30' : 'rgba(255,255,255,0.08)'}`,
              color: enabled ? def.color : 'rgba(255,255,255,0.4)',
              fontWeight: 600,
            }}
          >
            {enabled ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
            {enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{def.desc}</p>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Every</span>
              <input
                type="number"
                min={def.id === 'sentry_bot' ? 15 : 1}
                max={3600}
                value={def.intervalUnit === 'seconds' ? intervalSecs : Math.round(intervalSecs / 60)}
                onChange={e => {
                  const v = parseInt(e.target.value) || 1;
                  onIntervalChange(def.intervalUnit === 'seconds' ? v : v * 60);
                }}
                className="w-14 text-center text-xs py-1 px-2"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#e5e7eb' }}
              />
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{def.intervalUnit}</span>
            </div>
            {botState.lastRun && (
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                last: {botState.lastRun.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowRisk(p => !p); setExpanded(false); }}
              className="flex items-center gap-1 text-xs btn-ghost px-2 py-1"
              style={{ color: showRisk ? def.color : undefined }}
            >
              <Sliders className="w-3 h-3" />
              Risk
              {showRisk ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              onClick={() => { setExpanded(p => !p); setShowRisk(false); }}
              className="flex items-center gap-1 text-xs btn-ghost px-2 py-1"
            >
              <Terminal className="w-3 h-3" />
              Log
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>

      {showRisk && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <RiskSettingsPanel def={def} config={config || { autonomy_level: 'observe', risk_threshold: 'low', allowed_actions: def.defaultAllowedActions }} onSave={onConfigSave} />
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-xs font-700 uppercase tracking-wider my-3" style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>Activity Log</p>
          <BotLog logs={logs} />
        </div>
      )}
    </div>
  );
}

function PendingActionsPanel({ pendingActions, onApprove, onReject }) {
  if (!pendingActions.length) return null;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(245,158,11,0.2)' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
        <Bell className="w-4 h-4" style={{ color: '#f59e0b' }} />
        <span className="text-sm font-700" style={{ color: '#f59e0b', fontWeight: 700 }}>Pending Bot Actions ({pendingActions.length})</span>
      </div>
      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        {pendingActions.map(action => (
          <div key={action.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{action.bot_name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: 9 }}>
                    {action.risk_level.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{action.trigger_reason}</p>
                <p className="text-xs mt-0.5 font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>Action: {action.action_type}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>{new Date(action.created_at).toLocaleString()}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => onReject(action.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs transition-all"
                  style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.2)', color: '#ff4757' }}
                >
                  Reject
                </button>
                <button
                  onClick={() => onApprove(action.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs transition-all"
                  style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0' }}
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BotTeamPanel() {
  const { org, user, profile, drivers, trips, assignments, refreshTripsFromSentry, checkSentryHealth, loadAssignments, loadDrivers, loadTrips, isPlatformOwner } = useApp();
  const [botEnabled, setBotEnabled] = useState({
    sentry_bot: false,
    scheduler_bot: false,
    health_bot: false,
    security_bot: false,
    codex_bot: false,
    claude_bot: false,
  });
  const [botIntervals, setBotIntervals] = useState({
    sentry_bot: 60,
    scheduler_bot: 300,
    health_bot: 120,
    security_bot: 600,
    codex_bot: 900,
    claude_bot: 1200,
  });
  const [botConfigs, setBotConfigs] = useState({});
  const [schedulerConfig, setSchedulerConfig] = useState(null);
  const [pendingActions, setPendingActions] = useState([]);
  const [globalKillSwitch, setGlobalKillSwitch] = useState(false);
  const [resolvedOrgId, setResolvedOrgId] = useState(null);
  const [resolvingOrgId, setResolvingOrgId] = useState(true);
  const [panelError, setPanelError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function resolveOrgId() {
      setResolvingOrgId(true);

      if (org?.id) {
        if (mounted) {
          setResolvedOrgId(org.id);
          setResolvingOrgId(false);
        }
        return;
      }

      if (!user?.id) {
        if (mounted) {
          setResolvedOrgId(null);
          setResolvingOrgId(false);
        }
        return;
      }

      const { data: membership } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (membership?.org_id) {
        if (mounted) {
          setResolvedOrgId(membership.org_id);
          setResolvingOrgId(false);
        }
        return;
      }

      if (isPlatformOwner) {
        try {
          const platformOrg = await ensurePlatformAdminOrg(user);
          if (platformOrg?.id) {
            if (mounted) {
              setResolvedOrgId(platformOrg.id);
              setResolvingOrgId(false);
            }
            return;
          }
        } catch (error) {
          console.warn('BotTeamPanel: failed to bootstrap admin org', error);
        }
      }

      const { data: latestBotRow } = await supabase
        .from('bot_config')
        .select('org_id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestBotRow?.org_id) {
        if (mounted) {
          setResolvedOrgId(latestBotRow.org_id);
          setResolvingOrgId(false);
        }
        return;
      }

      const { data: latestAiRow } = await supabase
        .from('ai_settings')
        .select('org_id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestAiRow?.org_id) {
        if (mounted) {
          setResolvedOrgId(latestAiRow.org_id);
          setResolvingOrgId(false);
        }
        return;
      }

      const { data: fallbackOrg } = await supabase
        .from('organizations')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (mounted) {
        setResolvedOrgId(fallbackOrg?.id || null);
        setResolvingOrgId(false);
      }
    }

    resolveOrgId();
    return () => {
      mounted = false;
    };
  }, [org?.id, user?.id, isPlatformOwner]);

  useEffect(() => {
    let active = true;

    async function loadPanelData() {
      if (!resolvedOrgId) return;
      try {
        setPanelError(null);
        await Promise.all([
          loadConfig(),
          loadBotConfigs(),
          loadPendingActions(),
          loadAiSettings(),
        ]);
      } catch (error) {
        if (active) {
          setPanelError(error.message || 'Bot Team failed to load');
        }
      }
    }

    loadPanelData();
    return () => {
      active = false;
    };
  }, [resolvedOrgId]);

  async function loadAiSettings() {
    if (!resolvedOrgId) return;
    const { data } = await supabase.from('ai_settings').select('*').eq('org_id', resolvedOrgId).maybeSingle();
    if (!data) return;
    const paused = data.all_bots_paused ?? false;
    if (paused) {
      setGlobalKillSwitch(true);
      setBotEnabled({
        sentry_bot: false,
        scheduler_bot: false,
        health_bot: false,
        security_bot: false,
        codex_bot: false,
        claude_bot: false,
      });
    } else {
      setBotEnabled({
        sentry_bot: data.sentry_bot_enabled ?? false,
        scheduler_bot: data.scheduler_bot_enabled ?? false,
        health_bot: data.health_bot_enabled ?? false,
        security_bot: data.security_bot_enabled ?? false,
        codex_bot: false,
        claude_bot: false,
      });
    }
  }

  async function persistAiSettings(patch) {
    if (!resolvedOrgId) return;
    const { data: existing } = await supabase.from('ai_settings').select('id').eq('org_id', resolvedOrgId).maybeSingle();
    if (existing) {
      await supabase.from('ai_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('org_id', resolvedOrgId);
    } else {
      await supabase.from('ai_settings').insert({ ...patch, org_id: resolvedOrgId });
    }
  }

  async function loadConfig() {
    if (!resolvedOrgId) return;
    const { data } = await supabase.from('auto_scheduler_config').select('*').eq('org_id', resolvedOrgId).maybeSingle();
    setSchedulerConfig(data);
  }

  async function loadBotConfigs() {
    if (!resolvedOrgId) return;
    const { data } = await supabase.from('bot_config').select('*').eq('org_id', resolvedOrgId);
    const map = {};
    (data || []).forEach(c => { map[c.bot_id] = c; });

    const missing = BOT_DEFS.filter(def => !map[def.id]).map(def => getDefaultBotConfig(def, resolvedOrgId));
    if (missing.length > 0) {
      await supabase.from('bot_config').upsert(missing, { onConflict: 'org_id,bot_id' });
      missing.forEach(config => { map[config.bot_id] = config; });
    }

    setBotConfigs(map);
    setBotEnabled(prev => ({
      ...prev,
      codex_bot: map.codex_bot ? !map.codex_bot.kill_switch : false,
      claude_bot: map.claude_bot ? !map.claude_bot.kill_switch : false,
    }));
  }

  async function loadPendingActions() {
    if (!resolvedOrgId) return;
    const { data } = await supabase
      .from('pending_bot_actions')
      .select('*')
      .eq('org_id', resolvedOrgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setPendingActions(data || []);
  }

  async function saveConfig(botId, config) {
    if (!resolvedOrgId) return;
    const botDef = BOT_DEFS.find(b => b.id === botId);
    const payload = {
      org_id: resolvedOrgId,
      bot_id: botId,
      bot_name: botDef.name,
      autonomy_level: config.autonomy_level || botDef.defaultAutonomyLevel || 'observe',
      risk_threshold: config.risk_threshold || botDef.defaultRiskThreshold || 'low',
      allowed_actions: config.allowed_actions || botDef.defaultAllowedActions,
      payout_protection: true,
      kill_switch: config.kill_switch ?? false,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('bot_config').upsert(payload, { onConflict: 'org_id,bot_id' });
    setBotConfigs(prev => ({ ...prev, [botId]: payload }));
  }

  async function logBotAction(botId, botName, triggerReason, actionType, riskLevel, outcome, detail) {
    if (!resolvedOrgId) return;
    await supabase.from('bot_actions').insert({
      org_id: resolvedOrgId,
      bot_id: botId,
      bot_name: botName,
      trigger_reason: triggerReason,
      action_type: actionType,
      risk_level: riskLevel,
      outcome,
      outcome_detail: detail || '',
    });
  }

  async function escalateBotAction(botId, botName, triggerReason, actionType, riskLevel, actionPayload = {}) {
    if (!resolvedOrgId) return;
    await supabase.from('pending_bot_actions').insert({
      org_id: resolvedOrgId,
      bot_id: botId,
      bot_name: botName,
      trigger_reason: triggerReason,
      action_type: actionType,
      action_payload: actionPayload,
      risk_level: riskLevel,
      status: 'pending',
    });
    await loadPendingActions();
  }

  async function cancelDuplicateAssignments(tripIds = []) {
    if (!tripIds.length) return { cancelled: 0 };
    const { data: dupAssignments } = await supabase
      .from('trip_assignments')
      .select('id, trip_id, status, notes, assigned_at')
      .in('trip_id', tripIds)
      .not('status', 'in', '("completed","cancelled","rejected")')
      .order('assigned_at', { ascending: true });

    const rowsToCancel = [];
    const seenTripIds = new Set();
    (dupAssignments || []).forEach(assignment => {
      if (!seenTripIds.has(assignment.trip_id)) {
        seenTripIds.add(assignment.trip_id);
        return;
      }
      rowsToCancel.push(assignment);
    });

    for (const assignment of rowsToCancel) {
      await supabase
        .from('trip_assignments')
        .update({
          status: 'cancelled',
          notes: [assignment.notes, 'SECURITY_BOT_CANCELLED_DUPLICATE'].filter(Boolean).join(' | '),
        })
        .eq('id', assignment.id);
    }

    return { cancelled: rowsToCancel.length };
  }

  async function flagAssignmentsForDrivers(driverIds = [], note = 'SECURITY_BOT_FLAGGED') {
    if (!driverIds.length) return { flagged: 0 };
    const { data: activeAssignments } = await supabase
      .from('trip_assignments')
      .select('id, notes')
      .in('driver_id', driverIds)
      .not('status', 'in', '("completed","cancelled","rejected")');

    for (const assignment of activeAssignments || []) {
      await supabase
        .from('trip_assignments')
        .update({
          notes: [assignment.notes, note].filter(Boolean).join(' | '),
        })
        .eq('id', assignment.id);
    }

    return { flagged: (activeAssignments || []).length };
  }

  async function acknowledgeAlertsByIds(alertIds = []) {
    if (!alertIds.length) return { acknowledged: 0 };
    await supabase
      .from('security_alerts')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: profile?.id || null,
      })
      .in('id', alertIds);
    return { acknowledged: alertIds.length };
  }

  async function updateThreatsAndLinkedAlerts(threatIds = [], status = 'investigating') {
    if (!threatIds.length) return { updated: 0 };

    await supabase
      .from('security_threats')
      .update({
        status,
        updated_at: new Date().toISOString(),
        resolved_at: ['mitigated', 'resolved', 'false_positive'].includes(status) ? new Date().toISOString() : null,
      })
      .in('id', threatIds);

    if (['mitigated', 'resolved', 'false_positive'].includes(status)) {
      const { data: linkedAlerts } = await supabase
        .from('security_alerts')
        .select('id')
        .in('threat_id', threatIds)
        .eq('acknowledged', false);
      await acknowledgeAlertsByIds((linkedAlerts || []).map(alert => alert.id));
    }

    return { updated: threatIds.length };
  }

  async function runSecurityThreatScan() {
    const res = await fetch(`${SECURITY_EDGE_URL}/scan`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SECURITY_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Threat scan failed with ${res.status}`);
    }

    return res.json();
  }

  async function logAIReview(botId, botName, prompt, response, model, contextType = 'operations_review') {
    if (!resolvedOrgId) return;
    await supabase.from('ai_logs').insert({
      org_id: resolvedOrgId,
      driver_id: null,
      driver_name: botName,
      context_type: contextType,
      prompt,
      response,
      model_used: model || '',
      tokens_used: 0,
    });
  }

  function normalizeRecommendedActions(actions = []) {
    return actions
      .filter(Boolean)
      .map(action => ({
        action_type: action.action_type,
        reason: action.reason || 'AI recommendation',
        risk_level: action.risk_level || 'medium',
        payload: action.payload || {},
      }))
      .filter(action => action.action_type);
  }

  async function processBotRecommendations(botId, botName, config, actions = []) {
    const autonomy = config?.autonomy_level || 'observe';
    const riskThreshold = config?.risk_threshold || 'low';
    const allowedActions = config?.allowed_actions || [];
    const executed = [];
    const escalated = [];

    for (const action of normalizeRecommendedActions(actions)) {
      if (!allowedActions.includes(action.action_type)) continue;

      if (autonomy === 'act' && riskAtOrBelow(action.risk_level, riskThreshold)) {
        const execution = await executePendingAction({
          action_type: action.action_type,
          action_payload: action.payload,
        });
        executed.push(`${action.action_type}: ${execution.summary}`);
        await logBotAction(botId, botName, action.reason, action.action_type, action.risk_level, 'executed', execution.summary || '');
      } else if (autonomy !== 'observe') {
        await escalateBotAction(botId, botName, action.reason, action.action_type, action.risk_level, action.payload);
        escalated.push(action.action_type);
      }
    }

    return { executed, escalated };
  }

  async function executePendingAction(action) {
    const payload = action.action_payload || {};

    switch (action.action_type) {
      case 'pull_trips':
      case 'refresh_data': {
        const result = await refreshTripsFromSentry();
        await loadTrips();
        return { summary: `Pulled ${result?.count || 0} trips` };
      }
      case 'check_health': {
        const result = await checkSentryHealth();
        return { summary: result?.authenticated ? 'Sentry health check passed' : (result?.error || 'Health check failed') };
      }
      case 'restart_connections': {
        await Promise.all([loadDrivers(), loadTrips(), loadAssignments(), checkSentryHealth()]);
        return { summary: 'Reloaded drivers, trips, assignments, and Sentry health' };
      }
      case 'auto_assign': {
        const cfg = {
          ...(schedulerConfig || {}),
          ...(payload.configSnapshot || {}),
          auto_assign: true,
        };
        const result = await runAutoScheduler({
          drivers,
          trips,
          assignments,
          config: cfg,
          orgId: resolvedOrgId,
          dryRun: false,
        });
        await Promise.all([loadAssignments(), loadTrips()]);
        return { summary: `Auto-assigned ${result.totalAssigned} trips` };
      }
      case 'cancel_duplicates': {
        const result = await cancelDuplicateAssignments(payload.trip_ids || []);
        await loadAssignments();
        return { summary: `Cancelled ${result.cancelled} duplicate assignments` };
      }
      case 'flag_anomalies': {
        const result = await flagAssignmentsForDrivers(payload.driver_ids || [], payload.note || 'SECURITY_BOT_FLAGGED');
        await loadAssignments();
        return { summary: `Flagged ${result.flagged} assignments for review` };
      }
      case 'acknowledge_alert': {
        const result = await acknowledgeAlertsByIds(payload.alert_ids || []);
        return { summary: `Acknowledged ${result.acknowledged} alerts` };
      }
      case 'investigate_threat': {
        const result = await updateThreatsAndLinkedAlerts(payload.threat_ids || [], 'investigating');
        return { summary: `Moved ${result.updated} threats to investigating` };
      }
      case 'mitigate_threat': {
        const result = await updateThreatsAndLinkedAlerts(payload.threat_ids || [], 'mitigated');
        return { summary: `Mitigated ${result.updated} threats and synced linked alerts` };
      }
      default:
        return { summary: `No executor registered for ${action.action_type}` };
    }
  }

  async function handleApprove(actionId) {
    const { data: action } = await supabase
      .from('pending_bot_actions')
      .select('*')
      .eq('id', actionId)
      .maybeSingle();

    if (!action) return;

    const execution = await executePendingAction(action);

    await supabase.from('pending_bot_actions').update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile?.id || null,
      review_note: execution.summary || '',
    }).eq('id', actionId);

    await logBotAction(action.bot_id, action.bot_name, `Approved by admin: ${action.trigger_reason}`, action.action_type, action.risk_level, 'executed', execution.summary || '');
    loadPendingActions();
  }

  async function handleReject(actionId) {
    await supabase.from('pending_bot_actions').update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile?.id || null,
    }).eq('id', actionId);
    loadPendingActions();
  }

  async function toggleGlobalKillSwitch() {
    const next = !globalKillSwitch;
    setGlobalKillSwitch(next);
    if (next) {
      setBotEnabled({
        sentry_bot: false,
        scheduler_bot: false,
        health_bot: false,
        security_bot: false,
        codex_bot: false,
        claude_bot: false,
      });
    }
    for (const def of BOT_DEFS) {
      await supabase.from('bot_config').upsert({
        org_id: resolvedOrgId,
        bot_id: def.id,
        bot_name: def.name,
        kill_switch: next,
        autonomy_level: botConfigs[def.id]?.autonomy_level || def.defaultAutonomyLevel || 'observe',
        risk_threshold: botConfigs[def.id]?.risk_threshold || def.defaultRiskThreshold || 'low',
        allowed_actions: botConfigs[def.id]?.allowed_actions || def.defaultAllowedActions,
        payout_protection: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,bot_id' });
    }
    await persistAiSettings({ all_bots_paused: next });
  }

  async function runSentryBot() {
    const config = botConfigs['sentry_bot'] || getDefaultBotConfig(BOT_DEFS.find(b => b.id === 'sentry_bot'), resolvedOrgId);
    if (globalKillSwitch || config?.kill_switch) return { summary: 'Kill switch active — bot halted' };
    const result = await refreshTripsFromSentry();
    if (result?.error) {
      await logBotAction('sentry_bot', 'SentryBot', 'Scheduled trip pull', 'pull_trips', 'low', 'failed', result.error);
      return { error: result.error, summary: `Failed to pull trips: ${result.error}` };
    }
    await logBotAction('sentry_bot', 'SentryBot', 'Scheduled trip pull', 'pull_trips', 'low', 'executed', `Pulled ${result?.count || 0} trips`);
    return { summary: `Pulled ${result?.count || 0} trips from marketplace` };
  }

  async function runSchedulerBot() {
    const config = botConfigs['scheduler_bot'] || getDefaultBotConfig(BOT_DEFS.find(b => b.id === 'scheduler_bot'), resolvedOrgId);
    if (globalKillSwitch || config?.kill_switch) return { summary: 'Kill switch active — bot halted' };
    const cfg = schedulerConfig || {
      revenue_target_per_hour: 60,
      driver_pay_per_hour: 35,
      max_trip_distance_miles: 25,
      proximity_weight: 7,
      mileage_weight: 5,
      price_weight: 8,
      buffer_mins: 15,
      auto_assign: false,
      shift_hours: '7am-5pm',
    };
    const autonomy = config?.autonomy_level || 'observe';
    const riskThreshold = config?.risk_threshold || 'low';
    const allowedActions = config?.allowed_actions || [];
    const canAutoAssign =
      cfg.auto_assign &&
      autonomy === 'act' &&
      riskThreshold !== 'low' &&
      allowedActions.includes('auto_assign');

    if (!canAutoAssign && cfg.auto_assign && autonomy === 'suggest' && allowedActions.includes('auto_assign')) {
      await escalateBotAction('scheduler_bot', 'SchedulerBot', 'Auto-assign is enabled but autonomy is set to suggest', 'auto_assign', 'medium', { configSnapshot: cfg });
    }

    const result = await runAutoScheduler({
      drivers,
      trips,
      assignments,
      config: { ...cfg, auto_assign: canAutoAssign },
      orgId: resolvedOrgId,
      dryRun: !canAutoAssign,
    });
    await logBotAction(
      'scheduler_bot',
      'SchedulerBot',
      'Scheduled run',
      canAutoAssign ? 'auto_assign' : 'dry_run_schedule',
      canAutoAssign ? 'medium' : 'low',
      'executed',
      canAutoAssign ? `${result.totalAssigned} trips auto-assigned` : `${result.totalAssigned} trips analyzed`
    );
    if (canAutoAssign) {
      await loadAssignments();
      await loadTrips();
    }
    return {
      summary: canAutoAssign
        ? `Assigned ${result.totalAssigned} trips across ${result.driversProcessed} drivers — $${result.totalRevenue?.toFixed(2)} projected`
        : `Analyzed ${result.totalAssigned} trips across ${result.driversProcessed} drivers — $${result.totalRevenue?.toFixed(2)} projected (dry-run)`,
      error: result.issues?.length > 0 ? result.issues[0] : null,
    };
  }

  async function runHealthBot() {
    const config = botConfigs['health_bot'] || getDefaultBotConfig(BOT_DEFS.find(b => b.id === 'health_bot'), resolvedOrgId);
    if (globalKillSwitch || config?.kill_switch) return { summary: 'Kill switch active — bot halted' };
    const result = await checkSentryHealth();
    const issues = [];
    const allowedActions = config?.allowed_actions || [];
    const autonomy = config?.autonomy_level || 'observe';
    const riskThreshold = config?.risk_threshold || 'low';
    if (!result.authenticated) issues.push('Sentry API auth failed');
    const activeDrivers = drivers.filter(d => d.status === 'online' || d.status === 'on_trip').length;
    if (activeDrivers === 0 && drivers.length > 0) issues.push('No drivers online');
    if (issues.length > 0) {
      await logBotAction('health_bot', 'HealthBot', 'System health check', 'check_health', 'medium', 'escalated', issues.join('; '));
      if (allowedActions.includes('restart_connections')) {
        if (autonomy === 'act' && riskThreshold !== 'low') {
          await Promise.all([loadDrivers(), loadTrips(), loadAssignments(), checkSentryHealth()]);
          await logBotAction('health_bot', 'HealthBot', 'Automatic recovery', 'restart_connections', 'medium', 'executed', 'Reloaded stale connections and core data');
        } else if (autonomy === 'suggest') {
          await escalateBotAction('health_bot', 'HealthBot', issues.join('; '), 'restart_connections', 'medium', { issues });
        }
      }
    }
    return {
      summary: `Sentry ${result.authenticated ? 'connected' : 'disconnected'} (${result.latencyMs || '?'}ms) · ${activeDrivers} drivers active · ${trips.length} trips loaded`,
      error: issues.length > 0 ? issues.join('; ') : null,
    };
  }

  async function runSecurityBot() {
    const config = botConfigs['security_bot'] || getDefaultBotConfig(BOT_DEFS.find(b => b.id === 'security_bot'), resolvedOrgId);
    if (globalKillSwitch || config?.kill_switch) return { summary: 'Kill switch active — bot halted' };
    const issues = [];
    const actionsTaken = [];
    const allowedActions = config?.allowed_actions || [];
    const autonomy = config?.autonomy_level || 'observe';
    const riskThreshold = config?.risk_threshold || 'low';
    const assignedTripIds = assignments.filter(a => !['completed', 'cancelled', 'rejected'].includes(a.status)).map(a => a.trip_id);
    const duplicates = [...new Set(assignedTripIds.filter((id, i) => assignedTripIds.indexOf(id) !== i))];
    if (duplicates.length > 0) issues.push(`${duplicates.length} duplicate trip assignments detected`);

    const highValueTrips = assignments.filter(a => parseFloat(a.delivery_price) > 200 && a.status === 'pending');
    if (highValueTrips.length > 5) issues.push(`${highValueTrips.length} high-value trips unaccepted`);

    const offlineWithTrips = drivers.filter(d =>
      d.status === 'offline' &&
      assignments.some(a => a.driver_id === d.id && a.status === 'accepted')
    );
    if (offlineWithTrips.length > 0) {
      issues.push(`${offlineWithTrips.length} offline drivers have active trip assignments`);
    }

    let scanResult = null;
    if (allowedActions.includes('scan_policies')) {
      try {
        scanResult = await runSecurityThreatScan();
        if (scanResult?.threats_created > 0) issues.push(`${scanResult.threats_created} new threats detected by AI scan`);
      } catch (error) {
        issues.push(`Threat scan failed: ${error.message}`);
      }
    }

    const { data: activeThreats } = await supabase
      .from('security_threats')
      .select('id, severity, confidence, status, mitigation_steps')
      .in('status', ['active', 'investigating'])
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: openAlerts } = await supabase
      .from('security_alerts')
      .select('id, severity, threat_id, acknowledged')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(20);

    const criticalThreats = (activeThreats || []).filter(threat => ['critical', 'high'].includes(threat.severity));
    const safeMitigations = (activeThreats || []).filter(threat =>
      ['low', 'medium'].includes(threat.severity) &&
      Array.isArray(threat.mitigation_steps) &&
      threat.mitigation_steps.length > 0
    );

    if (criticalThreats.length > 0) {
      issues.push(`${criticalThreats.length} high-risk threats require investigation`);
      if (allowedActions.includes('investigate_threat')) {
        if (autonomy === 'act' && riskThreshold === 'high') {
          const result = await updateThreatsAndLinkedAlerts(criticalThreats.map(threat => threat.id), 'investigating');
          if (result.updated > 0) actionsTaken.push(`moved ${result.updated} high-risk threats to investigating`);
        } else if (autonomy === 'suggest') {
          await escalateBotAction('security_bot', 'SecurityBot', `${criticalThreats.length} high-risk threats require investigation`, 'investigate_threat', 'high', {
            threat_ids: criticalThreats.map(threat => threat.id),
          });
        }
      }
    }

    if (safeMitigations.length > 0 && allowedActions.includes('mitigate_threat')) {
      if (autonomy === 'act' && riskThreshold === 'high') {
        const result = await updateThreatsAndLinkedAlerts(safeMitigations.map(threat => threat.id), 'mitigated');
        if (result.updated > 0) actionsTaken.push(`mitigated ${result.updated} low-risk threats with known mitigation steps`);
      } else if (autonomy === 'suggest') {
        await escalateBotAction('security_bot', 'SecurityBot', `${safeMitigations.length} lower-risk threats are ready for mitigation`, 'mitigate_threat', 'medium', {
          threat_ids: safeMitigations.map(threat => threat.id),
        });
      }
    }

    const lowNoiseAlerts = (openAlerts || []).filter(alert => ['low', 'medium'].includes(alert.severity) && !alert.threat_id);
    if (lowNoiseAlerts.length > 0 && allowedActions.includes('acknowledge_alert')) {
      if (autonomy === 'act' && riskThreshold !== 'low') {
        const result = await acknowledgeAlertsByIds(lowNoiseAlerts.map(alert => alert.id));
        if (result.acknowledged > 0) actionsTaken.push(`acknowledged ${result.acknowledged} low-risk standalone alerts`);
      } else if (autonomy === 'suggest') {
        await escalateBotAction('security_bot', 'SecurityBot', `${lowNoiseAlerts.length} lower-risk standalone alerts can be acknowledged`, 'acknowledge_alert', 'low', {
          alert_ids: lowNoiseAlerts.map(alert => alert.id),
        });
      }
    }

    if (duplicates.length > 0 && allowedActions.includes('cancel_duplicates')) {
      if (autonomy === 'act' && riskThreshold !== 'low') {
        const result = await cancelDuplicateAssignments(duplicates);
        if (result.cancelled > 0) actionsTaken.push(`cancelled ${result.cancelled} duplicate assignments`);
      } else if (autonomy === 'suggest') {
        await escalateBotAction('security_bot', 'SecurityBot', `${duplicates.length} duplicate trip assignments detected`, 'cancel_duplicates', 'high', { trip_ids: duplicates });
      }
    }

    if (offlineWithTrips.length > 0 && allowedActions.includes('flag_anomalies')) {
      const driverIds = offlineWithTrips.map(driver => driver.id);
      if (autonomy === 'act' && riskThreshold === 'high') {
        const result = await flagAssignmentsForDrivers(driverIds, 'SECURITY_BOT_OFFLINE_DRIVER_ASSIGNED');
        if (result.flagged > 0) actionsTaken.push(`flagged ${result.flagged} offline-driver assignments`);
      } else {
        await escalateBotAction('security_bot', 'SecurityBot', `${offlineWithTrips.length} offline drivers have active assignments`, 'flag_anomalies', 'high', {
          driver_ids: driverIds,
          note: 'SECURITY_BOT_OFFLINE_DRIVER_ASSIGNED',
        });
      }
    }

    await logBotAction(
      'security_bot',
      'SecurityBot',
      'Policy scan',
      'scan_policies',
      'low',
      issues.length > 0 ? 'escalated' : 'executed',
      [issues.join('; '), actionsTaken.join('; ')].filter(Boolean).join(' | ') || 'No anomalies'
    );
    if (actionsTaken.length > 0) await loadAssignments();
    return {
      summary: issues.length > 0
        ? `Issues: ${issues.join(' | ')}${actionsTaken.length ? ` · Actions: ${actionsTaken.join(' | ')}` : ''}`
        : `All policies OK — ${assignments.length} assignments checked, no anomalies`,
      error: issues.length > 0 ? issues[0] : null,
    };
  }

  async function runCodexBot() {
    const config = botConfigs['codex_bot'] || getDefaultBotConfig(BOT_DEFS.find(b => b.id === 'codex_bot'), resolvedOrgId);
    if (globalKillSwitch || config?.kill_switch) return { summary: 'Kill switch active — bot halted' };

    const aiSettings = await getAiSettings(resolvedOrgId);
    const runtime = await getBotRuntimeSettings(resolvedOrgId, 'codex_bot', 'openai', aiSettings);
    if (!runtime?.api_key) {
      return { summary: 'CodexBot is waiting for an OpenAI API key', error: 'OpenAI is not configured for CodexBot' };
    }

    const { data: recentFailures } = await supabase
      .from('bot_actions')
      .select('bot_name, action_type, outcome_detail, created_at')
      .eq('org_id', resolvedOrgId)
      .eq('outcome', 'failed')
      .order('created_at', { ascending: false })
      .limit(8);

    const { data: activeThreats } = await supabase
      .from('security_threats')
      .select('id, title, severity, status')
      .in('status', ['active', 'investigating'])
      .order('created_at', { ascending: false })
      .limit(8);

    const snapshot = {
      drivers_online: drivers.filter(driver => ['online', 'on_trip'].includes(driver.status)).length,
      available_trips: trips.filter(trip => trip.status === 'available').length,
      active_assignments: assignments.filter(assignment => !['completed', 'cancelled', 'rejected'].includes(assignment.status)).length,
      pending_bot_actions: pendingActions.length,
      recent_failures: (recentFailures || []).map(row => ({
        bot_name: row.bot_name,
        action_type: row.action_type,
        detail: row.outcome_detail,
      })),
      active_threats: (activeThreats || []).map(threat => ({
        id: threat.id,
        title: threat.title,
        severity: threat.severity,
        status: threat.status,
      })),
    };

    const prompt = `Operational snapshot:\n${JSON.stringify(snapshot, null, 2)}\n\nReturn strict JSON with:
{
  "summary": "short diagnosis",
  "findings": ["..."],
  "recommended_actions": [
    {
      "action_type": "refresh_data|check_health|restart_connections|flag_anomalies|auto_assign|alert_admin",
      "reason": "why",
      "risk_level": "low|medium|high",
      "payload": {}
    }
  ]
}
Only recommend actions that match the allowed action list. Prefer the smallest safe action set.`;

    const result = await requestAIStructuredPlan(runtime, {
      systemPrompt: 'You are CodexBot, an operations fix and investigation worker. Diagnose issues, favor minimal safe actions, and respond with strict JSON only.',
      userPrompt: prompt,
    });

    if (!result?.json) {
      return { summary: 'CodexBot received an unreadable model response', error: 'AI response was not valid JSON' };
    }

    await logAIReview('codex_bot', 'CodexBot', prompt, result.text, result.model, 'codex_review');
    const handled = await processBotRecommendations('codex_bot', 'CodexBot', config, result.json.recommended_actions || []);

    return {
      summary: `${result.json.summary || 'CodexBot completed a review'}${handled.executed.length ? ` · Executed: ${handled.executed.join(' | ')}` : ''}${handled.escalated.length ? ` · Escalated: ${handled.escalated.join(', ')}` : ''}`,
      error: null,
    };
  }

  async function runClaudeBot() {
    const config = botConfigs['claude_bot'] || getDefaultBotConfig(BOT_DEFS.find(b => b.id === 'claude_bot'), resolvedOrgId);
    if (globalKillSwitch || config?.kill_switch) return { summary: 'Kill switch active — bot halted' };

    const aiSettings = await getAiSettings(resolvedOrgId);
    const runtime = await getBotRuntimeSettings(resolvedOrgId, 'claude_bot', 'anthropic', aiSettings);
    if (!runtime?.api_key) {
      return { summary: 'ClaudeBot is waiting for an Anthropic API key', error: 'Anthropic is not configured for ClaudeBot' };
    }

    const { data: threatRows } = await supabase
      .from('security_threats')
      .select('id, title, severity, status, confidence, mitigation_steps')
      .in('status', ['active', 'investigating'])
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: pendingRows } = await supabase
      .from('pending_bot_actions')
      .select('id, bot_name, action_type, risk_level, trigger_reason')
      .eq('org_id', resolvedOrgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: alertRows } = await supabase
      .from('security_alerts')
      .select('id, title, severity, threat_id, acknowledged')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(10);

    const prompt = `Security review snapshot:\n${JSON.stringify({
      threats: threatRows || [],
      pending_actions: pendingRows || [],
      open_alerts: alertRows || [],
    }, null, 2)}\n\nReturn strict JSON with:
{
  "summary": "short review",
  "second_opinion": ["..."],
  "recommended_actions": [
    {
      "action_type": "flag_anomalies|investigate_threat|mitigate_threat|acknowledge_alert|alert_admin",
      "reason": "why",
      "risk_level": "low|medium|high|critical",
      "payload": {}
    }
  ]
}
Be conservative. Only recommend mitigation for low/medium threats that already have mitigation steps.`;

    const result = await requestAIStructuredPlan(runtime, {
      systemPrompt: 'You are ClaudeBot, a second-opinion reviewer focused on security risk, mitigation quality, and escalation discipline. Return strict JSON only.',
      userPrompt: prompt,
    });

    if (!result?.json) {
      return { summary: 'ClaudeBot received an unreadable model response', error: 'AI response was not valid JSON' };
    }

    await logAIReview('claude_bot', 'ClaudeBot', prompt, result.text, result.model, 'claude_review');
    const handled = await processBotRecommendations('claude_bot', 'ClaudeBot', config, result.json.recommended_actions || []);

    return {
      summary: `${result.json.summary || 'ClaudeBot completed a review'}${handled.executed.length ? ` · Executed: ${handled.executed.join(' | ')}` : ''}${handled.escalated.length ? ` · Escalated: ${handled.escalated.join(', ')}` : ''}`,
      error: null,
    };
  }

  const sentryBotState = useBot('sentry_bot', botIntervals.sentry_bot, botEnabled.sentry_bot && !globalKillSwitch, runSentryBot);
  const schedulerBotState = useBot('scheduler_bot', botIntervals.scheduler_bot, botEnabled.scheduler_bot && !globalKillSwitch, runSchedulerBot);
  const healthBotState = useBot('health_bot', botIntervals.health_bot, botEnabled.health_bot && !globalKillSwitch, runHealthBot);
  const securityBotState = useBot('security_bot', botIntervals.security_bot, botEnabled.security_bot && !globalKillSwitch, runSecurityBot);
  const codexBotState = useBot('codex_bot', botIntervals.codex_bot, botEnabled.codex_bot && !globalKillSwitch, runCodexBot);
  const claudeBotState = useBot('claude_bot', botIntervals.claude_bot, botEnabled.claude_bot && !globalKillSwitch, runClaudeBot);

  const botStates = {
    sentry_bot: sentryBotState,
    scheduler_bot: schedulerBotState,
    health_bot: healthBotState,
    security_bot: securityBotState,
    codex_bot: codexBotState,
    claude_bot: claudeBotState,
  };

  const activeBots = Object.values(botEnabled).filter(Boolean).length;
  const errorBots = Object.entries(botStates).filter(([, s]) => s.status === 'error').length;

  async function toggleAll(on) {
    if (globalKillSwitch && on) return;
    setBotEnabled({
      sentry_bot: on,
      scheduler_bot: on,
      health_bot: on,
      security_bot: on,
      codex_bot: on,
      claude_bot: on,
    });
    await persistAiSettings({
      sentry_bot_enabled: on,
      scheduler_bot_enabled: on,
      health_bot_enabled: on,
      security_bot_enabled: on,
    });
    for (const botId of ['codex_bot', 'claude_bot']) {
      await saveConfig(botId, {
        ...(botConfigs[botId] || getDefaultBotConfig(BOT_DEFS.find(bot => bot.id === botId), resolvedOrgId)),
        kill_switch: !on,
      });
    }
  }

  if (resolvingOrgId) {
    return (
      <div className="flex h-full items-center justify-center p-6" style={{ background: '#07090d' }}>
        <div className="rounded-2xl p-6 text-center max-w-md" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-sm font-700 mb-2" style={{ color: '#e5e7eb', fontWeight: 700 }}>Loading Bot Team</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Resolving the platform AI context for this admin session.
          </p>
        </div>
      </div>
    );
  }

  if (!resolvedOrgId) {
    return (
      <div className="flex h-full items-center justify-center p-6" style={{ background: '#07090d' }}>
        <div className="rounded-2xl p-6 text-center max-w-md" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-sm font-700 mb-2" style={{ color: '#ffcc66', fontWeight: 700 }}>Bot Team Needs an Admin Org</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            No platform organization could be resolved for this session yet, so bot controls are paused instead of crashing.
          </p>
        </div>
      </div>
    );
  }

  if (panelError) {
    return (
      <div className="flex h-full items-center justify-center p-6" style={{ background: '#07090d' }}>
        <div className="rounded-2xl p-6 text-center max-w-md" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-sm font-700 mb-2" style={{ color: '#ff7a7a', fontWeight: 700 }}>Bot Team Load Warning</p>
          <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {panelError}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl text-xs font-600"
            style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600 }}
          >
            Reload Bot Team
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#07090d' }}>
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <h2 className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Bot Team</h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {activeBots} of {BOT_DEFS.length} bots running
            {errorBots > 0 && <span style={{ color: '#ff4757' }}> · {errorBots} error{errorBots !== 1 ? 's' : ''}</span>}
            {pendingActions.length > 0 && <span style={{ color: '#f59e0b' }}> · {pendingActions.length} pending approval</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex gap-2 text-xs">
            {Object.entries(botStates).map(([id, state]) => {
              const def = BOT_DEFS.find(b => b.id === id);
              return (
                <div
                  key={id}
                  className="w-2 h-2 rounded-full"
                  title={`${def.name}: ${state.status}`}
                  style={{
                    background: state.status === 'ok' ? '#00e5a0' : state.status === 'running' ? def.color : state.status === 'error' ? '#ff4757' : 'rgba(255,255,255,0.15)',
                    boxShadow: state.status === 'running' ? `0 0 6px ${def.color}` : state.status === 'ok' ? '0 0 4px #00e5a0' : 'none',
                  }}
                />
              );
            })}
          </div>
          <button
            onClick={toggleGlobalKillSwitch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-600 transition-all"
            style={{
              background: globalKillSwitch ? 'rgba(255,71,87,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${globalKillSwitch ? 'rgba(255,71,87,0.3)' : 'rgba(255,255,255,0.08)'}`,
              color: globalKillSwitch ? '#ff4757' : 'rgba(255,255,255,0.5)',
              fontWeight: 600,
            }}
          >
            <Lock className="w-3 h-3" />
            {globalKillSwitch ? 'Kill Active' : 'Kill Switch'}
          </button>
          <button
            onClick={() => toggleAll(true)}
            disabled={globalKillSwitch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-600 transition-all"
            style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0', fontWeight: 600, opacity: globalKillSwitch ? 0.4 : 1 }}
          >
            <Play className="w-3 h-3" />
            All On
          </button>
          <button
            onClick={() => toggleAll(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-600 transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}
          >
            <Pause className="w-3 h-3" />
            All Off
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-2xl space-y-4">
          {globalKillSwitch && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)' }}>
              <Lock className="w-4 h-4 flex-shrink-0" style={{ color: '#ff4757' }} />
              <p className="text-xs" style={{ color: '#ff4757' }}>Global kill switch is active — all bots are halted. Click "Kill Switch" to re-enable.</p>
            </div>
          )}

          <PendingActionsPanel pendingActions={pendingActions} onApprove={handleApprove} onReject={handleReject} />

          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Active', value: activeBots, color: '#00e5a0' },
              { label: 'Drivers', value: drivers.filter(d => d.status === 'online' || d.status === 'on_trip').length, color: '#c9a84c' },
              { label: 'Trips', value: trips.filter(t => t.status === 'available').length, color: '#0ea5e9' },
              { label: 'Assigned', value: assignments.filter(a => !['completed', 'cancelled', 'rejected'].includes(a.status)).length, color: '#f59e0b' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xl font-700" style={{ color: s.color, fontWeight: 700 }}>{s.value}</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {BOT_DEFS.map(def => (
            <BotCard
              key={def.id}
              def={def}
              botState={botStates[def.id]}
              enabled={botEnabled[def.id]}
              onToggle={async () => {
                if (globalKillSwitch) return;
                const next = !botEnabled[def.id];
                setBotEnabled(prev => ({ ...prev, [def.id]: next }));
                if (['sentry_bot', 'scheduler_bot', 'health_bot', 'security_bot'].includes(def.id)) {
                  await persistAiSettings({ [def.id + '_enabled']: next });
                }
                await saveConfig(def.id, {
                  ...(botConfigs[def.id] || getDefaultBotConfig(def, resolvedOrgId)),
                  kill_switch: !next,
                });
              }}
              intervalSecs={botIntervals[def.id]}
              onIntervalChange={v => setBotIntervals(prev => ({ ...prev, [def.id]: v }))}
              config={botConfigs[def.id]}
              onConfigSave={cfg => saveConfig(def.id, cfg)}
            />
          ))}

          <div className="rounded-2xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
              Payout Safety Policy
            </p>
            <div className="flex items-start gap-3">
              <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ff4757' }} />
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                Bots can never initiate, approve, or process payouts autonomously — regardless of risk settings or autonomy level. When a payout anomaly is detected, the relevant bot creates an escalation that requires explicit admin approval before any payout action is taken.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
