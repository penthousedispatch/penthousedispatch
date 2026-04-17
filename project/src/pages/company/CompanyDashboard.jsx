import React, { useState, useEffect } from 'react';
import { NavLink, Routes, Route, Link, Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import LiveDispatch from '../dispatcher/LiveDispatch';
import ModuleBoundary from '../../components/app/ModuleBoundary';
import { DEFAULT_COMPANY_SCHEDULER_PREFS, readCompanySchedulerPrefs, writeCompanySchedulerPrefs } from '../../lib/companySchedulerPrefs';
import {
  Users, Navigation, FileText, Settings, LogOut,
  DollarSign, AlertTriangle, LayoutGrid, Bot, BookOpen, Palette, CreditCard, Layers
} from 'lucide-react';
import { handleSupabaseError, toastSuccess } from '../../utils/errorHandler';

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

function CompanyMarketplace({ company }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadMarketplaceTrips() {
      setLoading(true);
      let query = supabase
        .from('marketplace_trips')
        .select('*')
        .order('loaded_at', { ascending: false })
        .limit(250);

      if (company?.id) {
        query = query.eq('company_id', company.id);
      }

      const { data, error } = await query;

      if (error) {
        handleSupabaseError(error, 'CompanyMarketplace:load', { silent: true, fallback: 'Failed to load marketplace trips.' });
      }

      if (mounted) {
        setTrips(data || []);
        setLoading(false);
      }
    }

    loadMarketplaceTrips();
    return () => {
      mounted = false;
    };
  }, [company?.id]);

  const filteredTrips = trips.filter(trip => {
    if (!search) return true;
    const query = search.toLowerCase();
    return [trip.sentry_trip_id, trip.pu_address, trip.do_address, trip.pu_city, trip.do_city]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query));
  });

  const statusColors = {
    available: '#00e5a0',
    assigned: '#c9a84c',
    completed: '#0ea5e9',
    cancelled: '#ff4757',
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-700 mb-1" style={{ fontWeight: 700 }}>Marketplace Trips</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Review provider-imported trips assigned to your company before or after dispatching them.
        </p>
      </div>

      <div className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
        <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Search imported trips</label>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by trip id, pickup, dropoff, city..."
          className="w-full"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl gap-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Layers className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.22)' }} />
          <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 13 }}>No marketplace trips available right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTrips.map(trip => (
            <div key={trip.id || trip.sentry_trip_id} className="rounded-xl p-4 flex items-start gap-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,168,76,0.1)', color: '#c9a84c' }}>
                <Navigation className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <p className="text-sm font-600 truncate" style={{ fontWeight: 600 }}>{trip.sentry_trip_id || trip.id}</p>
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{
                      background: `${statusColors[trip.status] || '#c9a84c'}15`,
                      color: statusColors[trip.status] || '#c9a84c',
                    }}
                  >
                    {trip.status || 'available'}
                  </span>
                </div>
                <p className="text-sm truncate" style={{ color: '#e5e7eb' }}>{trip.pu_address || 'Unknown pickup'}</p>
                <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.42)' }}>{trip.do_address || 'Unknown dropoff'}</p>
                <div className="flex flex-wrap gap-3 mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  <span>Pickup: {trip.pu_time || 'TBD'}</span>
                  <span>Mileage: {trip.mileage || '0'}</span>
                  <span>Fare: ${parseFloat(trip.delivery_price || 0).toFixed(2)}</span>
                  <span>Source: {trip.loaded_at ? 'Imported' : 'Manual'}</span>
                </div>
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
    white_label_enabled: company?.white_label_enabled || false,
    app_display_name: company?.app_display_name || '',
    logo_url: company?.logo_url || '',
    brand_primary: company?.brand_primary || '#c9a84c',
    brand_accent: company?.brand_accent || '#00e5a0',
    payout_bank_name: company?.payout_bank_name || '',
    payout_bank_last4: company?.payout_bank_last4 || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const displayNamePreview = form.app_display_name || form.company_name || 'Your Dispatch App';

  useEffect(() => {
    setForm({
      company_name: company?.company_name || '',
      phone: company?.phone || '',
      address: company?.address || '',
      billing_contact_name: company?.billing_contact_name || '',
      billing_contact_email: company?.billing_contact_email || '',
      white_label_enabled: company?.white_label_enabled || false,
      app_display_name: company?.app_display_name || '',
      logo_url: company?.logo_url || '',
      brand_primary: company?.brand_primary || '#c9a84c',
      brand_accent: company?.brand_accent || '#00e5a0',
      payout_bank_name: company?.payout_bank_name || '',
      payout_bank_last4: company?.payout_bank_last4 || '',
    });
  }, [
    company?.id,
    company?.company_name,
    company?.phone,
    company?.address,
    company?.billing_contact_name,
    company?.billing_contact_email,
    company?.white_label_enabled,
    company?.app_display_name,
    company?.logo_url,
    company?.brand_primary,
    company?.brand_accent,
    company?.payout_bank_name,
    company?.payout_bank_last4,
  ]);

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
        <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.14)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-4 h-4" style={{ color: '#c9a84c' }} />
            <div>
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>White Label Branding</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>Optional subscriber branding for your drivers and riders. If your subscription includes white-label access, your logo, colors, and app name can replace the platform defaults.</p>
            </div>
          </div>
          <label className="flex items-center justify-between rounded-xl px-4 py-3 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <p className="text-sm font-600" style={{ fontWeight: 600 }}>Enable white-label app branding</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>Show your company name, colors, and logo in the driver and rider experience.</p>
            </div>
            <input type="checkbox" checked={form.white_label_enabled} onChange={e => setForm({ ...form, white_label_enabled: e.target.checked })} />
          </label>
          <div className="space-y-3">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>App Display Name</label>
              <input type="text" value={form.app_display_name} onChange={e => setForm({ ...form, app_display_name: e.target.value })} placeholder="CLJExpress Dispatch" className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Logo URL</label>
              <input type="text" value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." className="w-full" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Primary Brand Color</label>
                <input type="text" value={form.brand_primary} onChange={e => setForm({ ...form, brand_primary: e.target.value })} placeholder="#c9a84c" className="w-full" />
              </div>
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Accent Color</label>
                <input type="text" value={form.brand_accent} onChange={e => setForm({ ...form, brand_accent: e.target.value })} placeholder="#00e5a0" className="w-full" />
              </div>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>Brand preview</p>
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{
                  background: form.white_label_enabled ? form.brand_primary || '#c9a84c' : 'rgba(201,168,76,0.08)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
                  style={{ background: form.white_label_enabled ? form.brand_accent || '#00e5a0' : 'rgba(255,255,255,0.08)' }}
                >
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span style={{ color: form.white_label_enabled ? '#07090d' : '#c9a84c', fontWeight: 800 }}>
                      {displayNamePreview.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-600 truncate" style={{ color: form.white_label_enabled ? '#07090d' : '#e5e7eb', fontWeight: 600 }}>
                    {displayNamePreview}
                  </p>
                  <p className="text-xs truncate" style={{ color: form.white_label_enabled ? 'rgba(7,9,13,0.72)' : 'rgba(255,255,255,0.45)' }}>
                    Driver and rider branding preview
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(0,229,160,0.12)' }}>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4" style={{ color: '#00e5a0' }} />
            <div>
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Banking & Withdrawals</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>Store your payout account so settlements can be finalized once your bank is connected.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Bank Account Name</label>
              <input type="text" value={form.payout_bank_name} onChange={e => setForm({ ...form, payout_bank_name: e.target.value })} placeholder="Business checking" className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Last 4 Digits</label>
              <input type="text" value={form.payout_bank_last4} onChange={e => setForm({ ...form, payout_bank_last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="1234" className="w-full" />
            </div>
          </div>
          <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            This stores the payout destination label for now. Full bank linking and withdrawals can be connected later without changing the company workflow.
          </p>
        </div>
        <button type="submit" disabled={saving} className="btn-gold px-5 py-2.5 text-sm">
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}

function CompanyAIControls({ company, setCompany }) {
  const { org } = useApp();
  const [form, setForm] = useState({
    ai_routing_enabled: company?.ai_routing_enabled ?? true,
    ai_auto_assign_enabled: company?.ai_auto_assign_enabled ?? true,
    ai_driver_nudges_enabled: company?.ai_driver_nudges_enabled ?? true,
  });
  const [schedulerPrefs, setSchedulerPrefs] = useState(DEFAULT_COMPANY_SCHEDULER_PREFS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      ai_routing_enabled: company?.ai_routing_enabled ?? true,
      ai_auto_assign_enabled: company?.ai_auto_assign_enabled ?? true,
      ai_driver_nudges_enabled: company?.ai_driver_nudges_enabled ?? true,
    });
    setSchedulerPrefs(readCompanySchedulerPrefs(company));
  }, [company?.id, company?.ai_routing_enabled, company?.ai_auto_assign_enabled, company?.ai_driver_nudges_enabled]);

  async function handleSave() {
    if (!company?.id) return;
    setSaving(true);
    const notes = writeCompanySchedulerPrefs(company?.notes || '', schedulerPrefs);
    const { data, error } = await supabase
      .from('companies')
      .update({ ...form, notes, updated_at: new Date().toISOString() })
      .eq('id', company.id)
      .select()
      .maybeSingle();
    if (error) {
      handleSupabaseError(error, 'CompanyAIControls:handleSave', { fallback: 'Failed to save AI controls.' });
      setSaving(false);
      return;
    }
    if (org?.id) {
      const schedulerPayload = {
        org_id: org.id,
        price_weight: schedulerPrefs.price_weight,
        proximity_weight: schedulerPrefs.proximity_weight,
        shared_rides_enabled: schedulerPrefs.shared_rides_enabled,
        auto_assign: form.ai_auto_assign_enabled,
        updated_at: new Date().toISOString(),
      };
      const { data: existingScheduler } = await supabase
        .from('auto_scheduler_config')
        .select('id')
        .eq('org_id', org.id)
        .maybeSingle();
      if (existingScheduler?.id) {
        await supabase.from('auto_scheduler_config').update(schedulerPayload).eq('org_id', org.id);
      } else {
        await supabase.from('auto_scheduler_config').insert({
          enabled: true,
          revenue_target_per_hour: 60,
          driver_pay_per_hour: 35,
          billing_rate_per_mile: 0.13,
          max_trip_distance_miles: 25,
          mileage_weight: 5,
          short_trip_max_miles: 4,
          short_trip_bonus_weight: 9,
          chaining_weight: 8,
          shared_ride_bonus_weight: 6,
          buffer_mins: 15,
          traffic_buffer_pct: 20,
          shift_hours: '7am-5pm',
          ...schedulerPayload,
        });
      }
    }
    if (data) setCompany(data);
    toastSuccess('AI controls saved.');
    setSaving(false);
  }

  const options = [
    {
      key: 'ai_routing_enabled',
      title: 'AI Route Planning',
      description: 'Let the company dispatch board use routing recommendations and trip scoring.',
    },
    {
      key: 'ai_auto_assign_enabled',
      title: 'AI Auto Assignment',
      description: 'Allow the scheduler to recommend or auto-assign the best-fit driver for open trips.',
    },
    {
      key: 'ai_driver_nudges_enabled',
      title: 'Driver Motivation Nudges',
      description: 'Send incentive and performance nudges to active drivers during their shift.',
    },
  ];

  const schedulerSliders = [
    {
      key: 'price_weight',
      label: 'Trip Price Priority',
      description: 'Higher values push the scheduler to favor higher-paying trips.',
    },
    {
      key: 'proximity_weight',
      label: 'Driver Proximity Priority',
      description: 'Higher values push the scheduler to keep drivers closer to pickup locations.',
    },
    {
      key: 'zone_weight',
      label: 'Preferred Zone Priority',
      description: 'Higher values give more weight to driver-selected work zones.',
    },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-700 mb-1" style={{ fontWeight: 700 }}>AI Settings</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>Company admins can control routing, auto-assignment, and scheduling weights here without exposing platform-level AI providers.</p>
      </div>
      {options.map(option => (
        <div key={option.key} className="rounded-xl p-4 flex items-start justify-between gap-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-sm font-600" style={{ fontWeight: 600 }}>{option.title}</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{option.description}</p>
          </div>
          <button
            type="button"
            onClick={() => setForm(prev => ({ ...prev, [option.key]: !prev[option.key] }))}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: form[option.key] ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${form[option.key] ? 'rgba(0,229,160,0.24)' : 'rgba(255,255,255,0.08)'}`,
              color: form[option.key] ? '#00e5a0' : 'rgba(255,255,255,0.55)',
              fontWeight: 600,
            }}
          >
            {form[option.key] ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      ))}
      <div className="rounded-xl p-4 space-y-4" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.14)' }}>
        <div>
          <p className="text-sm font-600" style={{ fontWeight: 600 }}>Scheduling Priorities</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Set how strongly your company favors price, proximity, preferred zones, and shared rides.
          </p>
        </div>
        {schedulerSliders.map(slider => (
          <div key={slider.key}>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <p className="text-xs font-600" style={{ fontWeight: 600 }}>{slider.label}</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>{slider.description}</p>
              </div>
              <span className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>
                {schedulerPrefs[slider.key]}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={schedulerPrefs[slider.key]}
              onChange={e => setSchedulerPrefs(prev => ({ ...prev, [slider.key]: parseInt(e.target.value, 10) || 0 }))}
              className="w-full"
              style={{ accentColor: '#c9a84c' }}
            />
          </div>
        ))}
        <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-sm font-600" style={{ fontWeight: 600 }}>Shared Ride Suggestions</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>Allow AI routing to favor same-direction rides that can be stacked safely.</p>
          </div>
          <button
            type="button"
            onClick={() => setSchedulerPrefs(prev => ({ ...prev, shared_rides_enabled: !prev.shared_rides_enabled }))}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: schedulerPrefs.shared_rides_enabled ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${schedulerPrefs.shared_rides_enabled ? 'rgba(0,229,160,0.24)' : 'rgba(255,255,255,0.08)'}`,
              color: schedulerPrefs.shared_rides_enabled ? '#00e5a0' : 'rgba(255,255,255,0.55)',
              fontWeight: 600,
            }}
          >
            {schedulerPrefs.shared_rides_enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>
      <button type="button" onClick={handleSave} disabled={saving} className="btn-gold px-5 py-2.5 text-sm">
        {saving ? 'Saving...' : 'Save AI Settings'}
      </button>
    </div>
  );
}

function CompanyGuides() {
  const guides = [
    {
      title: 'Dispatch Guide',
      copy: 'Use Dispatch to watch your live fleet, review trip assignments, and keep drivers moving. Add or import drivers first so the map can route work to your company only.',
    },
    {
      title: 'Drivers Guide',
      copy: 'The Drivers tab shows only your company drivers. Update their photo, pay, online status, and contact details there before sending them into the field.',
    },
    {
      title: 'Trip History Guide',
      copy: 'Trip History is your clean audit trail for past assignments. Use it to review completed trips, spot no-shows, and verify billing questions.',
    },
    {
      title: 'Invoices Guide',
      copy: 'Invoices show accrued mileage billing and issued platform invoices. Keep your billing contact current in Settings so you never miss an invoice notice.',
    },
    {
      title: 'Settings Guide',
      copy: 'Settings is where your company can update branding, payout information, and white-label preferences. Leave blanks now and complete them later if needed.',
    },
    {
      title: 'AI Controls Guide',
      copy: 'AI Controls lets your company decide whether route planning, auto-assign, and driver motivation nudges are active without exposing platform-wide AI settings.',
    },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-lg font-700 mb-4" style={{ fontWeight: 700 }}>Dashboard Guides</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {guides.map(guide => (
          <div key={guide.title} className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4" style={{ color: '#c9a84c' }} />
              <p className="text-sm font-600" style={{ fontWeight: 600 }}>{guide.title}</p>
            </div>
            <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.48)' }}>{guide.copy}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderCompanyModule(name, element) {
  return <ModuleBoundary moduleName={name}>{element}</ModuleBoundary>;
}

export default function CompanyDashboard({ previewMode = false, companyOverride = null }) {
  const { company, setCompany, profile } = useApp();
  const activeCompany = companyOverride || company;
  const [mobileNav, setMobileNav] = useState(false);
  const importSource = React.useMemo(() => {
    const match = activeCompany?.notes?.match(/IMPORT_SOURCE:([A-Z_]+)/);
    return match?.[1] || 'MANUAL';
  }, [activeCompany?.notes]);
  const companyDisplayName = activeCompany?.app_display_name || activeCompany?.company_name || 'Penthouse Dispatch';
  const basePath = previewMode && activeCompany?.id ? `/admin/company-preview/${activeCompany.id}` : '';

  const tabs = [
    { path: previewMode ? `${basePath}` : (basePath || '/'), routePath: '/', label: previewMode ? 'Company Dashboard' : 'Dispatch', icon: LayoutGrid, exact: true },
    { path: `${basePath}/marketplace`, routePath: 'marketplace', label: 'Marketplace', icon: Layers },
    { path: `${basePath}/drivers`, routePath: 'drivers', label: 'Drivers', icon: Users },
    { path: `${basePath}/trips`, routePath: 'trips', label: 'Trip History', icon: Navigation },
    { path: `${basePath}/invoices`, routePath: 'invoices', label: 'Invoices', icon: FileText },
    { path: `${basePath}/ai-controls`, routePath: 'ai-controls', label: 'AI Settings', icon: Bot },
    { path: `${basePath}/guides`, routePath: 'guides', label: 'Guides', icon: BookOpen },
    { path: `${basePath}/settings`, routePath: 'settings', label: 'Settings', icon: Settings },
  ];

  if (!previewMode && !activeCompany?.is_approved && activeCompany?.onboarding_status !== 'approved') {
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
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2 flex-shrink-0"
        style={{
          background: 'linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.04))',
          borderBottom: '1px solid rgba(201,168,76,0.18)',
        }}
      >
        <StatusChip label={`Company Admin: ${activeCompany?.company_name || 'Subscriber'}`} color="#c9a84c" />
        <StatusChip label={`Import: ${importSource}`} color="#0ea5e9" />
        <StatusChip label={activeCompany?.white_label_enabled ? 'White-label enabled' : 'Platform branding active'} color={activeCompany?.white_label_enabled ? '#00e5a0' : 'rgba(255,255,255,0.6)'} />
        <StatusChip label={activeCompany?.ai_routing_enabled ? 'AI routing on' : 'AI routing off'} color={activeCompany?.ai_routing_enabled ? '#00e5a0' : '#ff4757'} />
      </div>

      <header className="flex items-center justify-between px-4 h-14 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#07090d' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))', border: '1px solid rgba(201,168,76,0.3)' }}>
            <span style={{ color: '#c9a84c', fontSize: 16, fontWeight: 800 }}>P</span>
          </div>
          <div className="hidden sm:block">
            <p style={{ color: '#c9a84c', fontSize: 13, fontWeight: 700 }}>{companyDisplayName.toUpperCase()}</p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>Company Admin Dashboard</p>
          </div>
          {previewMode && activeCompany?.id && (
            <Link
              to="/admin/companies"
              className="hidden md:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all"
              style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', textDecoration: 'none', fontWeight: 600 }}
            >
              Back To Companies
            </Link>
          )}
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
          <Route
            index
            element={
              previewMode
                ? renderCompanyModule('Dispatch', <LiveDispatch />)
                : renderCompanyModule('Dispatch', <LiveDispatch />)
            }
          />
          <Route path="marketplace" element={renderCompanyModule('Marketplace', <CompanyMarketplace company={activeCompany} />)} />
          <Route path="drivers" element={renderCompanyModule('Drivers', <CompanyDrivers company={activeCompany} />)} />
          <Route path="trips" element={renderCompanyModule('Trip History', <CompanyTrips company={activeCompany} />)} />
          <Route path="invoices" element={renderCompanyModule('Invoices', <CompanyInvoices company={activeCompany} />)} />
          <Route path="ai-controls" element={renderCompanyModule('AI Controls', <CompanyAIControls company={activeCompany} setCompany={setCompany} />)} />
          <Route path="guides" element={renderCompanyModule('Guides', <CompanyGuides />)} />
          <Route path="settings" element={renderCompanyModule('Settings', <CompanySettings company={activeCompany} setCompany={setCompany} />)} />
          <Route
            path="/*"
            element={
              previewMode
                ? <Navigate to={`${basePath}`} replace />
                : renderCompanyModule('Dispatch', <LiveDispatch />)
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function StatusChip({ label, color }) {
  return (
    <span
      className="text-[11px] px-2.5 py-1 rounded-full"
      style={{
        background: `${color}15`,
        border: `1px solid ${color}33`,
        color,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}
