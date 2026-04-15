import React, { useState, useEffect } from 'react';
import {
  FileText, DollarSign, Building2, CheckCircle, AlertCircle, Download,
  RefreshCw, Plus, X, Send, Users, TrendingUp, Calendar, Settings, Banknote
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { logFailure } from '../../utils/errorHandler';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const TAX_YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

function Tab({ id, label, icon: Icon, active, onClick }) {
  return (
    <button onClick={() => onClick(id)}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap"
      style={{
        background: active ? 'rgba(201,168,76,0.12)' : 'transparent',
        border: `1px solid ${active ? 'rgba(201,168,76,0.25)' : 'transparent'}`,
        color: active ? '#c9a84c' : 'rgba(255,255,255,0.45)',
        fontWeight: active ? 600 : 400,
      }}>
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

export default function AdminPayroll() {
  const { org } = useApp();
  const [tab, setTab] = useState('tax');
  const [taxDocs, setTaxDocs] = useState([]);
  const [taxInfo, setTaxInfo] = useState({});
  const [partners, setPartners] = useState([]);
  const [payoutSummary, setPayoutSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [editPartner, setEditPartner] = useState(null);
  const [partnerForm, setPartnerForm] = useState({ name: '', contact_email: '', stripe_account_id: '', is_default: false, notes: '' });
  const [savingPartner, setSavingPartner] = useState(false);

  useEffect(() => { loadAll(); }, [org, selectedYear]);

  async function loadAll() {
    setLoading(true);
    if (!org?.id) { setLoading(false); return; }

    const [{ data: docs }, { data: ti }, { data: pts }, { data: po }] = await Promise.all([
      supabase.from('driver_tax_documents').select('*, drivers(full_name, photo_data)')
        .eq('org_id', org.id).eq('tax_year', selectedYear).order('total_compensation', { ascending: false }),
      supabase.from('driver_tax_info').select('driver_id, legal_name, tax_id_last4, w9_completed_at, is_1099_eligible, tax_classification'),
      supabase.from('payout_partners').select('*').eq('org_id', org.id).order('created_at', { ascending: false }),
      supabase.from('driver_payouts').select('driver_id, net_amount, status, pay_period_start, payment_method, paid_by, payout_partner_id, payout_partners(name)')
        .eq('org_id', org.id).eq('status', 'paid')
        .gte('pay_period_start', `${selectedYear}-01-01`)
        .lte('pay_period_start', `${selectedYear}-12-31`),
    ]);

    setTaxDocs(docs || []);
    const tiMap = {};
    for (const t of ti || []) tiMap[t.driver_id] = t;
    setTaxInfo(tiMap);
    setPartners(pts || []);

    const summaryMap = {};
    for (const p of po || []) {
      if (!summaryMap[p.driver_id]) summaryMap[p.driver_id] = { total: 0, partner_total: 0, direct_total: 0, partner_name: null };
      summaryMap[p.driver_id].total += parseFloat(p.net_amount || 0);
      if (p.paid_by === 'partner') {
        summaryMap[p.driver_id].partner_total += parseFloat(p.net_amount || 0);
        summaryMap[p.driver_id].partner_name = p.payout_partners?.name;
      } else {
        summaryMap[p.driver_id].direct_total += parseFloat(p.net_amount || 0);
      }
    }
    setPayoutSummary(Object.entries(summaryMap).map(([driver_id, data]) => ({ driver_id, ...data })));

    setLoading(false);
  }

  async function generate1099s() {
    setGenerating(true);
    setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/driver-payouts/generate-1099s`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json', Apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ org_id: org.id, tax_year: selectedYear }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsg({ type: 'success', text: `Generated ${data.generated} 1099-NEC document${data.generated !== 1 ? 's' : ''} for ${selectedYear}.` });
      await loadAll();
    } catch (err) {
      logFailure('AdminPayroll:generate1099s', err);
      setMsg({ type: 'error', text: err.message });
    }
    setGenerating(false);
  }

  async function updateDocStatus(docId, status) {
    const update = { document_status: status, updated_at: new Date().toISOString() };
    if (status === 'sent') update.sent_at = new Date().toISOString();
    if (status === 'filed') update.filed_at = new Date().toISOString();
    const { error } = await supabase.from('driver_tax_documents').update(update).eq('id', docId);
    if (error) setMsg({ type: 'error', text: error.message });
    else await loadAll();
  }

  function exportTaxCSV() {
    const rows = [['Driver', 'Legal Name', 'Tax ID Last4', 'Classification', 'Total Compensation', 'Status', 'W9 Completed'].join(',')];
    for (const d of taxDocs) {
      const ti = taxInfo[d.driver_id] || {};
      rows.push([
        `"${d.drivers?.full_name || ''}"`,
        `"${ti.legal_name || ''}"`,
        ti.tax_id_last4 || '',
        ti.tax_classification || '',
        d.total_compensation,
        d.document_status,
        ti.w9_completed_at ? new Date(ti.w9_completed_at).toLocaleDateString() : '',
      ].join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `1099-nec-${selectedYear}.csv`; a.click();
  }

  function exportPayrollCSV() {
    const rows = [['Driver ID', 'Total Paid', 'Direct', 'Via Partner', 'Partner Name'].join(',')];
    for (const s of payoutSummary) {
      rows.push([s.driver_id, s.total.toFixed(2), s.direct_total.toFixed(2), s.partner_total.toFixed(2), `"${s.partner_name || ''}"`].join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `payroll-summary-${selectedYear}.csv`; a.click();
  }

  function openPartnerModal(partner = null) {
    setEditPartner(partner);
    setPartnerForm(partner ? { name: partner.name, contact_email: partner.contact_email || '', stripe_account_id: partner.stripe_account_id || '', is_default: partner.is_default, notes: partner.notes || '' } : { name: '', contact_email: '', stripe_account_id: '', is_default: false, notes: '' });
    setShowPartnerModal(true);
  }

  async function savePartner() {
    setSavingPartner(true);
    setMsg(null);
    try {
      if (editPartner) {
        const { error } = await supabase.from('payout_partners').update({ ...partnerForm, updated_at: new Date().toISOString() }).eq('id', editPartner.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('payout_partners').insert({ org_id: org.id, ...partnerForm });
        if (error) throw error;
      }
      if (partnerForm.is_default) {
        await supabase.from('payout_partners').update({ is_default: false }).eq('org_id', org.id).neq('id', editPartner?.id || '00000000-0000-0000-0000-000000000000');
        await supabase.from('payout_partners').update({ is_default: true }).eq('org_id', org.id).eq('name', partnerForm.name);
      }
      setMsg({ type: 'success', text: editPartner ? 'Partner updated.' : 'Partner added.' });
      setShowPartnerModal(false);
      setEditPartner(null);
      await loadAll();
    } catch (err) {
      logFailure('AdminPayroll:savePartner', err);
      setMsg({ type: 'error', text: err.message });
    }
    setSavingPartner(false);
  }

  async function togglePartnerActive(partner) {
    const { error } = await supabase.from('payout_partners').update({ is_active: !partner.is_active, updated_at: new Date().toISOString() }).eq('id', partner.id);
    if (error) setMsg({ type: 'error', text: error.message });
    else await loadAll();
  }

  const DOC_STATUS = {
    draft:  { color: 'rgba(255,255,255,0.4)', label: 'Draft' },
    ready:  { color: '#c9a84c',               label: 'Ready' },
    sent:   { color: '#0ea5e9',               label: 'Sent' },
    filed:  { color: '#00e5a0',               label: 'Filed' },
  };

  const totalCompensation = taxDocs.reduce((s, d) => s + parseFloat(d.total_compensation || 0), 0);
  const eligible = taxDocs.length;
  const filed = taxDocs.filter(d => d.document_status === 'filed').length;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#07090d' }}>
      <div className="px-6 py-4 border-b flex-shrink-0 flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div>
          <h2 className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Payroll & Tax</h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>1099 documents, payout partners, and payroll reporting</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
            className="px-3 py-2 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}>
            {TAX_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="px-6 pt-4 flex gap-2 flex-shrink-0">
        <Tab id="tax" label="1099 Documents" icon={FileText} active={tab === 'tax'} onClick={setTab} />
        <Tab id="partners" label="Payout Partners" icon={Building2} active={tab === 'partners'} onClick={setTab} />
        <Tab id="summary" label="Payroll Summary" icon={TrendingUp} active={tab === 'summary'} onClick={setTab} />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
        {msg && (
          <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-sm"
            style={{ background: msg.type === 'success' ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)', border: `1px solid ${msg.type === 'success' ? 'rgba(0,229,160,0.2)' : 'rgba(255,71,87,0.2)'}`, color: msg.type === 'success' ? '#00e5a0' : '#ff4757' }}>
            {msg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {msg.text}
            <button className="ml-auto" onClick={() => setMsg(null)}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {tab === 'tax' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: `${selectedYear} Total Compensation`, value: `$${totalCompensation.toFixed(2)}`, color: '#c9a84c' },
                { label: '1099 Eligible Drivers', value: String(eligible), color: '#0ea5e9' },
                { label: 'Forms Filed', value: `${filed} / ${eligible}`, color: '#00e5a0' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</p>
                  <p className="text-xl font-700" style={{ color: s.color, fontWeight: 700 }}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={generate1099s} disabled={generating}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-600"
                style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600 }}>
                {generating ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} /> : <RefreshCw className="w-4 h-4" />}
                Generate 1099s for {selectedYear}
              </button>
              <button onClick={exportTaxCSV} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                <Download className="w-4 h-4" /> Export CSV
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} /></div>
            ) : taxDocs.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
                <p className="text-sm font-600 mb-1" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>No 1099 documents for {selectedYear}</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>Click "Generate 1099s" to create documents for drivers who earned $600+</p>
              </div>
            ) : (
              <div className="space-y-2">
                {taxDocs.map(doc => {
                  const ti = taxInfo[doc.driver_id] || {};
                  const st = DOC_STATUS[doc.document_status] || DOC_STATUS.draft;
                  return (
                    <div key={doc.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-700 flex-shrink-0"
                            style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', fontWeight: 700 }}>
                            {doc.drivers?.full_name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{doc.drivers?.full_name}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                              {ti.legal_name && <span>{ti.legal_name} · </span>}
                              {ti.tax_id_last4 && <span>SSN/EIN ···{ti.tax_id_last4} · </span>}
                              {ti.w9_completed_at ? <span style={{ color: '#00e5a0' }}>W9 on file</span> : <span style={{ color: '#ff4757' }}>No W9</span>}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>${parseFloat(doc.total_compensation).toFixed(2)}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: st.color, background: `${st.color}18` }}>{st.label}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        {doc.document_status === 'draft' && (
                          <button onClick={() => updateDocStatus(doc.id, 'ready')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                            style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c' }}>
                            <CheckCircle className="w-3.5 h-3.5" /> Mark Ready
                          </button>
                        )}
                        {doc.document_status === 'ready' && (
                          <button onClick={() => updateDocStatus(doc.id, 'sent')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                            style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', color: '#0ea5e9' }}>
                            <Send className="w-3.5 h-3.5" /> Mark Sent
                          </button>
                        )}
                        {doc.document_status === 'sent' && (
                          <button onClick={() => updateDocStatus(doc.id, 'filed')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                            style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0' }}>
                            <CheckCircle className="w-3.5 h-3.5" /> Mark Filed
                          </button>
                        )}
                        {doc.document_status === 'filed' && (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ color: '#00e5a0' }}>
                            <CheckCircle className="w-3.5 h-3.5" /> Filed {doc.filed_at && `on ${new Date(doc.filed_at).toLocaleDateString()}`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'partners' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Payout partners are third-party payroll companies that can process driver payments on your behalf.
              </p>
              <button onClick={() => openPartnerModal()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-600 whitespace-nowrap ml-4"
                style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600 }}>
                <Plus className="w-4 h-4" /> Add Partner
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} /></div>
            ) : partners.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
                <p className="text-sm font-600 mb-1" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>No payout partners configured</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>Add a partner company to route driver payouts through a third-party payroll provider</p>
              </div>
            ) : (
              <div className="space-y-3">
                {partners.map(pt => (
                  <div key={pt.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', opacity: pt.is_active ? 1 : 0.5 }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.2)' }}>
                          <Building2 className="w-5 h-5" style={{ color: '#0ea5e9' }} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{pt.name}</p>
                            {pt.is_default && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c' }}>Default</span>}
                            {!pt.is_active && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,71,87,0.08)', color: '#ff4757' }}>Inactive</span>}
                          </div>
                          {pt.contact_email && <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{pt.contact_email}</p>}
                          {pt.stripe_account_id && <p className="text-xs mt-0.5 font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{pt.stripe_account_id}</p>}
                          {pt.notes && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{pt.notes}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => openPartnerModal(pt)} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                          Edit
                        </button>
                        <button onClick={() => togglePartnerActive(pt)} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: pt.is_active ? 'rgba(255,71,87,0.08)' : 'rgba(0,229,160,0.08)', border: `1px solid ${pt.is_active ? 'rgba(255,71,87,0.15)' : 'rgba(0,229,160,0.15)'}`, color: pt.is_active ? '#ff4757' : '#00e5a0' }}>
                          {pt.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'summary' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>All completed payouts for {selectedYear}</p>
              <button onClick={exportPayrollCSV} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                <Download className="w-4 h-4" /> Export CSV
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} /></div>
            ) : payoutSummary.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <TrendingUp className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No payroll data for {selectedYear}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {payoutSummary.sort((a, b) => b.total - a.total).map(s => (
                  <div key={s.driver_id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.driver_id.slice(0, 8)}...</p>
                        <div className="flex items-center gap-4 mt-1">
                          <div>
                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Direct</p>
                            <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>${s.direct_total.toFixed(2)}</p>
                          </div>
                          {s.partner_total > 0 && (
                            <div>
                              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Via {s.partner_name || 'Partner'}</p>
                              <p className="text-sm font-600" style={{ color: '#0ea5e9', fontWeight: 600 }}>${s.partner_total.toFixed(2)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Total {selectedYear}</p>
                        <p className="text-xl font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${s.total.toFixed(2)}</p>
                        {s.total >= 600 && <p className="text-xs mt-0.5" style={{ color: '#c9a84c' }}>1099 Required</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showPartnerModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto px-4 py-6 sm:flex sm:items-center sm:justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <p className="font-700 text-sm" style={{ color: '#e5e7eb', fontWeight: 700 }}>{editPartner ? 'Edit Partner' : 'Add Payout Partner'}</p>
              <button onClick={() => { setShowPartnerModal(false); setEditPartner(null); }} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {[
                { key: 'name', label: 'Company Name', placeholder: 'e.g. ADP, Gusto, Paychex' },
                { key: 'contact_email', label: 'Contact Email', placeholder: 'billing@partner.com' },
                { key: 'stripe_account_id', label: 'Stripe Account ID (optional)', placeholder: 'acct_...' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</label>
                  <input value={partnerForm[key]} onChange={e => setPartnerForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                    placeholder={placeholder} />
                </div>
              ))}
              <div>
                <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Notes</label>
                <textarea value={partnerForm.notes} onChange={e => setPartnerForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                  rows={2} placeholder="Optional notes about this partner..." />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={partnerForm.is_default} onChange={e => setPartnerForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded" />
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Set as default payout partner</span>
              </label>
            </div>
            <div className="px-5 py-4 border-t flex gap-2" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <button onClick={() => { setShowPartnerModal(false); setEditPartner(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                Cancel
              </button>
              <button onClick={savePartner} disabled={savingPartner || !partnerForm.name}
                className="flex-1 py-2.5 rounded-xl text-sm font-600 flex items-center justify-center gap-2"
                style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontWeight: 600 }}>
                {savingPartner ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} /> : <CheckCircle className="w-4 h-4" />}
                {editPartner ? 'Save Changes' : 'Add Partner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
