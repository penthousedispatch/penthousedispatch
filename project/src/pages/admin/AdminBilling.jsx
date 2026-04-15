import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, FileText, CheckCircle, RefreshCw } from 'lucide-react';
import { handleSupabaseError, toastSuccess } from '../../utils/errorHandler';
import { DEFAULT_BILLING_RATE_PER_MILE } from '../../utils/billingAutomation';

export default function AdminBilling() {
  const [companies, setCompanies] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pendingSummary, setPendingSummary] = useState({ tripCount: 0, totalFees: 0 });
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [
      { data: comps, error: compsErr },
      { data: invs, error: invsErr },
      { data: bTrips, error: bTripsErr },
    ] = await Promise.all([
      supabase.from('companies').select('id, company_name, baseline_fleet_size, is_approved').order('company_name'),
      supabase.from('invoices').select('*, companies(company_name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('billing_trips').select('*').order('calculated_at', { ascending: false }).limit(100),
    ]);
    if (compsErr) handleSupabaseError(compsErr, 'AdminBilling:loadCompanies', { silent: true });
    if (invsErr) handleSupabaseError(invsErr, 'AdminBilling:loadInvoices', { silent: true });
    if (bTripsErr) handleSupabaseError(bTripsErr, 'AdminBilling:loadBillingTrips', { silent: true });
    setCompanies(comps || []);
    setInvoices(invs || []);
    setPendingSummary({
      tripCount: (bTrips || []).filter(trip => trip.billing_status === 'pending').length,
      totalFees: (bTrips || [])
        .filter(trip => trip.billing_status === 'pending')
        .reduce((sum, trip) => sum + parseFloat(trip.platform_fee || 0), 0),
    });
  }

  async function handlePreview() {
    if (!selectedCompany) return;
    setLoading(true);

    const company = companies.find(c => c.id === selectedCompany);
    const ratePerMile = DEFAULT_BILLING_RATE_PER_MILE;

    const { data: trips, error: tripsErr } = await supabase.from('billing_trips')
      .select('*')
      .eq('company_id', selectedCompany)
      .eq('billing_status', 'pending')
      .gte('calculated_at', dateRange.start)
      .lte('calculated_at', dateRange.end + 'T23:59:59');
    if (tripsErr) handleSupabaseError(tripsErr, 'AdminBilling:handlePreview:trips', { silent: true });

    const totalMiles = (trips || []).reduce((s, t) => s + parseFloat(t.miles || 0), 0);
    const totalFee = (trips || []).reduce((sum, trip) => {
      if (trip.platform_fee != null) return sum + parseFloat(trip.platform_fee || 0);
      return sum + ((parseFloat(trip.miles || 0) * ratePerMile) || 0);
    }, 0);

    setPreviewData({
      company,
      ratePerMile,
      totalMiles,
      totalFee,
      tripCount: trips?.length || 0,
      trips: trips || [],
    });
    setLoading(false);
  }

  async function handleGenerateInvoice() {
    if (!previewData) return;
    setGenerating(true);

    const { error } = await supabase.from('invoices').insert({
      company_id: selectedCompany,
      period_start: dateRange.start,
      period_end: dateRange.end,
      total_miles: previewData.totalMiles,
      total_fee: previewData.totalFee,
      invoice_status: 'draft',
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    });

    if (error) {
      handleSupabaseError(error, 'AdminBilling:generateInvoice', { fallback: 'Failed to generate invoice.' });
      setGenerating(false);
      return;
    }

    if (previewData.trips.length > 0) {
      const { error: updateErr } = await supabase.from('billing_trips')
        .update({ billing_status: 'invoiced' })
        .in('id', previewData.trips.map(t => t.id));
      if (updateErr) handleSupabaseError(updateErr, 'AdminBilling:markInvoiced', { silent: true });
    }

    toastSuccess('Invoice generated successfully.');
    setPreviewData(null);
    setGenerating(false);
    await loadData();
  }

  const statusColor = {
    draft: '#c9a84c',
    sent: '#0ea5e9',
    paid: '#00e5a0',
    overdue: '#ff4757',
  };

  return (
    <div className="h-full overflow-y-auto p-6" style={{ color: '#e5e7eb' }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-700 mb-1" style={{ fontWeight: 700, color: '#c9a84c' }}>Simple Auto Mileage Billing</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Completed trips are billed automatically at $0.13 per mile, then rolled into invoices.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.15)' }}>
            <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Pending Billing Trips</p>
            <p className="text-2xl font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{pendingSummary.tripCount}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(0,229,160,0.15)' }}>
            <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Pending Mileage Fees</p>
            <p className="text-2xl font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>${pendingSummary.totalFees.toFixed(2)}</p>
          </div>
        </div>

        <div className="rounded-xl p-5 mb-6" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.2)' }}>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4" style={{ color: '#c9a84c' }} />
            <p className="font-600 text-sm" style={{ fontWeight: 600, color: '#c9a84c' }}>Invoice Preview (Admin Only)</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Company</p>
              <select
                value={selectedCompany}
                onChange={e => setSelectedCompany(e.target.value)}
                className="w-full text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb' }}
              >
                <option value="">Select company...</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Period Start</p>
              <input type="date" value={dateRange.start} onChange={e => setDateRange(d => ({ ...d, start: e.target.value }))} className="w-full text-sm" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb' }} />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Period End</p>
              <input type="date" value={dateRange.end} onChange={e => setDateRange(d => ({ ...d, end: e.target.value }))} className="w-full text-sm" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb' }} />
            </div>
          </div>
          <button onClick={handlePreview} disabled={!selectedCompany || loading} className="btn-gold px-5 py-2.5 flex items-center gap-2 text-sm">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            {loading ? 'Calculating...' : 'Preview Invoice'}
          </button>

          {previewData && (
            <div className="mt-5 p-4 rounded-xl" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}>
              <p className="font-600 text-sm mb-3" style={{ fontWeight: 600, color: '#c9a84c' }}>Preview: {previewData.company?.company_name}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  ['Total Miles', previewData.totalMiles.toFixed(1)],
                  ['Rate/Mile', `$${previewData.ratePerMile.toFixed(2)}`],
                  ['Trips', previewData.tripCount],
                  ['Total Fee', `$${previewData.totalFee.toFixed(2)}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
                    <p className="font-700 text-base" style={{ fontWeight: 700, color: '#e5e7eb' }}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <CheckCircle className="w-3.5 h-3.5" />
                Fixed platform rate: ${previewData.ratePerMile.toFixed(2)} per completed mile
              </div>
              <button
                onClick={handleGenerateInvoice}
                disabled={generating}
                className="btn-gold px-5 py-2.5 text-sm flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {generating ? 'Generating...' : 'Generate Invoice'}
              </button>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Recent Invoices</p>
          {invoices.length === 0 ? (
            <div className="flex items-center justify-center h-32 rounded-xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No invoices yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map(inv => (
                <div key={inv.id} className="flex items-center gap-4 p-4 rounded-xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,168,76,0.08)' }}>
                    <FileText className="w-4 h-4" style={{ color: '#c9a84c' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-600 text-sm" style={{ fontWeight: 600 }}>{inv.companies?.company_name || 'Unknown'}</p>
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
      </div>
    </div>
  );
}
