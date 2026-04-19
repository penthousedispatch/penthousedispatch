import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { sentryApi } from '../../lib/sentryApi';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, ChevronRight, ChevronLeft, Building2, User, Zap,
  FileText, AlertTriangle, RefreshCw, Download
} from 'lucide-react';

const AGREEMENT_TEXT = `SOFTWARE LICENSE AGREEMENT — PENTHOUSE DISPATCH

Last Updated: 2026

IMPORTANT: READ THIS AGREEMENT CAREFULLY BEFORE ACCESSING THE PLATFORM.

1. LICENSE GRANT
Penthouse Dispatch grants you a non-exclusive, non-transferable, limited license to access and use the Platform solely for your internal business operations. The software is LICENSED, NOT SOLD.

2. AUTOMATIC BILLING
By accepting this agreement, you authorize Penthouse Dispatch to automatically charge your payment method for platform usage fees on a monthly basis. Invoices are generated automatically based on trip mileage processed through the platform.

3. PRICING CONTROL
Platform pricing, billing rates, and fee structures are determined solely by Penthouse Dispatch and may be adjusted with 30 days written notice.

4. USAGE TERMS
You agree to use the Platform only for lawful transportation dispatch operations. You may not resell, sublicense, or transfer your access to third parties.

5. NON-PAYMENT SUSPENSION
Failure to maintain a valid payment method or failure to pay invoices within 30 days of issuance may result in immediate suspension of your access to the Platform.

6. DATA AND PRIVACY
You grant Penthouse Dispatch the right to process trip, driver, and operational data for the purpose of providing and improving the Platform services.

7. LIMITATION OF LIABILITY
Penthouse Dispatch's total liability shall not exceed fees paid in the previous 3 months. We are not liable for indirect, incidental, or consequential damages.

8. TERMINATION
Either party may terminate this agreement with 30 days written notice. Upon termination, your access to the Platform will be suspended.

By clicking "Accept & Submit Application", you confirm that you have read, understood, and agree to be bound by these terms.`;

const STEPS = [
  { id: 'sentry', label: 'Connect Sentry', icon: Zap },
  { id: 'info', label: 'Company Info', icon: Building2 },
  { id: 'billing', label: 'Billing Contact', icon: User },
  { id: 'agreement', label: 'Agreement', icon: FileText },
  { id: 'confirm', label: 'Done', icon: CheckCircle },
];

export default function CompanyOnboarding() {
  const { user, company, setCompany } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const agreementRef = useRef(null);

  const [form, setForm] = useState({
    company_name: '',
    legal_entity: '',
    phone: '',
    address: '',
    tax_id: '',
    billing_contact_name: '',
    billing_contact_email: '',
    import_source: 'sentry',
    asm_notes: '',
    sentry_base_url: 'https://dsp-integration.test.sentryms.com',
    sentry_username: '',
    sentry_password: '',
    sentry_api_key: '',
  });

  function setField(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  React.useEffect(() => {
    try {
      const seed = JSON.parse(localStorage.getItem('pd_company_signup_seed') || 'null');
      if (seed) {
        setForm(prev => ({
          ...prev,
          company_name: prev.company_name || seed.company_name || '',
          billing_contact_name: prev.billing_contact_name || seed.billing_contact_name || '',
          billing_contact_email: prev.billing_contact_email || seed.billing_contact_email || '',
          import_source: seed.import_source || prev.import_source,
        }));
      }
    } catch (_) {
      // ignore malformed local storage seed
    }
  }, []);

  function handleScroll() {
    const el = agreementRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 40) setScrolledToBottom(true);
  }

  async function testSentryConnection() {
    setTestingConn(true);
    setConnResult(null);
    setImportResult(null);
    sentryApi.configure({
      baseUrl: form.sentry_base_url,
      username: form.sentry_username,
      password: form.sentry_password,
      apiKey: form.sentry_api_key,
      authType: form.sentry_username ? 'basic' : 'bearer',
    });
    const result = await sentryApi.healthCheck();
    setConnResult(result);
    setTestingConn(false);
  }

  async function importFromSentry() {
    setImporting(true);
    setImportResult(null);
    sentryApi.configure({
      baseUrl: form.sentry_base_url,
      username: form.sentry_username,
      password: form.sentry_password,
      apiKey: form.sentry_api_key,
      authType: form.sentry_username ? 'basic' : 'bearer',
    });

    const fields = {};

    const tryImport = async (fetcher, mapper) => {
      try {
        const res = await fetcher();
        if (res.ok && res.data) mapper(res.data, fields);
      } catch (_) {}
    };

    await tryImport(
      () => sentryApi.request('GET', '/rest/transportation_provider_facade/v4.0/provider.json'),
      (data, f) => {
        const p = Array.isArray(data) ? data[0] : data;
        if (p?.name) f.company_name = p.name;
        if (p?.legal_name) f.legal_entity = p.legal_name;
        if (p?.phone) f.phone = p.phone;
        if (p?.address) f.address = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ');
        if (p?.tax_id || p?.ein) f.tax_id = p.tax_id || p.ein;
        if (p?.billing_email) f.billing_contact_email = p.billing_email;
        if (p?.billing_contact) f.billing_contact_name = p.billing_contact;
      }
    );

    await tryImport(
      () => sentryApi.request('GET', '/rest/transportation_provider_facade/v4.0/company.json'),
      (data, f) => {
        const c = Array.isArray(data) ? data[0] : data;
        if (!f.company_name && c?.name) f.company_name = c.name;
        if (!f.phone && c?.phone) f.phone = c.phone;
        if (!f.address && c?.address) f.address = c.address;
      }
    );

    await tryImport(
      () => sentryApi.request('GET', '/rest/transportation_provider_facade/v4.0/provider_profile.json'),
      (data, f) => {
        const pr = Array.isArray(data) ? data[0] : data;
        if (!f.company_name && pr?.provider_name) f.company_name = pr.provider_name;
        if (!f.phone && pr?.contact_phone) f.phone = pr.contact_phone;
      }
    );

    const count = Object.keys(fields).length;
    if (count > 0) {
      setForm(prev => ({ ...prev, ...fields }));
      setImportResult({ ok: true, count, fields: Object.keys(fields) });
    } else {
      setImportResult({ ok: false });
    }
    setImporting(false);
  }

  async function handleFinish() {
    if (!user) return;
    setSaving(true);
    setError('');

    const normalizedBillingEmail = String(form.billing_contact_email || user.email || '').trim().toLowerCase();
    const normalizedCompanyName = String(form.company_name || '').trim().toLowerCase();
    let existingCompany = company || null;

    if (!existingCompany?.id) {
      const lookupCandidates = [];

      lookupCandidates.push(
        supabase.from('companies').select('*').eq('owner_user_id', user.id).maybeSingle()
      );

      if (normalizedBillingEmail) {
        lookupCandidates.push(
          supabase
            .from('companies')
            .select('*')
            .ilike('billing_contact_email', normalizedBillingEmail)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        );
      }

      if (normalizedCompanyName) {
        lookupCandidates.push(
          supabase
            .from('companies')
            .select('*')
            .ilike('company_name', form.company_name.trim())
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        );
      }

      for (const candidate of lookupCandidates) {
        const { data, error: lookupError } = await candidate;
        if (lookupError) {
          setError(lookupError.message || 'Failed to look up company.');
          setSaving(false);
          return;
        }
        if (data?.id) {
          existingCompany = data;
          break;
        }
      }
    }

    const companyPayload = {
      owner_user_id: user.id,
      company_name: form.company_name,
      legal_entity: form.legal_entity,
      phone: form.phone,
      address: form.address,
      tax_id: form.tax_id,
      billing_contact_name: form.billing_contact_name,
      billing_contact_email: form.billing_contact_email,
      sentry_base_url: form.sentry_base_url,
      sentry_username: form.sentry_username,
      sentry_password: form.sentry_password,
      sentry_api_key: form.sentry_api_key,
      onboarding_status: 'approved',
      is_approved: true,
      notes: [
        `IMPORT_SOURCE:${form.import_source.toUpperCase()}`,
        form.asm_notes ? `ASM_NOTES:${form.asm_notes}` : '',
      ].filter(Boolean).join('\n'),
    };

    const companyQuery = existingCompany?.id
      ? supabase.from('companies').update({ ...companyPayload, updated_at: new Date().toISOString() }).eq('id', existingCompany.id)
      : supabase.from('companies').insert(companyPayload);

    const { data: comp, error: compErr } = await companyQuery.select().maybeSingle();

    if (compErr || !comp) {
      setError(compErr?.message || 'Failed to save company');
      setSaving(false);
      return;
    }

    if (!existingCompany?.id) {
      await supabase.from('company_agreements').insert({
        company_id: comp.id,
        user_id: user.id,
        agreement_version: 'v1.0',
        agreement_text: AGREEMENT_TEXT,
      });
    }

    await supabase.from('profiles').update({ role: 'company', company_id: comp.id }).eq('id', user.id);

    setCompany(comp);
    setSaving(false);
    navigate('/', { replace: true });
  }

  function canAdvance() {
    if (step === 1 && (!form.company_name || !form.legal_entity || !form.phone || !form.address)) return false;
    if (step === 2 && (!form.billing_contact_name || !form.billing_contact_email)) return false;
    return true;
  }

  return (
    <div className="fixed inset-0 overflow-y-auto" style={{ background: '#07090d', color: '#e5e7eb' }}>
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">

          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))', border: '1px solid rgba(201,168,76,0.3)' }}>
              <span style={{ color: '#c9a84c', fontSize: 18, fontWeight: 800 }}>P</span>
            </div>
            <div>
              <p style={{ color: '#c9a84c', fontSize: 14, fontWeight: 700 }}>PENTHOUSE DISPATCH</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Company Setup</p>
            </div>
          </div>

          <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{
                      background: i < step ? '#c9a84c' : i === step ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.06)',
                      border: i === step ? '2px solid #c9a84c' : 'none',
                      color: i < step ? '#07090d' : i === step ? '#c9a84c' : 'rgba(255,255,255,0.3)',
                      fontWeight: 700,
                      fontSize: 10,
                    }}
                  >
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span className="text-xs hidden sm:block" style={{ color: i === step ? '#c9a84c' : 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className="flex-1 h-px min-w-2" style={{ background: i < step ? '#c9a84c' : 'rgba(255,255,255,0.08)' }} />}
              </React.Fragment>
            ))}
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>

            {step === 0 && (
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4" style={{ color: '#c9a84c' }} />
                  <h2 className="text-base font-700" style={{ fontWeight: 700 }}>
                    {form.import_source === 'asm' ? 'Prepare ASM Transfer' : form.import_source === 'manual' ? 'Choose Data Setup' : 'Connect SentryMS'}
                  </h2>
                </div>
                <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                  {form.import_source === 'asm'
                    ? 'Tell us you are migrating from ASM so the platform can tag your onboarding correctly and keep the data-transfer path visible.'
                    : form.import_source === 'manual'
                      ? 'You can skip imports and enter everything manually if your business is starting fresh.'
                      : 'Enter your SentryMS credentials to auto-import your company info. Skip this step if you do not use SentryMS.'}
                </p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { value: 'sentry', label: 'Sentry' },
                    { value: 'asm', label: 'ASM' },
                    { value: 'manual', label: 'Manual' },
                  ].map(option => {
                    const active = form.import_source === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setField('import_source', option.value)}
                        className="py-2 rounded-xl text-xs transition-all"
                        style={{
                          background: active ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${active ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.08)'}`,
                          color: active ? '#c9a84c' : 'rgba(255,255,255,0.45)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-3">
                  {form.import_source === 'sentry' ? (
                    <>
                      <div>
                        <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Sentry Base URL</label>
                        <input type="url" value={form.sentry_base_url} onChange={e => setField('sentry_base_url', e.target.value)} className="w-full" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Username</label>
                          <input type="text" value={form.sentry_username} onChange={e => setField('sentry_username', e.target.value)} className="w-full" placeholder="API username" autoComplete="off" />
                        </div>
                        <div>
                          <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Password</label>
                          <input type="password" value={form.sentry_password} onChange={e => setField('sentry_password', e.target.value)} className="w-full" placeholder="API password" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>API Key (Bearer)</label>
                        <input type="password" value={form.sentry_api_key} onChange={e => setField('sentry_api_key', e.target.value)} className="w-full" placeholder="Bearer token" />
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={testSentryConnection}
                          disabled={testingConn}
                          className="btn-ghost flex items-center gap-1.5 text-sm px-4 py-2"
                        >
                          {testingConn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          Test Connection
                        </button>
                        {connResult?.authenticated && (
                          <button
                            type="button"
                            onClick={importFromSentry}
                            disabled={importing}
                            className="btn-gold flex items-center gap-1.5 text-sm px-4 py-2"
                          >
                            {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            {importing ? 'Importing...' : 'Import Company Info'}
                          </button>
                        )}
                      </div>

                      {connResult && (
                        <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: connResult.authenticated ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)', border: `1px solid ${connResult.authenticated ? 'rgba(0,229,160,0.2)' : 'rgba(255,71,87,0.2)'}` }}>
                          {connResult.authenticated
                            ? <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#00e5a0' }} />
                            : <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#ff4757' }} />}
                          <span style={{ color: connResult.authenticated ? '#00e5a0' : '#ff4757' }}>
                            {connResult.authenticated ? `Connected (${connResult.latencyMs}ms)` : (connResult.error || 'Connection failed')}
                          </span>
                        </div>
                      )}

                      {importResult && (
                        <div className="p-3 rounded-lg text-sm" style={{ background: importResult.ok ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${importResult.ok ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.08)'}` }}>
                          {importResult.ok ? (
                            <>
                              <p style={{ color: '#c9a84c', fontWeight: 600, marginBottom: 4 }}>Imported {importResult.count} field{importResult.count !== 1 ? 's' : ''} from SentryMS</p>
                              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{importResult.fields.join(', ')}</p>
                            </>
                          ) : (
                            <p style={{ color: 'rgba(255,255,255,0.4)' }}>No company data found in SentryMS. You can enter details manually on the next step.</p>
                          )}
                        </div>
                      )}
                    </>
                  ) : form.import_source === 'asm' ? (
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c' }}>
                        ASM migration mode enabled. Finish signup now, then use the admin side to map your legacy export into the platform without retyping everything.
                      </div>
                      <div>
                        <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>ASM migration notes</label>
                        <textarea
                          value={form.asm_notes}
                          onChange={e => setField('asm_notes', e.target.value)}
                          rows={4}
                          className="w-full"
                          placeholder="Example: 42 drivers, 3 dispatchers, weekly CSV export available, last billing period closed in ASM..."
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
                      Manual setup selected. Continue and enter your company information directly on the next steps.
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-4 h-4" style={{ color: '#c9a84c' }} />
                  <h2 className="text-base font-700" style={{ fontWeight: 700 }}>Company Information</h2>
                </div>
                <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>Confirm or fill in your business details</p>
                <div className="space-y-3">
                  {[
                    { label: 'Company Name *', key: 'company_name', placeholder: 'Acme Transportation LLC' },
                    { label: 'Legal Entity Name *', key: 'legal_entity', placeholder: 'Legal registered name' },
                    { label: 'Business Phone *', key: 'phone', placeholder: '+1 (555) 000-0000', type: 'tel' },
                    { label: 'Business Address *', key: 'address', placeholder: '123 Main St, New York, NY 10001' },
                    { label: 'Tax ID / EIN', key: 'tax_id', placeholder: 'XX-XXXXXXX' },
                  ].map(({ label, key, placeholder, type }) => (
                    <div key={key}>
                      <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</label>
                      <input type={type || 'text'} value={form[key]} onChange={e => setField(key, e.target.value)} placeholder={placeholder} className="w-full" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-4 h-4" style={{ color: '#c9a84c' }} />
                  <h2 className="text-base font-700" style={{ fontWeight: 700 }}>Billing Contact</h2>
                </div>
                <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>Who receives invoices and billing notices?</p>
                <div className="space-y-3">
                  {[
                    { label: 'Billing Contact Name *', key: 'billing_contact_name', placeholder: 'Jane Smith' },
                    { label: 'Billing Email *', key: 'billing_contact_email', placeholder: 'billing@yourcompany.com', type: 'email' },
                  ].map(({ label, key, placeholder, type }) => (
                    <div key={key}>
                      <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</label>
                      <input type={type || 'text'} value={form[key]} onChange={e => setField(key, e.target.value)} placeholder={placeholder} className="w-full" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4" style={{ color: '#c9a84c' }} />
                  <h2 className="text-base font-700" style={{ fontWeight: 700 }}>License Agreement</h2>
                </div>
                <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Scroll to the bottom to accept and continue</p>
                <div
                  ref={agreementRef}
                  onScroll={handleScroll}
                  className="rounded-xl p-4 mb-4 text-xs overflow-y-auto"
                  style={{
                    height: 240,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.6)',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {AGREEMENT_TEXT}
                </div>
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl" style={{ background: scrolledToBottom ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${scrolledToBottom ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#c9a84c' }} />
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                    {scrolledToBottom ? 'You have read the agreement. Click "Accept & Submit" below.' : 'Please scroll to the bottom of the agreement to continue.'}
                  </p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="p-6 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)' }}>
                  <CheckCircle className="w-7 h-7" style={{ color: '#00e5a0' }} />
                </div>
                <h2 className="text-lg font-700 mb-2" style={{ fontWeight: 700 }}>Setup Complete!</h2>
                <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                  Your company account is now active. Sign in with your password and continue into the company dashboard.
                </p>
                <div className="space-y-2 text-left p-4 rounded-xl mb-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {[`Company: ${form.company_name}`, `Billing: ${form.billing_contact_email}`, 'Status: Active'].map(line => (
                    <div key={line} className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#c9a84c' }} />
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{line}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate('/', { replace: true })} className="btn-ghost w-full py-3 text-sm">
                  Continue to Dashboard
                </button>
              </div>
            )}
          </div>

          {step < 4 && (
            <div className="flex gap-3 mt-4">
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)} className="btn-ghost flex-shrink-0 px-4 py-3 flex items-center gap-1.5 text-sm">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}
              {step < 3 && (
                <button
                  onClick={() => {
                    setError('');
                    if (!canAdvance()) {
                      setError(step === 1 ? 'Please fill in all required fields.' : 'Please fill in billing contact details.');
                      return;
                    }
                    setStep(s => s + 1);
                  }}
                  className="btn-gold flex-1 py-3 text-sm flex items-center justify-center gap-2"
                >
                  {step === 0 ? 'Continue to Company Info' : 'Continue'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {step === 3 && (
                <button
                  onClick={handleFinish}
                  disabled={!scrolledToBottom || saving}
                  className="btn-gold flex-1 py-3 text-sm flex items-center justify-center gap-2"
                  style={{ opacity: (!scrolledToBottom || saving) ? 0.5 : 1 }}
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {saving ? 'Submitting...' : 'Accept & Submit Application'}
                </button>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-center" style={{ color: '#ff4757' }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
