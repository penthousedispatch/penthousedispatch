import React, { useState, useEffect } from 'react';
import {
  Save, TestTube, Eye, EyeOff, CheckCircle, AlertCircle, RefreshCw,
  Trash2, ChevronDown, ChevronRight, Bot, Radio, Zap, Activity,
  Shield, PauseCircle, PlayCircle, Power
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { getBotMemory, saveBotMemory, testAIConnection } from '../../utils/aiMotivation';

const PROVIDERS = [
  { id: 'disabled', label: 'Disabled', icon: '🚫', desc: 'No AI features' },
  { id: 'openai', label: 'OpenAI', icon: '🤖', desc: 'GPT-4o, GPT-4o-mini, GPT-3.5' },
  { id: 'anthropic', label: 'Anthropic', icon: '🧠', desc: 'Claude models for review and second-opinion analysis' },
  { id: 'gemini', label: 'Google Gemini', icon: '✨', desc: 'Gemini 1.5 Flash, Pro' },
  { id: 'self_hosted', label: 'Self-Hosted / OpenAI-Compatible', icon: '🖥️', desc: 'Use your own hosted model endpoint later without replacing the hosted-model path.' },
];

const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
const ANTHROPIC_MODELS = ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'];
const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
const SELF_HOSTED_MODELS = ['local-chat', 'qwen-coder', 'llama-instruct'];

const CONTEXT_LABELS = {
  motivation: 'Driver Motivation',
  scheduling: 'AI Scheduling',
  test: 'Connection Test',
};

const BOT_SERVICES = [
  {
    id: 'sentry_bot',
    field: 'sentry_bot_enabled',
    name: 'SentryBot',
    role: 'Marketplace Trip Puller',
    desc: 'Pulls trips from the SentryMS marketplace on a configurable interval',
    icon: Radio,
    color: '#00e5a0',
  },
  {
    id: 'scheduler_bot',
    field: 'scheduler_bot_enabled',
    name: 'SchedulerBot',
    role: 'Auto-Assignment Engine',
    desc: 'Runs the AI scheduler to route trips to the best available drivers',
    icon: Zap,
    color: '#c9a84c',
  },
  {
    id: 'health_bot',
    field: 'health_bot_enabled',
    name: 'HealthBot',
    role: 'System Monitor',
    desc: 'Monitors Sentry API health, driver connectivity, and data freshness',
    icon: Activity,
    color: '#0ea5e9',
  },
  {
    id: 'security_bot',
    field: 'security_bot_enabled',
    name: 'SecurityBot',
    role: 'Policy Enforcer',
    desc: 'Detects anomalous assignments, duplicates, and unusual billing patterns',
    icon: Shield,
    color: '#f59e0b',
  },
  {
    id: 'codex_bot',
    field: 'codex_bot_enabled',
    name: 'Frank',
    role: 'Fix & Investigation Worker',
    desc: 'Codex-powered implementer bot for issue diagnosis, safe corrective plans, and code-fix proposals.',
    icon: Bot,
    color: '#7dd3fc',
  },
  {
    id: 'claude_bot',
    field: 'claude_bot_enabled',
    name: 'Darius',
    role: 'Reviewer & Second Opinion',
    desc: 'Claude-powered reviewer bot for second opinions, risk review, and approval guidance.',
    icon: Bot,
    color: '#c084fc',
  },
];

const DEFAULT_FORM = {
  provider: 'disabled',
  api_key: '',
  base_url: '',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  max_tokens: 200,
  motivation_enabled: true,
  scheduling_enabled: true,
  sentry_bot_enabled: true,
  scheduler_bot_enabled: true,
  health_bot_enabled: true,
  security_bot_enabled: true,
  codex_bot_enabled: false,
  claude_bot_enabled: false,
  all_bots_paused: false,
};

const DEFAULT_BOT_PROVIDER_CONFIGS = {
  codex_bot: {
    provider: 'openai',
    api_key: '',
    model: 'gpt-4o-mini',
    base_url: '',
    temperature: 0.2,
    max_tokens: 500,
  },
  claude_bot: {
    provider: 'anthropic',
    api_key: '',
    model: 'claude-3-5-sonnet-latest',
    base_url: '',
    temperature: 0.2,
    max_tokens: 500,
  },
};

function Toggle({ value, onChange, color = '#c9a84c', disabled = false }) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      className="w-10 h-5 rounded-full relative flex-shrink-0 ml-4 transition-all"
      style={{
        background: disabled ? 'rgba(255,255,255,0.06)' : value ? color : 'rgba(255,255,255,0.1)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none',
      }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
        style={{ left: value ? '22px' : '2px' }}
      />
    </button>
  );
}

export default function AISettingsPanel() {
  const { org, user, isPlatformOwner, role } = useApp();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [botProviderConfigs, setBotProviderConfigs] = useState(DEFAULT_BOT_PROVIDER_CONFIGS);
  const [showKey, setShowKey] = useState(false);
  const [showBotKeys, setShowBotKeys] = useState({ codex_bot: false, claude_bot: false });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedLog, setExpandedLog] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [syncingBot, setSyncingBot] = useState(null);
  const [resolvedOrgId, setResolvedOrgId] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function resolveOrgId() {
      if (org?.id) {
        setResolvedOrgId(org.id);
        return;
      }

      if (!user?.id) {
        setResolvedOrgId(null);
        return;
      }

      const { data: membership } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (membership?.org_id) {
        if (mounted) setResolvedOrgId(membership.org_id);
        return;
      }

      const { data: latestAiRow } = await supabase
        .from('ai_settings')
        .select('org_id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestAiRow?.org_id) {
        if (mounted) setResolvedOrgId(latestAiRow.org_id);
        return;
      }

      const { data: fallbackOrg } = await supabase
        .from('organizations')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (mounted) setResolvedOrgId(fallbackOrg?.id || null);
    }

    resolveOrgId();
    return () => {
      mounted = false;
    };
  }, [org?.id, user?.id]);

  async function persistCoreBotFlags(nextForm) {
    if (!resolvedOrgId) return;
    const payload = {
      sentry_bot_enabled: nextForm.sentry_bot_enabled,
      scheduler_bot_enabled: nextForm.scheduler_bot_enabled,
      health_bot_enabled: nextForm.health_bot_enabled,
      security_bot_enabled: nextForm.security_bot_enabled,
      all_bots_paused: nextForm.all_bots_paused,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase.from('ai_settings').select('id').eq('org_id', resolvedOrgId).maybeSingle();
    if (existing) {
      await supabase.from('ai_settings').update(payload).eq('org_id', resolvedOrgId);
    } else {
      await supabase.from('ai_settings').insert({
        org_id: resolvedOrgId,
        provider: nextForm.provider || 'disabled',
        api_key: nextForm.api_key || '',
        base_url: nextForm.base_url || '',
        model: nextForm.model || 'gpt-4o-mini',
        temperature: nextForm.temperature ?? 0.7,
        max_tokens: nextForm.max_tokens || 200,
        motivation_enabled: nextForm.motivation_enabled ?? true,
        scheduling_enabled: nextForm.scheduling_enabled ?? true,
        ...payload,
      });
    }
  }

  useEffect(() => {
    loadSettings();
    loadLogs();
  }, [resolvedOrgId]);

  async function loadSettings() {
    if (!resolvedOrgId) return;
    const { data } = await supabase.from('ai_settings').select('*').eq('org_id', resolvedOrgId).maybeSingle();
    if (data) {
      setForm({
        provider: data.provider || 'disabled',
        api_key: data.api_key || '',
        base_url: data.base_url || '',
        model: data.model || 'gpt-4o-mini',
        temperature: data.temperature ?? 0.7,
        max_tokens: data.max_tokens || 200,
        motivation_enabled: data.motivation_enabled ?? true,
        scheduling_enabled: data.scheduling_enabled ?? true,
        sentry_bot_enabled: data.sentry_bot_enabled ?? true,
        scheduler_bot_enabled: data.scheduler_bot_enabled ?? true,
        health_bot_enabled: data.health_bot_enabled ?? true,
        security_bot_enabled: data.security_bot_enabled ?? true,
        codex_bot_enabled: false,
        claude_bot_enabled: false,
        all_bots_paused: data.all_bots_paused ?? false,
      });
    }

    const [codexMemory, claudeMemory] = await Promise.all([
      getBotMemory(resolvedOrgId, 'codex_bot'),
      getBotMemory(resolvedOrgId, 'claude_bot'),
    ]);

    setBotProviderConfigs({
      codex_bot: {
        ...DEFAULT_BOT_PROVIDER_CONFIGS.codex_bot,
        ...(codexMemory?.memory_value || {}),
      },
      claude_bot: {
        ...DEFAULT_BOT_PROVIDER_CONFIGS.claude_bot,
        ...(claudeMemory?.memory_value || {}),
      },
    });

    const { data: botConfigs } = await supabase
      .from('bot_config')
      .select('bot_id, kill_switch')
      .eq('org_id', resolvedOrgId)
      .in('bot_id', ['codex_bot', 'claude_bot']);

    const botKillMap = Object.fromEntries((botConfigs || []).map(row => [row.bot_id, row.kill_switch]));
    setForm(prev => ({
      ...prev,
      codex_bot_enabled: botKillMap.codex_bot === undefined ? false : !botKillMap.codex_bot,
      claude_bot_enabled: botKillMap.claude_bot === undefined ? false : !botKillMap.claude_bot,
    }));
  }

  async function loadLogs() {
    if (!resolvedOrgId) return;
    setLoadingLogs(true);
    const { data } = await supabase
      .from('ai_logs')
      .select('*')
      .eq('org_id', resolvedOrgId)
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs(data || []);
    setLoadingLogs(false);
  }

  async function handleSave() {
    if (!resolvedOrgId) return;
    if (role === 'admin' && !isPlatformOwner) return;
    setSaving(true);
    const payload = {
      provider: form.provider,
      api_key: form.api_key,
      base_url: form.base_url || '',
      model: form.model,
      temperature: form.temperature,
      max_tokens: form.max_tokens,
      motivation_enabled: form.motivation_enabled,
      scheduling_enabled: form.scheduling_enabled,
      sentry_bot_enabled: form.sentry_bot_enabled,
      scheduler_bot_enabled: form.scheduler_bot_enabled,
      health_bot_enabled: form.health_bot_enabled,
      security_bot_enabled: form.security_bot_enabled,
      all_bots_paused: form.all_bots_paused,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase.from('ai_settings').select('id').eq('org_id', resolvedOrgId).maybeSingle();
    if (existing) {
      await supabase.from('ai_settings').update(payload).eq('org_id', resolvedOrgId);
    } else {
      await supabase.from('ai_settings').insert({ ...payload, org_id: resolvedOrgId });
    }

    await Promise.all([
      saveBotMemory(resolvedOrgId, 'codex_bot', 'provider_config', botProviderConfigs.codex_bot),
      saveBotMemory(resolvedOrgId, 'claude_bot', 'provider_config', botProviderConfigs.claude_bot),
    ]);

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setSaving(false);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const result = await testAIConnection(form);
    setTestResult(result);
    setTesting(false);
    await loadLogs();
  }

  async function clearLogs() {
    if (!resolvedOrgId) return;
    await supabase.from('ai_logs').delete().eq('org_id', resolvedOrgId);
    setLogs([]);
  }

  async function syncBotKillSwitch(botId, enabled) {
    if (!resolvedOrgId) return;
    setSyncingBot(botId);
    const { data: existing } = await supabase
      .from('bot_config')
      .select('id')
      .eq('org_id', resolvedOrgId)
      .eq('bot_id', botId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('bot_config')
        .update({ kill_switch: !enabled, updated_at: new Date().toISOString() })
        .eq('org_id', resolvedOrgId)
        .eq('bot_id', botId);
    } else {
      await supabase
        .from('bot_config')
        .insert({
          org_id: resolvedOrgId,
          bot_id: botId,
          bot_name: BOT_SERVICES.find(bot => bot.id === botId)?.name || botId,
          autonomy_level: botId === 'claude_bot' ? 'suggest' : 'act',
          risk_threshold: botId === 'codex_bot' ? 'medium' : 'high',
          allowed_actions: botId === 'codex_bot'
            ? ['refresh_data', 'check_health', 'restart_connections', 'flag_anomalies', 'auto_assign']
            : ['flag_anomalies', 'alert_admin', 'acknowledge_alert', 'investigate_threat'],
          payout_protection: true,
          kill_switch: !enabled,
          updated_at: new Date().toISOString(),
        });
    }
    setSyncingBot(null);
  }

  async function toggleBot(field, botId) {
    const newValue = !form[field];
    const newForm = { ...form, [field]: newValue };
    setForm(newForm);
    if (['sentry_bot', 'scheduler_bot', 'health_bot', 'security_bot'].includes(botId)) {
      await persistCoreBotFlags(newForm);
      return;
    }
    await syncBotKillSwitch(botId, newValue);
  }

  async function toggleAllBots(pause) {
    const newForm = {
      ...form,
      all_bots_paused: pause,
    };
    setForm(newForm);
    if (!resolvedOrgId) return;
    await persistCoreBotFlags(newForm);
    for (const bot of BOT_SERVICES) {
      await syncBotKillSwitch(bot.id, !pause);
    }
  }

  async function setAllBotsEnabled(enabled) {
    const newForm = {
      ...form,
      sentry_bot_enabled: enabled,
      scheduler_bot_enabled: enabled,
      health_bot_enabled: enabled,
      security_bot_enabled: enabled,
      codex_bot_enabled: enabled,
      claude_bot_enabled: enabled,
      all_bots_paused: false,
    };
    setForm(newForm);
    if (!resolvedOrgId) return;
    await persistCoreBotFlags(newForm);
    for (const bot of BOT_SERVICES) {
      await syncBotKillSwitch(bot.id, enabled);
    }
  }

  const models =
    form.provider === 'gemini'
      ? GEMINI_MODELS
      : form.provider === 'self_hosted'
        ? SELF_HOSTED_MODELS
      : form.provider === 'anthropic'
        ? ANTHROPIC_MODELS
        : OPENAI_MODELS;
  const filteredLogs = filterType === 'all' ? logs : logs.filter(l => l.context_type === filterType);

  const activeServices = [
    form.provider !== 'disabled',
    form.motivation_enabled && form.provider !== 'disabled',
    form.scheduling_enabled && form.provider !== 'disabled',
    !form.all_bots_paused && form.sentry_bot_enabled,
    !form.all_bots_paused && form.scheduler_bot_enabled,
    !form.all_bots_paused && form.health_bot_enabled,
    !form.all_bots_paused && form.security_bot_enabled,
    !form.all_bots_paused && form.codex_bot_enabled,
    !form.all_bots_paused && form.claude_bot_enabled,
  ].filter(Boolean).length;

  const totalServices = 9;
  const aiProviderReady = form.provider !== 'disabled' && !!form.api_key && (form.provider !== 'self_hosted' || !!(form.base_url || '').trim());

  function updateBotProviderConfig(botId, patch) {
    setBotProviderConfigs(prev => ({
      ...prev,
      [botId]: {
        ...prev[botId],
        ...patch,
      },
    }));
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#07090d' }}>
      <div className="flex-1 overflow-y-auto p-5 max-w-2xl">

        <div className="mb-5">
          <h2 className="text-base mb-1" style={{ fontWeight: 700 }}>AI Configuration</h2>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Configure the AI engine that powers driver motivation, scheduling, and autonomous bots</p>
        </div>

        {role === 'admin' && !isPlatformOwner && (
          <div className="mb-5 rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-sm font-600 mb-1" style={{ color: '#f59e0b', fontWeight: 600 }}>Owner Approval Required</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
              You can review AI and bot settings, but only the platform owner admin can save live platform AI changes.
            </p>
          </div>
        )}

        <div className="mb-5 p-3 rounded-xl flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: totalServices }).map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ background: i < activeServices ? '#00e5a0' : 'rgba(255,255,255,0.1)' }}
              />
            ))}
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ color: '#00e5a0', fontWeight: 600 }}>{activeServices}</span> of {totalServices} services active
          </p>
        </div>

        <div className="mb-5">
          <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.5)' }}>AI Provider</label>
          <div className="space-y-2">
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  const defaultModel =
                    p.id === 'gemini'
                      ? 'gemini-1.5-flash'
                      : p.id === 'self_hosted'
                        ? 'local-chat'
                      : p.id === 'anthropic'
                        ? 'claude-3-5-sonnet-latest'
                        : 'gpt-4o-mini';
                  setForm({ ...form, provider: p.id, model: defaultModel });
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                style={{
                  background: form.provider === p.id ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${form.provider === p.id ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <span className="text-xl">{p.icon}</span>
                <div className="flex-1">
                  <p className="text-sm" style={{ color: form.provider === p.id ? '#c9a84c' : '#e5e7eb', fontWeight: 600 }}>{p.label}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{p.desc}</p>
                </div>
                {form.provider === p.id && <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#c9a84c' }} />}
              </button>
            ))}
          </div>
        </div>

        {form.provider !== 'disabled' && (
          <>
            <div className="mb-4">
              <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={form.api_key}
                  onChange={e => setForm({ ...form, api_key: e.target.value })}
                  placeholder="sk-... or API key"
                  className="w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)' }}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {form.provider === 'self_hosted' && (
              <div className="mb-4">
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Base URL</label>
                <input
                  type="text"
                  value={form.base_url || ''}
                  onChange={e => setForm({ ...form, base_url: e.target.value })}
                  placeholder="https://your-model-host/v1/chat/completions"
                  className="w-full"
                />
                <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.32)' }}>
                  This is for your future self-hosted OpenAI-compatible endpoint. Hosted models keep working separately.
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Model</label>
                <select
                  value={form.model}
                  onChange={e => setForm({ ...form, model: e.target.value })}
                  className="w-full"
                  style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e5e7eb', padding: '8px 10px', fontSize: 13 }}
                >
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Temperature</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={form.temperature}
                  onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Max Tokens</label>
                <input
                  type="number"
                  min="50"
                  max="1000"
                  step="50"
                  value={form.max_tokens}
                  onChange={e => setForm({ ...form, max_tokens: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>

            <div className="mb-5 p-4 rounded-xl space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>AI Features</p>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm" style={{ color: '#e5e7eb' }}>Driver Motivation</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>AI messages when drivers are near goals or idle</p>
                </div>
                <Toggle value={form.motivation_enabled} onChange={() => setForm({ ...form, motivation_enabled: !form.motivation_enabled })} />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm" style={{ color: '#e5e7eb' }}>Scheduling Suggestions</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>AI-powered trip scoring in Full-Day Scheduler</p>
                </div>
                <Toggle value={form.scheduling_enabled} onChange={() => setForm({ ...form, scheduling_enabled: !form.scheduling_enabled })} />
              </label>
            </div>
          </>
        )}

        <div className="mb-5 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Bot Services</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Enable or disable autonomous bots individually</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAllBotsEnabled(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{
                  background: 'rgba(0,229,160,0.1)',
                  border: '1px solid rgba(0,229,160,0.25)',
                  color: '#00e5a0',
                  fontWeight: 600,
                }}
              >
                <PlayCircle className="w-3.5 h-3.5" /> All On
              </button>
              <button
                onClick={() => setAllBotsEnabled(false)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.72)',
                  fontWeight: 600,
                }}
              >
                <PauseCircle className="w-3.5 h-3.5" /> All Off
              </button>
              <button
                onClick={() => toggleAllBots(!form.all_bots_paused)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{
                  background: form.all_bots_paused ? 'rgba(0,229,160,0.1)' : 'rgba(255,71,87,0.1)',
                  border: `1px solid ${form.all_bots_paused ? 'rgba(0,229,160,0.25)' : 'rgba(255,71,87,0.25)'}`,
                  color: form.all_bots_paused ? '#00e5a0' : '#ff4757',
                  fontWeight: 600,
                }}
              >
                {form.all_bots_paused
                  ? <><PlayCircle className="w-3.5 h-3.5" /> Resume</>
                  : <><Power className="w-3.5 h-3.5" /> Kill Switch</>
                }
              </button>
            </div>
          </div>

          {form.all_bots_paused && (
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'rgba(255,71,87,0.06)', borderBottom: '1px solid rgba(255,71,87,0.15)' }}>
              <Power className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#ff4757' }} />
              <p className="text-xs" style={{ color: '#ff4757' }}>All bots are paused. Individual toggles have no effect until you resume.</p>
            </div>
          )}

          <div className="divide-y" style={{ '--tw-divide-opacity': 1, borderColor: 'rgba(255,255,255,0.06)' }}>
            {BOT_SERVICES.map(bot => {
              const BotIcon = bot.icon;
              const isEnabled = form[bot.field];
              const effectivelyRunning = !form.all_bots_paused && isEnabled;
              const isSyncing = syncingBot === bot.id;

              return (
                <div
                  key={bot.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${bot.color}18`, border: `1px solid ${bot.color}30` }}
                  >
                    <BotIcon className="w-4 h-4" style={{ color: effectivelyRunning ? bot.color : 'rgba(255,255,255,0.25)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm" style={{ color: effectivelyRunning ? '#e5e7eb' : 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{bot.name}</p>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-md"
                        style={{
                          background: effectivelyRunning ? 'rgba(0,229,160,0.1)' : 'rgba(255,255,255,0.05)',
                          color: effectivelyRunning ? '#00e5a0' : 'rgba(255,255,255,0.3)',
                          fontWeight: 600,
                          fontSize: 10,
                        }}
                      >
                        {isSyncing ? 'Syncing...' : effectivelyRunning ? 'Running' : 'Stopped'}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{bot.desc}</p>
                  </div>
                  <Toggle
                    value={isEnabled}
                    onChange={() => toggleBot(bot.field, bot.id)}
                    color={bot.color}
                    disabled={form.all_bots_paused}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-5 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Bot Worker Providers</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Frank uses hosted OpenAI by default and can switch to your own self-hosted OpenAI-compatible endpoint later. Darius uses Anthropic by default and can also move to your own OpenAI-compatible reviewer endpoint when you are ready.
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {[
              { id: 'codex_bot', title: 'Frank', defaultDesc: 'Codex-powered implementer bot', hostedProvider: 'openai', keyLabel: 'Provider API Key', models: { openai: OPENAI_MODELS, self_hosted: SELF_HOSTED_MODELS } },
              { id: 'claude_bot', title: 'Darius', defaultDesc: 'Claude-powered reviewer bot', hostedProvider: 'anthropic', keyLabel: 'Provider API Key', models: { anthropic: ANTHROPIC_MODELS, self_hosted: SELF_HOSTED_MODELS } },
            ].map(worker => (
              <div key={worker.id} className="p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.01)' }}>
                <div>
                  <p className="text-sm" style={{ color: '#e5e7eb', fontWeight: 600 }}>{worker.title}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {worker.id === 'codex_bot'
                      ? 'Default hosted provider: OpenAI. Optional later path: your own self-hosted OpenAI-compatible endpoint.'
                      : 'Default hosted provider: Anthropic. Optional later path: your own self-hosted OpenAI-compatible endpoint.'}
                  </p>
                </div>
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Provider</label>
                  <select
                    value={botProviderConfigs[worker.id]?.provider || worker.hostedProvider}
                    onChange={e => updateBotProviderConfig(worker.id, {
                      provider: e.target.value,
                      model: e.target.value === 'self_hosted'
                        ? 'local-chat'
                        : e.target.value === 'anthropic'
                          ? 'claude-3-5-sonnet-latest'
                          : 'gpt-4o-mini',
                    })}
                    className="w-full"
                    style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e5e7eb', padding: '8px 10px', fontSize: 13 }}
                  >
                    <option value={worker.hostedProvider}>{worker.hostedProvider === 'openai' ? 'Hosted OpenAI' : 'Hosted Anthropic'}</option>
                    <option value="self_hosted">Self-Hosted / OpenAI-Compatible</option>
                  </select>
                </div>
                <div className="relative">
                  <input
                    type={showBotKeys[worker.id] ? 'text' : 'password'}
                    value={botProviderConfigs[worker.id]?.api_key || ''}
                    onChange={e => updateBotProviderConfig(worker.id, { api_key: e.target.value })}
                    placeholder={worker.keyLabel}
                    className="w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotKeys(prev => ({ ...prev, [worker.id]: !prev[worker.id] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)' }}
                  >
                    {showBotKeys[worker.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {botProviderConfigs[worker.id]?.provider === 'self_hosted' && (
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Base URL</label>
                    <input
                      type="text"
                      value={botProviderConfigs[worker.id]?.base_url || ''}
                      onChange={e => updateBotProviderConfig(worker.id, { base_url: e.target.value })}
                      placeholder="https://your-model-host/v1/chat/completions"
                      className="w-full"
                    />
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Model</label>
                    <select
                      value={botProviderConfigs[worker.id]?.model || (botProviderConfigs[worker.id]?.provider === 'self_hosted' ? 'local-chat' : worker.hostedProvider === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'gpt-4o-mini')}
                      onChange={e => updateBotProviderConfig(worker.id, { model: e.target.value })}
                      className="w-full"
                      style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e5e7eb', padding: '8px 10px', fontSize: 13 }}
                    >
                      {(worker.models[botProviderConfigs[worker.id]?.provider || worker.hostedProvider] || []).map(model => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Temperature</label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={botProviderConfigs[worker.id]?.temperature ?? 0.2}
                      onChange={e => updateBotProviderConfig(worker.id, { temperature: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Max Tokens</label>
                    <input
                      type="number"
                      min="100"
                      max="2000"
                      step="50"
                      value={botProviderConfigs[worker.id]?.max_tokens ?? 500}
                      onChange={e => updateBotProviderConfig(worker.id, { max_tokens: parseInt(e.target.value, 10) || 500 })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {testResult && (
          <div
            className="mb-4 px-4 py-3 rounded-xl flex items-start gap-3"
            style={{
              background: testResult.ok ? 'rgba(0,229,160,0.07)' : 'rgba(255,71,87,0.07)',
              border: `1px solid ${testResult.ok ? 'rgba(0,229,160,0.2)' : 'rgba(255,71,87,0.2)'}`,
            }}
          >
            {testResult.ok
              ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#00e5a0' }} />
              : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ff4757' }} />
            }
            <div>
              <p className="text-sm" style={{ color: testResult.ok ? '#00e5a0' : '#ff4757', fontWeight: 600 }}>
                {testResult.ok ? 'Connected!' : 'Connection Failed'}
              </p>
              {testResult.ok && testResult.response && (
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{testResult.response}</p>
              )}
              {!testResult.ok && testResult.error && (
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{testResult.error}</p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-8">
          {form.provider !== 'disabled' && (
            <button
              onClick={handleTest}
              disabled={testing || !aiProviderReady}
              className="btn-ghost flex items-center gap-2 py-2.5 px-4 flex-1"
            >
              <TestTube className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || (role === 'admin' && !isPlatformOwner)}
            className="btn-gold flex items-center gap-2 py-2.5 px-5 flex-1"
          >
            {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 20 }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm" style={{ fontWeight: 700 }}>AI Activity Log</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{logs.length} entries recorded</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', padding: '5px 8px', fontSize: 12 }}
              >
                <option value="all">All Types</option>
                <option value="motivation">Motivation</option>
                <option value="scheduling">Scheduling</option>
                <option value="test">Tests</option>
              </select>
              <button onClick={loadLogs} className="btn-ghost px-2 py-1 flex items-center gap-1 text-xs">
                <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
              </button>
              {logs.length > 0 && (
                <button onClick={clearLogs} className="btn-ghost px-2 py-1 flex items-center gap-1 text-xs" style={{ color: '#ff4757' }}>
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="text-center py-10">
              <Bot className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No AI activity yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map(log => (
                <div
                  key={log.id}
                  className="rounded-xl overflow-hidden"
                  style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer"
                    onClick={() => setExpandedLog(prev => prev === log.id ? null : log.id)}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs"
                      style={{
                        background: log.context_type === 'motivation' ? 'rgba(201,168,76,0.12)' : log.context_type === 'test' ? 'rgba(0,229,160,0.12)' : 'rgba(59,130,246,0.12)',
                        color: log.context_type === 'motivation' ? '#c9a84c' : log.context_type === 'test' ? '#00e5a0' : '#60a5fa',
                      }}
                    >
                      {log.context_type === 'motivation' ? '💬' : log.context_type === 'test' ? '✓' : '🗓'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                          {CONTEXT_LABELS[log.context_type] || log.context_type}
                        </p>
                        {log.driver_name && (
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>— {log.driver_name}</span>
                        )}
                      </div>
                      <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {log.response?.slice(0, 80)}{log.response?.length > 80 ? '…' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-right">
                      {log.tokens_used > 0 && (
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{log.tokens_used}t</span>
                      )}
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {expandedLog === log.id ? <ChevronDown className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />}
                    </div>
                  </div>

                  {expandedLog === log.id && (
                    <div className="border-t px-3 pb-3 pt-2 space-y-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <div>
                        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>Prompt</p>
                        <p className="text-xs p-2 rounded-lg whitespace-pre-wrap" style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', maxHeight: 120, overflow: 'auto' }}>
                          {log.prompt}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>Response</p>
                        <p className="text-xs p-2 rounded-lg" style={{ background: 'rgba(201,168,76,0.05)', color: '#c9a84c', border: '1px solid rgba(201,168,76,0.1)' }}>
                          {log.response}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        <span>Model: {log.model_used || '—'}</span>
                        <span>Tokens: {log.tokens_used}</span>
                        <span>{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                    </div>
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
