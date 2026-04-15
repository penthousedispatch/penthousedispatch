import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, RefreshCw, CheckCircle, XCircle, AlertTriangle,
  Users, CreditCard, Zap, X, Save, ChevronDown, ChevronUp
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';

const PLAN_TIERS = [
  { key: 'free', label: 'Free', color: '#00e5a0', maxDrivers: 10, maxOrgs: 1 },
  { key: 'growth', label: 'Growth', color: '#c9a84c', maxDrivers: 50, maxOrgs: 5 },
  { key: 'enterprise', label: 'Enterprise', color: '#f59e0b', maxDrivers: 500, maxOrgs: 50 },
];

const BILLING_STATUSES = [
  { key: 'active', label: 'Active', color: '#00e5a0' },
  { key: 'trial', label: 'Trial', color: '#c9a84c' },
  { key: 'past_due', label: 'Past Due', color: '#f59e0b' },
  { key: 'cancelled', label: 'Cancelled', color: '#ff4757' },
];

const DEFAULT_FLAGS = [
  { key: 'autonomous_bots', label: 'Autonomous Bots', desc: 'Enable bot autonomy (act/suggest modes)' },
  { key: 'integration_hub', label: 'Integration Hub', desc: 'Access to cloud provider integrations' },
  { key: 'advanced_scheduling', label: 'Advanced Scheduling', desc: 'AI-powered auto-scheduler' },
  { key: 'multi_company', label: 'Multi-Company', desc: 'Manage multiple transport companies' },
  { key: 'api_access', label: 'API Access', desc: 'Generate and use API keys' },
  { key: 'payroll_module', label: 'Payroll Module', desc: 'Driver payment and payroll features' },
];

function TenantCard({ tenant, onEdit, onManageFlags }) {
  const plan = PLAN_TIERS.find(p => p.key === tenant.plan_tier);
  const billing = BILLING_STATUSES.find(b => b.key === tenant.billing_status);

  return (
    <div
      className="rounded-2xl p-4 cursor-pointer transition-all"
      style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}
      onClick={() => onEdit(tenant)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-700" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', fontWeight: 700 }}>
            {tenant.name[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{tenant.name}</p>
            <p className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{tenant.slug}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${plan?.color}15`, color: plan?.color, fontWeight: 600 }}>{plan?.label}</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${billing?.color}10`, color: billing?.color }}>{billing?.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>{tenant.max_drivers}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Max Drivers</p>
        </div>
        <div className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-sm font-700" style={{ color: '#0ea5e9', fontWeight: 700 }}>{tenant.max_orgs}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Max Orgs</p>
        </div>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onManageFlags(tenant); }}
        className="mt-3 w-full py-1.5 rounded-xl text-xs transition-all"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}
      >
        Manage Feature Flags
      </button>
    </div>
  );
}

function TenantModal({ tenant, onSave, onClose }) {
  const isEdit = !!tenant?.id;
  const [form, setForm] = useState(tenant || {
    name: '',
    slug: '',
    plan_tier: 'free',
    billing_status: 'active',
    max_drivers: 10,
    max_orgs: 1,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function update(key, val) { setForm(p => ({ ...p, [key]: val })); }

  function autoSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message || 'Failed to save tenant. Check your permissions.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="rounded-2xl w-full max-w-md overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0d1117' }}>
          <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{isEdit ? 'Edit Tenant' : 'New Tenant'}</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Company Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => { update('name', e.target.value); if (!isEdit) update('slug', autoSlug(e.target.value)); }}
                placeholder="Acme Corp"
                className="w-full text-xs p-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={e => update('slug', e.target.value)}
                placeholder="acme-corp"
                className="w-full text-xs p-2.5 rounded-xl font-mono"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Plan Tier</label>
            <div className="grid grid-cols-3 gap-2">
              {PLAN_TIERS.map(p => (
                <button
                  key={p.key}
                  onClick={() => { update('plan_tier', p.key); update('max_drivers', p.maxDrivers); update('max_orgs', p.maxOrgs); }}
                  className="py-2 rounded-xl text-xs transition-all"
                  style={{
                    background: form.plan_tier === p.key ? `${p.color}15` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${form.plan_tier === p.key ? p.color + '40' : 'rgba(255,255,255,0.07)'}`,
                    color: form.plan_tier === p.key ? p.color : 'rgba(255,255,255,0.4)',
                    fontWeight: form.plan_tier === p.key ? 600 : 400,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Billing Status</label>
            <div className="grid grid-cols-2 gap-2">
              {BILLING_STATUSES.map(b => (
                <button
                  key={b.key}
                  onClick={() => update('billing_status', b.key)}
                  className="py-2 rounded-xl text-xs transition-all"
                  style={{
                    background: form.billing_status === b.key ? `${b.color}10` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${form.billing_status === b.key ? b.color + '30' : 'rgba(255,255,255,0.07)'}`,
                    color: form.billing_status === b.key ? b.color : 'rgba(255,255,255,0.4)',
                    fontWeight: form.billing_status === b.key ? 600 : 400,
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Max Drivers</label>
              <input
                type="number"
                min={1}
                value={form.max_drivers}
                onChange={e => update('max_drivers', parseInt(e.target.value) || 10)}
                className="w-full text-xs p-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Max Orgs</label>
              <input
                type="number"
                min={1}
                value={form.max_orgs}
                onChange={e => update('max_orgs', parseInt(e.target.value) || 1)}
                className="w-full text-xs p-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl px-3 py-2.5 flex items-start gap-2" style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)' }}>
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ff4757' }} />
              <p className="text-xs" style={{ color: '#ff4757' }}>{error}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="py-2.5 rounded-xl text-sm font-600 flex items-center justify-center gap-2 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !form.name.trim() || !form.slug.trim()}
              className="py-2.5 rounded-xl text-sm font-600 flex items-center justify-center gap-2 transition-all"
              style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600, opacity: saving || !form.name.trim() ? 0.5 : 1 }}
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureFlagsDrawer({ tenant, onClose }) {
  const [flags, setFlags] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadFlags(); }, [tenant.id]);

  async function loadFlags() {
    const { data } = await supabase.from('tenant_plan_flags').select('*').eq('tenant_id', tenant.id);
    const map = {};
    (data || []).forEach(f => { map[f.flag_key] = f; });
    setFlags(DEFAULT_FLAGS.map(f => ({ ...f, enabled: map[f.key]?.flag_value ?? false, dbId: map[f.key]?.id })));
  }

  async function toggleFlag(flagKey, current) {
    setSaving(true);
    const existing = flags.find(f => f.key === flagKey);
    if (existing?.dbId) {
      await supabase.from('tenant_plan_flags').update({ flag_value: !current, updated_at: new Date().toISOString() }).eq('id', existing.dbId);
    } else {
      await supabase.from('tenant_plan_flags').insert({ tenant_id: tenant.id, flag_key: flagKey, flag_value: !current });
    }
    await loadFlags();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="h-full overflow-y-auto" style={{ width: 380, background: '#0d1117', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10" style={{ background: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Feature Flags</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{tenant.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {flags.map(flag => (
            <div
              key={flag.key}
              className="flex items-center justify-between px-4 py-3 rounded-xl transition-all"
              style={{
                background: flag.enabled ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${flag.enabled ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.05)'}`,
              }}
            >
              <div>
                <p className="text-xs font-600" style={{ color: flag.enabled ? '#c9a84c' : '#e5e7eb', fontWeight: 600 }}>{flag.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{flag.desc}</p>
              </div>
              <button
                onClick={() => toggleFlag(flag.key, flag.enabled)}
                disabled={saving}
                className="w-9 h-5 rounded-full relative transition-all flex-shrink-0 ml-3"
                style={{ background: flag.enabled ? '#c9a84c' : 'rgba(255,255,255,0.1)' }}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                  style={{ background: '#fff', left: flag.enabled ? 'calc(100% - 18px)' : '2px' }}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TenantManager() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTenant, setEditTenant] = useState(null);
  const [flagsTenant, setFlagsTenant] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
    setTenants(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form) {
    let result;
    if (form.id) {
      result = await supabase.from('tenants').update({ ...form, updated_at: new Date().toISOString() }).eq('id', form.id);
    } else {
      result = await supabase.from('tenants').insert(form);
    }
    if (result.error) throw new Error(result.error.message);
    await load();
    setShowModal(false);
    setEditTenant(null);
  }

  function openEdit(tenant) { setEditTenant(tenant); setShowModal(true); }
  function openAdd() { setEditTenant(null); setShowModal(true); }

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.billing_status === 'active').length,
    enterprise: tenants.filter(t => t.plan_tier === 'enterprise').length,
    trial: tenants.filter(t => t.billing_status === 'trial').length,
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ color: '#e5e7eb' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
            <Building2 className="w-4 h-4" style={{ color: '#c9a84c' }} />
          </div>
          <div>
            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Tenant Manager</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Manage SaaS customers, plan tiers, and feature flags</p>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl font-600"
          style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" /> New Tenant
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 pt-4 flex-shrink-0">
        {[
          { label: 'Total', value: stats.total, color: '#0ea5e9' },
          { label: 'Active', value: stats.active, color: '#00e5a0' },
          { label: 'Enterprise', value: stats.enterprise, color: '#f59e0b' },
          { label: 'Trial', value: stats.trial, color: '#c9a84c' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 flex flex-col gap-0.5" style={{ background: `${s.color}08`, border: `1px solid ${s.color}20` }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</p>
            <p className="text-xl font-700" style={{ color: s.color, fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
          </div>
        ) : tenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Building2 className="w-10 h-10 mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No tenants yet</p>
            <button onClick={openAdd} className="btn-gold px-4 py-2 text-sm mt-4">Onboard First Tenant</button>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {tenants.map(t => (
              <TenantCard key={t.id} tenant={t} onEdit={openEdit} onManageFlags={setFlagsTenant} />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <TenantModal
          tenant={editTenant}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTenant(null); }}
        />
      )}

      {flagsTenant && (
        <FeatureFlagsDrawer tenant={flagsTenant} onClose={() => setFlagsTenant(null)} />
      )}
    </div>
  );
}
