import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Routes, Route, Link, Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import LiveDispatch from '../dispatcher/LiveDispatch';
import IncentivesPanel from '../dispatcher/IncentivesPanel';
import PayoutsTab from '../dispatcher/PayoutsTab';
import PayRatesSection from '../dispatcher/PayRatesSection';
import ModuleBoundary from '../../components/app/ModuleBoundary';
import { DEFAULT_COMPANY_SCHEDULER_PREFS, readCompanySchedulerPrefs, writeCompanySchedulerPrefs } from '../../lib/companySchedulerPrefs';
import { clearGuideAudio, getGuideAudioRecord, saveGuideAudioFile, saveGuideAudioUrl } from '../../lib/guideAudio';
import AddDriverModal from '../../components/drivers/AddDriverModal';
import CSVImportModal, { CSV_DRIVERS } from '../../components/drivers/CSVImportModal';
import { isSyntheticMarketplaceTrip } from '../../lib/sentrySyntheticTrips';
import { isBrokerNonAcceptedMarketplaceRow } from '../../lib/sentryTripInbound';
import {
  Users, Navigation, FileText, Settings, LogOut,
  DollarSign, AlertTriangle, LayoutGrid, Bot, BookOpen, Palette, CreditCard, Layers, Pencil, Trash2, Plus, ShieldCheck, Trophy,
  Upload, Link2, Headphones, RefreshCw, Send, ClipboardList, Menu, X, Clock
} from 'lucide-react';
import { handleSupabaseError, toastError, toastSuccess } from '../../utils/errorHandler';
import { toastFleetImportSummary } from '../../utils/fleetImportSummaryToast';

function CompanyDrivers({ company }) {
  const { user, profile } = useApp();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [deletingDriver, setDeletingDriver] = useState(null);
  const [onboardingDriver, setOnboardingDriver] = useState(null);
  const [savingDriver, setSavingDriver] = useState(false);
  const [savingShiftDriverId, setSavingShiftDriverId] = useState(null);
  const [shiftDrafts, setShiftDrafts] = useState({});
  const [driverTaxInfo, setDriverTaxInfo] = useState({});
  const cljFleetSeededRef = useRef(false);
  const driverAppUrl = `${window.location.origin}/driver`;

  async function syncProfileCompanyId(companyId) {
    if (!user?.id || !companyId || profile?.company_id === companyId) return;
    await supabase
      .from('profiles')
      .update({ company_id: companyId, updated_at: new Date().toISOString() })
      .eq('id', user.id);
  }

  async function loadDriverTaxInfo(driverRows) {
    const driverIds = (driverRows || []).map(driver => driver.id).filter(Boolean);
    if (driverIds.length) {
      const { data: taxRows, error: taxError } = await supabase
        .from('driver_tax_info')
        .select('driver_id, legal_name, tax_id_last4, w9_completed_at, tax_classification')
        .in('driver_id', driverIds);

      if (taxError) {
        handleSupabaseError(taxError, 'CompanyDrivers:loadTaxInfo', { silent: true });
      } else {
        setDriverTaxInfo(
          Object.fromEntries((taxRows || []).map(row => [row.driver_id, row]))
        );
      }
    } else {
      setDriverTaxInfo({});
    }
  }

  /**
   * CLJ Express canonical fleet (CSV_DRIVERS) — real TLC roster, not test-mode synthetic data.
   * Only runs when the active company is CLJExpress and the drivers table is empty (e.g. fresh org).
   */
  async function ensureCljExpressFleet(companyId) {
    const normalizedCompanyName = String(company?.company_name || '').trim().toLowerCase();
    const shouldSeedFleet =
      normalizedCompanyName.includes('cljexpress') || normalizedCompanyName.includes('clj express');

    if (!companyId || !shouldSeedFleet || cljFleetSeededRef.current) {
      return false;
    }

    cljFleetSeededRef.current = true;
    let changed = false;

    for (const driver of CSV_DRIVERS) {
      const tlcNumber = String(driver.tlc_number || '').trim();
      const fullName = `${String(driver.first_name || '').trim()} ${String(driver.last_name || '').trim()}`.trim();
      if (!tlcNumber || !fullName) continue;

      const driverPayload = {
        company_id: companyId,
        full_name: fullName,
        phone: String(driver.phone || '').trim() || '',
        tlc_number: tlcNumber,
        license_number: String(driver.license_number || '').trim() || '',
        license_state: String(driver.license_state || '').trim() || '',
        license_class: String(driver.license_class || '').trim() || '',
        gender: String(driver.gender || '').trim() || '',
        dob: String(driver.dob || '').trim() || '',
        status: 'offline',
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      const { data: existingDriver, error: lookupError } = await supabase
        .from('drivers')
        .select('id, company_id')
        .eq('tlc_number', tlcNumber)
        .maybeSingle();

      if (lookupError) {
        handleSupabaseError(lookupError, 'CompanyDrivers:seedLookup', { silent: true });
        continue;
      }

      if (existingDriver?.id) {
        const { error: updateError } = await supabase
          .from('drivers')
          .update(driverPayload)
          .eq('id', existingDriver.id);

        if (updateError) {
          handleSupabaseError(updateError, 'CompanyDrivers:seedUpdate', { silent: true });
        } else {
          changed = true;
        }
        continue;
      }

      const { error: insertError } = await supabase
        .from('drivers')
        .insert({
          ...driverPayload,
          driver_number: `CLJ-${tlcNumber}`,
        });

      if (insertError) {
        handleSupabaseError(insertError, 'CompanyDrivers:seedInsert', { silent: true });
      } else {
        changed = true;
      }
    }

    return changed;
  }

  async function loadCompanyDrivers() {
    let companyId = company?.id || profile?.company_id || null;

    if (!companyId && user?.id) {
      const normalizedEmail = String(user.email || '').trim().toLowerCase();
      const lookups = [
        supabase
          .from('companies')
          .select('id')
          .eq('owner_user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ];

      if (normalizedEmail) {
        lookups.push(
          supabase
            .from('companies')
            .select('id')
            .ilike('billing_contact_email', normalizedEmail)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        );
      }

      for (const lookup of lookups) {
        const { data: resolvedCompany } = await lookup;
        if (resolvedCompany?.id) {
          companyId = resolvedCompany.id;
          await syncProfileCompanyId(companyId);
          break;
        }
      }
    }

    if (!companyId) {
      setDrivers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('full_name');

    if (error) {
      handleSupabaseError(error, 'CompanyDrivers:load', { silent: true });
      setDrivers([]);
      setLoading(false);
      return;
    }

    let nextDrivers = data || [];
    if (nextDrivers.length === 0) {
      const seeded = await ensureCljExpressFleet(companyId);
      if (seeded) {
        const { data: refreshedDrivers, error: refreshError } = await supabase
          .from('drivers')
          .select('*')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('full_name');

        if (refreshError) {
          handleSupabaseError(refreshError, 'CompanyDrivers:loadAfterSeed', { silent: true });
        } else {
          nextDrivers = refreshedDrivers || [];
        }
      }
    }

    setDrivers(nextDrivers);
    await loadDriverTaxInfo(nextDrivers);

    setLoading(false);
  }

  async function applyImportedDrivers(payload) {
    await loadCompanyDrivers();
    toastFleetImportSummary(payload);
  }

  useEffect(() => {
    loadCompanyDrivers();
  }, [company?.id, profile?.company_id, user?.id, user?.email]);

  useEffect(() => {
    setShiftDrafts(
      Object.fromEntries(
        (drivers || []).map(driver => [driver.id, driver.shift_hours || '7am-5pm'])
      )
    );
  }, [drivers]);

  const statusColor = { online: '#00e5a0', offline: 'rgba(255,255,255,0.3)', on_trip: '#c9a84c', break: '#f59e0b' };
  const filteredDrivers = drivers.filter(driver => {
    if (!search) return true;
    const query = search.toLowerCase();
    return [driver.full_name, driver.phone, driver.tlc_number, driver.driver_number]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query));
  });

  const stats = React.useMemo(() => {
    const total = drivers.length;
    const online = drivers.filter(driver => ['online', 'on_trip'].includes(driver.status)).length;
    const missingPhone = drivers.filter(driver => !String(driver.phone || '').trim()).length;
    const approved = drivers.filter(driver => ['approved', 'ready'].includes(String(driver.layer2_status || '').toLowerCase())).length;
    return { total, online, missingPhone, approved };
  }, [drivers]);

  function exportDrivers() {
    const rows = [
      ['#', 'Name', 'Phone', 'TLC', 'Status'],
      ...filteredDrivers.map((driver, index) => [
        String(index + 1).padStart(3, '0'),
        driver.full_name || '',
        driver.phone || '',
        driver.tlc_number || '',
        driver.status || 'offline',
      ]),
    ];

    const csv = rows
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${(company?.company_name || 'company').replace(/\s+/g, '-').toLowerCase()}-drivers.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function sendDriverApp(driver) {
    const driverName = driver.full_name || 'Driver';
    const inviteUrl = `${driverAppUrl}?onboarding=1`;
    const loginId = String(driver.login_username || driver.email || driver.tlc_number || '').trim();
    const loginPassword = String(driver.login_password || driver.tlc_number || '').trim();
    const hasCredentials = Boolean(loginId && loginPassword);
    const body = [
      `Hi ${driverName},`,
      '',
      'Use this link to open the Penthouse Dispatch driver app and complete onboarding:',
      inviteUrl,
      '',
      ...(hasCredentials
        ? [
            'Your driver login:',
            `- Username: ${loginId}`,
            `- Password: ${loginPassword}`,
            '',
          ]
        : [
            'Your company has not finished assigning login credentials yet.',
            'Contact dispatch to receive your driver username and password before signing in.',
            '',
          ]),
      'After login, onboarding slides and setup steps will open automatically.',
      'Please complete onboarding before starting your shift.',
    ].join('\n');

    if (driver.email) {
      window.location.href = `mailto:${encodeURIComponent(driver.email)}?subject=${encodeURIComponent('Your Penthouse Dispatch Driver App Access')}&body=${encodeURIComponent(body)}`;
      toastSuccess(hasCredentials ? 'Driver onboarding invite prepared in email.' : 'Invite sent, but driver credentials are missing.');
      return;
    }

    const cleanPhone = String(driver.phone || '').replace(/[^\d+]/g, '');
    if (cleanPhone) {
      window.location.href = `sms:${cleanPhone}?&body=${encodeURIComponent(body)}`;
      toastSuccess(hasCredentials ? 'Driver onboarding invite prepared in text message.' : 'Invite sent, but driver credentials are missing.');
      return;
    }

    navigator.clipboard?.writeText(body).catch(() => {});
    toastSuccess(hasCredentials
      ? 'Driver onboarding invite copied. No email or phone was saved for this driver.'
      : 'Invite copied, but driver credentials are missing.');
  }

  function onboardingSummary(driver) {
    const tax = driverTaxInfo[driver.id];
    return [
      {
        label: 'Profile basics',
        done: Boolean(driver.full_name && (driver.phone || driver.email) && driver.tlc_number),
        detail: 'Name, TLC number, and at least one contact method',
      },
      {
        label: 'Layer 1 app onboarding',
        done: Number(driver.layer1_pct || 0) >= 100,
        detail: `Completion ${driver.layer1_pct || 0}%`,
      },
      {
        label: 'Company approval',
        done: String(driver.layer2_status || '').toLowerCase() === 'approved_internal',
        detail: `Status: ${driver.layer2_status || 'not_submitted'}`,
      },
      {
        label: 'Dispatch / Sentry ready',
        done: String(driver.layer3_status || '').toLowerCase() === 'ready',
        detail: `Status: ${driver.layer3_status || 'not_ready'}`,
      },
      {
        label: 'Tax / identity last 4',
        done: Boolean(tax?.tax_id_last4),
        detail: tax?.tax_id_last4 ? `SSN last 4 saved: ${tax.tax_id_last4}` : 'Last 4 not saved yet',
      },
    ];
  }

  async function handleSaveDriverEdits(e) {
    e.preventDefault();
    if (!editingDriver?.id) return;
    setSavingDriver(true);

    const driverPayload = {
      full_name: editingDriver.full_name || '',
      phone: editingDriver.phone || '',
      email: editingDriver.email || '',
      tlc_number: editingDriver.tlc_number || '',
      driver_number: editingDriver.driver_number || '',
      status: editingDriver.status || 'offline',
      shift_hours: editingDriver.shift_hours || '',
      home_address: editingDriver.home_address || '',
      updated_at: new Date().toISOString(),
    };

    const { error: driverError } = await supabase
      .from('drivers')
      .update(driverPayload)
      .eq('id', editingDriver.id);

    if (driverError) {
      handleSupabaseError(driverError, 'CompanyDrivers:saveDriver', { fallback: 'Failed to update driver.' });
      setSavingDriver(false);
      return;
    }

    const taxPayload = {
      driver_id: editingDriver.id,
      legal_name: editingDriver.legal_name || editingDriver.full_name || '',
      tax_id_last4: String(editingDriver.tax_id_last4 || '').replace(/\D/g, '').slice(0, 4),
      tax_classification: editingDriver.tax_classification || '1099',
      w9_completed_at: editingDriver.tax_id_last4 ? (editingDriver.w9_completed_at || new Date().toISOString()) : null,
    };

    const existingTaxRow = driverTaxInfo[editingDriver.id];
    const taxQuery = supabase.from('driver_tax_info');
    const taxResult = existingTaxRow
      ? await taxQuery.update(taxPayload).eq('driver_id', editingDriver.id)
      : await taxQuery.insert(taxPayload);

    if (taxResult.error) {
      handleSupabaseError(taxResult.error, 'CompanyDrivers:saveDriverTax', { fallback: 'Driver saved, but SSN last 4 could not be updated.' });
    }

    toastSuccess('Driver updated.');
    setEditingDriver(null);
    setSavingDriver(false);
    await loadCompanyDrivers();
  }

  async function handleDeleteDriver() {
    if (!deletingDriver?.id) return;
    setSavingDriver(true);

    const { error } = await supabase
      .from('drivers')
      .update({ is_active: false, status: 'offline', updated_at: new Date().toISOString() })
      .eq('id', deletingDriver.id);

    if (error) {
      handleSupabaseError(error, 'CompanyDrivers:deleteDriver', { fallback: 'Failed to delete driver.' });
      setSavingDriver(false);
      return;
    }

    toastSuccess('Driver deleted.');
    setDeletingDriver(null);
    setSavingDriver(false);
    await loadCompanyDrivers();
  }

  async function handleSaveDriverShift(driver) {
    if (!driver?.id) return;
    const nextShift = String(shiftDrafts[driver.id] || '7am-5pm').trim() || '7am-5pm';
    setSavingShiftDriverId(driver.id);

    const { error } = await supabase
      .from('drivers')
      .update({
        shift_hours: nextShift,
        updated_at: new Date().toISOString(),
      })
      .eq('id', driver.id);

    if (error) {
      handleSupabaseError(error, 'CompanyDrivers:saveShiftHours', { fallback: 'Failed to save driver shift.' });
      setSavingShiftDriverId(null);
      return;
    }

    setDrivers(prev =>
      prev.map(row => (row.id === driver.id ? { ...row, shift_hours: nextShift } : row))
    );
    toastSuccess(`${driver.full_name || 'Driver'} shift saved.`);
    setSavingShiftDriverId(null);
  }

  return (
    <div className="p-4 sm:p-6 pb-48 max-w-5xl mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-700 mb-1" style={{ fontWeight: 700 }}>Drivers</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Company fleet visibility for dispatch, onboarding, and availability.
        </p>
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.16)' }}>
        <p className="text-sm font-600" style={{ color: '#dff4ff', fontWeight: 600 }}>Driver app and onboarding</p>
        <p className="text-xs mt-1.5" style={{ color: 'rgba(223,244,255,0.72)', lineHeight: 1.6 }}>
          Use <strong>Send App</strong> to text or email the driver app link. Use <strong>Onboarding</strong> to review app setup, company approval, dispatch readiness, and whether the identity last 4 was saved for payroll or Sentry readiness.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total drivers', value: stats.total, hint: 'Fleet size', tone: '#e5e7eb' },
          { label: 'Online now', value: stats.online, hint: stats.online === 0 ? 'All offline' : 'Ready for trips', tone: '#00e5a0' },
          { label: 'Missing phone', value: stats.missingPhone, hint: stats.missingPhone ? 'Needs profile cleanup' : 'All set', tone: stats.missingPhone ? '#ff7a7a' : '#e5e7eb' },
          { label: 'Onboarding', value: stats.approved ? 'Approved' : 'Pending', hint: `${stats.approved}/${stats.total || 0} ready`, tone: stats.approved ? '#8bd450' : '#c9a84c' },
        ].map(card => (
          <div key={card.label} className="rounded-2xl p-4" style={{ background: '#161819', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>{card.label}</p>
            <p className="text-3xl font-700 leading-none" style={{ fontWeight: 700, color: card.tone }}>{card.value}</p>
            <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-4 mb-4" style={{ background: '#161819', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Driver Work Shifts</p>
            <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
              Set each driver&apos;s saved work hours here. Penthouse AI uses these hours when <strong>Pre-Schedule From Driver Work Shifts</strong> is enabled in AI Settings.
            </p>
          </div>
        </div>
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {filteredDrivers.length === 0 ? (
            <div className="rounded-xl px-4 py-5 text-sm" style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)' }}>
              Add or import drivers first, then set their work shifts here.
            </div>
          ) : (
            filteredDrivers.map(driver => (
              <div
                key={`shift-${driver.id}`}
                className="grid grid-cols-1 md:grid-cols-[minmax(0,1.25fr)_minmax(170px,240px)_auto] gap-3 rounded-xl px-4 py-3 items-start md:items-center"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-600 truncate" style={{ color: '#e5e7eb', fontWeight: 600 }}>
                    {driver.full_name || 'Unnamed Driver'}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {driver.tlc_number || driver.driver_number || 'No TLC / driver #'}
                  </p>
                </div>
                <input
                  type="text"
                  value={shiftDrafts[driver.id] || ''}
                  onChange={e => setShiftDrafts(prev => ({ ...prev, [driver.id]: e.target.value }))}
                  placeholder="7am-5pm"
                  className="w-full min-w-0"
                />
                <div className="flex justify-stretch md:justify-end">
                  <button
                    type="button"
                    onClick={() => handleSaveDriverShift(driver)}
                    disabled={savingShiftDriverId === driver.id}
                    className="px-4 py-2 rounded-xl text-xs font-700 w-full md:w-auto"
                    style={{
                      background: '#c9a84c',
                      border: '1px solid rgba(201,168,76,0.45)',
                      color: '#07090d',
                      fontWeight: 700,
                      boxShadow: '0 10px 24px rgba(201,168,76,0.18)',
                    }}
                  >
                    {savingShiftDriverId === driver.id ? 'Saving...' : 'Save Shift'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: '#161819', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Drivers</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter"
              style={{ minWidth: 160 }}
            />
            <button
              onClick={() => setShowCSVImport(true)}
              className="px-4 py-2 rounded-xl text-sm font-600"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', fontWeight: 600 }}
            >
              Import
            </button>
            <button
              onClick={() => setShowAddDriver(true)}
              className="px-4 py-2 rounded-xl text-sm font-600 flex items-center gap-2"
              style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600 }}
            >
              <Plus className="w-4 h-4" />
              Add Driver
            </button>
            <button
              onClick={exportDrivers}
              className="px-4 py-2 rounded-xl text-sm font-600"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', fontWeight: 600 }}
            >
              Export
            </button>
          </div>
        </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
        </div>
      ) : filteredDrivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 rounded-xl gap-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Users className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No drivers yet</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="hidden md:grid grid-cols-[72px_minmax(220px,1.4fr)_1fr_120px_130px_120px_160px_180px] gap-3 px-4 py-3 text-xs" style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.42)' }}>
            <span>#</span>
            <span>Name</span>
            <span>Phone</span>
            <span>TLC</span>
            <span>Work Shift</span>
            <span>Status</span>
            <span>Onboarding</span>
            <span>Actions</span>
          </div>
          <div style={{ background: '#0d1117' }}>
            {filteredDrivers.map((driver, index) => (
              <React.Fragment key={driver.id}>
                <div
                  className="hidden md:grid grid-cols-[72px_minmax(220px,1.4fr)_1fr_120px_130px_120px_160px_180px] gap-3 px-4 py-3 items-center"
                  style={{ borderTop: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{String(index + 1).padStart(3, '0')}</span>
                  <div className="flex items-center gap-3 min-w-0">
                    {driver.photo_data ? (
                      <img src={driver.photo_data} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-700 flex-shrink-0" style={{ background: 'rgba(190,215,255,0.14)', color: '#cfe1ff', fontWeight: 700 }}>
                        {(driver.full_name || '?').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-600 truncate" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driver.full_name || 'Unnamed Driver'}</p>
                      <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.38)' }}>{driver.driver_number || 'No driver #'}</p>
                    </div>
                  </div>
                  <span className="text-sm" style={{ color: '#d4d4d4' }}>{driver.phone || 'Missing'}</span>
                  <span className="text-sm" style={{ color: '#d4d4d4' }}>{driver.tlc_number || 'Missing'}</span>
                  <span className="text-sm" style={{ color: '#d4d4d4' }}>{driver.shift_hours || '7am-5pm'}</span>
                  <div>
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs"
                      style={{
                        background: driver.status === 'offline' ? 'rgba(255,255,255,0.12)' : `${statusColor[driver.status] || '#c9a84c'}18`,
                        color: driver.status === 'offline' ? '#f3f4f6' : (statusColor[driver.status] || '#c9a84c'),
                      }}
                    >
                      {driver.status || 'offline'}
                    </span>
                  </div>
                  <div>
                    <button
                      onClick={() => setOnboardingDriver(driver)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs"
                      style={{
                        background: Number(driver.layer1_pct || 0) >= 100 && String(driver.layer2_status || '').toLowerCase() === 'approved_internal'
                          ? 'rgba(0,229,160,0.1)'
                          : 'rgba(201,168,76,0.1)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: Number(driver.layer1_pct || 0) >= 100 && String(driver.layer2_status || '').toLowerCase() === 'approved_internal'
                          ? '#00e5a0'
                          : '#c9a84c',
                      }}
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Onboarding
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => sendDriverApp(driver)}
                      className="h-9 px-3 rounded-lg flex items-center justify-center gap-2"
                      style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.18)', color: '#c9a84c', fontSize: 12, fontWeight: 600 }}
                      title="Send driver app"
                    >
                      <Send className="w-4 h-4" />
                      <span className="hidden xl:inline">Send App</span>
                    </button>
                    <button
                      onClick={() => setEditingDriver({
                        ...driver,
                        legal_name: driverTaxInfo[driver.id]?.legal_name || driver.full_name || '',
                        tax_id_last4: driverTaxInfo[driver.id]?.tax_id_last4 || '',
                        tax_classification: driverTaxInfo[driver.id]?.tax_classification || '1099',
                        w9_completed_at: driverTaxInfo[driver.id]?.w9_completed_at || null,
                      })}
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
                      title="Edit driver"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingDriver(driver)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', color: '#ff7a7a' }}
                      title="Delete driver"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div
                  className="md:hidden px-4 py-4 space-y-3"
                  style={{ borderTop: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {driver.photo_data ? (
                      <img src={driver.photo_data} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-700 flex-shrink-0" style={{ background: 'rgba(190,215,255,0.14)', color: '#cfe1ff', fontWeight: 700 }}>
                        {(driver.full_name || '?').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-600 truncate" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driver.full_name || 'Unnamed Driver'}</p>
                      <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.38)' }}>{driver.driver_number || 'No driver #'}</p>
                    </div>
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs"
                      style={{
                        background: driver.status === 'offline' ? 'rgba(255,255,255,0.12)' : `${statusColor[driver.status] || '#c9a84c'}18`,
                        color: driver.status === 'offline' ? '#f3f4f6' : (statusColor[driver.status] || '#c9a84c'),
                      }}
                    >
                      {driver.status || 'offline'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p style={{ color: 'rgba(255,255,255,0.35)' }}>Phone</p>
                      <p style={{ color: '#d4d4d4' }}>{driver.phone || 'Missing'}</p>
                    </div>
                    <div>
                      <p style={{ color: 'rgba(255,255,255,0.35)' }}>TLC</p>
                      <p style={{ color: '#d4d4d4' }}>{driver.tlc_number || 'Missing'}</p>
                    </div>
                    <div className="col-span-2">
                      <p style={{ color: 'rgba(255,255,255,0.35)' }}>Work Shift</p>
                      <p style={{ color: '#d4d4d4' }}>{driver.shift_hours || '7am-5pm'}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setOnboardingDriver(driver)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                    style={{
                      background: Number(driver.layer1_pct || 0) >= 100 && String(driver.layer2_status || '').toLowerCase() === 'approved_internal'
                        ? 'rgba(0,229,160,0.1)'
                        : 'rgba(201,168,76,0.1)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: Number(driver.layer1_pct || 0) >= 100 && String(driver.layer2_status || '').toLowerCase() === 'approved_internal'
                        ? '#00e5a0'
                        : '#c9a84c',
                    }}
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Onboarding
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => sendDriverApp(driver)}
                      className="h-10 px-3 rounded-lg flex items-center justify-center gap-2"
                      style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.18)', color: '#c9a84c', fontSize: 12, fontWeight: 600 }}
                      title="Send driver app"
                    >
                      <Send className="w-4 h-4" />
                      Send
                    </button>
                    <button
                      onClick={() => setEditingDriver({
                        ...driver,
                        legal_name: driverTaxInfo[driver.id]?.legal_name || driver.full_name || '',
                        tax_id_last4: driverTaxInfo[driver.id]?.tax_id_last4 || '',
                        tax_classification: driverTaxInfo[driver.id]?.tax_classification || '1099',
                        w9_completed_at: driverTaxInfo[driver.id]?.w9_completed_at || null,
                      })}
                      className="h-10 px-3 rounded-lg flex items-center justify-center gap-2"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', fontSize: 12, fontWeight: 600 }}
                      title="Edit driver"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingDriver(driver)}
                      className="h-10 px-3 rounded-lg flex items-center justify-center gap-2"
                      style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', color: '#ff7a7a', fontSize: 12, fontWeight: 600 }}
                      title="Delete driver"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
        <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.18)' }}>
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 flex-shrink-0" style={{ color: '#0ea5e9' }} />
            <div>
              <p className="text-sm font-600" style={{ color: '#dff4ff', fontWeight: 600 }}>Secure driver onboarding</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(223,244,255,0.72)', lineHeight: 1.6 }}>
                Full Social Security numbers should be collected through an external identity or payroll verification provider. This dashboard stores only the last 4 in the secure tax record so companies never handle the full SSN inside the app.
              </p>
            </div>
          </div>
        </div>
      </div>

      {showAddDriver && (
        <AddDriverModal
          companyIdOverride={company?.id || null}
          onClose={() => {
            setShowAddDriver(false);
            loadCompanyDrivers();
          }}
        />
      )}

      {showCSVImport && (
        <CSVImportModal
          companyIdOverride={company?.id || null}
          onImported={(payload) => {
            applyImportedDrivers(payload);
          }}
          onClose={() => {
            setShowCSVImport(false);
            loadCompanyDrivers();
          }}
        />
      )}

      {editingDriver && (
        <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:flex sm:items-center sm:justify-center" style={{ background: 'rgba(0,0,0,0.72)' }}>
          <div className="mx-auto w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <p className="font-700 text-sm" style={{ fontWeight: 700 }}>Edit Driver</p>
              <button onClick={() => setEditingDriver(null)} className="btn-ghost w-7 h-7 flex items-center justify-center rounded-lg text-xs">✕</button>
            </div>
            <form onSubmit={handleSaveDriverEdits} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ['Full Name', 'full_name'],
                  ['Phone', 'phone'],
                  ['Email', 'email'],
                  ['TLC Number', 'tlc_number'],
                  ['Driver Number', 'driver_number'],
                  ['Work Shift Hours', 'shift_hours'],
                ].map(([label, key]) => (
                  <div key={key}>
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</label>
                    <input
                      type="text"
                      value={editingDriver[key] || ''}
                      onChange={e => setEditingDriver(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Home Address</label>
                <input
                  type="text"
                  value={editingDriver.home_address || ''}
                  onChange={e => setEditingDriver(prev => ({ ...prev, home_address: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Status</label>
                  <select
                    value={editingDriver.status || 'offline'}
                    onChange={e => setEditingDriver(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full"
                  >
                    <option value="offline">Offline</option>
                    <option value="online">Online</option>
                    <option value="on_trip">On Trip</option>
                    <option value="break">Break</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Tax Classification</label>
                  <select
                    value={editingDriver.tax_classification || '1099'}
                    onChange={e => setEditingDriver(prev => ({ ...prev, tax_classification: e.target.value }))}
                    className="w-full"
                  >
                    <option value="1099">1099</option>
                    <option value="w2">W-2</option>
                  </select>
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.18)' }}>
                <p className="text-sm font-600 mb-2" style={{ color: '#dff4ff', fontWeight: 600 }}>Identity verification</p>
                <p className="text-xs mb-3" style={{ color: 'rgba(223,244,255,0.72)', lineHeight: 1.6 }}>
                  Use Stripe Identity, Persona, Alloy, or another authentication provider for full SSN and document collection. Only the last 4 is stored here for payroll and compliance display.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Legal Name</label>
                    <input
                      type="text"
                      value={editingDriver.legal_name || ''}
                      onChange={e => setEditingDriver(prev => ({ ...prev, legal_name: e.target.value }))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>SSN Last 4</label>
                    <input
                      type="text"
                      value={editingDriver.tax_id_last4 || ''}
                      onChange={e => setEditingDriver(prev => ({ ...prev, tax_id_last4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                      placeholder="1234"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditingDriver(null)} className="flex-1 btn-ghost py-2.5">Cancel</button>
                <button type="submit" disabled={savingDriver} className="flex-1 btn-gold py-2.5">
                  {savingDriver ? 'Saving...' : 'Save Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingDriver && (
        <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:flex sm:items-center sm:justify-center" style={{ background: 'rgba(0,0,0,0.72)' }}>
          <div className="mx-auto w-full max-w-md rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,71,87,0.18)' }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <p className="font-700 text-sm" style={{ fontWeight: 700, color: '#ff7a7a' }}>Delete Driver</p>
            </div>
            <div className="p-5">
              <p className="text-sm" style={{ color: '#e5e7eb' }}>
                Remove <strong>{deletingDriver.full_name}</strong> from your company?
              </p>
              <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                This keeps past records intact but removes the driver from your active fleet.
              </p>
              <div className="flex gap-3 mt-5">
                <button type="button" onClick={() => setDeletingDriver(null)} className="flex-1 btn-ghost py-2.5">Cancel</button>
                <button type="button" onClick={handleDeleteDriver} disabled={savingDriver} className="flex-1 py-2.5 rounded-xl"
                  style={{ background: 'rgba(255,71,87,0.14)', border: '1px solid rgba(255,71,87,0.25)', color: '#ff7a7a', fontWeight: 600 }}>
                  {savingDriver ? 'Deleting...' : 'Delete Driver'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {onboardingDriver && (
        <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:flex sm:items-center sm:justify-center" style={{ background: 'rgba(0,0,0,0.72)' }}>
          <div className="mx-auto w-full max-w-2xl rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <div>
                <p className="font-700 text-sm" style={{ fontWeight: 700 }}>Driver Onboarding Status</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>{onboardingDriver.full_name}</p>
              </div>
              <button onClick={() => setOnboardingDriver(null)} className="btn-ghost w-7 h-7 flex items-center justify-center rounded-lg text-xs">✕</button>
            </div>
            <div className="p-5 space-y-3">
              {onboardingSummary(onboardingDriver).map(item => (
                <div key={item.label} className="rounded-xl p-4 flex items-start justify-between gap-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <p className="text-sm font-600" style={{ fontWeight: 600 }}>{item.label}</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>{item.detail}</p>
                  </div>
                  <span
                    className="px-3 py-1 rounded-full text-xs"
                    style={{
                      background: item.done ? 'rgba(0,229,160,0.1)' : 'rgba(201,168,76,0.1)',
                      color: item.done ? '#00e5a0' : '#c9a84c',
                    }}
                  >
                    {item.done ? 'Complete' : 'Needs action'}
                  </span>
                </div>
              ))}
              <div className="rounded-xl p-4" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.16)' }}>
                <p className="text-sm font-600" style={{ color: '#dff4ff', fontWeight: 600 }}>What the driver receives</p>
                <p className="text-xs mt-2" style={{ color: 'rgba(223,244,255,0.72)', lineHeight: 1.6 }}>
                  Sending the driver app opens the same driver route with onboarding slides, guide audio, and the company-required profile setup. Full Social Security collection should stay with your external verification provider; this app stores only the last 4.
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => sendDriverApp(onboardingDriver)}
                  className="flex-1 px-4 py-2.5 rounded-xl"
                  style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600 }}
                >
                  Send Driver App
                </button>
                <button
                  type="button"
                  onClick={() => setOnboardingDriver(null)}
                  className="flex-1 btn-ghost py-2.5"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
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

    (async () => {
      setLoading(true);
      const { data: driverRows, error: driverError } = await supabase
        .from('drivers')
        .select('id')
        .eq('company_id', company.id);

      if (driverError) {
        handleSupabaseError(driverError, 'CompanyTrips:loadDrivers', { silent: true });
        setAssignments([]);
        setLoading(false);
        return;
      }

      const driverIds = (driverRows || []).map(row => row.id).filter(Boolean);
      let tripQuery = supabase
        .from('trip_assignments')
        .select('*, drivers(full_name, is_active)')
        .order('assigned_at', { ascending: false })
        .limit(100);

      if (driverIds.length) {
        tripQuery = tripQuery.or(`company_id.eq.${company.id},driver_id.in.(${driverIds.join(',')})`);
      } else {
        tripQuery = tripQuery.eq('company_id', company.id);
      }

      const { data, error } = await tripQuery;
      if (error) handleSupabaseError(error, 'CompanyTrips:load', { silent: true });
      setAssignments(data || []);
      setLoading(false);
    })();
  }, [company?.id]);

  const statusColor = {
    pending: '#c9a84c',
    accepted: '#0ea5e9',
    arrived: '#0ea5e9',
    picked_up: '#0ea5e9',
    in_progress: '#0ea5e9',
    on_trip: '#0ea5e9',
    completed: '#00e5a0',
    rejected: '#ff4757',
  };
  const activeStatuses = new Set(['accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip']);
  const activeAssignments = assignments.filter(a => activeStatuses.has(String(a.status || '').toLowerCase()));
  const historyAssignments = assignments.filter(a => !activeStatuses.has(String(a.status || '').toLowerCase()));

  function formatTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function destinationTimeLabel(assignment) {
    if (assignment.actual_dropoff_time || assignment.completed_at) {
      return {
        label: 'Reached destination',
        value: formatTime(assignment.actual_dropoff_time || assignment.completed_at),
      };
    }
    return {
      label: 'ETA destination',
      value: formatTime(assignment.do_time),
    };
  }

  return (
    <div className="p-6 pb-48 max-w-4xl mx-auto">
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
        <div className="space-y-4">
          <div className="rounded-xl p-3" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.16)' }}>
            <p className="text-xs font-700 uppercase tracking-wider mb-2" style={{ color: '#0ea5e9', fontWeight: 700 }}>
              Active Trips ({activeAssignments.length})
            </p>
            {activeAssignments.length === 0 ? (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>No drivers currently on an active trip.</p>
            ) : (
              <div className="space-y-2">
                {activeAssignments.map(a => {
                  const dest = destinationTimeLabel(a);
                  return (
                    <div key={`active-${a.id}`} className="flex items-center gap-4 p-3 rounded-lg" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-600 truncate" style={{ color: '#e5e7eb', fontWeight: 600 }}>{a.drivers?.full_name || a.driver_name || 'Driver'}</p>
                          {a.drivers && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                              style={{
                                background: a.drivers.is_active === false ? 'rgba(255,71,87,0.12)' : 'rgba(0,229,160,0.12)',
                                color: a.drivers.is_active === false ? '#ff4757' : '#00e5a0',
                                fontWeight: 600,
                              }}
                            >
                              {a.drivers.is_active === false ? 'Inactive' : 'Active'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.55)' }}>{a.pu_address || 'Unknown pickup'} → {a.do_address || 'Unknown dropoff'}</p>
                        <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: '#0ea5e9' }}>
                          <Clock className="w-3 h-3" />
                          {dest.label}: {dest.value}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${statusColor[a.status] || '#0ea5e9'}15`, color: statusColor[a.status] || '#0ea5e9' }}>
                        {a.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>
              Trip History
            </p>
            {historyAssignments.map(a => {
              const dest = destinationTimeLabel(a);
              return (
                <div key={a.id} className="flex items-center gap-4 p-4 rounded-xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-xs font-600 truncate" style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
                        {a.drivers?.full_name || a.driver_name || 'Driver'}
                      </p>
                      {a.drivers && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                          style={{
                            background: a.drivers.is_active === false ? 'rgba(255,71,87,0.12)' : 'rgba(0,229,160,0.12)',
                            color: a.drivers.is_active === false ? '#ff4757' : '#00e5a0',
                            fontWeight: 600,
                          }}
                        >
                          {a.drivers.is_active === false ? 'Inactive' : 'Active'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-500 truncate" style={{ color: '#e5e7eb' }}>{a.pu_address || 'Unknown pickup'}</p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{a.do_address || 'Unknown dropoff'}</p>
                    <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      <Clock className="w-3 h-3" />
                      {dest.label}: {dest.value}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-700" style={{ fontWeight: 700, color: '#c9a84c' }}>${parseFloat(a.delivery_price || 0).toFixed(2)}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${statusColor[a.status] || '#c9a84c'}15`, color: statusColor[a.status] || '#c9a84c' }}>
                      {a.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
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
    <div className="p-6 pb-48 max-w-4xl mx-auto">
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
  const { refreshTripsFromSentry } = useApp();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function loadMarketplaceTrips() {
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

    return (data || []).filter(
      trip => !isSyntheticMarketplaceTrip(trip) && !isBrokerNonAcceptedMarketplaceRow(trip)
    );
  }

  useEffect(() => {
    let mounted = true;

    async function initialLoad() {
      setLoading(true);
      const data = await loadMarketplaceTrips();
      if (mounted) {
        setTrips(data);
        setLoading(false);
      }
    }

    initialLoad();
    return () => {
      mounted = false;
    };
  }, [company?.id]);

  async function handleRefreshMarketplace() {
    setRefreshing(true);
    const result = await refreshTripsFromSentry();
    const data = await loadMarketplaceTrips();
    setTrips(data);
    setRefreshing(false);

    if (result?.error) {
      handleSupabaseError({ message: result.error }, 'CompanyMarketplace:refresh', { fallback: 'Failed to refresh trips from Sentry.' });
      return;
    }

    toastSuccess(`Marketplace refreshed${result?.count ? ` — ${result.count} trips synced` : ''}.`);
  }

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
    <div className="p-6 pb-48 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-700 mb-1" style={{ fontWeight: 700 }}>Marketplace Trips</h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Review provider-imported trips assigned to your company before or after dispatching them.
          </p>
        </div>
        <button
          onClick={handleRefreshMarketplace}
          disabled={refreshing}
          className="px-4 py-2 rounded-xl text-sm font-600"
          style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600, opacity: refreshing ? 0.7 : 1 }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh From Sentry'}
        </button>
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
          <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 13 }}>
            {search.trim() ? 'No trips match your search filter.' : 'No marketplace trips available right now.'}
          </p>
          {search.trim() && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
            >
              Clear Search
            </button>
          )}
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
                  <span>Dropoff: {trip.do_time || 'TBD'}</span>
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

const PROGRAM_TYPE_OPTIONS = [
  { value: 'daycare', label: 'Daycare' },
  { value: 'school', label: 'School' },
  { value: 'after_school', label: 'After-School' },
  { value: 'special_program', label: 'Special Program' },
  { value: 'medical', label: 'Medical Program' },
];

const PROGRAM_DAY_OPTIONS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function createEmptyProgramForm() {
  return {
    program_name: '',
    program_type: 'daycare',
    status: 'active',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    service_days: [],
    pickup_window: '',
    requires_guardian_release: false,
    wheelchair_support: false,
    monitor_required: false,
    notes: '',
  };
}

function createEmptyChildForm(programId = '') {
  return {
    program_id: programId,
    child_name: '',
    status: 'active',
    guardian_name: '',
    guardian_phone: '',
    pickup_address: '',
    dropoff_address: '',
    pickup_days: [],
    mobility_notes: '',
    notes: '',
  };
}

function CompanyPrograms({ company }) {
  const [programs, setPrograms] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [editingProgramId, setEditingProgramId] = useState(null);
  const [editingChildId, setEditingChildId] = useState(null);
  const [savingProgram, setSavingProgram] = useState(false);
  const [savingChild, setSavingChild] = useState(false);
  const [deletingProgramId, setDeletingProgramId] = useState(null);
  const [deletingChildId, setDeletingChildId] = useState(null);
  const [programForm, setProgramForm] = useState(createEmptyProgramForm);
  const [childForm, setChildForm] = useState(createEmptyChildForm());

  async function loadProgramsAndChildren() {
    if (!company?.id) {
      setPrograms([]);
      setChildren([]);
      setSelectedProgramId('');
      setLoading(false);
      return;
    }

    setLoading(true);

    const [programsResult, childrenResult] = await Promise.all([
      supabase
        .from('company_programs')
        .select('*')
        .eq('company_id', company.id)
        .order('program_name'),
      supabase
        .from('program_children')
        .select('*')
        .eq('company_id', company.id)
        .order('child_name'),
    ]);

    if (programsResult.error) {
      handleSupabaseError(programsResult.error, 'CompanyPrograms:loadPrograms', { silent: true, fallback: 'Failed to load programs.' });
    }

    if (childrenResult.error) {
      handleSupabaseError(childrenResult.error, 'CompanyPrograms:loadChildren', { silent: true, fallback: 'Failed to load program roster.' });
    }

    const nextPrograms = programsResult.data || [];
    const nextChildren = childrenResult.data || [];
    setPrograms(nextPrograms);
    setChildren(nextChildren);

    setSelectedProgramId(currentId => {
      if (currentId && nextPrograms.some(program => program.id === currentId)) {
        return currentId;
      }
      return nextPrograms[0]?.id || '';
    });

    setLoading(false);
  }

  useEffect(() => {
    loadProgramsAndChildren();
  }, [company?.id]);

  const filteredPrograms = programs.filter(program => {
    if (!search) return true;
    const query = search.toLowerCase();
    return [
      program.program_name,
      program.program_type,
      program.contact_name,
      program.contact_email,
      program.address,
      program.notes,
    ]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query));
  });

  const selectedProgram =
    filteredPrograms.find(program => program.id === selectedProgramId) ||
    programs.find(program => program.id === selectedProgramId) ||
    filteredPrograms[0] ||
    programs[0] ||
    null;

  const childCountsByProgram = children.reduce((acc, child) => {
    acc[child.program_id] = (acc[child.program_id] || 0) + 1;
    return acc;
  }, {});

  const childrenForSelectedProgram = selectedProgram
    ? children.filter(child => child.program_id === selectedProgram.id)
    : [];

  const activePrograms = programs.filter(program => program.status === 'active').length;
  const activeChildren = children.filter(child => child.status === 'active').length;

  useEffect(() => {
    if (!selectedProgramId && programs[0]?.id) {
      setSelectedProgramId(programs[0].id);
    }
  }, [selectedProgramId, programs]);

  useEffect(() => {
    if (!editingChildId) {
      setChildForm(current => ({
        ...current,
        program_id: selectedProgram?.id || '',
      }));
    }
  }, [selectedProgram?.id, editingChildId]);

  function toggleArrayValue(values, nextValue) {
    const set = new Set(values || []);
    if (set.has(nextValue)) {
      set.delete(nextValue);
    } else {
      set.add(nextValue);
    }
    return Array.from(set);
  }

  function resetProgramForm(nextProgramId = null) {
    setEditingProgramId(null);
    setProgramForm(createEmptyProgramForm());
    if (nextProgramId) {
      setSelectedProgramId(nextProgramId);
    }
  }

  function resetChildForm(programId = selectedProgram?.id || '') {
    setEditingChildId(null);
    setChildForm(createEmptyChildForm(programId));
  }

  async function handleProgramSubmit(event) {
    event.preventDefault();
    if (!company?.id || !String(programForm.program_name || '').trim()) return;

    setSavingProgram(true);
    const payload = {
      company_id: company.id,
      program_name: String(programForm.program_name || '').trim(),
      program_type: programForm.program_type || 'daycare',
      status: programForm.status || 'active',
      contact_name: String(programForm.contact_name || '').trim(),
      contact_email: String(programForm.contact_email || '').trim(),
      contact_phone: String(programForm.contact_phone || '').trim(),
      address: String(programForm.address || '').trim(),
      service_days: programForm.service_days || [],
      pickup_window: String(programForm.pickup_window || '').trim(),
      requires_guardian_release: Boolean(programForm.requires_guardian_release),
      wheelchair_support: Boolean(programForm.wheelchair_support),
      monitor_required: Boolean(programForm.monitor_required),
      notes: String(programForm.notes || '').trim(),
      updated_at: new Date().toISOString(),
    };

    let result;
    if (editingProgramId) {
      result = await supabase
        .from('company_programs')
        .update(payload)
        .eq('id', editingProgramId)
        .select('*')
        .single();
    } else {
      result = await supabase
        .from('company_programs')
        .insert(payload)
        .select('*')
        .single();
    }

    setSavingProgram(false);

    if (handleSupabaseError(result.error, 'CompanyPrograms:saveProgram', { fallback: 'Failed to save program.' })) {
      return;
    }

    toastSuccess(editingProgramId ? 'Program updated.' : 'Program created.');
    await loadProgramsAndChildren();
    resetProgramForm(result.data?.id || null);
  }

  async function handleDeleteProgram(program) {
    if (!program?.id) return;
    const confirmed = window.confirm(`Delete ${program.program_name}? This also removes its child roster.`);
    if (!confirmed) return;

    setDeletingProgramId(program.id);
    const { error } = await supabase
      .from('company_programs')
      .delete()
      .eq('id', program.id);
    setDeletingProgramId(null);

    if (handleSupabaseError(error, 'CompanyPrograms:deleteProgram', { fallback: 'Failed to delete program.' })) {
      return;
    }

    toastSuccess('Program deleted.');
    await loadProgramsAndChildren();
    resetProgramForm();
    resetChildForm();
  }

  async function handleChildSubmit(event) {
    event.preventDefault();
    const targetProgramId = childForm.program_id || selectedProgram?.id || '';
    if (!company?.id || !targetProgramId || !String(childForm.child_name || '').trim()) return;

    setSavingChild(true);
    const payload = {
      company_id: company.id,
      program_id: targetProgramId,
      child_name: String(childForm.child_name || '').trim(),
      status: childForm.status || 'active',
      guardian_name: String(childForm.guardian_name || '').trim(),
      guardian_phone: String(childForm.guardian_phone || '').trim(),
      pickup_address: String(childForm.pickup_address || '').trim(),
      dropoff_address: String(childForm.dropoff_address || '').trim(),
      pickup_days: childForm.pickup_days || [],
      mobility_notes: String(childForm.mobility_notes || '').trim(),
      notes: String(childForm.notes || '').trim(),
      updated_at: new Date().toISOString(),
    };

    let result;
    if (editingChildId) {
      result = await supabase
        .from('program_children')
        .update(payload)
        .eq('id', editingChildId)
        .select('*')
        .single();
    } else {
      result = await supabase
        .from('program_children')
        .insert(payload)
        .select('*')
        .single();
    }

    setSavingChild(false);

    if (handleSupabaseError(result.error, 'CompanyPrograms:saveChild', { fallback: 'Failed to save child roster entry.' })) {
      return;
    }

    toastSuccess(editingChildId ? 'Roster entry updated.' : 'Child added to roster.');
    await loadProgramsAndChildren();
    setSelectedProgramId(targetProgramId);
    resetChildForm(targetProgramId);
  }

  async function handleDeleteChild(child) {
    if (!child?.id) return;
    const confirmed = window.confirm(`Remove ${child.child_name} from this roster?`);
    if (!confirmed) return;

    setDeletingChildId(child.id);
    const { error } = await supabase
      .from('program_children')
      .delete()
      .eq('id', child.id);
    setDeletingChildId(null);

    if (handleSupabaseError(error, 'CompanyPrograms:deleteChild', { fallback: 'Failed to remove roster entry.' })) {
      return;
    }

    toastSuccess('Roster entry removed.');
    await loadProgramsAndChildren();
    resetChildForm(selectedProgram?.id || '');
  }

  function startProgramEdit(program) {
    setEditingProgramId(program.id);
    setSelectedProgramId(program.id);
    setProgramForm({
      program_name: program.program_name || '',
      program_type: program.program_type || 'daycare',
      status: program.status || 'active',
      contact_name: program.contact_name || '',
      contact_email: program.contact_email || '',
      contact_phone: program.contact_phone || '',
      address: program.address || '',
      service_days: program.service_days || [],
      pickup_window: program.pickup_window || '',
      requires_guardian_release: Boolean(program.requires_guardian_release),
      wheelchair_support: Boolean(program.wheelchair_support),
      monitor_required: Boolean(program.monitor_required),
      notes: program.notes || '',
    });
  }

  function startChildEdit(child) {
    setEditingChildId(child.id);
    setSelectedProgramId(child.program_id);
    setChildForm({
      program_id: child.program_id || '',
      child_name: child.child_name || '',
      status: child.status || 'active',
      guardian_name: child.guardian_name || '',
      guardian_phone: child.guardian_phone || '',
      pickup_address: child.pickup_address || '',
      dropoff_address: child.dropoff_address || '',
      pickup_days: child.pickup_days || [],
      mobility_notes: child.mobility_notes || '',
      notes: child.notes || '',
    });
  }

  if (!company?.id) {
    return (
      <div className="p-6">
        <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.48)' }}>
            Programs will appear here once this account is connected to a company profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-48 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-700 mb-1" style={{ fontWeight: 700 }}>Programs</h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Track daycare, school, and program partners plus the children your dispatch team moves for them.
          </p>
        </div>
        <button
          onClick={loadProgramsAndChildren}
          className="px-4 py-2 rounded-xl text-sm font-600 flex items-center gap-2"
          style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600 }}
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: 'Programs', value: programs.length, hint: `${activePrograms} active`, color: '#c9a84c' },
          { label: 'Children On Roster', value: children.length, hint: `${activeChildren} active`, color: '#00e5a0' },
          { label: 'Selected Program', value: selectedProgram ? childCountsByProgram[selectedProgram.id] || 0 : 0, hint: selectedProgram ? 'children assigned' : 'choose a program', color: '#0ea5e9' },
        ].map(card => (
          <div key={card.label} className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,0.42)' }}>{card.label}</p>
            <p className="text-2xl font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{card.value}</p>
            <p className="text-xs mt-2" style={{ color: card.color }}>{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5 items-start">
        <div className="space-y-5">
          <div className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <p className="text-sm font-600" style={{ fontWeight: 600 }}>Program Directory</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
                  Keep one record per daycare, school, or program you dispatch for.
                </p>
              </div>
              <input
                type="text"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search programs"
                className="w-full sm:w-72"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
              </div>
            ) : filteredPrograms.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                <ClipboardList className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.22)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {search.trim()
                    ? 'No programs match your current search.'
                    : 'No programs yet. Create your first daycare or program account on the right.'}
                </p>
                {search.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="mt-3 px-3 py-2 rounded-lg text-xs"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
                  >
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPrograms.map(program => {
                  const isSelected = selectedProgram?.id === program.id;
                  return (
                    <div
                      key={program.id}
                      onClick={() => setSelectedProgramId(program.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedProgramId(program.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="w-full rounded-xl p-4 text-left transition-all"
                      style={{
                        background: isSelected ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isSelected ? 'rgba(201,168,76,0.22)' : 'rgba(255,255,255,0.07)'}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-600 truncate" style={{ fontWeight: 600 }}>{program.program_name}</p>
                            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(14,165,233,0.12)', color: '#7dd3fc' }}>
                              {String(program.program_type || 'daycare').replace('_', ' ')}
                            </span>
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full"
                              style={{
                                background: `${program.status === 'active' ? '#00e5a0' : '#f59e0b'}15`,
                                color: program.status === 'active' ? '#00e5a0' : '#f59e0b',
                              }}
                            >
                              {program.status || 'active'}
                            </span>
                          </div>
                          <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.42)' }}>
                            {program.contact_name || 'No contact'}{program.contact_phone ? ` • ${program.contact_phone}` : ''}{program.contact_email ? ` • ${program.contact_email}` : ''}
                          </p>
                          <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            {program.address || 'No pickup location saved'}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{childCountsByProgram[program.id] || 0}</p>
                          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>children</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            startProgramEdit(program);
                          }}
                          className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={deletingProgramId === program.id}
                          onClick={event => {
                            event.stopPropagation();
                            handleDeleteProgram(program);
                          }}
                          className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5"
                          style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.14)', color: '#ff6b7a', opacity: deletingProgramId === program.id ? 0.7 : 1 }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {deletingProgramId === program.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
              <div>
                <p className="text-sm font-600" style={{ fontWeight: 600 }}>Child Roster</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
                  {selectedProgram ? `Children assigned to ${selectedProgram.program_name}.` : 'Choose a program to manage its roster.'}
                </p>
              </div>
              {selectedProgram && (
                <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(201,168,76,0.1)', color: '#c9a84c', border: '1px solid rgba(201,168,76,0.2)' }}>
                  {childrenForSelectedProgram.length} on roster
                </span>
              )}
            </div>

            {!selectedProgram ? (
              <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                <Users className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>Select a program first, then build its child roster.</p>
              </div>
            ) : childrenForSelectedProgram.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                <Users className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>No children added yet for this program.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {childrenForSelectedProgram.map(child => (
                  <div key={child.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-600" style={{ fontWeight: 600 }}>{child.child_name}</p>
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full"
                            style={{
                              background: `${child.status === 'active' ? '#00e5a0' : '#f59e0b'}15`,
                              color: child.status === 'active' ? '#00e5a0' : '#f59e0b',
                            }}
                          >
                            {child.status || 'active'}
                          </span>
                        </div>
                        <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.42)' }}>
                          Guardian: {child.guardian_name || 'Not set'}{child.guardian_phone ? ` • ${child.guardian_phone}` : ''}
                        </p>
                        <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          Pickup: {child.pickup_address || 'Not set'}
                        </p>
                        <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          Dropoff: {child.dropoff_address || 'Not set'}
                        </p>
                        {!!child.pickup_days?.length && (
                          <p className="text-xs mt-2" style={{ color: '#7dd3fc' }}>
                            {child.pickup_days.join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => startChildEdit(child)}
                          className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={deletingChildId === child.id}
                          onClick={() => handleDeleteChild(child)}
                          className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5"
                          style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.14)', color: '#ff6b7a', opacity: deletingChildId === child.id ? 0.7 : 1 }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {deletingChildId === child.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <form onSubmit={handleProgramSubmit} className="rounded-xl p-4 space-y-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-600" style={{ fontWeight: 600 }}>{editingProgramId ? 'Edit Program' : 'Add Program'}</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
                  Save operating rules your dispatchers need before they start scheduling.
                </p>
              </div>
              {editingProgramId && (
                <button
                  type="button"
                  onClick={() => resetProgramForm(selectedProgram?.id || null)}
                  className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Program name</label>
                <input
                  type="text"
                  value={programForm.program_name}
                  onChange={event => setProgramForm(form => ({ ...form, program_name: event.target.value }))}
                  placeholder="Bright Start Daycare"
                  className="w-full"
                  required
                />
              </div>
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Program type</label>
                <select
                  value={programForm.program_type}
                  onChange={event => setProgramForm(form => ({ ...form, program_type: event.target.value }))}
                  className="w-full"
                >
                  {PROGRAM_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Status</label>
                <select
                  value={programForm.status}
                  onChange={event => setProgramForm(form => ({ ...form, status: event.target.value }))}
                  className="w-full"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Contact name</label>
                <input
                  type="text"
                  value={programForm.contact_name}
                  onChange={event => setProgramForm(form => ({ ...form, contact_name: event.target.value }))}
                  placeholder="Program coordinator"
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Contact phone</label>
                <input
                  type="text"
                  value={programForm.contact_phone}
                  onChange={event => setProgramForm(form => ({ ...form, contact_phone: event.target.value }))}
                  placeholder="(555) 555-5555"
                  className="w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Contact email</label>
                <input
                  type="email"
                  value={programForm.contact_email}
                  onChange={event => setProgramForm(form => ({ ...form, contact_email: event.target.value }))}
                  placeholder="dispatch@program.com"
                  className="w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Program address</label>
                <input
                  type="text"
                  value={programForm.address}
                  onChange={event => setProgramForm(form => ({ ...form, address: event.target.value }))}
                  placeholder="Pickup or campus address"
                  className="w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Pickup window</label>
                <input
                  type="text"
                  value={programForm.pickup_window}
                  onChange={event => setProgramForm(form => ({ ...form, pickup_window: event.target.value }))}
                  placeholder="Mon-Fri 2:30pm-4:30pm"
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Service days</label>
              <div className="flex flex-wrap gap-2">
                {PROGRAM_DAY_OPTIONS.map(day => {
                  const checked = programForm.service_days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setProgramForm(form => ({ ...form, service_days: toggleArrayValue(form.service_days, day) }))}
                      className="px-3 py-2 rounded-lg text-xs transition-all"
                      style={{
                        background: checked ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${checked ? 'rgba(201,168,76,0.24)' : 'rgba(255,255,255,0.08)'}`,
                        color: checked ? '#c9a84c' : 'rgba(255,255,255,0.62)',
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                ['requires_guardian_release', 'Guardian release'],
                ['wheelchair_support', 'Wheelchair support'],
                ['monitor_required', 'Monitor required'],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-xl px-3 py-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(programForm[key])}
                    onChange={event => setProgramForm(form => ({ ...form, [key]: event.target.checked }))}
                  />
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>{label}</span>
                </label>
              ))}
            </div>

            <div>
              <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Dispatcher notes</label>
              <textarea
                value={programForm.notes}
                onChange={event => setProgramForm(form => ({ ...form, notes: event.target.value }))}
                placeholder="Gate code, release rules, arrival routine, billing reminders..."
                className="w-full min-h-[100px]"
              />
            </div>

            <button
              type="submit"
              disabled={savingProgram}
              className="w-full px-4 py-3 rounded-xl text-sm font-600 flex items-center justify-center gap-2"
              style={{ background: '#c9a84c', color: '#07090d', fontWeight: 700, opacity: savingProgram ? 0.75 : 1 }}
            >
              <Plus className="w-4 h-4" />
              {savingProgram ? 'Saving program...' : (editingProgramId ? 'Update Program' : 'Create Program')}
            </button>
          </form>

          <form onSubmit={handleChildSubmit} className="rounded-xl p-4 space-y-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-600" style={{ fontWeight: 600 }}>{editingChildId ? 'Edit Child' : 'Add Child To Roster'}</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
                  Store the rider details your dispatch team needs before trip intake.
                </p>
              </div>
              {editingChildId && (
                <button
                  type="button"
                  onClick={() => resetChildForm(selectedProgram?.id || '')}
                  className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
                >
                  Cancel
                </button>
              )}
            </div>

            <div>
              <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Program</label>
              <select
                value={childForm.program_id}
                onChange={event => {
                  setSelectedProgramId(event.target.value);
                  setChildForm(form => ({ ...form, program_id: event.target.value }));
                }}
                className="w-full"
                required
              >
                <option value="">Select program...</option>
                {programs.map(program => (
                  <option key={program.id} value={program.id}>{program.program_name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Child name</label>
                <input
                  type="text"
                  value={childForm.child_name}
                  onChange={event => setChildForm(form => ({ ...form, child_name: event.target.value }))}
                  placeholder="Child full name"
                  className="w-full"
                  required
                />
              </div>
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Status</label>
                <select
                  value={childForm.status}
                  onChange={event => setChildForm(form => ({ ...form, status: event.target.value }))}
                  className="w-full"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="waitlist">Waitlist</option>
                </select>
              </div>
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Guardian name</label>
                <input
                  type="text"
                  value={childForm.guardian_name}
                  onChange={event => setChildForm(form => ({ ...form, guardian_name: event.target.value }))}
                  placeholder="Guardian or release contact"
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Guardian phone</label>
                <input
                  type="text"
                  value={childForm.guardian_phone}
                  onChange={event => setChildForm(form => ({ ...form, guardian_phone: event.target.value }))}
                  placeholder="(555) 555-5555"
                  className="w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Pickup address</label>
                <input
                  type="text"
                  value={childForm.pickup_address}
                  onChange={event => setChildForm(form => ({ ...form, pickup_address: event.target.value }))}
                  placeholder="Home or program pickup address"
                  className="w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Dropoff address</label>
                <input
                  type="text"
                  value={childForm.dropoff_address}
                  onChange={event => setChildForm(form => ({ ...form, dropoff_address: event.target.value }))}
                  placeholder="Home or destination address"
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Pickup days</label>
              <div className="flex flex-wrap gap-2">
                {PROGRAM_DAY_OPTIONS.map(day => {
                  const checked = childForm.pickup_days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setChildForm(form => ({ ...form, pickup_days: toggleArrayValue(form.pickup_days, day) }))}
                      className="px-3 py-2 rounded-lg text-xs transition-all"
                      style={{
                        background: checked ? 'rgba(14,165,233,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${checked ? 'rgba(14,165,233,0.22)' : 'rgba(255,255,255,0.08)'}`,
                        color: checked ? '#7dd3fc' : 'rgba(255,255,255,0.62)',
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Mobility / ride notes</label>
              <textarea
                value={childForm.mobility_notes}
                onChange={event => setChildForm(form => ({ ...form, mobility_notes: event.target.value }))}
                placeholder="Booster, wheelchair, aide, behavioral notes, safe handoff instructions..."
                className="w-full min-h-[88px]"
              />
            </div>

            <div>
              <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.45)' }}>Internal notes</label>
              <textarea
                value={childForm.notes}
                onChange={event => setChildForm(form => ({ ...form, notes: event.target.value }))}
                placeholder="Anything dispatch needs to know before scheduling."
                className="w-full min-h-[88px]"
              />
            </div>

            <button
              type="submit"
              disabled={savingChild || !programs.length}
              className="w-full px-4 py-3 rounded-xl text-sm font-600 flex items-center justify-center gap-2"
              style={{ background: '#00e5a0', color: '#03120d', fontWeight: 700, opacity: savingChild || !programs.length ? 0.75 : 1 }}
            >
              <Plus className="w-4 h-4" />
              {savingChild ? 'Saving roster...' : (editingChildId ? 'Update Child' : 'Add Child')}
            </button>
            {!programs.length && (
              <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Create a program first, then add children to the roster.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function CompanyDriverPay({ company }) {
  return (
    <div className="pb-48">
      <div className="max-w-6xl mx-auto px-5 py-5 space-y-4">
        <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.12)' }}>
          <div className="flex items-start gap-3">
            <DollarSign className="w-5 h-5 mt-0.5" style={{ color: '#c9a84c' }} />
            <div>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Driver pay rates</p>
              <p className="text-sm mt-1 leading-6" style={{ color: 'rgba(255,255,255,0.48)' }}>
                Update hourly or per-trip pay for every driver in your company fleet from one place. This is the company-wide pay screen you were using before.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <PayRatesSection companyIdOverride={company?.id || null} />
        </div>
        <div className="rounded-xl p-5" style={{ background: '#0d1117', border: '1px solid rgba(0,229,160,0.12)' }}>
          <div className="flex items-start gap-3">
            <CreditCard className="w-5 h-5 mt-0.5" style={{ color: '#00e5a0' }} />
            <div>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Driver payouts</p>
              <p className="text-sm mt-1 leading-6" style={{ color: 'rgba(255,255,255,0.48)' }}>
                Companies can create and send driver payouts here. Direct-deposit payouts use the existing secure Stripe ACH flow once drivers connect their bank inside the driver app.
              </p>
              <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Your company bank label and last 4 can be stored in Settings. Full external bank linking should be completed through a secure provider like Plaid or Stripe Financial Connections rather than typed into the app directly.
              </p>
            </div>
          </div>
        </div>
        <PayoutsTab embedded />
      </div>
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
    const normalizedCompanyName = String(form.company_name || '').trim();
    if (normalizedCompanyName) {
      const { data: nameConflict, error: nameConflictError } = await supabase
        .from('companies')
        .select('id, company_name')
        .ilike('company_name', normalizedCompanyName)
        .neq('id', company.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (nameConflictError) {
        handleSupabaseError(nameConflictError, 'CompanySettings:companyNameCheck', { fallback: 'Failed to validate company name.' });
        setSaving(false);
        return;
      }

      if (nameConflict?.id) {
        toastError(`${nameConflict.company_name || 'That company name'} is already in use.`);
        setSaving(false);
        return;
      }
    }
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
    <div className="p-6 pb-48 max-w-2xl mx-auto">
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
          <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>Secure bank setup</p>
            <p className="text-xs mt-2 leading-6" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Driver payouts already use the secure Stripe ACH payout flow in the new <strong>Driver Pay</strong> tab. For your company settlement account, keep using an external secure provider such as Plaid or Stripe Financial Connections for full bank linking. This app stores only the destination label and last 4 so full banking credentials are never handled here.
            </p>
          </div>
        </div>
        <div
          className="sticky bottom-4 z-10 pt-3"
          style={{
            background: 'linear-gradient(180deg, rgba(7,9,13,0), rgba(7,9,13,0.92) 22%, #07090d 100%)',
          }}
        >
          <div className="rounded-2xl p-3" style={{ background: 'rgba(13,17,23,0.96)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button type="submit" disabled={saving} className="btn-gold w-full px-5 py-2.5 text-sm">
              {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
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
        traffic_weight: schedulerPrefs.traffic_weight,
        zone_weight: schedulerPrefs.zone_weight,
        traffic_buffer_pct: schedulerPrefs.traffic_buffer_pct,
        shared_rides_enabled: schedulerPrefs.shared_rides_enabled,
        preschedule_from_work_shifts: schedulerPrefs.preschedule_from_work_shifts,
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
          traffic_buffer_pct: schedulerPrefs.traffic_buffer_pct,
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
    {
      key: 'traffic_weight',
      label: 'Traffic Awareness Priority',
      description: 'Higher values push the scheduler to avoid assignments that waste too much drive time in traffic.',
    },
  ];

  return (
    <div className="p-6 pb-48 max-w-3xl mx-auto space-y-4">
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
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <p className="text-xs font-600" style={{ fontWeight: 600 }}>Traffic Buffer</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
                Add extra time to pickups and dropoffs so the AI fills the whole shift more safely.
              </p>
            </div>
            <span className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>
              {schedulerPrefs.traffic_buffer_pct}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={60}
            step={5}
            value={schedulerPrefs.traffic_buffer_pct}
            onChange={e => setSchedulerPrefs(prev => ({ ...prev, traffic_buffer_pct: parseInt(e.target.value, 10) || 0 }))}
            className="w-full"
            style={{ accentColor: '#c9a84c' }}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-sm font-600" style={{ fontWeight: 600 }}>Pre-Schedule From Driver Work Shifts</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
              Build the day in advance using each driver&apos;s saved work shift. Drivers can set their shift, and company admins can edit it from the Drivers tab.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSchedulerPrefs(prev => ({ ...prev, preschedule_from_work_shifts: !prev.preschedule_from_work_shifts }))}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: schedulerPrefs.preschedule_from_work_shifts ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${schedulerPrefs.preschedule_from_work_shifts ? 'rgba(0,229,160,0.24)' : 'rgba(255,255,255,0.08)'}`,
              color: schedulerPrefs.preschedule_from_work_shifts ? '#00e5a0' : 'rgba(255,255,255,0.55)',
              fontWeight: 600,
            }}
          >
            {schedulerPrefs.preschedule_from_work_shifts ? 'Enabled' : 'Disabled'}
          </button>
        </div>
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
      <div
        className="sticky bottom-4 z-10 pt-3"
        style={{
          background: 'linear-gradient(180deg, rgba(7,9,13,0), rgba(7,9,13,0.92) 22%, #07090d 100%)',
        }}
      >
        <div className="rounded-2xl p-3" style={{ background: 'rgba(13,17,23,0.96)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-gold w-full px-5 py-2.5 text-sm">
            {saving ? 'Saving...' : 'Save AI Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanyGuides() {
  const GUIDE_AUDIO_ITEMS = [
    { key: 'driver_onboarding', title: 'Driver Onboarding Audio', desc: 'Audio guide for first-time driver onboarding steps.' },
    { key: 'driver_guide', title: 'Driver Guide Audio', desc: 'Full driver app instructions for shift, trip, and dispatch behavior.' },
    { key: 'rider_guide', title: 'Rider Guide Audio', desc: 'Optional rider tracking narration for pickup, wait, and arrival instructions.' },
    { key: 'company_guide', title: 'Company Guide Audio', desc: 'Optional narrated overview for company dashboard training.' },
  ];
  const guides = [
    {
      title: 'Dispatch Guide',
      copy: 'Use Company Dashboard to watch your live fleet map, review trip assignments, and keep drivers moving in real time. Admin preview can open your company map or trip view directly, while company users can refresh marketplace trips manually and dispatch from the same live board.',
    },
    {
      title: 'Drivers Guide',
      copy: 'The Drivers tab shows only your company drivers. Add, import, edit, export, send the app link, and remove drivers there, then keep their photo, phone, TLC, pay rate, and status up to date before sending them into the field.',
    },
    {
      title: 'Onboarding Review Guide',
      copy: 'When a driver completes onboarding, the company gets an alert for review. Use the driver roster and onboarding summary to confirm app onboarding, company profile details, and the secure last-4/verification workflow before the driver starts taking live work.',
    },
    {
      title: 'Driver Pay Guide',
      copy: 'Driver Pay lets your company manage hourly or per-mile/per-trip rates, review payout status, and send secure ACH payouts. Keep full company bank linking in an external secure provider such as Plaid or Stripe Financial Connections, while this app stores only the display label and last 4.',
    },
    {
      title: 'Guide Audio Guide',
      copy: 'Use the Guide Audio section above to upload onboarding and guide audio files or paste hosted audio links. Uploaded audio now overrides the robotic fallback voice in driver onboarding, driver guide, rider tracking, and company training whenever an audio file is present.',
    },
    {
      title: 'Marketplace Guide',
      copy: 'Marketplace shows imported provider trips for your company. Use the manual refresh button there to pull trips from Sentry, inspect incoming work, and move trips into dispatch. Rider tracking links are generated as soon as a driver accepts the trip, and riders can copy or share that live link.',
    },
    {
      title: 'Parent Guide',
      copy: 'Parents should enroll their child even before rides are needed so dispatch is ready later for appointments, programs, sports, and other one-off trips. They should also keep pickup details current, understand subscription billing, claim signup or referral incentives, and use the rider tracking link once a trip goes live. The full written guide lives in project/docs/parent-platform-guide.md.',
    },
    {
      title: 'Daycare Provider Guide',
      copy: 'Daycare and program providers should sign up as company admins on the platform first, then get all parents enrolled early so children stay dispatch-ready for current and future rides like appointments, programs, and sports. They also need to keep the roster accurate, explain subscriptions and incentive rules clearly, and send exact ride changes to dispatch early. The full written guide lives in project/docs/daycare-provider-guide.md.',
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
      copy: 'Settings is where your company can update branding, payout information, payout destination labels, billing contact details, and white-label preferences. Save company contact information there so invoices, notifications, and driver communications reach the right inbox.',
    },
    {
      title: 'AI Controls Guide',
      copy: 'AI Settings lets your company control route planning, auto-assign, driver motivation nudges, and scheduling priorities like price, proximity, preferred zones, and shared rides without exposing platform-wide AI providers. When the platform kill switch or All Off is active, the green AI routing badge turns off so your company can see that routing is paused.',
    },
  ];
  const [audioRecords, setAudioRecords] = useState(() =>
    Object.fromEntries(GUIDE_AUDIO_ITEMS.map(item => [item.key, getGuideAudioRecord(item.key)]))
  );
  const [audioUrls, setAudioUrls] = useState({});
  const [audioMessage, setAudioMessage] = useState('');
  const fileRefs = useRef({});

  function refreshAudioRecords(message = '') {
    setAudioRecords(Object.fromEntries(GUIDE_AUDIO_ITEMS.map(item => [item.key, getGuideAudioRecord(item.key)])));
    setAudioMessage(message);
  }

  async function handleAudioFile(key, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await saveGuideAudioFile(key, file);
      refreshAudioRecords('Guide audio uploaded.');
    } catch (error) {
      setAudioMessage(error?.message || 'Audio upload failed.');
    } finally {
      if (fileRefs.current[key]) {
        fileRefs.current[key].value = '';
      }
    }
  }

  function handleSaveUrl(key) {
    const url = String(audioUrls[key] || '').trim();
    if (!url) {
      setAudioMessage('Paste an audio URL first.');
      return;
    }
    saveGuideAudioUrl(key, url, url);
    refreshAudioRecords('Guide audio link saved.');
  }

  function handleClearAudio(key) {
    clearGuideAudio(key);
    setAudioUrls(prev => ({ ...prev, [key]: '' }));
    refreshAudioRecords('Guide audio removed.');
  }

  return (
    <div className="p-6 pb-48 max-w-4xl mx-auto">
      <h2 className="text-lg font-700 mb-4" style={{ fontWeight: 700 }}>Dashboard Guides</h2>
      <div className="rounded-xl p-4 mb-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="text-sm font-600 flex items-center gap-2" style={{ fontWeight: 600 }}>
              <Headphones className="w-4 h-4" style={{ color: '#c9a84c' }} />
              Guide Audio
            </p>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.48)' }}>
              Upload or paste audio links here so the guide and onboarding can play them directly under Guides.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refreshAudioRecords('Guide audio refreshed.')}
            className="px-3 py-2 rounded-xl text-sm flex items-center gap-2"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        {audioMessage && (
          <p className="text-xs mb-3" style={{ color: '#c9a84c' }}>{audioMessage}</p>
        )}
        <div className="space-y-3">
          {GUIDE_AUDIO_ITEMS.map(item => {
            const record = audioRecords[item.key];
            return (
              <div key={item.key} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div>
                    <p className="text-sm font-600" style={{ fontWeight: 600 }}>{item.title}</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>{item.desc}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: record ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.06)', color: record ? '#00e5a0' : 'rgba(255,255,255,0.45)' }}>
                    {record ? (record.type === 'upload' ? 'Uploaded' : 'Linked') : 'No audio'}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <input
                    ref={el => { fileRefs.current[item.key] = el; }}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={event => handleAudioFile(item.key, event)}
                  />
                  <button
                    type="button"
                    onClick={() => fileRefs.current[item.key]?.click()}
                    className="px-3 py-2 rounded-xl text-sm flex items-center gap-2"
                    style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c' }}
                  >
                    <Upload className="w-4 h-4" />
                    Upload Audio
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClearAudio(item.key)}
                    className="px-3 py-2 rounded-xl text-sm"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
                  >
                    Clear
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <input
                      type="text"
                      value={audioUrls[item.key] || ''}
                      onChange={e => setAudioUrls(prev => ({ ...prev, [item.key]: e.target.value }))}
                      placeholder="Or paste a hosted audio URL"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveUrl(item.key)}
                    className="px-3 py-2 rounded-xl text-sm flex items-center gap-2"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
                  >
                    <Link2 className="w-4 h-4" />
                    Save Link
                  </button>
                </div>
                {record?.label && (
                  <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.42)' }}>
                    Current source: {record.label}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
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
  const { company, setCompany, profile, org } = useApp();
  const activeCompany = companyOverride || company;
  const [mobileNav, setMobileNav] = useState(false);
  const [platformAiPaused, setPlatformAiPaused] = useState(false);
  const importSource = React.useMemo(() => {
    const match = activeCompany?.notes?.match(/IMPORT_SOURCE:([A-Z_]+)/);
    return match?.[1] || 'MANUAL';
  }, [activeCompany?.notes]);
  const companyDisplayName = activeCompany?.app_display_name || activeCompany?.company_name || 'Penthouse Dispatch';
  const basePath = previewMode && activeCompany?.id ? `/admin/company-preview/${activeCompany.id}` : '';

  useEffect(() => {
    let mounted = true;

    async function loadPlatformAiState() {
      let query = supabase
        .from('ai_settings')
        .select('all_bots_paused, provider, motivation_enabled, scheduling_enabled, sentry_bot_enabled, scheduler_bot_enabled, health_bot_enabled, security_bot_enabled')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (org?.id) {
        query = supabase
          .from('ai_settings')
          .select('all_bots_paused, provider, motivation_enabled, scheduling_enabled, sentry_bot_enabled, scheduler_bot_enabled, health_bot_enabled, security_bot_enabled')
          .eq('org_id', org.id)
          .limit(1);
      }
      const { data } = await query.maybeSingle();
      const anyAiServiceEnabled = Boolean(
        data?.provider &&
        data.provider !== 'disabled' &&
        (
          data?.motivation_enabled ||
          data?.scheduling_enabled ||
          data?.sentry_bot_enabled ||
          data?.scheduler_bot_enabled ||
          data?.health_bot_enabled ||
          data?.security_bot_enabled
        )
      );
      if (mounted) {
        setPlatformAiPaused(Boolean(data?.all_bots_paused) || !anyAiServiceEnabled);
      }
    }

    loadPlatformAiState();
    return () => {
      mounted = false;
    };
  }, [org?.id, activeCompany?.id]);

  const tabs = [
    { path: previewMode ? `${basePath}` : (basePath || '/'), routePath: '/', label: previewMode ? 'Company Dashboard' : 'Dispatch', icon: LayoutGrid, exact: true },
    { path: `${basePath}/marketplace`, routePath: 'marketplace', label: 'Marketplace', icon: Layers },
    { path: `${basePath}/programs`, routePath: 'programs', label: 'Programs', icon: ClipboardList },
    { path: `${basePath}/drivers`, routePath: 'drivers', label: 'Drivers', icon: Users },
    { path: `${basePath}/trips`, routePath: 'trips', label: 'Trip History', icon: Navigation },
    { path: `${basePath}/invoices`, routePath: 'invoices', label: 'Invoices', icon: FileText },
    { path: `${basePath}/payouts`, routePath: 'payouts', label: 'Driver Pay', icon: CreditCard },
    { path: `${basePath}/incentives`, routePath: 'incentives', label: 'Incentives', icon: Trophy },
    { path: `${basePath}/ai-controls`, routePath: 'ai-controls', label: 'AI Settings', icon: Bot },
    { path: `${basePath}/guides`, routePath: 'guides', label: 'Guides', icon: BookOpen },
    { path: `${basePath}/settings`, routePath: 'settings', label: 'Settings', icon: Settings },
  ];

  function CompanyMobileDrawer() {
    if (!mobileNav) return null;

    return (
      <div
        className="fixed inset-0 z-50 md:hidden flex"
        style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)' }}
        onClick={() => setMobileNav(false)}
      >
        <div
          className="flex flex-col w-72 h-full overflow-y-auto"
          style={{
            background: '#0d1117',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 'calc(var(--safe-top) + 10px)',
            paddingBottom: 'var(--safe-bottom)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <div>
              <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>{companyDisplayName}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Company Admin Dashboard</p>
            </div>
            <button
              onClick={() => setMobileNav(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost"
              title="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {previewMode && activeCompany?.id && (
            <Link
              to="/admin/companies"
              onClick={() => setMobileNav(false)}
              className="mx-4 mt-4 inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm transition-all"
              style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', textDecoration: 'none', fontWeight: 600 }}
            >
              Back To Companies
            </Link>
          )}

          <div className="mt-4 flex flex-col">
            {tabs.map(({ path, label, icon: Icon, exact }) => (
              <NavLink
                key={path}
                to={path}
                end={exact}
                onClick={() => setMobileNav(false)}
                className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium transition-all border-b"
                style={({ isActive }) => ({
                  color: isActive ? '#c9a84c' : 'rgba(255,255,255,0.62)',
                  background: isActive ? 'rgba(201,168,76,0.08)' : 'transparent',
                  borderColor: 'rgba(255,255,255,0.04)',
                  textDecoration: 'none',
                })}
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </div>

          <div className="mt-auto px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <button
              onClick={() => supabase.auth.signOut()}
              className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm transition-all"
              style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.15)', color: '#ff4757', fontWeight: 600 }}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!previewMode && activeCompany?.onboarding_status === 'rejected') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6" style={{ background: '#07090d' }}>
        <div className="max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)' }}>
            <AlertTriangle className="w-8 h-8" style={{ color: '#c9a84c' }} />
          </div>
          <h2 className="text-xl font-700 mb-2" style={{ fontWeight: 700 }}>Access Paused</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6 }}>
            Your company account has been rejected or paused. Contact Penthouse Dispatch support if you need this access restored.
          </p>
          <button onClick={() => supabase.auth.signOut()} className="btn-ghost mt-6 px-5 py-2.5 text-sm flex items-center gap-2 mx-auto">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#07090d', color: '#e5e7eb', paddingTop: 'calc(var(--safe-top) + 6px)' }}>
      <div
        className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 px-4 py-2 flex-shrink-0"
        style={{
          background: 'linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.04))',
          borderBottom: '1px solid rgba(201,168,76,0.18)',
        }}
      >
        <StatusChip label={`Company Admin: ${activeCompany?.company_name || 'Subscriber'}`} color="#c9a84c" />
        <StatusChip label={`Import: ${importSource}`} color="#0ea5e9" />
        <StatusChip label={activeCompany?.white_label_enabled ? 'White-label enabled' : 'Platform branding active'} color={activeCompany?.white_label_enabled ? '#00e5a0' : 'rgba(255,255,255,0.6)'} />
        <StatusChip label={activeCompany?.ai_routing_enabled && !platformAiPaused ? 'AI routing on' : 'AI routing off'} color={activeCompany?.ai_routing_enabled && !platformAiPaused ? '#00e5a0' : '#ff4757'} />
      </div>

      <header className="flex items-center justify-between px-4 py-2 min-h-14 border-b flex-shrink-0 gap-3" style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#07090d' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))', border: '1px solid rgba(201,168,76,0.3)' }}>
            <span style={{ color: '#c9a84c', fontSize: 16, fontWeight: 800 }}>P</span>
          </div>
          <div className="min-w-0">
            <p className="truncate" style={{ color: '#c9a84c', fontSize: 13, fontWeight: 700 }}>{companyDisplayName.toUpperCase()}</p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>Company Admin Dashboard</p>
          </div>
          {previewMode && activeCompany?.id && (
            <Link
              to="/admin/companies"
              className="hidden lg:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all"
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

        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => supabase.auth.signOut()} className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg btn-ghost text-xs font-semibold" title="Sign out">
            <LogOut className="w-4 h-4" />
            Logout
          </button>
          <button className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg btn-ghost text-xs font-semibold" onClick={() => setMobileNav(true)} title="Open menu">
            <Menu className="w-4 h-4" />
            Menu
          </button>
        </div>
      </header>

      <CompanyMobileDrawer />

      <main className="flex-1 overflow-y-auto pb-16">
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
          <Route path="programs" element={renderCompanyModule('Programs', <CompanyPrograms company={activeCompany} />)} />
          <Route path="drivers" element={renderCompanyModule('Drivers', <CompanyDrivers company={activeCompany} />)} />
          <Route path="trips" element={renderCompanyModule('Trip History', <CompanyTrips company={activeCompany} />)} />
          <Route path="invoices" element={renderCompanyModule('Invoices', <CompanyInvoices company={activeCompany} />)} />
          <Route path="payouts" element={renderCompanyModule('Driver Pay', <CompanyDriverPay company={activeCompany} />)} />
          <Route path="incentives" element={renderCompanyModule('Incentives', <IncentivesPanel />)} />
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
      className="text-[11px] px-2.5 py-1 rounded-full leading-4 w-full sm:w-auto break-words"
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
