import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { Building2, CheckCircle, XCircle, Clock, Eye, Users, AlertTriangle, Route } from 'lucide-react';
import DriverRouteView from '../../components/drivers/DriverRouteView';

const STATUS_COLORS = {
  pending: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b' },
  info_submitted: { bg: 'rgba(14,165,233,0.1)', border: 'rgba(14,165,233,0.3)', color: '#0ea5e9' },
  agreement_signed: { bg: 'rgba(201,168,76,0.1)', border: 'rgba(201,168,76,0.3)', color: '#c9a84c' },
  approved: { bg: 'rgba(0,229,160,0.1)', border: 'rgba(0,229,160,0.3)', color: '#00e5a0' },
  rejected: { bg: 'rgba(255,71,87,0.1)', border: 'rgba(255,71,87,0.3)', color: '#ff4757' },
};

export default function AdminCompanies() {
  const { setAdminPreviewCompany, isPlatformOwner } = useApp();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [routeDriver, setRouteDriver] = useState(null);

  useEffect(() => { loadCompanies(); }, []);

  async function loadCompanies() {
    setLoading(true);
    const { data } = await supabase
      .from('companies')
      .select('id, company_name, billing_contact_email, onboarding_status, is_suspended, is_approved, owner_user_id, created_at, legal_entity, phone, billing_contact_name, address, tax_id, baseline_fleet_size')
      .order('created_at', { ascending: false });
    setCompanies(data || []);
    setLoading(false);
  }

  async function loadDriversForCompany(companyId) {
    const { data } = await supabase.from('drivers').select('id, full_name, status, layer2_status').eq('company_id', companyId).eq('is_active', true);
    setDrivers(data || []);
  }

  async function handleApprove(company) {
    if (!isPlatformOwner) return;
    setSaving(true);
    await supabase.from('companies').update({
      is_approved: true,
      onboarding_status: 'approved',
      baseline_fleet_size: drivers.length || company.baseline_fleet_size || 1,
      notes: note,
      updated_at: new Date().toISOString(),
    }).eq('id', company.id);
    await supabase.from('profiles').update({ role: 'company' }).eq('id', company.owner_user_id);
    setNote('');
    setSelected(null);
    setSaving(false);
    await loadCompanies();
  }

  async function handleReject(company) {
    if (!isPlatformOwner) return;
    setSaving(true);
    await supabase.from('companies').update({
      is_approved: false,
      onboarding_status: 'rejected',
      notes: note,
      updated_at: new Date().toISOString(),
    }).eq('id', company.id);
    setNote('');
    setSelected(null);
    setSaving(false);
    await loadCompanies();
  }

  async function handleSuspend(company) {
    if (!isPlatformOwner) return;
    await supabase.from('companies').update({ is_suspended: !company.is_suspended, updated_at: new Date().toISOString() }).eq('id', company.id);
    await loadCompanies();
  }

  async function handleSaveCompanyEdits() {
    if (!isPlatformOwner || !selected?.id) return;
    if (!selected?.id) return;
    setSaving(true);
    await supabase.from('companies').update({
      company_name: selected.company_name || '',
      legal_entity: selected.legal_entity || '',
      phone: selected.phone || '',
      billing_contact_name: selected.billing_contact_name || '',
      billing_contact_email: selected.billing_contact_email || '',
      address: selected.address || '',
      tax_id: selected.tax_id || '',
      updated_at: new Date().toISOString(),
    }).eq('id', selected.id);
    setSaving(false);
    await loadCompanies();
  }

  function handleOpenDashboard(company) {
    setAdminPreviewCompany(company);
    setSelected(null);
    try {
      sessionStorage.setItem(`admin-preview-company:${company.id}`, JSON.stringify(company));
    } catch {}
    window.location.assign(`/admin/company-preview/${company.id}/drivers`);
  }

  const pending = companies.filter(c => !c.is_approved && c.onboarding_status !== 'rejected');
  const approved = companies.filter(c => c.is_approved);
  const rejected = companies.filter(c => c.onboarding_status === 'rejected');

  return (
    <div className="h-full overflow-y-auto p-6" style={{ color: '#e5e7eb' }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-700 mb-1" style={{ fontWeight: 700, color: '#c9a84c' }}>Companies</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Manage company onboarding, approvals, and access</p>
        </div>

        {!isPlatformOwner && (
          <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-sm font-600 mb-1" style={{ color: '#f59e0b', fontWeight: 600 }}>Owner Approval Required</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
              You can review subscriber companies, but approving, rejecting, suspending, or editing company data requires the platform owner admin.
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Pending Approval', count: pending.length, color: '#f59e0b', icon: Clock },
            { label: 'Approved', count: approved.length, color: '#00e5a0', icon: CheckCircle },
            { label: 'Rejected', count: rejected.length, color: '#ff4757', icon: XCircle },
          ].map(({ label, count, color, icon: Icon }) => (
            <div key={label} className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color }} />
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
              </div>
              <p className="text-2xl font-700" style={{ fontWeight: 700, color }}>{count}</p>
            </div>
          ))}
        </div>

        {pending.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: '#f59e0b', fontWeight: 700 }}>Pending Approval</p>
            <div className="space-y-3">
              {pending.map(company => (
                <CompanyRow
                  key={company.id}
                  company={company}
                  onView={() => { setSelected(company); loadDriversForCompany(company.id); }}
                  onOpenDashboard={() => handleOpenDashboard(company)}
                  onSuspend={() => handleSuspend(company)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mb-6">
          <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>All Companies</p>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
              <Building2 className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No companies yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {companies.map(company => (
                <CompanyRow
                  key={company.id}
                  company={company}
                  onView={() => { setSelected(company); loadDriversForCompany(company.id); }}
                  onOpenDashboard={() => handleOpenDashboard(company)}
                  onSuspend={() => handleSuspend(company)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:flex sm:items-center sm:justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="mx-auto w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.3)', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <p className="font-700 text-sm" style={{ fontWeight: 700, color: '#c9a84c' }}>Review: {selected.company_name}</p>
              <button onClick={() => setSelected(null)} className="btn-ghost w-7 h-7 flex items-center justify-center rounded-lg text-xs">✕</button>
            </div>
            <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Legal Entity', selected.legal_entity],
                  ['Phone', selected.phone],
                  ['Billing Contact', selected.billing_contact_name],
                  ['Billing Email', selected.billing_contact_email],
                  ['Address', selected.address],
                  ['Tax ID', selected.tax_id],
                  ['Status', selected.onboarding_status],
                  ['Drivers', drivers.length],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
                    <p style={{ color: '#e5e7eb' }}>{value || '—'}</p>
                  </div>
                ))}
              </div>
              {drivers.length > 0 && (
                <div>
                  <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Drivers ({drivers.length}) — click to view route</p>
                  <div className="flex flex-wrap gap-2">
                    {drivers.map(d => (
                      <button
                        key={d.id}
                        onClick={() => setRouteDriver(d)}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all"
                        style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c' }}
                      >
                        <Route className="w-3 h-3" />
                        {d.full_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Company Data</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    ['Company Name', 'company_name'],
                    ['Legal Entity', 'legal_entity'],
                    ['Phone', 'phone'],
                    ['Billing Contact', 'billing_contact_name'],
                    ['Billing Email', 'billing_contact_email'],
                    ['Address', 'address'],
                    ['Tax ID', 'tax_id'],
                  ].map(([label, key]) => (
                    <div key={key} className={key === 'address' ? 'sm:col-span-2' : ''}>
                      <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
                      <input
                        type="text"
                        value={selected[key] || ''}
                        onChange={e => setSelected(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full text-sm"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Admin Note</p>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Optional note for approval/rejection..."
                  rows={3}
                  className="w-full text-sm"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb', resize: 'none' }}
                />
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={handleSaveCompanyEdits}
                disabled={saving || !isPlatformOwner}
                className="px-4 py-2.5 rounded-xl text-sm font-600"
                style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontWeight: 600 }}
              >
                {saving ? 'Saving...' : 'Save Company Data'}
              </button>
              <button
                onClick={() => handleReject(selected)}
                disabled={saving || !isPlatformOwner}
                className="flex-1 py-2.5 rounded-xl text-sm font-600"
                style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757', fontWeight: 600 }}
              >
                Reject
              </button>
              <button
                onClick={() => handleApprove(selected)}
                disabled={saving || !isPlatformOwner}
                className="flex-1 py-2.5 rounded-xl text-sm font-600"
                style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', color: '#00e5a0', fontWeight: 600 }}
              >
                {saving ? 'Saving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    {routeDriver && (
      <DriverRouteView driver={routeDriver} onClose={() => setRouteDriver(null)} />
    )}
    </div>
  );
}

function CompanyRow({ company, onView, onOpenDashboard, onSuspend }) {
  const st = STATUS_COLORS[company.onboarding_status] || STATUS_COLORS.pending;
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
        <Building2 className="w-5 h-5" style={{ color: '#c9a84c' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-600 text-sm" style={{ fontWeight: 600, color: '#e5e7eb' }}>{company.company_name || 'Unnamed'}</p>
          {company.is_suspended && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,71,87,0.1)', color: '#ff4757' }}>SUSPENDED</span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{company.billing_contact_email || 'No email'}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs px-2 py-1 rounded-lg" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>
          {company.onboarding_status}
        </span>
        <button onClick={onView} className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5">
          <Eye className="w-3 h-3" /> Review
        </button>
        <a
          href={`/admin/company-preview/${company.id}/drivers`}
          onClick={e => {
            e.preventDefault();
            onOpenDashboard();
          }}
          className="px-3 py-1.5 text-xs rounded-lg"
          style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', textDecoration: 'none' }}
        >
          Open Dashboard
        </a>
        <button
          onClick={onSuspend}
          className="px-3 py-1.5 text-xs rounded-lg"
          style={{ background: company.is_suspended ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)', border: `1px solid ${company.is_suspended ? 'rgba(0,229,160,0.2)' : 'rgba(255,71,87,0.2)'}`, color: company.is_suspended ? '#00e5a0' : '#ff4757' }}
        >
          {company.is_suspended ? 'Unsuspend' : 'Suspend'}
        </button>
      </div>
    </div>
  );
}
