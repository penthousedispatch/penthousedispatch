import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { Building2, CheckCircle, Clock, Eye, Users, Route, Plus } from 'lucide-react';
import DriverRouteView from '../../components/drivers/DriverRouteView';
import { toastError, toastSuccess } from '../../utils/errorHandler';
import { COMPANY_SEGMENTS, DEFAULT_COMPANY_SEGMENT, getCompanySegment, getCompanySegmentMeta, isDaycareStyleCompany, normalizeCompanySegment, upsertCompanySegmentNote } from '../../lib/companyType';

const STATUS_COLORS = {
  pending: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b' },
  info_submitted: { bg: 'rgba(14,165,233,0.1)', border: 'rgba(14,165,233,0.3)', color: '#0ea5e9' },
  agreement_signed: { bg: 'rgba(201,168,76,0.1)', border: 'rgba(201,168,76,0.3)', color: '#c9a84c' },
  approved: { bg: 'rgba(0,229,160,0.1)', border: 'rgba(0,229,160,0.3)', color: '#00e5a0' },
  rejected: { bg: 'rgba(255,71,87,0.1)', border: 'rgba(255,71,87,0.3)', color: '#ff4757' },
};

function isApprovedCompanyRecord(company) {
  return Boolean(
    company?.is_approved ||
    String(company?.onboarding_status || '').toLowerCase() === 'approved'
  );
}

export default function AdminCompanies() {
  const { setAdminPreviewCompany, isPlatformOwner } = useApp();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [routeDriver, setRouteDriver] = useState(null);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [supportsCompanySegmentField, setSupportsCompanySegmentField] = useState(true);
  const [createCompanyForm, setCreateCompanyForm] = useState({
    company_name: '',
    legal_entity: '',
    billing_contact_name: '',
    billing_contact_email: '',
    phone: '',
    address: '',
    tax_id: '',
    company_segment: DEFAULT_COMPANY_SEGMENT,
  });

  useEffect(() => { loadCompanies(); }, []);

  async function loadCompanies() {
    setLoading(true);
    let companyRows = [];

    const fullResult = await supabase
      .from('companies')
      .select('id, company_name, billing_contact_email, onboarding_status, is_suspended, is_approved, owner_user_id, created_at, legal_entity, phone, billing_contact_name, address, tax_id, baseline_fleet_size, notes, company_segment')
      .order('created_at', { ascending: false });

    if (fullResult.error && /company_segment/i.test(fullResult.error.message || '')) {
      setSupportsCompanySegmentField(false);

      const fallbackResult = await supabase
        .from('companies')
        .select('id, company_name, billing_contact_email, onboarding_status, is_suspended, is_approved, owner_user_id, created_at, legal_entity, phone, billing_contact_name, address, tax_id, baseline_fleet_size, notes')
        .order('created_at', { ascending: false });

      if (fallbackResult.error) {
        toastError(fallbackResult.error.message || 'Failed to load companies.');
        setCompanies([]);
        setPendingProfiles([]);
        setLoading(false);
        return;
      }

      companyRows = (fallbackResult.data || []).map(row => ({
        ...row,
        company_segment: DEFAULT_COMPANY_SEGMENT,
      }));
    } else if (fullResult.error) {
      toastError(fullResult.error.message || 'Failed to load companies.');
      setCompanies([]);
      setPendingProfiles([]);
      setLoading(false);
      return;
    } else {
      setSupportsCompanySegmentField(true);
      companyRows = fullResult.data || [];
    }

    const staleApprovedRows = companyRows.filter(company =>
      !company.is_approved && String(company.onboarding_status || '').toLowerCase() === 'approved'
    );

    if (staleApprovedRows.length > 0) {
      supabase
        .from('companies')
        .update({ is_approved: true, updated_at: new Date().toISOString() })
        .in('id', staleApprovedRows.map(company => company.id))
        .then(({ error }) => {
          if (error) {
            toastError(error.message || 'Failed to sync approved company flags.');
          }
        });
    }

    setCompanies(companyRows);

    const linkedUserIds = new Set(companyRows.map(row => row.owner_user_id).filter(Boolean));
    const linkedCompanyIds = new Set(companyRows.map(row => row.id).filter(Boolean));
    const linkedBillingEmails = new Set(
      companyRows
        .map(row => String(row.billing_contact_email || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const { data: rawProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, company_id, created_at')
      .eq('role', 'company')
      .order('created_at', { ascending: false });
    if (profilesError) {
      toastError(profilesError.message || 'Failed to load company profiles.');
      setPendingProfiles([]);
      setLoading(false);
      return;
    }

    const unresolvedProfiles = (rawProfiles || []).filter(profile =>
      !linkedUserIds.has(profile.id)
      && !linkedCompanyIds.has(profile.company_id)
      && !linkedBillingEmails.has(String(profile.email || '').trim().toLowerCase())
    );

    setPendingProfiles(unresolvedProfiles);
    setLoading(false);
  }

  async function loadDriversForCompany(companyId) {
    const { data } = await supabase.from('drivers').select('id, full_name, status, layer2_status').eq('company_id', companyId).eq('is_active', true);
    setDrivers(data || []);
  }

  function guessCompanyNameFromProfile(profileRow) {
    const email = String(profileRow?.email || '').trim().toLowerCase();
    const localName = String(profileRow?.full_name || '').trim();
    const domain = email.includes('@') ? email.split('@')[1] : '';
    const base = domain ? domain.split('.')[0] : '';
    const normalized = (base || localName || 'New Company')
      .replace(/[_-]+/g, ' ')
      .replace(/\b(limo|dispatch|express|transport|transportation|services?|llc|inc|corp)\b/gi, match => match.toUpperCase());

    return normalized
      .split(' ')
      .filter(Boolean)
      .map(word => /^[A-Z0-9]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  async function handleApprove(company) {
    if (!isPlatformOwner) return;
    setSaving(true);
    const normalizedBillingEmail = String(company?.billing_contact_email || '').trim().toLowerCase();
    let ownerProfileId = company?.owner_user_id || null;

    if (!ownerProfileId && normalizedBillingEmail) {
      const { data: ownerProfile, error: ownerLookupError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', normalizedBillingEmail)
        .eq('role', 'company')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ownerLookupError) {
        toastError(ownerLookupError.message || 'Failed to resolve company owner profile.');
        setSaving(false);
        return;
      }

      ownerProfileId = ownerProfile?.id || null;
    }

    const { error: companyError } = await supabase.from('companies').update({
      is_approved: true,
      onboarding_status: 'approved',
      baseline_fleet_size: drivers.length || company.baseline_fleet_size || 1,
      notes: mergeCompanyNotes(company, note),
      owner_user_id: ownerProfileId,
      updated_at: new Date().toISOString(),
    }).eq('id', company.id);
    if (companyError) {
      toastError(companyError.message || 'Failed to approve company.');
      setSaving(false);
      return;
    }

    if (ownerProfileId) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          role: 'company',
          company_id: company.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ownerProfileId);
      if (profileError) {
        toastError(profileError.message || 'Company approved, but updating the owner profile failed.');
        setSaving(false);
        return;
      }
    }
    setNote('');
    setSelected(null);
    setSaving(false);
    toastSuccess(`${company.company_name || 'Company'} approved.`);
    await loadCompanies();
  }

  async function handleApprovePendingSignup(profileRow) {
    if (!isPlatformOwner || !profileRow?.id) return;
    setSaving(true);

    const companyName = guessCompanyNameFromProfile(profileRow);
    const now = new Date().toISOString();

    const { data: createdCompany, error: companyError } = await supabase
      .from('companies')
      .insert({
        owner_user_id: profileRow.id,
        company_name: companyName,
        legal_entity: companyName,
        billing_contact_name: profileRow.full_name || companyName,
        billing_contact_email: profileRow.email || '',
        company_segment: DEFAULT_COMPANY_SEGMENT,
        onboarding_status: 'approved',
        is_approved: true,
        notes: upsertCompanySegmentNote('ADMIN_APPROVED_SIGNUP:true', DEFAULT_COMPANY_SEGMENT),
        updated_at: now,
      })
      .select()
      .maybeSingle();

    if (companyError || !createdCompany) {
      toastError(companyError?.message || 'Failed to approve pending company signup.');
      setSaving(false);
      return;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        role: 'company',
        full_name: profileRow.full_name || companyName,
        company_id: createdCompany.id,
        updated_at: now,
      })
      .eq('id', profileRow.id);

    if (profileError) {
      toastError(profileError.message || 'Company was created, but linking the signup profile failed.');
      setSaving(false);
      return;
    }

    toastSuccess(`${profileRow.full_name || profileRow.email || companyName} approved successfully.`);
    setSaving(false);
    await loadCompanies();
  }

  async function handleReject(company) {
    if (!isPlatformOwner) return;
    setSaving(true);
    const { error } = await supabase.from('companies').update({
      is_approved: false,
      onboarding_status: 'rejected',
      notes: mergeCompanyNotes(company, note),
      updated_at: new Date().toISOString(),
    }).eq('id', company.id);
    if (error) {
      toastError(error.message || 'Failed to reject company.');
      setSaving(false);
      return;
    }
    setNote('');
    setSelected(null);
    setSaving(false);
    toastSuccess(`${company.company_name || 'Company'} rejected.`);
    await loadCompanies();
  }

  async function handleSuspend(company) {
    if (!isPlatformOwner) return;
    const { error } = await supabase.from('companies').update({ is_suspended: !company.is_suspended, updated_at: new Date().toISOString() }).eq('id', company.id);
    if (error) {
      toastError(error.message || 'Failed to update company suspension.');
      return;
    }
    toastSuccess(`${company.company_name || 'Company'} ${company.is_suspended ? 'restored' : 'suspended'}.`);
    await loadCompanies();
  }

  async function handleDeleteCompany(company) {
    if (!isPlatformOwner || !company?.id) return;

    const confirmed = window.confirm(
      `Delete ${company.company_name || 'this company'} and remove its company data? This cannot be undone.`
    );

    if (!confirmed) return;

    const finalCheck = window.prompt(
      `Type DELETE to permanently remove ${company.company_name || 'this company'} and its saved company data.`
    );

    if (String(finalCheck || '').trim().toUpperCase() !== 'DELETE') {
      toastError('Company delete cancelled. Type DELETE to confirm.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc('admin_delete_company', {
      target_company_id: company.id,
    });

    if (error) {
      toastError(error.message || 'Failed to delete company.');
      setSaving(false);
      return;
    }

    if (selected?.id === company.id) {
      setSelected(null);
      setDrivers([]);
      setRouteDriver(null);
    }

    setSaving(false);
    toastSuccess(`${company.company_name || 'Company'} deleted permanently.`);
    await loadCompanies();
  }

  async function handleSaveCompanyEdits() {
    if (!isPlatformOwner || !selected?.id) return;
    if (!selected?.id) return;
    setSaving(true);
    const companyUpdate = {
      company_name: selected.company_name || '',
      legal_entity: selected.legal_entity || '',
      phone: selected.phone || '',
      billing_contact_name: selected.billing_contact_name || '',
      billing_contact_email: selected.billing_contact_email || '',
      address: selected.address || '',
      tax_id: selected.tax_id || '',
      notes: upsertCompanySegmentNote(selected.notes, selected.company_segment),
      updated_at: new Date().toISOString(),
      ...(supportsCompanySegmentField ? { company_segment: normalizeCompanySegment(selected.company_segment) } : {}),
    };
    const { error } = await supabase.from('companies').update(companyUpdate).eq('id', selected.id);
    if (error) {
      toastError(error.message || 'Failed to save company changes.');
      setSaving(false);
      return;
    }
    setSaving(false);
    toastSuccess(`${selected.company_name || 'Company'} saved.`);
    await loadCompanies();
  }

  async function handleCreateCompany() {
    if (!isPlatformOwner) return;

    const companyName = String(createCompanyForm.company_name || '').trim();
    if (!companyName) {
      toastError('Company name is required.');
      return;
    }

    setSaving(true);
    const nextSegment = normalizeCompanySegment(createCompanyForm.company_segment);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('companies')
      .insert({
        company_name: companyName,
        legal_entity: String(createCompanyForm.legal_entity || companyName).trim(),
        billing_contact_name: String(createCompanyForm.billing_contact_name || '').trim(),
        billing_contact_email: String(createCompanyForm.billing_contact_email || '').trim().toLowerCase(),
        phone: String(createCompanyForm.phone || '').trim(),
        address: String(createCompanyForm.address || '').trim(),
        tax_id: String(createCompanyForm.tax_id || '').trim(),
        onboarding_status: 'approved',
        is_approved: true,
        notes: upsertCompanySegmentNote('ADMIN_CREATED_COMPANY:true', nextSegment),
        updated_at: now,
        ...(supportsCompanySegmentField ? { company_segment: nextSegment } : {}),
      });

    if (error) {
      toastError(error.message || 'Failed to create company.');
      setSaving(false);
      return;
    }

    setShowCreateCompany(false);
    setCreateCompanyForm({
      company_name: '',
      legal_entity: '',
      billing_contact_name: '',
      billing_contact_email: '',
      phone: '',
      address: '',
      tax_id: '',
      company_segment: DEFAULT_COMPANY_SEGMENT,
    });
    setSaving(false);
    toastSuccess(`${companyName} created.`);
    await loadCompanies();
  }

  function handleOpenDashboard(company) {
    setAdminPreviewCompany(company);
    setSelected(null);
    navigate(`/admin/company-preview/${company.id}`);
  }

  function handleOpenTrips(company) {
    setAdminPreviewCompany(company);
    navigate(`/admin/company-preview/${company.id}/trips`);
  }

  function mergeCompanyNotes(company, adminNote) {
    const baseNotes = String(company?.notes || '').trim();
    const trimmedNote = String(adminNote || '').trim();
    const mergedNotes = !trimmedNote
      ? baseNotes
      : !baseNotes
        ? `ADMIN_NOTE:${trimmedNote}`
        : `${baseNotes}\nADMIN_NOTE:${trimmedNote}`;

    return upsertCompanySegmentNote(mergedNotes, company?.company_segment);
  }

  const pending = companies.filter(c => !isApprovedCompanyRecord(c) && c.onboarding_status !== 'rejected');
  const rejected = companies.filter(c => c.onboarding_status === 'rejected');
  const daycareAccounts = companies.filter(company => {
    const segment = getCompanySegment(company);
    return segment === 'daycare_provider' || segment === 'program_provider';
  });
  const otherProviderAccounts = companies.filter(company => getCompanySegment(company) === 'other_provider');

  function renderCompanyGroup(title, color, rows) {
    if (!rows.length) return null;

    return (
      <div className="mb-6">
        <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color, fontWeight: 700 }}>{title}</p>
        <div className="space-y-2">
          {rows.map(company => (
            <CompanyRow
              key={company.id}
              company={company}
              isPlatformOwner={isPlatformOwner}
              onView={() => { setSelected(company); loadDriversForCompany(company.id); }}
              onOpenDashboard={() => handleOpenDashboard(company)}
              onOpenTrips={() => handleOpenTrips(company)}
              onApprove={() => handleApprove(company)}
              onReject={() => handleReject(company)}
              onSuspend={() => handleSuspend(company)}
              onDelete={() => handleDeleteCompany(company)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6" style={{ color: '#e5e7eb' }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-700 mb-1" style={{ fontWeight: 700, color: '#c9a84c' }}>Companies</h1>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Manage company onboarding, approvals, provider grouping, and account access</p>
            </div>
            {isPlatformOwner && (
              <button
                onClick={() => setShowCreateCompany(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
                style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.28)', color: '#c9a84c', fontWeight: 600 }}
              >
                <Plus className="w-4 h-4" />
                Create Company
              </button>
            )}
          </div>
        </div>

        {!isPlatformOwner && (
          <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-sm font-600 mb-1" style={{ color: '#f59e0b', fontWeight: 600 }}>Owner Approval Required</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
              You can review subscriber companies, but approving, rejecting, suspending, or editing company data requires the platform owner admin.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Pending Approval', count: pending.length, color: '#f59e0b', icon: Clock },
            { label: 'Daycare / Program', count: daycareAccounts.length, color: '#00e5a0', icon: Users },
            { label: 'Other Providers', count: otherProviderAccounts.length, color: '#0ea5e9', icon: CheckCircle },
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

        <div className="rounded-2xl p-4 mb-6" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}>
          <p className="text-sm font-600 mb-1" style={{ color: '#7dd3fc', fontWeight: 600 }}>Provider Signup Tracks</p>
          <p className="text-xs leading-6" style={{ color: 'rgba(255,255,255,0.56)' }}>
            Transportation companies, daycare providers, program providers, and other partner organizations can all sign up under the company account model.
            This admin screen now separates those account types so provider growth and provider onboarding are easier to review.
          </p>
        </div>

        {pending.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: '#f59e0b', fontWeight: 700 }}>Pending Approval</p>
            <div className="space-y-3">
              {pending.map(company => (
                <CompanyRow
                  key={company.id}
                  company={company}
                  isPlatformOwner={isPlatformOwner}
                  onView={() => { setSelected(company); loadDriversForCompany(company.id); }}
                  onOpenDashboard={() => handleOpenDashboard(company)}
                  onOpenTrips={() => handleOpenTrips(company)}
                  onApprove={() => handleApprove(company)}
                  onReject={() => handleReject(company)}
                  onSuspend={() => handleSuspend(company)}
                  onDelete={() => handleDeleteCompany(company)}
                />
              ))}
            </div>
          </div>
        )}

        {pendingProfiles.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: '#0ea5e9', fontWeight: 700 }}>Pending Company Signups</p>
            <div className="space-y-2">
              {pendingProfiles.map(profileRow => (
                <div
                  key={profileRow.id}
                  className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: '#0d1117', border: '1px solid rgba(14,165,233,0.2)' }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>
                        {profileRow.full_name || 'Company signup'}
                      </span>
                      <span
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#0ea5e9' }}
                      >
                        Signup only
                      </span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {profileRow.email || 'No email saved'} · This account exists, but no company application row is attached yet.
                    </p>
                  </div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.38)' }}>
                    {profileRow.created_at ? new Date(profileRow.created_at).toLocaleString() : 'Just created'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprovePendingSignup(profileRow)}
                      disabled={saving || !isPlatformOwner}
                      className="px-3 py-1.5 text-xs rounded-lg"
                      style={{
                        background: 'rgba(0,229,160,0.08)',
                        border: '1px solid rgba(0,229,160,0.2)',
                        color: '#00e5a0',
                        fontWeight: 600,
                      }}
                    >
                      {saving ? 'Saving...' : 'Approve Signup'}
                    </button>
                  </div>
                </div>
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
            <>
              {renderCompanyGroup('Daycare And Program Providers', '#00e5a0', companies.filter(company => {
                const segment = getCompanySegment(company);
                return (segment === 'daycare_provider' || segment === 'program_provider') && company.onboarding_status !== 'rejected';
              }))}
              {renderCompanyGroup('Other Providers', '#0ea5e9', companies.filter(company => getCompanySegment(company) === 'other_provider' && company.onboarding_status !== 'rejected'))}
              {renderCompanyGroup('Transportation Companies', 'rgba(255,255,255,0.48)', companies.filter(company => getCompanySegment(company) === 'transport_company' && company.onboarding_status !== 'rejected'))}
              {renderCompanyGroup('Rejected Accounts', '#ff4757', rejected)}
            </>
          )}
        </div>
      </div>

      {showCreateCompany && (
        <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:flex sm:items-center sm:justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="mx-auto w-full max-w-xl rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.3)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <p className="font-700 text-sm" style={{ fontWeight: 700, color: '#c9a84c' }}>Create Company Or Provider</p>
              <button onClick={() => setShowCreateCompany(false)} className="btn-ghost w-7 h-7 flex items-center justify-center rounded-lg text-xs">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Account segment</p>
                <div className="grid grid-cols-1 gap-2">
                  {Object.values(COMPANY_SEGMENTS).map(segment => {
                    const active = createCompanyForm.company_segment === segment.id;
                    return (
                      <button
                        key={segment.id}
                        type="button"
                        onClick={() => setCreateCompanyForm(prev => ({ ...prev, company_segment: segment.id }))}
                        className="text-left rounded-xl px-3 py-3 transition-all"
                        style={{
                          background: active ? `${segment.accent}18` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${active ? `${segment.accent}50` : 'rgba(255,255,255,0.08)'}`,
                          color: active ? segment.accent : 'rgba(255,255,255,0.62)',
                        }}
                      >
                        <p className="text-sm font-600 mb-1" style={{ fontWeight: 600 }}>{segment.label}</p>
                        <p className="text-xs leading-5" style={{ color: active ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.42)' }}>{segment.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ['Company Name', 'company_name'],
                  ['Legal Entity', 'legal_entity'],
                  ['Billing Contact', 'billing_contact_name'],
                  ['Billing Email', 'billing_contact_email'],
                  ['Phone', 'phone'],
                  ['Tax ID', 'tax_id'],
                ].map(([label, key]) => (
                  <div key={key}>
                    <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
                    <input
                      type="text"
                      value={createCompanyForm[key] || ''}
                      onChange={e => setCreateCompanyForm(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full text-sm"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb' }}
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Address</p>
                  <input
                    type="text"
                    value={createCompanyForm.address || ''}
                    onChange={e => setCreateCompanyForm(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full text-sm"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb' }}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={handleCreateCompany}
                disabled={saving || !isPlatformOwner}
                className="px-4 py-2.5 rounded-xl text-sm font-600"
                style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', color: '#00e5a0', fontWeight: 600 }}
              >
                {saving ? 'Saving...' : 'Create Account'}
              </button>
              <button
                onClick={() => setShowCreateCompany(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-600"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', fontWeight: 600 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
                  ['Company Type', getCompanySegmentMeta(selected).label],
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
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Company Segment</p>
                    <select
                      value={normalizeCompanySegment(selected.company_segment)}
                      onChange={e => setSelected(prev => ({ ...prev, company_segment: e.target.value, notes: upsertCompanySegmentNote(prev?.notes, e.target.value) }))}
                      className="w-full text-sm"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb' }}
                    >
                      {Object.values(COMPANY_SEGMENTS).map(segment => (
                        <option key={segment.id} value={segment.id}>
                          {segment.label}
                        </option>
                      ))}
                    </select>
                  </div>
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
              {selected.onboarding_status !== 'rejected' && !selected.is_approved && (
                <>
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
                </>
              )}
              {isPlatformOwner && (
                <button
                  onClick={() => handleDeleteCompany(selected)}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl text-sm font-600"
                  style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757', fontWeight: 600 }}
                >
                  Delete Company
                </button>
              )}
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

function CompanyRow({ company, isPlatformOwner, onView, onOpenDashboard, onOpenTrips, onApprove, onReject, onSuspend, onDelete }) {
  const effectiveStatus = isApprovedCompanyRecord(company) ? 'approved' : company.onboarding_status;
  const st = STATUS_COLORS[effectiveStatus] || STATUS_COLORS.pending;
  const showApprovalActions = !isApprovedCompanyRecord(company) && company.onboarding_status !== 'rejected';
  const segmentMeta = getCompanySegmentMeta(company);
  const daycareStyle = isDaycareStyleCompany(company);
  return (
    <div className="p-4 rounded-xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
          <Building2 className="w-5 h-5" style={{ color: '#c9a84c' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-600 text-sm break-words" style={{ fontWeight: 600, color: '#e5e7eb' }}>{company.company_name || 'Unnamed'}</p>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: `${segmentMeta.accent}18`, color: segmentMeta.accent, border: `1px solid ${segmentMeta.accent}30` }}
            >
              {segmentMeta.shortLabel}
            </span>
            {company.is_suspended && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,71,87,0.1)', color: '#ff4757' }}>SUSPENDED</span>
            )}
          </div>
          <p className="text-xs mt-0.5 break-all" style={{ color: 'rgba(255,255,255,0.4)' }}>{company.billing_contact_email || 'No email'}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs px-2 py-1 rounded-lg" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>
          {effectiveStatus}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        <button onClick={onView} className="btn-ghost px-3 py-2 text-xs flex items-center justify-center gap-1.5 min-w-0 w-full">
          <Eye className="w-3 h-3" /> Review
        </button>
        {showApprovalActions && isPlatformOwner && (
          <>
            <button
              onClick={onReject}
              className="px-3 py-2 text-xs rounded-lg min-w-0 w-full"
              style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', color: '#ff4757' }}
            >
              Reject
            </button>
            <button
              onClick={onApprove}
              className="px-3 py-2 text-xs rounded-lg min-w-0 w-full"
              style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0' }}
            >
              Approve
            </button>
          </>
        )}
        <a
          href={`/admin/company-preview/${company.id}`}
          onClick={e => {
            e.preventDefault();
            onOpenDashboard();
          }}
          className="px-3 py-2 text-xs rounded-lg text-center min-w-0 w-full"
          style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', textDecoration: 'none' }}
        >
          {daycareStyle ? 'Open Provider Dashboard' : 'View Map'}
        </a>
        <a
          href={`/admin/company-preview/${company.id}/trips`}
          onClick={e => {
            e.preventDefault();
            onOpenTrips();
          }}
          className="px-3 py-2 text-xs rounded-lg text-center min-w-0 w-full"
          style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', color: '#0ea5e9', textDecoration: 'none' }}
        >
          View Trips
        </a>
        <button
          onClick={onSuspend}
          className="px-3 py-2 text-xs rounded-lg min-w-0 w-full"
          style={{ background: company.is_suspended ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)', border: `1px solid ${company.is_suspended ? 'rgba(0,229,160,0.2)' : 'rgba(255,71,87,0.2)'}`, color: company.is_suspended ? '#00e5a0' : '#ff4757' }}
        >
          {company.is_suspended ? 'Unsuspend' : 'Suspend'}
        </button>
        {isPlatformOwner && (
          <button
            onClick={onDelete}
            className="px-3 py-2 text-xs rounded-lg min-w-0 w-full"
            style={{ background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.28)', color: '#ff7a7a' }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
