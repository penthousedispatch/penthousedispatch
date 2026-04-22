import React, { useState, useEffect } from 'react';
import { X, CreditCard, CheckCircle, AlertCircle, Clock, ChevronRight, Building2, FileText, DollarSign, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logFailure } from '../../utils/errorHandler';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const statusColors = {
  pending: { color: '#f59e0b', label: 'Pending Verification' },
  verified: { color: '#00e5a0', label: 'Verified' },
  failed: { color: '#ff4757', label: 'Verification Failed' },
  requires_action: { color: '#f59e0b', label: 'Action Required' },
};

function StatusBadge({ status }) {
  const s = statusColors[status] || statusColors.pending;
  return (
    <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
      style={{ background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}30` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export default function DriverPaymentSetup({ driverId, driverName, driverEmail, onClose }) {
  const [tab, setTab] = useState('account');
  const [bankAccount, setBankAccount] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [taxInfo, setTaxInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const [taxForm, setTaxForm] = useState({
    legal_name: '', tax_id_last4: '', address_line1: '', address_line2: '',
    city: '', state: '', zip: '', tax_classification: 'individual',
  });

  useEffect(() => {
    loadAll();
  }, [driverId]);

  async function loadAll() {
    setLoading(true);
    const [{ data: ba }, { data: po }, { data: ti }] = await Promise.all([
      supabase.from('driver_bank_accounts').select('*').eq('driver_id', driverId).eq('is_active', true).maybeSingle(),
      supabase.from('driver_payouts').select('*').eq('driver_id', driverId).order('created_at', { ascending: false }).limit(20),
      supabase.from('driver_tax_info').select('*').eq('driver_id', driverId).maybeSingle(),
    ]);
    setBankAccount(ba);
    setPayouts(po || []);
    if (ti) {
      setTaxInfo(ti);
      setTaxForm({
        legal_name: ti.legal_name || '',
        tax_id_last4: ti.tax_id_last4 || '',
        address_line1: ti.address_line1 || '',
        address_line2: ti.address_line2 || '',
        city: ti.city || '',
        state: ti.state || '',
        zip: ti.zip || '',
        tax_classification: ti.tax_classification || 'individual',
      });
    }
    setLoading(false);
  }

  async function handleSetupStripe() {
    setSaving(true);
    setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      let stripeAccountId = bankAccount?.stripe_account_id;

      if (!stripeAccountId) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/driver-payouts/create-connect-account`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ driver_id: driverId, email: driverEmail, name: driverName }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        stripeAccountId = data.stripe_account_id;
      }

      const baRes = await supabase.from('driver_bank_accounts')
        .select('id').eq('driver_id', driverId).maybeSingle();
      const baId = baRes.data?.id;

      const res2 = await fetch(`${SUPABASE_URL}/functions/v1/driver-payouts/create-onboarding-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({
          stripe_account_id: stripeAccountId,
          return_url: window.location.href,
          refresh_url: window.location.href,
        }),
      });
      const linkData = await res2.json();
      if (linkData.error) throw new Error(linkData.error);

      window.open(linkData.url, '_blank');
      setMsg({ type: 'info', text: 'Stripe onboarding opened in a new tab. After completing it, come back and refresh to check your verification status.' });
      await loadAll();
    } catch (err) {
      logFailure('DriverPaymentSetup:setupStripe', err);
      setMsg({ type: 'error', text: err.message || 'Failed to set up payment account.' });
    }
    setSaving(false);
  }

  async function handleCheckStatus() {
    if (!bankAccount?.stripe_account_id || !bankAccount?.id) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/driver-payouts/check-account-status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ stripe_account_id: bankAccount.stripe_account_id, driver_bank_account_id: bankAccount.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsg({ type: data.status === 'verified' ? 'success' : 'info', text: `Account status: ${statusColors[data.status]?.label || data.status}` });
      await loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
    setSaving(false);
  }

  async function saveTaxInfo() {
    setSaving(true);
    setMsg(null);
    try {
      if (taxInfo?.id) {
        const { error } = await supabase.from('driver_tax_info').update({
          ...taxForm,
          w9_completed_at: new Date().toISOString(),
          is_1099_eligible: true,
          updated_at: new Date().toISOString(),
        }).eq('id', taxInfo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('driver_tax_info').insert({
          driver_id: driverId,
          ...taxForm,
          w9_completed_at: new Date().toISOString(),
          is_1099_eligible: true,
        });
        if (error) throw error;
      }
      setMsg({ type: 'success', text: 'Tax information saved.' });
      await loadAll();
    } catch (err) {
      logFailure('DriverPaymentSetup:saveTaxInfo', err);
      setMsg({ type: 'error', text: err.message });
    }
    setSaving(false);
  }

  const totalPaid = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.net_amount || 0), 0);
  const pendingPay = payouts.filter(p => p.status === 'pending' || p.status === 'processing').reduce((s, p) => s + parseFloat(p.net_amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)', paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: '#0d1117', maxHeight: 'min(90vh, calc(100vh - var(--safe-top) - var(--safe-bottom) - 8px))', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)', paddingTop: 'calc(var(--safe-top) + 12px)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.25)' }}>
              <DollarSign className="w-4 h-4" style={{ color: '#c9a84c' }} />
            </div>
            <div>
              <p className="font-700 text-sm" style={{ color: '#e5e7eb', fontWeight: 700 }}>Payment Setup</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Manage your bank account & payouts</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>

        <div className="flex border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          {[
            { id: 'account', label: 'Bank Account', icon: CreditCard },
            { id: 'payouts', label: 'Payouts', icon: DollarSign },
            { id: 'tax', label: 'Tax Info', icon: FileText },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-600 transition-all"
              style={{
                color: tab === id ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                borderBottom: tab === id ? '2px solid #c9a84c' : '2px solid transparent',
                fontWeight: tab === id ? 600 : 400,
              }}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <>
              {msg && (
                <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-sm"
                  style={{
                    background: msg.type === 'success' ? 'rgba(0,229,160,0.08)' : msg.type === 'error' ? 'rgba(255,71,87,0.08)' : 'rgba(201,168,76,0.08)',
                    border: `1px solid ${msg.type === 'success' ? 'rgba(0,229,160,0.2)' : msg.type === 'error' ? 'rgba(255,71,87,0.2)' : 'rgba(201,168,76,0.2)'}`,
                    color: msg.type === 'success' ? '#00e5a0' : msg.type === 'error' ? '#ff4757' : '#c9a84c',
                  }}>
                  {msg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  {msg.text}
                </div>
              )}

              {tab === 'account' && (
                <div className="space-y-4">
                  {bankAccount ? (
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4" style={{ color: '#c9a84c' }} />
                          <span className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>
                            {bankAccount.bank_name || 'Connected Account'}
                          </span>
                        </div>
                        <StatusBadge status={bankAccount.verification_status} />
                      </div>
                      {bankAccount.last4 && (
                        <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          Account ending in {bankAccount.last4} &bull; {bankAccount.account_type}
                        </p>
                      )}
                      {bankAccount.routing_last4 && (
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          Routing ending in {bankAccount.routing_last4}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button onClick={handleCheckStatus} disabled={saving}
                          className="flex-1 py-2 rounded-xl text-xs font-600 flex items-center justify-center gap-1"
                          style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', fontWeight: 600 }}>
                          <Clock className="w-3.5 h-3.5" />
                          Refresh Status
                        </button>
                        <button onClick={handleSetupStripe} disabled={saving}
                          className="flex-1 py-2 rounded-xl text-xs font-600 flex items-center justify-center gap-1"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                          <ExternalLink className="w-3.5 h-3.5" />
                          Update Bank
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(201,168,76,0.04)', border: '1px dashed rgba(201,168,76,0.2)' }}>
                      <CreditCard className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(201,168,76,0.5)' }} />
                      <p className="text-sm font-600 mb-1" style={{ color: '#e5e7eb', fontWeight: 600 }}>No Bank Account Connected</p>
                      <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        Connect your bank account to receive direct deposit payouts securely through Stripe.
                      </p>
                      <button onClick={handleSetupStripe} disabled={saving}
                        className="px-6 py-2.5 rounded-xl text-sm font-600 flex items-center gap-2 mx-auto"
                        style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontWeight: 600 }}>
                        {saving ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} /> : <ExternalLink className="w-4 h-4" />}
                        Connect Bank Account
                      </button>
                    </div>
                  )}

                  <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-xs font-600 mb-3" style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Earnings Summary</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl p-3" style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.12)' }}>
                        <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Total Received</p>
                        <p className="text-lg font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>${totalPaid.toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.12)' }}>
                        <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Pending</p>
                        <p className="text-lg font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${pendingPay.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'payouts' && (
                <div className="space-y-2">
                  {payouts.length === 0 ? (
                    <div className="text-center py-10">
                      <DollarSign className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.15)' }} />
                      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No payouts yet</p>
                    </div>
                  ) : payouts.map(p => {
                    const statusStyle = {
                      paid: { color: '#00e5a0', label: 'Paid' },
                      processing: { color: '#c9a84c', label: 'Processing' },
                      pending: { color: 'rgba(255,255,255,0.4)', label: 'Pending' },
                      failed: { color: '#ff4757', label: 'Failed' },
                      cancelled: { color: '#ff4757', label: 'Cancelled' },
                      returned: { color: '#ff4757', label: 'Returned' },
                    }[p.status] || { color: '#aaa', label: p.status };
                    return (
                      <div key={p.id} className="rounded-xl p-4 flex items-center justify-between"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                          <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>
                            {p.pay_period_start} – {p.pay_period_end}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            {p.payment_method === 'partner' ? 'Via Partner' : 'Direct Deposit'}
                            {p.initiated_at && ` · ${new Date(p.initiated_at).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>${parseFloat(p.net_amount).toFixed(2)}</p>
                          <span className="text-xs" style={{ color: statusStyle.color }}>{statusStyle.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === 'tax' && (
                <div className="space-y-4">
                  <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
                    <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#c9a84c' }} />
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                      This information is used to generate your 1099-NEC tax form if you earn $600 or more in a calendar year. Please enter your legal name exactly as it appears on your tax return.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Legal Name (as on tax return)</label>
                      <input value={taxForm.legal_name} onChange={e => setTaxForm(f => ({ ...f, legal_name: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                        placeholder="Full legal name" />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Last 4 of SSN / EIN</label>
                      <input value={taxForm.tax_id_last4} onChange={e => setTaxForm(f => ({ ...f, tax_id_last4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                        placeholder="XXXX" maxLength={4} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Tax Classification</label>
                      <select value={taxForm.tax_classification} onChange={e => setTaxForm(f => ({ ...f, tax_classification: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}>
                        <option value="individual">Individual / Sole Proprietor</option>
                        <option value="sole_prop">Sole Proprietorship</option>
                        <option value="llc_single">LLC (Single Member)</option>
                        <option value="llc_partnership">LLC (Partnership)</option>
                        <option value="c_corp">C Corporation</option>
                        <option value="s_corp">S Corporation</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Address Line 1</label>
                      <input value={taxForm.address_line1} onChange={e => setTaxForm(f => ({ ...f, address_line1: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                        placeholder="Street address" />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Address Line 2 (optional)</label>
                      <input value={taxForm.address_line2} onChange={e => setTaxForm(f => ({ ...f, address_line2: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                        placeholder="Apt, suite, etc." />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>City</label>
                        <input value={taxForm.city} onChange={e => setTaxForm(f => ({ ...f, city: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                          placeholder="City" />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>State</label>
                        <input value={taxForm.state} onChange={e => setTaxForm(f => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
                          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                          placeholder="NY" maxLength={2} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>ZIP</label>
                        <input value={taxForm.zip} onChange={e => setTaxForm(f => ({ ...f, zip: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
                          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                          placeholder="10001" maxLength={5} />
                      </div>
                    </div>
                    <button onClick={saveTaxInfo} disabled={saving || !taxForm.legal_name}
                      className="w-full py-3 rounded-xl text-sm font-600 flex items-center justify-center gap-2"
                      style={{ background: taxForm.legal_name ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${taxForm.legal_name ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.08)'}`, color: taxForm.legal_name ? '#c9a84c' : 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                      {saving ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} /> : <CheckCircle className="w-4 h-4" />}
                      Save Tax Information
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
