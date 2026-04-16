import React, { useState, useEffect } from 'react';
import { NavLink, Routes, Route } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import {
  Users, Navigation, FileText, Settings, LogOut,
  DollarSign, AlertTriangle, LayoutGrid
} from 'lucide-react';
import { handleSupabaseError, toastSuccess } from '../../utils/errorHandler';
import AlertInboxButton from '../../components/ui/AlertInboxButton';

function CompanyDrivers({ company }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company?.id) return;
    supabase.from('drivers').select('*').eq('company_id', company.id).eq('is_active', true).order('full_name').then(({ data, error }) => {
      if (error) handleSupabaseError(error, 'CompanyDrivers:load', { silent: true });
      setDrivers(data || []);
      setLoading(false);
    });
  }, [company?.id]);

  const statusColor = { online: '#00e5a0', offline: 'rgba(255,255,255,0.3)', on_trip: '#c9a84c', break: '#f59e0b' };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-lg font-700 mb-4" style={{ fontWeight: 700 }}>Your Drivers</h2>
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
        </div>
      ) : drivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 rounded-xl gap-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Users className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No drivers yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {drivers.map(d => (
            <div key={d.id} className="flex items-center gap-4 p-4 rounded-xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
              {d.photo_data ? (
                <img src={d.photo_data} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" style={{ border: '2px solid rgba(201,168,76,0.3)' }} />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-700 flex-shrink-0" style={{ background: 'rgba(201,168,76,0.1)', color: '#c9a84c', fontWeight: 700 }}>
                  {d.full_name?.charAt(0) || '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-600 text-sm" style={{ fontWeight: 600 }}>{d.full_name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{d.phone || 'No phone'}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: statusColor[d.status] || 'rgba(255,255,255,0.3)' }} />
                <span className="text-xs" style={{ color: statusColor[d.status] || 'rgba(255,255,255,0.4)' }}>{d.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyTrips({ company }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company?.id) return;

    supabase.from('drivers').select('id').eq('company_id', company.id).then(async ({ data: driverRows, error: driverError }) => {
      if (driverError) {
        handleSupabaseError(driverError, 'CompanyTrips:loadDrivers', { silent: true });
        setLoading(false);
        return;
      }

      const driverIds = (driverRows || []).map(row => row.id);
      if (!driverIds.length) {
        setAssignments([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('trip_assignments')
        .select('*, drivers(full_name)')
        .in('driver_id', driverIds)
        .order('assigned_at', { ascending: false })
        .limit(100);

      if (error) handleSupabaseError(error, 'CompanyTrips:load', { silent: true });
      setAssignments(data || []);
      setLoading(false);
    });
  }, [company?.id]);

  const statusColor = { pending: '#c9a84c', accepted: '#0ea5e9', completed: '#00e5a0', rejected: '#ff4757' };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-lg font-700 mb-4" style={{ fontWeight: 700 }}>Trip History</h2>
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
        </div>
      ) : assignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 rounded-xl gap-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Navigation className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No trips yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map(a => (
            <div key={a.id} className="flex items-center gap-4 p-4 rounded-xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-500 truncate" style={{ color: '#e5e7eb' }}>{a.pu_address || 'Unknown pickup'}</p>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{a.do_address || 'Unknown dropoff'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-700" style={{ fontWeight: 700, color: '#c9a84c' }}>${parseFloat(a.delivery_price || 0).toFixed(2)}</p>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${statusColor[a.status] || '#c9a84c'}15`, color: statusColor[a.status] || '#c9a84c' }}>
                  {a.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyInvoices({ company }) {
  const [invoices, setInvoices] = useState([]);
  const [pendingBilling, setPendingBilling] = useState({ tripCount: 0, totalFees: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company?.id) return;
    Promise.all([
      supabase.from('invoices').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('billing_trips').select('id, platform_fee').eq('company_id', company.id).eq('billing_status', 'pending'),
    ]).then(([invoiceResult, billingResult]) => {
      if (invoiceResult.error) handleSupabaseError(invoiceResult.error, 'CompanyInvoices:load', { silent: true });
      if (billingResult.error) handleSupabaseError(billingResult.error, 'CompanyInvoices:loadPendingBilling', { silent: true });
      setInvoices(invoiceResult.data || []);
      setPendingBilling({
        tripCount: billingResult.data?.length || 0,
        totalFees: (billingResult.data || []).reduce((sum, row) => sum + parseFloat(row.platform_fee || 0), 0),
      });
      setLoading(false);
    });
  }, [company?.id]);

  const statusColor = { draft: '#c9a84c', sent: '#0ea5e9', paid: '#00e5a0', overdue: '#ff4757' };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-lg font-700 mb-4" style={{ fontWeight: 700 }}>Invoices</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Pending Completed Trips</p>
          <p className="text-2xl font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{pendingBilling.tripCount}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(0,229,160,0.14)' }}>
          <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Accrued Mileage Fees</p>
          <p className="text-2xl font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>${pendingBilling.totalFees.toFixed(2)}</p>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 rounded-xl gap-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <FileText className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No invoices yet</p>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>Invoices will appear here once issued by the platform</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => (
            <div key={inv.id} className="flex items-center gap-4 p-4 rounded-xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,168,76,0.08)' }}>
                <FileText className="w-4 h-4" style={{ color: '#c9a84c' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-600 text-sm" style={{ fontWeight: 600 }}>Invoice #{inv.id.slice(-8).toUpperCase()}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{inv.period_start} — {inv.period_end}</p>
              </div>
              <div className="text-right">
                <p className="font-700 text-sm" style={{ fontWeight: 700, color: '#c9a84c' }}>${parseFloat(inv.total_fee || 0).toFixed(2)}</p>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${statusColor[inv.invoice_status] || '#c9a84c'}15`, color: statusColor[inv.invoice_status] || '#c9a84c' }}>
                  {inv.invoice_status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanySettings({ company, setCompany }) {
  const [form, setForm] = useState({
    company_name: company?.company_name || '',
    phone: company?.phone || '',
    address: company?.address || '',
    billing_contact_name: company?.billing_contact_name || '',
    billing_contact_email: company?.billing_contact_email || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    if (!company?.id) return;
    setSaving(true);
    const { data, error } = await supabase.from('companies').update({ ...form, updated_at: new Date().toISOString() }).eq('id', company.id).select().maybeSingle();
    if (error) {
      handleSupabaseError(error, 'CompanySettings:handleSave', { fallback: 'Failed to save company settings.' });
      setSaving(false);
      return;
    }
    if (data) setCompany(data);
    toastSuccess('Settings saved.');
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-700 mb-4" style={{ fontWeight: 700 }}>Company Settings</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-700 uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Company Info</p>
          <div className="space-y-3">
            {[
              { label: 'Company Name', key: 'company_name' },
              { label: 'Phone', key: 'phone' },
              { label: 'Address', key: 'address' },
              { label: 'Billing Contact Name', key: 'billing_contact_name' },
              { label: 'Billing Contact Email', key: 'billing_contact_email' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</label>
                <input type="text" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className="w-full" />
              </div>
            ))}
          </div>
        </div>
        <button type="submit" disabled={saving} className="btn-gold px-5 py-2.5 text-sm">
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}

export default function CompanyDashboard() {
  const { company, setCompany, profile } = useApp();
  const [mobileNav, setMobileNav] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const tabs = [
    { path: '/', label: 'Drivers', icon: Users, exact: true },
    { path: '/trips', label: 'Trips', icon: Navigation },
    { path: '/invoices', label: 'Invoices', icon: FileText },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  if (!company?.is_approved && company?.onboarding_status !== 'approved') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6" style={{ background: '#07090d' }}>
        <div className="max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)' }}>
            <AlertTriangle className="w-8 h-8" style={{ color: '#c9a84c' }} />
          </div>
          <h2 className="text-xl font-700 mb-2" style={{ fontWeight: 700 }}>Pending Approval</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6 }}>
            Your company account is under review. You'll have full access once an admin approves your application.
          </p>
          <button onClick={() => supabase.auth.signOut()} className="btn-ghost mt-6 px-5 py-2.5 text-sm flex items-center gap-2 mx-auto">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#07090d', color: '#e5e7eb' }}>
      {!bannerDismissed && (
        <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.08))', borderBottom: '1px solid rgba(201,168,76,0.2)' }}>
          <p className="text-xs font-600" style={{ color: '#c9a84c', fontWeight: 600 }}>
            Upgrade to SaaS — Advanced features coming soon. Manage your fleet at scale.
          </p>
          <button onClick={() => setBannerDismissed(true)} className="text-xs" style={{ color: 'rgba(201,168,76,0.6)', background: 'none', border: 'none' }}>✕</button>
        </div>
      )}

      <header className="flex items-center justify-between px-4 h-14 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#07090d' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))', border: '1px solid rgba(201,168,76,0.3)' }}>
            <span style={{ color: '#c9a84c', fontSize: 16, fontWeight: 800 }}>P</span>
          </div>
          <div className="hidden sm:block">
            <p style={{ color: '#c9a84c', fontSize: 13, fontWeight: 700 }}>PENTHOUSE DISPATCH</p>
            {company && <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>{company.company_name}</p>}
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-0.5">
          {tabs.map(({ path, label, icon: Icon, exact }) => (
            <NavLink
              key={path}
              to={path}
              end={exact}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={({ isActive }) => ({
                color: isActive ? '#c9a84c' : 'rgba(255,255,255,0.45)',
                background: isActive ? 'rgba(201,168,76,0.1)' : 'transparent',
                border: '1px solid',
                borderColor: isActive ? 'rgba(201,168,76,0.2)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <AlertInboxButton scope="company" companyId={company?.id} />
          <button onClick={() => supabase.auth.signOut()} className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
          <button className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg btn-ghost" onClick={() => setMobileNav(!mobileNav)}>
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </header>

      {mobileNav && (
        <div className="md:hidden flex flex-col border-b" style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#0d1117' }}>
          {tabs.map(({ path, label, icon: Icon, exact }) => (
            <NavLink
              key={path}
              to={path}
              end={exact}
              onClick={() => setMobileNav(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm border-b"
              style={({ isActive }) => ({
                color: isActive ? '#c9a84c' : 'rgba(255,255,255,0.6)',
                background: isActive ? 'rgba(201,168,76,0.08)' : 'transparent',
                borderColor: 'rgba(255,255,255,0.04)',
              })}
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<CompanyDrivers company={company} />} />
          <Route path="/trips" element={<CompanyTrips company={company} />} />
          <Route path="/invoices" element={<CompanyInvoices company={company} />} />
          <Route path="/settings" element={<CompanySettings company={company} setCompany={setCompany} />} />
          <Route path="/*" element={<CompanyDrivers company={company} />} />
        </Routes>
      </main>
    </div>
  );
}
