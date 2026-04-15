import React, { useState, useEffect } from 'react';
import {
  DollarSign, Send, RefreshCw, CheckCircle, AlertCircle, Clock, X, Filter,
  ChevronDown, Building2, Calendar, Download, Users, TrendingUp
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { logFailure } from '../../utils/errorHandler';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const STATUS_STYLES = {
  pending:    { color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.06)', label: 'Pending' },
  processing: { color: '#c9a84c',               bg: 'rgba(201,168,76,0.1)',   label: 'Processing' },
  paid:       { color: '#00e5a0',               bg: 'rgba(0,229,160,0.08)',   label: 'Paid' },
  failed:     { color: '#ff4757',               bg: 'rgba(255,71,87,0.08)',   label: 'Failed' },
  cancelled:  { color: '#ff4757',               bg: 'rgba(255,71,87,0.06)',   label: 'Cancelled' },
  returned:   { color: '#ff4757',               bg: 'rgba(255,71,87,0.06)',   label: 'Returned' },
};

function StatusChip({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

export default function PayoutsTab() {
  const { drivers, org } = useApp();
  const [payouts, setPayouts] = useState([]);
  const [partners, setPartners] = useState([]);
  const [driverEarnings, setDriverEarnings] = useState({});
  const [bankAccounts, setBankAccounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [msg, setMsg] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [payoutForm, setPayoutForm] = useState({
    pay_period_start: '',
    pay_period_end: '',
    gross_amount: '',
    deductions: '0',
    payment_method: 'stripe_ach',
    paid_by: 'platform',
    payout_partner_id: '',
    notes: '',
  });

  useEffect(() => {
    loadAll();
  }, [org]);

  async function loadAll() {
    setLoading(true);
    if (!org?.id) { setLoading(false); return; }

    const [{ data: po }, { data: pts }, { data: ba }, { data: earn }] = await Promise.all([
      supabase.from('driver_payouts').select('*, drivers(full_name, photo_data), payout_partners(name)')
        .eq('org_id', org.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('payout_partners').select('*').eq('org_id', org.id).eq('is_active', true),
      supabase.from('driver_bank_accounts').select('driver_id, verification_status, bank_name, last4, account_type, is_active').eq('is_active', true),
      supabase.from('driver_earnings_log').select('driver_id, total_pay').eq('org_id', org.id)
        .gte('earn_date', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
    ]);

    setPayouts(po || []);
    setPartners(pts || []);

    const baMap = {};
    for (const b of ba || []) baMap[b.driver_id] = b;
    setBankAccounts(baMap);

    const earnMap = {};
    for (const e of earn || []) earnMap[e.driver_id] = (earnMap[e.driver_id] || 0) + parseFloat(e.total_pay || 0);
    setDriverEarnings(earnMap);

    setLoading(false);
  }

  async function createPayout() {
    if (!selectedDriverId || !payoutForm.pay_period_start || !payoutForm.pay_period_end || !payoutForm.gross_amount) return;
    setProcessing('create');
    setMsg(null);
    const gross = parseFloat(payoutForm.gross_amount) || 0;
    const deductions = parseFloat(payoutForm.deductions) || 0;
    const net = gross - deductions;
    const ba = bankAccounts[selectedDriverId];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('driver_payouts').insert({
        driver_id: selectedDriverId,
        org_id: org.id,
        bank_account_id: ba ? (await supabase.from('driver_bank_accounts').select('id').eq('driver_id', selectedDriverId).eq('is_active', true).maybeSingle()).data?.id : null,
        payout_partner_id: payoutForm.payout_partner_id || null,
        pay_period_start: payoutForm.pay_period_start,
        pay_period_end: payoutForm.pay_period_end,
        gross_amount: gross,
        deductions,
        net_amount: net,
        status: 'pending',
        payment_method: payoutForm.payment_method,
        paid_by: payoutForm.paid_by,
        notes: payoutForm.notes,
        initiated_by: user?.id,
        initiated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setMsg({ type: 'success', text: 'Payout created successfully.' });
      setShowCreateModal(false);
      setSelectedDriverId('');
      setPayoutForm({ pay_period_start: '', pay_period_end: '', gross_amount: '', deductions: '0', payment_method: 'stripe_ach', paid_by: 'platform', payout_partner_id: '', notes: '' });
      await loadAll();
    } catch (err) {
      logFailure('PayoutsTab:createPayout', err);
      setMsg({ type: 'error', text: err.message });
    }
    setProcessing(null);
  }

  async function sendPayout(payoutId) {
    setProcessing(payoutId);
    setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/driver-payouts/initiate-payout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json', Apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ payout_id: payoutId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsg({ type: 'success', text: 'Payout initiated successfully.' });
      await loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
    setProcessing(null);
  }

  async function markManualPaid(payoutId) {
    setProcessing(payoutId);
    const { error } = await supabase.from('driver_payouts').update({
      status: 'paid',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', payoutId);
    if (error) setMsg({ type: 'error', text: error.message });
    else { setMsg({ type: 'success', text: 'Payout marked as paid.' }); await loadAll(); }
    setProcessing(null);
  }

  async function cancelPayout(payoutId) {
    setProcessing(payoutId);
    const { error } = await supabase.from('driver_payouts').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', payoutId);
    if (error) setMsg({ type: 'error', text: error.message });
    else { await loadAll(); }
    setProcessing(null);
  }

  function exportCSV() {
    const rows = [['Driver', 'Period Start', 'Period End', 'Gross', 'Deductions', 'Net', 'Status', 'Method', 'Date'].join(',')];
    for (const p of filtered) {
      rows.push([
        `"${p.drivers?.full_name || ''}"`,
        p.pay_period_start, p.pay_period_end,
        p.gross_amount, p.deductions, p.net_amount,
        p.status, p.payment_method,
        p.initiated_at ? new Date(p.initiated_at).toLocaleDateString() : '',
      ].join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `payouts-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  const filtered = filterStatus === 'all' ? payouts : payouts.filter(p => p.status === filterStatus);
  const totalPaid = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.net_amount || 0), 0);
  const totalPending = payouts.filter(p => ['pending', 'processing'].includes(p.status)).reduce((s, p) => s + parseFloat(p.net_amount || 0), 0);
  const driversWithBank = Object.keys(bankAccounts).filter(id => bankAccounts[id]?.verification_status === 'verified').length;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#07090d' }}>
      <div className="px-6 py-4 border-b flex-shrink-0 flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div>
          <h2 className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Driver Payouts</h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Manage and send driver payments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-600"
            style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontWeight: 600 }}>
            <DollarSign className="w-3.5 h-3.5" /> Create Payout
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Paid (All Time)', value: `$${totalPaid.toFixed(2)}`, color: '#00e5a0' },
            { label: 'Pending / Processing', value: `$${totalPending.toFixed(2)}`, color: '#c9a84c' },
            { label: 'Drivers w/ Bank', value: `${driversWithBank}`, color: '#0ea5e9' },
            { label: 'Total Payouts', value: String(payouts.length), color: 'rgba(255,255,255,0.6)' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</p>
              <p className="text-xl font-700" style={{ color: s.color, fontWeight: 700 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {msg && (
          <div className="mx-6 mb-3 px-4 py-3 rounded-xl flex items-center gap-2 text-sm"
            style={{ background: msg.type === 'success' ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)', border: `1px solid ${msg.type === 'success' ? 'rgba(0,229,160,0.2)' : 'rgba(255,71,87,0.2)'}`, color: msg.type === 'success' ? '#00e5a0' : '#ff4757' }}>
            {msg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {msg.text}
            <button className="ml-auto" onClick={() => setMsg(null)}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        <div className="px-6 mb-3 flex items-center gap-2 flex-wrap">
          {['all', 'pending', 'processing', 'paid', 'failed', 'cancelled'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className="px-3 py-1.5 rounded-lg text-xs capitalize transition-all"
              style={{
                background: filterStatus === s ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${filterStatus === s ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.07)'}`,
                color: filterStatus === s ? '#c9a84c' : 'rgba(255,255,255,0.4)',
              }}>
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <DollarSign className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No payouts found</p>
          </div>
        ) : (
          <div className="px-6 space-y-2 pb-6">
            {filtered.map(p => {
              const ba = bankAccounts[p.driver_id];
              const isProcessing = processing === p.id;
              return (
                <div key={p.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-700 flex-shrink-0"
                        style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', fontWeight: 700 }}>
                        {p.drivers?.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{p.drivers?.full_name || 'Unknown Driver'}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {p.pay_period_start} – {p.pay_period_end}
                          {p.payout_partners?.name && <span className="ml-2" style={{ color: '#0ea5e9' }}>via {p.payout_partners.name}</span>}
                        </p>
                        {ba && (
                          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {ba.bank_name || 'Bank'} ···{ba.last4}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>${parseFloat(p.net_amount).toFixed(2)}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>of ${parseFloat(p.gross_amount).toFixed(2)}</p>
                      <div className="mt-1"><StatusChip status={p.status} /></div>
                    </div>
                  </div>

                  {(p.status === 'pending' || p.status === 'failed') && (
                    <div className="flex gap-2 mt-3">
                      {p.payment_method === 'stripe_ach' && ba?.verification_status === 'verified' && (
                        <button onClick={() => sendPayout(p.id)} disabled={!!processing}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-600"
                          style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0', fontWeight: 600 }}>
                          {isProcessing ? <div className="w-3 h-3 border rounded-full animate-spin" style={{ borderColor: '#00e5a0', borderTopColor: 'transparent' }} /> : <Send className="w-3.5 h-3.5" />}
                          Send ACH
                        </button>
                      )}
                      {(p.payment_method === 'manual' || p.payment_method === 'partner' || p.payment_method === 'check') && (
                        <button onClick={() => markManualPaid(p.id)} disabled={!!processing}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-600"
                          style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0', fontWeight: 600 }}>
                          {isProcessing ? <div className="w-3 h-3 border rounded-full animate-spin" style={{ borderColor: '#00e5a0', borderTopColor: 'transparent' }} /> : <CheckCircle className="w-3.5 h-3.5" />}
                          Mark Paid
                        </button>
                      )}
                      <button onClick={() => cancelPayout(p.id)} disabled={!!processing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                        style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.15)', color: '#ff4757' }}>
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                      {p.failure_reason && (
                        <p className="text-xs flex items-center gap-1 ml-auto" style={{ color: '#ff4757' }}>
                          <AlertCircle className="w-3 h-3" /> {p.failure_reason}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <p className="font-700 text-sm" style={{ color: '#e5e7eb', fontWeight: 700 }}>Create Payout</p>
              <button onClick={() => setShowCreateModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
              </button>
            </div>
            <div className="p-5 space-y-3 max-h-96 overflow-y-auto">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Driver</label>
                <select value={selectedDriverId} onChange={e => setSelectedDriverId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm"
                  style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}>
                  <option value="">Select driver...</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} {bankAccounts[d.id]?.verification_status === 'verified' ? '✓' : '(no bank)'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Period Start</label>
                  <input type="date" value={payoutForm.pay_period_start} onChange={e => setPayoutForm(f => ({ ...f, pay_period_start: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Period End</label>
                  <input type="date" value={payoutForm.pay_period_end} onChange={e => setPayoutForm(f => ({ ...f, pay_period_end: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Gross Amount ($)</label>
                  <input type="number" min="0" step="0.01" value={payoutForm.gross_amount} onChange={e => setPayoutForm(f => ({ ...f, gross_amount: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                    placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Deductions ($)</label>
                  <input type="number" min="0" step="0.01" value={payoutForm.deductions} onChange={e => setPayoutForm(f => ({ ...f, deductions: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                    placeholder="0.00" />
                </div>
              </div>
              {payoutForm.gross_amount && (
                <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.12)' }}>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Net Amount</p>
                  <p className="text-base font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>
                    ${Math.max(0, (parseFloat(payoutForm.gross_amount) || 0) - (parseFloat(payoutForm.deductions) || 0)).toFixed(2)}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Payment Method</label>
                <select value={payoutForm.payment_method} onChange={e => setPayoutForm(f => ({ ...f, payment_method: e.target.value, paid_by: e.target.value === 'partner' ? 'partner' : 'platform' }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm"
                  style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}>
                  <option value="stripe_ach">Stripe ACH (Direct Deposit)</option>
                  <option value="manual">Manual (Cash/Zelle/etc.)</option>
                  <option value="partner">Route Through Partner</option>
                  <option value="check">Check</option>
                </select>
              </div>
              {payoutForm.payment_method === 'partner' && partners.length > 0 && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Payout Partner</label>
                  <select value={payoutForm.payout_partner_id} onChange={e => setPayoutForm(f => ({ ...f, payout_partner_id: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}>
                    <option value="">Select partner...</option>
                    {partners.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Notes (optional)</label>
                <input value={payoutForm.notes} onChange={e => setPayoutForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                  placeholder="e.g. Weekly pay 12/9-12/15" />
              </div>
            </div>
            <div className="px-5 py-4 border-t flex gap-2" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <button onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                Cancel
              </button>
              <button onClick={createPayout} disabled={!!processing || !selectedDriverId || !payoutForm.pay_period_start || !payoutForm.gross_amount}
                className="flex-1 py-2.5 rounded-xl text-sm font-600 flex items-center justify-center gap-2"
                style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontWeight: 600 }}>
                {processing === 'create' ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} /> : <DollarSign className="w-4 h-4" />}
                Create Payout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
