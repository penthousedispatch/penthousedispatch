import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers, Search, CheckCircle, XCircle, AlertCircle, Clock,
  ChevronRight, X, ExternalLink, Eye, EyeOff, Save, Trash2, RefreshCw,
  Cloud, MessageSquare, CreditCard, Map, BarChart2, Database, Cpu
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { PROVIDER_REGISTRY, PROVIDER_CATEGORIES, PLAN_TIERS } from './integrations/providerRegistry';

const CATEGORY_ICONS = {
  cloud: Cloud,
  communication: MessageSquare,
  payments: CreditCard,
  maps: Map,
  crm: BarChart2,
  monitoring: AlertCircle,
  storage: Database,
};

function HealthBadge({ status }) {
  const map = {
    healthy: { color: '#00e5a0', label: 'Healthy' },
    degraded: { color: '#f59e0b', label: 'Degraded' },
    error: { color: '#ff4757', label: 'Error' },
    unknown: { color: 'rgba(255,255,255,0.25)', label: 'Unknown' },
    disconnected: { color: 'rgba(255,255,255,0.2)', label: 'Not Connected' },
  };
  const s = map[status] || map.unknown;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color, boxShadow: status === 'healthy' ? `0 0 4px ${s.color}` : 'none' }} />
      <span className="text-xs" style={{ color: s.color }}>{s.label}</span>
    </div>
  );
}

function ProviderCard({ provider, integration, onConfigure, onTest, testing }) {
  const CategoryIcon = CATEGORY_ICONS[provider.category] || Layers;
  const cat = PROVIDER_CATEGORIES.find(c => c.key === provider.category);
  const plan = PLAN_TIERS[provider.planRequired];
  const isConnected = integration?.enabled;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all cursor-pointer group"
      style={{
        background: '#0d1117',
        border: `1px solid ${isConnected ? provider.logoColor + '25' : 'rgba(255,255,255,0.07)'}`,
      }}
      onClick={() => onConfigure(provider)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-700 flex-shrink-0"
              style={{ background: `${provider.logoColor}15`, border: `1px solid ${provider.logoColor}25`, color: provider.logoColor, fontWeight: 700 }}
            >
              {provider.logoInitial}
            </div>
            <div>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{provider.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <CategoryIcon className="w-3 h-3" style={{ color: cat?.color || 'rgba(255,255,255,0.3)' }} />
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{cat?.label}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <HealthBadge status={integration?.health_status || 'disconnected'} />
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${plan?.color}10`, color: plan?.color, fontSize: 9, border: `1px solid ${plan?.color}20` }}>
              {plan?.label?.toUpperCase()}
            </span>
          </div>
        </div>

        <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{provider.description}</p>
        {integration?.error_message && (
          <p className="text-xs mb-3" style={{ color: '#ff4757', lineHeight: 1.5 }}>
            {integration.error_message}
          </p>
        )}

        <div className="flex items-center justify-between">
          {integration?.last_sync_at ? (
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Synced {new Date(integration.last_sync_at).toLocaleTimeString()}
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>Not configured</span>
          )}
          <div className="flex items-center gap-1.5">
            {isConnected && (
              <button
                onClick={e => { e.stopPropagation(); onTest(provider, integration); }}
                disabled={testing}
                className="text-xs px-2 py-1 rounded-lg transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
              >
                {testing ? <RefreshCw className="w-3 h-3 animate-spin inline" /> : 'Test'}
              </button>
            )}
            <div
              className="flex items-center gap-1 text-xs"
              style={{ color: isConnected ? provider.logoColor : 'rgba(255,255,255,0.25)' }}
            >
              {isConnected ? 'Configure' : 'Connect'}
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigDrawer({ provider, integration, onSave, onDisconnect, onClose, saving }) {
  const [form, setForm] = useState({});
  const [showSecrets, setShowSecrets] = useState({});

  useEffect(() => {
    if (integration?.credentials) {
      setForm(integration.credentials);
    } else {
      const defaults = {};
      provider.fields.forEach(f => { defaults[f.key] = ''; });
      setForm(defaults);
    }
  }, [provider, integration]);

  function setField(key, val) {
    setForm(p => ({ ...p, [key]: val }));
  }

  function toggleShow(key) {
    setShowSecrets(p => ({ ...p, [key]: !p[key] }));
  }

  const cat = PROVIDER_CATEGORIES.find(c => c.key === provider.category);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div
        className="h-full overflow-y-auto flex-shrink-0"
        style={{ width: 420, background: '#0d1117', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10" style={{ background: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-700"
              style={{ background: `${provider.logoColor}15`, border: `1px solid ${provider.logoColor}25`, color: provider.logoColor, fontWeight: 700 }}
            >
              {provider.logoInitial}
            </div>
            <div>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{provider.name}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{cat?.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{provider.description}</p>
            {provider.docsUrl && (
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 mt-2 text-xs"
                style={{ color: provider.logoColor }}
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3" />
                View Documentation
              </a>
            )}
          </div>

          <div className="space-y-3">
            {provider.fields.map(field => (
              <div key={field.key}>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea
                    rows={4}
                    value={form[field.key] || ''}
                    onChange={e => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full text-xs p-2.5 rounded-xl resize-none font-mono"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={form[field.key] || field.options[0]}
                    onChange={e => setField(field.key, e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
                  >
                    {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <div className="relative">
                    <input
                      type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                      value={form[field.key] || ''}
                      onChange={e => setField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full text-xs p-2.5 pr-9 rounded-xl font-mono"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
                    />
                    {field.type === 'password' && (
                      <button
                        onClick={() => toggleShow(field.key)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2"
                        style={{ color: 'rgba(255,255,255,0.3)' }}
                      >
                        {showSecrets[field.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => onSave(provider, form)}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-sm font-600 flex items-center justify-center gap-2 transition-all"
              style={{ background: `${provider.logoColor}15`, border: `1px solid ${provider.logoColor}30`, color: provider.logoColor, fontWeight: 600 }}
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {integration ? 'Update & Enable' : 'Connect Integration'}
            </button>
            {integration && (
              <button
                onClick={() => onDisconnect(provider.key)}
                className="w-full py-2 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
                style={{ background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.12)', color: '#ff4757' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationHub() {
  const { org } = useApp();
  const [integrations, setIntegrations] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeProvider, setActiveProvider] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testingKey, setTestingKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);

  function showBanner(type, text) {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 4000);
  }

  function validateProviderCredentials(provider, credentials) {
    const errors = [];
    const requiredFields = provider.fields.filter(field => field.type !== 'select');

    requiredFields.forEach(field => {
      const value = String(credentials[field.key] || '').trim();
      if (!value) errors.push(`${field.label} is required`);
    });

    const urlFields = ['queue_url', 'function_url', 'webhook_url'];
    urlFields.forEach(key => {
      const raw = credentials[key];
      if (raw) {
        try {
          new URL(raw);
        } catch {
          errors.push(`${key.replace(/_/g, ' ')} must be a valid URL`);
        }
      }
    });

    if (credentials.service_account_json) {
      try {
        JSON.parse(credentials.service_account_json);
      } catch {
        errors.push('Service Account JSON must be valid JSON');
      }
    }

    if (provider.key === 'stripe') {
      if (credentials.publishable_key && !String(credentials.publishable_key).startsWith('pk_')) errors.push('Stripe publishable key should start with pk_');
      if (credentials.secret_key && !String(credentials.secret_key).startsWith('sk_')) errors.push('Stripe secret key should start with sk_');
      if (credentials.webhook_secret && !String(credentials.webhook_secret).startsWith('whsec_')) errors.push('Stripe webhook secret should start with whsec_');
    }

    if (provider.key === 'twilio' && credentials.account_sid && !String(credentials.account_sid).startsWith('AC')) {
      errors.push('Twilio Account SID should start with AC');
    }

    if (provider.key === 'sendgrid' && credentials.api_key && !String(credentials.api_key).startsWith('SG.')) {
      errors.push('SendGrid API key should start with SG.');
    }

    if (provider.key === 'slack' && credentials.webhook_url && !String(credentials.webhook_url).includes('hooks.slack.com/services/')) {
      errors.push('Slack webhook URL should point to hooks.slack.com/services/');
    }

    if (provider.key === 'zapier' && credentials.webhook_url && !String(credentials.webhook_url).includes('hooks.zapier.com/')) {
      errors.push('Zapier webhook URL should point to hooks.zapier.com/');
    }

    if (provider.key === 'mapbox' && credentials.access_token && !/^p[ks]\./.test(String(credentials.access_token))) {
      errors.push('Mapbox access token should start with pk. or sk.');
    }

    return errors;
  }

  const load = useCallback(async () => {
    if (!org?.id) {
      setIntegrations([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('saas_integrations')
      .select('*')
      .eq('org_id', org.id);
    if (error) {
      showBanner('error', `Failed to load integrations: ${error.message}`);
    }
    setIntegrations(data || []);
    setLoading(false);
  }, [org?.id]);

  useEffect(() => { load(); }, [load]);

  function getIntegration(providerKey) {
    return integrations.find(i => i.provider_key === providerKey);
  }

  async function handleSave(provider, credentials) {
    const validationErrors = validateProviderCredentials(provider, credentials);
    if (validationErrors.length) {
      showBanner('error', validationErrors[0]);
      return;
    }

    setSaving(true);
    const existing = getIntegration(provider.key);
    const payload = {
      org_id: org?.id || null,
      provider_key: provider.key,
      provider_name: provider.name,
      category: provider.category,
      enabled: true,
      credentials,
      health_status: 'unknown',
      error_message: '',
      updated_at: new Date().toISOString(),
    };
    let error = null;
    if (existing) {
      ({ error } = await supabase.from('saas_integrations').update(payload).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('saas_integrations').insert(payload));
    }
    if (error) {
      showBanner('error', `Save failed: ${error.message}`);
      setSaving(false);
      return;
    }
    await load();
    showBanner('success', `${provider.name} saved. Run Test to validate the credentials format.`);
    setSaving(false);
    setActiveProvider(null);
  }

  async function handleDisconnect(providerKey) {
    const existing = getIntegration(providerKey);
    if (!existing) return;
    const { error } = await supabase.from('saas_integrations').update({
      enabled: false,
      health_status: 'disconnected',
      error_message: '',
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
    if (error) {
      showBanner('error', `Disconnect failed: ${error.message}`);
      return;
    }
    await load();
    setActiveProvider(null);
    showBanner('success', 'Integration disconnected');
  }

  async function handleTest(provider, integration) {
    setTestingKey(provider.key);
    const errors = validateProviderCredentials(provider, integration?.credentials || {});
    const patch = {
      last_health_check_at: new Date().toISOString(),
      health_status: errors.length ? 'error' : 'healthy',
      error_message: errors.join(' | '),
      ...(errors.length ? {} : { last_sync_at: new Date().toISOString() }),
    };
    const { error } = await supabase.from('saas_integrations').update(patch).eq('id', integration.id);
    if (error) {
      showBanner('error', `Test failed: ${error.message}`);
      setTestingKey(null);
      return;
    }
    await load();
    showBanner(errors.length ? 'error' : 'success', errors.length ? errors[0] : `${provider.name} passed credential validation`);
    setTestingKey(null);
  }

  const filteredProviders = PROVIDER_REGISTRY.filter(p => {
    const q = search.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.category.includes(q) || p.description.toLowerCase().includes(q);
    const matchesCat = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const connectedCount = integrations.filter(i => i.enabled).length;
  const healthyCount = integrations.filter(i => i.health_status === 'healthy').length;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ color: '#e5e7eb' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)' }}>
            <Layers className="w-4 h-4" style={{ color: '#0ea5e9' }} />
          </div>
          <div>
            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Integration Hub</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Connect AWS, Google Cloud, Twilio, Stripe, and more</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>{connectedCount} connected</span>
          {healthyCount > 0 && <span style={{ color: '#00e5a0' }}>{healthyCount} healthy</span>}
        </div>
      </div>

      {banner && (
        <div
          className="mx-5 mt-4 px-3 py-2 rounded-xl text-xs"
          style={{
            background: banner.type === 'error' ? 'rgba(255,71,87,0.1)' : 'rgba(0,229,160,0.1)',
            border: `1px solid ${banner.type === 'error' ? 'rgba(255,71,87,0.2)' : 'rgba(0,229,160,0.2)'}`,
            color: banner.type === 'error' ? '#ff4757' : '#00e5a0',
          }}
        >
          {banner.text}
        </div>
      )}

      <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search integrations..."
            className="w-full text-xs pl-8 pr-3 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          <button
            onClick={() => setCategoryFilter('all')}
            className="px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all"
            style={{
              background: categoryFilter === 'all' ? 'rgba(14,165,233,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${categoryFilter === 'all' ? 'rgba(14,165,233,0.25)' : 'rgba(255,255,255,0.06)'}`,
              color: categoryFilter === 'all' ? '#0ea5e9' : 'rgba(255,255,255,0.4)',
            }}
          >
            All
          </button>
          {PROVIDER_CATEGORIES.map(cat => {
            const Icon = CATEGORY_ICONS[cat.key] || Layers;
            return (
              <button
                key={cat.key}
                onClick={() => setCategoryFilter(cat.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all"
                style={{
                  background: categoryFilter === cat.key ? `${cat.color}10` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${categoryFilter === cat.key ? cat.color + '30' : 'rgba(255,255,255,0.06)'}`,
                  color: categoryFilter === cat.key ? cat.color : 'rgba(255,255,255,0.4)',
                }}
              >
                <Icon className="w-3 h-3" />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Layers className="w-10 h-10 mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No integrations match your search</p>
          </div>
        ) : (
          <div className="space-y-6">
            {(categoryFilter === 'all' ? PROVIDER_CATEGORIES : PROVIDER_CATEGORIES.filter(c => c.key === categoryFilter)).map(cat => {
              const catProviders = filteredProviders.filter(p => p.category === cat.key);
              if (!catProviders.length) return null;
              const CatIcon = CATEGORY_ICONS[cat.key] || Layers;
              return (
                <div key={cat.key}>
                  <div className="flex items-center gap-2 mb-3">
                    <CatIcon className="w-3.5 h-3.5" style={{ color: cat.color }} />
                    <h3 className="text-xs font-700 uppercase tracking-wider" style={{ color: cat.color, fontWeight: 700 }}>{cat.label}</h3>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>{catProviders.length}</span>
                  </div>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                    {catProviders.map(provider => (
                      <ProviderCard
                        key={provider.key}
                        provider={provider}
                        integration={getIntegration(provider.key)}
                        onConfigure={setActiveProvider}
                        onTest={handleTest}
                        testing={testingKey === provider.key}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeProvider && (
        <ConfigDrawer
          provider={activeProvider}
          integration={getIntegration(activeProvider.key)}
          onSave={handleSave}
          onDisconnect={handleDisconnect}
          onClose={() => setActiveProvider(null)}
          saving={saving}
        />
      )}
    </div>
  );
}
