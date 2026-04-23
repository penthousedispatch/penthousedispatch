import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DollarSign, Coffee, X, AlertTriangle, TrendingUp, Clock, CheckCircle, CreditCard, Menu, Calendar, BookOpen, LogOut, ChevronRight, Trophy, MapPin, ClipboardList, BellRing } from 'lucide-react';
import { fbSet, fbGet, fbUpdate } from '../../lib/firebase';
import { supabase } from '../../lib/supabase';
import { getMotivationMessage } from '../../utils/aiMotivation';
import { logFailure } from '../../utils/errorHandler';
import { sentryApi } from '../../lib/sentryApi';
import DriverMapView from './DriverMapView';
import TripBottomSheet from './TripBottomSheet';
import OnboardingSlides from './OnboardingSlides';
import DriverLogin from './DriverLogin';
import BreakOverlay from './BreakOverlay';
import DriverChat from './DriverChat';
import DriverPaymentSetup from './DriverPaymentSetup';
import DriverScheduleView from './DriverScheduleView';
import DriverGuide from './DriverGuide';
import DriverCommunityHub from './DriverCommunityHub';
import IncentiveGoalToast from '../../components/drivers/IncentiveGoalToast';
import IncentiveCelebrationOverlay from '../../components/drivers/IncentiveCelebrationOverlay';
import DriverZonePreferences from '../../components/drivers/DriverZonePreferences';
import { formatServiceZone, normalizePreferredZones } from '../../lib/serviceZones';
import { useApp } from '../../context/AppContext';
import { getPublicAppUrl } from '../../lib/mobileRuntime';

const DEFAULT_RIDE_PREFERENCES = {
  shortTripPreference: '2-4 mi',
  priorityPreference: 'Nearby chain',
  sharedRidePreference: 'Same direction',
};

function buildRiderTrackingUrl(riderKey) {
  if (!riderKey) return '';
  return getPublicAppUrl(`/rider?trip=${encodeURIComponent(riderKey)}`);
}

function getDriverOnboardingKey(driverId) {
  return `pds_onboarding_seen:${driverId}`;
}

/** Persists admin/company embedded driver preview (and driver-role logins) across tab sleep / soft reloads. */
const DRIVER_EMBED_SESSION_KEY = 'pd_driver_embed_session_v1';
/** Persists direct driver-login sessions so refresh does not drop active trip context. */
const DRIVER_LAST_SESSION_KEY = 'pd_driver_last_session_v1';

const DRIVER_TEST_TRIP_MARKER = '[TEST_TRIP]';
const CLAIMED_ASSIGNMENT_STATUSES = ['accepted', 'arrived', 'picked_up', 'completed', 'no_show'];
const ACTIVE_DRIVER_ASSIGNMENT_STATUSES = ['accepted', 'arrived', 'picked_up'];
const OFFER_ASSIGNMENT_STATUSES = ['pending', 'assigned'];
const RESUMABLE_ASSIGNMENT_STATUSES = [...ACTIVE_DRIVER_ASSIGNMENT_STATUSES, ...OFFER_ASSIGNMENT_STATUSES];

function isLocalOnlyTestTripId(tripId) {
  return String(tripId || '').startsWith('LOCAL-TEST-');
}

function shouldSkipUpstreamSentryForDriverTestTrip(trip) {
  return Boolean(trip?.isTestTrip) || isLocalOnlyTestTripId(trip?.tripId || trip?.trip_id);
}

function parseTripAssignmentNotesForOffer(notes = '') {
  const safe = String(notes || '');
  const isTestTrip = safe.includes(DRIVER_TEST_TRIP_MARKER);
  const testNoteMatch = safe.match(/\[TEST_NOTE\]([\s\S]*)/);
  const testingNote = testNoteMatch?.[1]?.trim() || '';
  return { isTestTrip, testingNote };
}

function deriveSheetStateFromAssignmentStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'picked_up') return 'to_dropoff';
  if (['accepted', 'arrived'].includes(normalized)) return 'navigation';
  return 'new_trip';
}

function deriveMtaFareInfo(row = {}) {
  const raw = row.raw_payload || {};
  const mta = raw.mta || {};
  const required = Boolean(
    row.mtaFareRequired ||
    row.mta_fare_required ||
    mta.collected_fare_required ||
    mta.fare_required ||
    raw.collected_fare_required ||
    raw.fare_required ||
    raw.mta_fare_required ||
    String(row.assignment_type_code || raw.assignment_type_code || '').toUpperCase().includes('MTA')
  );
  const amount =
    row.mtaFareAmount ??
    row.collected_fare ??
    mta.collected_fare ??
    raw.collected_fare ??
    raw.collected_fare_amount ??
    raw.mta_collected_fare ??
    null;
  return {
    mtaFareRequired: required,
    mtaFareAmount: amount === null || amount === undefined || amount === '' ? null : Number(amount),
  };
}

function asFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildLifecycleRetryPayload(payload = {}) {
  const safe = payload && typeof payload === 'object' ? payload : {};
  return {
    status_id: safe.status_id,
    is_confirmed: safe.is_confirmed,
    cancel_reason_id: safe.cancel_reason_id ?? null,
    cancel_note: safe.cancel_note ?? null,
    cancelled_at: safe.cancelled_at ?? null,
    assigned_at: safe.assigned_at ?? null,
    accepted_at: safe.accepted_at ?? null,
    pick_up_arrival_timestamp: safe.pick_up_arrival_timestamp ?? null,
    pick_up_timestamp: safe.pick_up_timestamp ?? null,
    drop_off_timestamp: safe.drop_off_timestamp ?? null,
    collected_fare: safe.collected_fare ?? null,
    collected_fare_amount: safe.collected_fare_amount ?? null,
    is_next_day: safe.is_next_day ?? null,
    next_day: safe.next_day ?? null,
    next_day_requested_at: safe.next_day_requested_at ?? null,
  };
}

function shouldDowngradeLifecycleFailure(statusId, result) {
  const status = Number(result?.status || 0);
  // Upstream validation noise can return 422 even when local lifecycle is valid.
  if (status === 422) return true;
  // Completion/no-show can race with broker closure on sandbox rows.
  if (status === 404 && [6, 7, 8].includes(Number(statusId))) return true;
  return false;
}

function DriverAccessChooser({ role, company, onSelectDriver, onExit, companyIdFilter = null }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sandboxCompanyId, setSandboxCompanyId] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDriverOptions() {
      setLoading(true);

      const [{ data: sandboxSession }, driverResult] = await Promise.all([
        supabase
          .from('test_sandbox_sessions')
          .select('test_company_id')
          .eq('is_active', true)
          .order('reset_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        (() => {
          let query = supabase
            .from('drivers')
            .select('id, full_name, photo_data, tlc_number, login_username, email, is_active, status, company_id')
            .eq('is_active', true)
            .order('company_id')
            .order('full_name');
          if (role === 'company' && company?.id) {
            query = query.eq('company_id', company.id);
          } else if (role === 'admin' && companyIdFilter) {
            query = query.eq('company_id', companyIdFilter);
          }
          return query;
        })(),
      ]);

      if (!active) return;

      setSandboxCompanyId(sandboxSession?.test_company_id || null);
      setDrivers(driverResult?.data || []);
      setLoading(false);
    }

    if (role === 'admin' || role === 'company') {
      loadDriverOptions();
    }

    return () => {
      active = false;
    };
  }, [role, company?.id, companyIdFilter]);

  const filteredDrivers = drivers.filter(driver => {
    if (!search) return true;
    const query = search.toLowerCase();
    return [driver.full_name, driver.email, driver.login_username, driver.tlc_number]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query));
  });

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-4 sm:px-6"
      style={{ background: '#07090d', paddingTop: 'calc(var(--safe-top) + 20px)', paddingBottom: 'calc(var(--safe-bottom) + 12px)' }}
    >
      <div className="w-full max-w-2xl rounded-3xl p-5 sm:p-6" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="mb-5">
          <p style={{ color: '#c9a84c', fontSize: 22, fontWeight: 800 }}>
            {role === 'admin' ? 'Admin Test Driver Access' : 'Driver App Access'}
          </p>
          <p className="mt-1" style={{ color: 'rgba(255,255,255,0.48)', fontSize: 13 }}>
            {role === 'admin'
              ? 'Open the driver app as any driver or test driver without using their password. Your admin session acts as admin test-driver access.'
              : 'Open the driver app as one of your company drivers without using their password.'}
          </p>
        </div>

        <button
          onClick={onExit}
          className="w-full mb-4 px-4 py-3 rounded-2xl text-sm font-700 flex items-center justify-center gap-2"
          style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.24)', color: '#c9a84c', fontWeight: 700 }}
        >
          <X className="w-4 h-4" />
          {role === 'admin' ? 'Exit Back To Admin Dashboard' : 'Exit Back To Company Dashboard'}
        </button>

        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search drivers by name, email, username, or TLC"
            className="w-full"
          />
        </div>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center h-40" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Loading drivers...
            </div>
          ) : filteredDrivers.length === 0 ? (
            <div className="flex items-center justify-center h-40 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.45)' }}>
              No drivers available to preview.
            </div>
          ) : (
            filteredDrivers.map(driver => {
              const isSandboxDriver = sandboxCompanyId && driver.company_id === sandboxCompanyId;
              return (
                <button
                  key={driver.id}
                  onClick={() => onSelectDriver(driver)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  {driver.photo_data ? (
                    <img src={driver.photo_data} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,168,76,0.14)', color: '#c9a84c', fontWeight: 700 }}>
                      {driver.full_name?.charAt(0)?.toUpperCase() || 'D'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-600 truncate" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driver.full_name}</p>
                      {isSandboxDriver && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(14,165,233,0.14)', color: '#0ea5e9' }}>
                          TEST
                        </span>
                      )}
                      {role === 'admin' && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.14)', color: '#c9a84c' }}>
                          ADMIN TEST DRIVER
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {[driver.email, driver.login_username, driver.tlc_number].filter(Boolean).join(' • ') || 'No login metadata'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.28)' }} />
                </button>
              );
            })
          )}
        </div>

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={onExit}
            className="w-full px-4 py-3 rounded-2xl text-sm font-700"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', fontWeight: 700 }}
          >
            {role === 'admin' ? 'Cancel Driver Preview And Return To Admin' : 'Cancel Driver Preview And Return To Company'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DriverApp() {
  const { user, role, company } = useApp();
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const [driverData, setDriverData] = useState(null);
  const [driverRecord, setDriverRecord] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [sheetState, setSheetState] = useState('waiting');
  const [currentTrip, setCurrentTrip] = useState(null);
  const [onBreak, setOnBreak] = useState(false);
  const [location, setLocation] = useState(null);
  const [gpsIssue, setGpsIssue] = useState('');
  const [earnings, setEarnings] = useState({ today: 0, trips: 0 });
  const [sheetOpen, setSheetOpen] = useState(true);
  const [motivationToast, setMotivationToast] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [chatThreadId, setChatThreadId] = useState(null);
  const [showPaymentSetup, setShowPaymentSetup] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [resumingTrip, setResumingTrip] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [sosPressed, setSosPressed] = useState(false);
  const [sosProgress, setSosProgress] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [postTripSummary, setPostTripSummary] = useState(null);
  const [incentiveGoals, setIncentiveGoals] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showZonePreferences, setShowZonePreferences] = useState(false);
  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneSavedMessage, setZoneSavedMessage] = useState('');
  const [driverInstruction, setDriverInstruction] = useState(null);
  const [statusDockDismissed, setStatusDockDismissed] = useState(false);
  const [testChecklistDismissed, setTestChecklistDismissed] = useState(false);
  const [ridePreferences, setRidePreferences] = useState(DEFAULT_RIDE_PREFERENCES);
  const [driverWaitMins, setDriverWaitMins] = useState(5);
  const [waitRemaining, setWaitRemaining] = useState(null);
  const watchRef = useRef(null);
  const pollRef = useRef(null);
  const sheetStateRef = useRef(sheetState);
  const shiftStartRef = useRef(Date.now());
  const motivationTimerRef = useRef(null);
  const consecutiveTripsRef = useRef(0);
  const lastMotivationRef = useRef(0);
  const sosTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const pickupWaitRef = useRef(null);
  const locationRef = useRef(location);
  const incentiveSnapshotRef = useRef([]);

  useEffect(() => { sheetStateRef.current = sheetState; }, [sheetState]);
  useEffect(() => { locationRef.current = location; }, [location]);

  useEffect(() => {
    setStatusDockDismissed(false);
  }, [sheetState]);

  useEffect(() => {
    setTestChecklistDismissed(false);
  }, [currentTrip?.tripId]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      setShowMenu(false);
      setDriverInstruction(null);
      setPostTripSummary(null);
      setMotivationToast(null);
      setStatusDockDismissed(true);
      setTestChecklistDismissed(true);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (motivationTimerRef.current) clearInterval(motivationTimerRef.current);
      if (sosTimerRef.current) clearInterval(sosTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (pickupWaitRef.current) clearInterval(pickupWaitRef.current);
    };
  }, []);

  useEffect(() => {
    if (!driverData?.id) return;
    try {
      const stored = localStorage.getItem(`pd_ride_preferences:${driverData.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setRidePreferences({
          ...DEFAULT_RIDE_PREFERENCES,
          ...parsed,
        });
        return;
      }
    } catch {}
    setRidePreferences(DEFAULT_RIDE_PREFERENCES);
  }, [driverData?.id]);

  useEffect(() => {
    if (!driverData?.id) return;
    try {
      localStorage.setItem(`pd_ride_preferences:${driverData.id}`, JSON.stringify(ridePreferences));
    } catch {}
  }, [driverData?.id, ridePreferences]);

  async function launchDriverSession(data) {
    setLoggedIn(true);
    setShowOnboarding(false);
    setDriverData({
      id: data.id,
      name: data.full_name || data.name,
      photo: data.photo_data || data.photo,
      email: data.email || '',
      adminPreview: role === 'admin',
    });
    startShift({
      id: data.id,
      name: data.full_name || data.name,
      photo: data.photo_data || data.photo,
      email: data.email || '',
    });
    const loadedDriver = await loadDriverRecord(data.id);
    const onboardingSeen = localStorage.getItem(getDriverOnboardingKey(data.id));
    const onboardingComplete = Number(loadedDriver?.layer1_pct || data.layer1_pct || 0) >= 100;
    setShowOnboarding(!onboardingSeen && !onboardingComplete);

    try {
      if (data?.id) {
        localStorage.setItem(
          DRIVER_LAST_SESSION_KEY,
          JSON.stringify({ driverId: data.id, savedAt: Date.now() })
        );
      }
      if (user?.id && data?.id) {
        localStorage.setItem(
          DRIVER_EMBED_SESSION_KEY,
          JSON.stringify({ userId: user.id, driverId: data.id, savedAt: Date.now() })
        );
      }
    } catch {}
  }

  useEffect(() => {
    if (loggedIn || !user?.id) return;
    if (!(role === 'admin' || role === 'company' || role === 'driver')) return;
    const params = new URLSearchParams(routerLocation.search);
    if (params.get('driverId')) return;

    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(DRIVER_EMBED_SESSION_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed.userId !== user.id || !parsed.driverId) return;
        const { data: row, error } = await supabase.from('drivers').select('*').eq('id', parsed.driverId).maybeSingle();
        if (cancelled || error || !row?.id) return;
        await launchDriverSession(row);
      } catch (e) {
        logFailure('DriverApp:restoreDriverEmbedSession', e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // launchDriverSession identity changes each render; we only want restore on auth/role/loggedIn edges.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [user?.id, role, loggedIn, routerLocation.search]);

  useEffect(() => {
    if (loggedIn || user?.id) return;
    const params = new URLSearchParams(routerLocation.search);
    if (params.get('driverId')) return;

    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(DRIVER_LAST_SESSION_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed?.driverId) return;
        const { data: row, error } = await supabase
          .from('drivers')
          .select('*')
          .eq('id', parsed.driverId)
          .eq('is_active', true)
          .maybeSingle();
        if (cancelled || error || !row?.id) return;
        await launchDriverSession(row);
      } catch (e) {
        logFailure('DriverApp:restoreDriverLastSession', e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore only when auth/loading edge changes
  }, [loggedIn, user?.id, routerLocation.search]);

  useEffect(() => {
    if (loggedIn || !user?.id) return;
    if (!(role === 'admin' || role === 'company')) return;

    const params = new URLSearchParams(routerLocation.search);
    const driverId = String(params.get('driverId') || '').trim();
    const companyId = String(params.get('companyId') || '').trim();
    if (!driverId) return;

    let cancelled = false;
    (async () => {
      try {
        const { data: row, error } = await supabase.from('drivers').select('*').eq('id', driverId).maybeSingle();
        if (cancelled || error || !row?.id || row.is_active === false) return;
        if (companyId && String(row.company_id || '') !== companyId) return;
        await launchDriverSession(row);
      } catch (e) {
        logFailure('DriverApp:launchDriverSessionFromQuery', e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional query-driven launch
  }, [routerLocation.search, user?.id, role, loggedIn]);

  async function endShiftAndLogout() {
    if (watchRef.current) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (motivationTimerRef.current) {
      clearInterval(motivationTimerRef.current);
      motivationTimerRef.current = null;
    }
    stopCountdown();

    if (driverRecord?.id) {
      const { error } = await supabase
        .from('drivers')
        .update({ status: 'offline' })
        .eq('id', driverRecord.id);
      if (error) logFailure('DriverApp:endShiftAndLogout', error);
    }

    if (driverData?.id) {
      await fbSet(`drivers/${driverData.id}/lastSeen`, Date.now());
      await fbSet(`drivers/${driverData.id}/status`, 'offline');
    }

    setShowMenu(false);
    setShowSchedule(false);
    setShowPaymentSetup(false);
    setShowGuide(false);
    setShowZonePreferences(false);
    setCurrentTrip(null);
    setSheetState('waiting');
    setGpsIssue('');
    try {
      localStorage.removeItem(DRIVER_EMBED_SESSION_KEY);
      localStorage.removeItem(DRIVER_LAST_SESSION_KEY);
    } catch {}
    setLoggedIn(false);
    setDriverData(null);
    setDriverRecord(null);
  }

  async function loadDriverRecord(id) {
    const { data: driver, error: driverErr } = await supabase.from('drivers').select('*').eq('id', id).maybeSingle();
    if (driverErr) logFailure('DriverApp:loadDriverRecord', driverErr);
    setDriverRecord(driver);
    if (driver) {
      const { data: membership, error: memErr } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user?.id || '')
        .limit(1)
        .maybeSingle();
      if (memErr) logFailure('DriverApp:loadDriverRecord:membership', memErr);
      if (membership) {
        setOrgId(membership.org_id);
        const { data: orgRow, error: orgErr } = await supabase
          .from('organizations')
          .select('driver_wait_mins')
          .eq('id', membership.org_id)
          .maybeSingle();
        if (orgErr) logFailure('DriverApp:loadDriverRecord:organization', orgErr);
        if (orgRow?.driver_wait_mins) setDriverWaitMins(orgRow.driver_wait_mins);
        setTimeout(() => triggerMotivation({ driver, orgId: membership.org_id, trigger: 'shift_start' }), 3000);
        const progress = await getIncentiveProgress(driver.id);
        if (progress.length > 0) {
          incentiveSnapshotRef.current = progress;
          const sorted = [...progress].sort((a, b) => (b.current / (b.goal || 1)) - (a.current / (a.goal || 1)));
          setTimeout(() => setIncentiveGoals(sorted), 6000);
        }
      }
      const { data: thread, error: threadErr } = await supabase
        .from('chat_threads')
        .select('id')
        .eq('driver_id', driver.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (threadErr) logFailure('DriverApp:loadDriverRecord:thread', threadErr);
      if (thread) {
        setChatThreadId(thread.id);
      } else {
        const { data: newThread, error: createErr } = await supabase
          .from('chat_threads')
          .insert({
            driver_id: driver.id,
            last_message_at: new Date().toISOString(),
            unread_dispatch_count: 0,
            unread_driver_count: 0,
          })
          .select('id')
          .maybeSingle();
        if (createErr) logFailure('DriverApp:loadDriverRecord:createThread', createErr);
        if (newThread) setChatThreadId(newThread.id);
      }
    }
    return driver;
  }

  async function completeDriverOnboarding() {
    const driverId = driverRecord?.id || driverData?.id || null;
    if (!driverId) {
      setShowOnboarding(false);
      return;
    }

    localStorage.setItem(getDriverOnboardingKey(driverId), '1');
    setShowOnboarding(false);

    const completedAt = new Date().toISOString();
    const wasIncomplete = Number(driverRecord?.layer1_pct || 0) < 100;

    const { data: updatedDriver, error } = await supabase
      .from('drivers')
      .update({
        layer1_pct: 100,
        updated_at: completedAt,
      })
      .eq('id', driverId)
      .select('*')
      .maybeSingle();

    if (error) {
      logFailure('DriverApp:completeDriverOnboarding:drivers', error);
      return;
    }

    if (updatedDriver) {
      setDriverRecord(updatedDriver);
    }

    if (wasIncomplete) {
      await publishTripAlert(
        'driver_onboarding_complete',
        `${updatedDriver?.full_name || driverData?.name || 'Driver'} completed driver onboarding and is ready for company review.`,
        'info',
        {
          company_id: updatedDriver?.company_id || driverRecord?.company_id || null,
          onboarding_complete_at: completedAt,
          layer1_pct: 100,
          layer2_status: updatedDriver?.layer2_status || driverRecord?.layer2_status || 'not_submitted',
          layer3_status: updatedDriver?.layer3_status || driverRecord?.layer3_status || 'not_ready',
        }
      );
    }
  }

  async function triggerMotivation({ driver, orgId: oId, trigger }) {
    const now = Date.now();
    if (now - lastMotivationRef.current < 5 * 60 * 1000) return;
    const incentiveProgress = await getIncentiveProgress(driver?.id);
    const driverName = driver?.full_name || driverData?.name || 'Driver';
    const msg = await getMotivationMessage({
      orgId: oId || orgId,
      driverId: driver?.id || driverData?.id,
      driverName,
      todayEarnings: earnings.today,
      tripsCompleted: earnings.trips,
      incentiveProgress,
      shiftStartedAt: shiftStartRef.current,
      trigger,
    });
    if (msg) {
      lastMotivationRef.current = now;
      showToast(msg);
    }
  }

  async function getIncentiveProgress(driverId, overrides = {}) {
    if (!driverId) return [];
    const { data, error } = await supabase
      .from('driver_incentive_enrollments')
      .select('*, incentives(id, name, goal_type, goal_value, bonus_amount, celebration_style, celebration_message)')
      .eq('driver_id', driverId)
      .eq('earned', false);
    if (error) logFailure('DriverApp:getIncentiveProgress', error);
    return (data || []).map(e => ({
      id: e.incentives?.id,
      name: e.incentives?.name || '',
      goal: e.incentives?.goal_value || 0,
      current: Math.max(
        e.current_progress || 0,
        e.incentives?.goal_type === 'trips'
          ? overrides.tripCount ?? earnings.trips ?? 0
          : e.incentives?.goal_type === 'revenue'
            ? overrides.earningsToday ?? earnings.today ?? 0
            : e.incentives?.goal_type === 'hours'
              ? overrides.hoursWorked ?? ((Date.now() - shiftStartRef.current) / 3600000)
              : 0
      ),
      unit: e.incentives?.goal_type === 'revenue' ? '$' : e.incentives?.goal_type === 'hours' ? 'hrs' : 'trips',
      bonus: e.incentives?.bonus_amount || 0,
      celebration_style: e.incentives?.celebration_style || 'confetti',
      celebration_message: e.incentives?.celebration_message || '',
    }));
  }

  function syncIncentiveFeedback(progress) {
    const previous = incentiveSnapshotRef.current || [];
    const completedNow = progress.find(goal => {
      const prev = previous.find(item => item.id === goal.id);
      const wasComplete = prev ? prev.current >= prev.goal : false;
      return goal.goal > 0 && goal.current >= goal.goal && !wasComplete;
    });

    if (completedNow) {
      setCelebration({
        title: completedNow.name,
        message: completedNow.celebration_message || `You hit the ${completedNow.name} goal. Keep the momentum going.`,
        style: completedNow.celebration_style,
        bonus: completedNow.bonus,
      });
    }

    incentiveSnapshotRef.current = progress;
    if (progress.length > 0) {
      const sorted = [...progress].sort((a, b) => (b.current / (b.goal || 1)) - (a.current / (a.goal || 1)));
      setIncentiveGoals(sorted);
    }
  }

  function showToast(message) {
    setMotivationToast(message);
    setTimeout(() => setMotivationToast(null), 8000);
  }

  function toastSentryLifecycleFailure(label, result, { isTestTrip = false } = {}) {
    if (!result || result.ok || result.skipped) return;
    const st = Number(result.status || 0);
    if (isTestTrip && [422, 409, 400].includes(st)) {
      showToast(
        `${label} Sentry returned HTTP ${st} (common for sandbox / local-only takes). Your trip continues in the app.`
      );
    } else {
      showToast(`${label} ${result.error || `HTTP ${result.status}`}`);
    }
  }

  function calcDriverEarnings(rawEarnings, record) {
    if (!record?.pay_rate) return rawEarnings;
    const rate = parseFloat(record.pay_rate) || 0;
    const type = record.pay_rate_type || 'hourly';
    if (type === 'per_trip') {
      return { ...rawEarnings, today: rate * (rawEarnings.trips || 0) };
    }
    const hoursWorked = (Date.now() - shiftStartRef.current) / 3600000;
    return { ...rawEarnings, today: rate * hoursWorked };
  }

  async function savePreferredZones(preferredZones) {
    if (!driverRecord?.id) return;
    setZoneSaving(true);
    setZoneSavedMessage('');
    const normalizedZones = normalizePreferredZones(preferredZones);

    const { data, error } = await supabase
      .from('drivers')
      .update({ preferred_zones: normalizedZones })
      .eq('id', driverRecord.id)
      .select('*')
      .maybeSingle();

    if (error) {
      logFailure('DriverApp:savePreferredZones', error);
      setZoneSavedMessage('Saving failed. Please try again.');
      setZoneSaving(false);
      return;
    }

    if (data) {
      setDriverRecord(data);
      setZoneSavedMessage('Preferred zones saved.');
      setTimeout(() => setZoneSavedMessage(''), 2500);
    }

    setZoneSaving(false);
  }

  function applyDriverLocation(driverId, coords) {
    setLocation(coords);
    locationRef.current = coords;
    setGpsIssue('');
    fbSet(`drivers/${driverId}/coords`, coords);
    fbSet(`drivers/${driverId}/lastSeen`, Date.now());
    if (driverId) {
      const inActiveTripFlow = Boolean(
        currentTrip?.tripId && (
          currentTrip?.acceptedAt ||
          currentTrip?.arrivedAt ||
          currentTrip?.pickedUpAt
        )
      );
      supabase.from('drivers').update({
        current_lat: coords.lat,
        current_lng: coords.lng,
        last_location_update: new Date().toISOString(),
        status: inActiveTripFlow ? 'on_trip' : 'online',
      }).eq('id', driverId).then(({ error }) => {
        if (error) logFailure('DriverApp:applyDriverLocation', error);
      });
    }
  }

  function retryGpsLocation() {
    if (!driverData?.id) return;
    if (!navigator.geolocation) {
      setGpsIssue('GPS is not supported on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        applyDriverLocation(driverData.id, coords);
      },
      err => {
        logFailure('DriverApp:retryGpsLocation', err);
        setGpsIssue('GPS is still blocked. Enable location permission and retry.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }

  function startShift(driver) {
    shiftStartRef.current = Date.now();
    if (!navigator.geolocation) {
      setGpsIssue('GPS is not supported on this device.');
    } else {
      watchRef.current = navigator.geolocation.watchPosition(
        pos => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          applyDriverLocation(driver.id, coords);
        },
        err => {
          logFailure('DriverApp:startShift:gps', err);
          setGpsIssue('GPS unavailable. Enable location permissions for live trip updates.');
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    }

    pollRef.current = setInterval(() => pollForNotifications(driver), 8000);
    pollForNotifications(driver);

    motivationTimerRef.current = setInterval(() => {
      if (sheetStateRef.current === 'waiting') {
        triggerMotivation({ trigger: 'idle' });
      }
    }, 25 * 60 * 1000);
  }

  async function pollForNotifications(driver) {
    const perTripPay = String(driverRecord?.pay_rate_type || driver?.pay_rate_type || 'hourly').toLowerCase() === 'per_trip';
    let surfacedTripFromFirebase = false;
    const result = await fbGet(`driver_notifications/${driver.id}`);
    if (result.ok && result.data) {
      const notif = result.data;
      if (notif.type === 'daily_schedule') {
        setShowSchedule(true);
      } else if (notif.tripId && sheetStateRef.current === 'waiting') {
        const tripPayload = { ...notif };
        if (!perTripPay) delete tripPayload.deliveryPrice;
        Object.assign(tripPayload, deriveMtaFareInfo(notif));
        setCurrentTrip(tripPayload);
        setSheetState('new_trip');
        startTripCountdown(15);
        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
        surfacedTripFromFirebase = true;
      }
    }

    if (!surfacedTripFromFirebase && ['waiting', 'suggestions'].includes(sheetStateRef.current) && driver?.id) {
      const { data: pendingRows, error: pendingErr } = await supabase
        .from('trip_assignments')
        .select('trip_id, pu_address, do_address, pu_time, delivery_price, mileage, notes, created_at')
        .eq('driver_id', driver.id)
        .in('status', OFFER_ASSIGNMENT_STATUSES)
        .order('created_at', { ascending: false })
        .limit(5);

      if (pendingErr) {
        logFailure('DriverApp:pollForNotifications:pending_assignment', pendingErr);
      } else {
        const pendingRow = (pendingRows || [])[0];
        if (!pendingRow?.trip_id) {
          // no-op: no pending/assigned offers to surface
        } else {
        const { data: mtRow } = await supabase
          .from('marketplace_trips')
          .select('status, sentry_last_modified_at, raw_payload, assignment_type_code')
          .eq('sentry_trip_id', String(pendingRow.trip_id))
          .maybeSingle();
        const { data: claimedRows } = await supabase
          .from('trip_assignments')
          .select('driver_id, status')
          .eq('trip_id', pendingRow.trip_id)
          .in('status', CLAIMED_ASSIGNMENT_STATUSES);
        const claimedByAnotherDriver = (claimedRows || []).some(row => String(row.driver_id || '') !== String(driver.id || ''));
        const marketplaceStillAvailable = !mtRow || String(mtRow?.status || '').toLowerCase() === 'available';
        if (claimedByAnotherDriver || !marketplaceStillAvailable) {
          await supabase
            .from('trip_assignments')
            .update({
              status: 'rejected',
              trip_processing_status_id: 2,
              rejected_at: new Date().toISOString(),
            })
            .eq('trip_id', pendingRow.trip_id)
            .eq('driver_id', driver.id)
            .eq('status', 'pending');
          await fbSet(`driver_notifications/${driver.id}`, null);
          return;
        }

        const parsedNotes = parseTripAssignmentNotesForOffer(pendingRow.notes);
        const offer = {
          type: 'new_trip',
          tripId: pendingRow.trip_id,
          lastModifiedAt: mtRow?.sentry_last_modified_at || '',
          puAddress: pendingRow.pu_address || '',
          doAddress: pendingRow.do_address || '',
          puTime: pendingRow.pu_time || '',
          ...(perTripPay ? { deliveryPrice: pendingRow.delivery_price } : {}),
          mileage: pendingRow.mileage,
          assignedAt: Date.now(),
          testingNote: parsedNotes.testingNote,
          isTestTrip: parsedNotes.isTestTrip,
          ...deriveMtaFareInfo(mtRow || {}),
        };
        setCurrentTrip(offer);
        setSheetState('new_trip');
        startTripCountdown(15);
        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
        }
      }
    }

    if (driver?.id && (!currentTrip?.tripId || ['waiting', 'suggestions'].includes(sheetStateRef.current))) {
      await restoreActiveTripFromDb(driver, { openSheet: false });
    }

    const instructionResult = await fbGet(`driver_testing_messages/${driver.id}`);
    if (instructionResult.ok && instructionResult.data) {
      const incoming = instructionResult.data;
      if (!driverInstruction || incoming.sentAt !== driverInstruction.sentAt) {
        setDriverInstruction(incoming);
        if (navigator.vibrate) navigator.vibrate([150, 60, 150]);
        setTimeout(() => setDriverInstruction(null), 12000);
        fbSet(`driver_testing_messages/${driver.id}`, null).catch(err => {
          logFailure('DriverApp:clearDriverTestingMessage', err);
        });
      }
    }

    const earningsResult = await fbGet(`driver_portal/${driver.id}/earnings_report`);
    if (earningsResult.ok && earningsResult.data) {
      const raw = earningsResult.data;
      setEarnings(() => {
        const computed = calcDriverEarnings(raw, driverRecord);
        return computed;
      });
    }
  }

  function startTripCountdown(seconds) {
    setCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    let remaining = seconds;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        setCountdown(null);
        if (sheetStateRef.current === 'new_trip') {
          (async () => {
            const tripId = currentTrip?.tripId || null;
            const driverId = driverRecord?.id || driverData?.id || null;
            if (!tripId || !driverId) return;
            const { data: row } = await supabase
              .from('trip_assignments')
              .select('status')
              .eq('trip_id', tripId)
              .eq('driver_id', driverId)
              .maybeSingle();
            if (String(row?.status || '').toLowerCase() === 'pending') {
              rejectTrip();
            }
          })();
        }
      }
    }, 1000);
  }

  function stopCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(null);
  }

  function stopPickupWait() {
    if (pickupWaitRef.current) clearInterval(pickupWaitRef.current);
    pickupWaitRef.current = null;
    setWaitRemaining(null);
  }

  function startPickupWait(totalMinutes) {
    stopPickupWait();
    const totalSeconds = Math.max(1, Math.round((totalMinutes || 5) * 60));
    let remaining = totalSeconds;
    setWaitRemaining(remaining);
    pickupWaitRef.current = setInterval(() => {
      remaining -= 1;
      setWaitRemaining(Math.max(remaining, 0));
      if (remaining <= 0) stopPickupWait();
    }, 1000);
  }

  async function publishTripAlert(alertType, message, severity = 'info', extraPayload = {}) {
    const activeTripId = currentTrip?.tripId || currentTrip?.trip_id || null;
    const payload = {
      company_id: driverRecord?.company_id || null,
      driver_id: driverRecord?.id || driverData?.id || null,
      driver_name: driverRecord?.full_name || driverData?.name || '',
      trip_id: activeTripId,
      pickup_address: currentTrip?.puAddress || currentTrip?.pu_address || '',
      dropoff_address: currentTrip?.doAddress || currentTrip?.do_address || '',
      ...extraPayload,
    };

    const { error } = await supabase.from('supervisor_alerts').insert({
      bot_name: 'DriverApp',
      alert_type: alertType,
      message,
      severity,
      payload,
    });

    if (error) logFailure(`DriverApp:${alertType}:supervisor_alerts`, error);
  }

  function handleSosPress(down) {
    if (down) {
      setSosPressed(true);
      setSosProgress(0);
      let prog = 0;
      sosTimerRef.current = setInterval(() => {
        prog += 5;
        setSosProgress(prog);
        if (prog >= 100) {
          clearInterval(sosTimerRef.current);
          triggerSOS();
        }
      }, 100);
    } else {
      clearInterval(sosTimerRef.current);
      setSosPressed(false);
      setSosProgress(0);
    }
  }

  async function triggerSOS() {
    setSosActive(true);
    setSosPressed(false);
    setSosProgress(0);
    const loc = locationRef.current;
    await fbSet(`sos_alerts/${driverData?.id}`, {
      driverId: driverData?.id,
      driverName: driverData?.name,
      coords: loc,
      triggeredAt: Date.now(),
      status: 'active',
    });
    await supabase.from('supervisor_alerts').insert({
      bot_name: 'DriverApp',
      alert_type: 'sos',
      message: `SOS activated by driver ${driverData?.name || 'Unknown'}`,
      severity: 'critical',
      payload: {
        org_id: orgId,
        company_id: driverRecord?.company_id || null,
        driver_id: driverRecord?.id || null,
        lat: loc?.lat,
        lng: loc?.lng,
        driver_name: driverData?.name,
      },
    }).then(({ error }) => { if (error) logFailure('DriverApp:triggerSOS:supervisor_alerts', error); });
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
    if (sosTimerRef.current) clearInterval(sosTimerRef.current);
    sosTimerRef.current = setTimeout(() => setSosActive(false), 30000);
  }

  async function cancelSOS() {
    setSosActive(false);
    if (sosTimerRef.current) clearTimeout(sosTimerRef.current);
    await fbSet(`sos_alerts/${driverData?.id}`, { status: 'cancelled', cancelledAt: Date.now() });
  }

  function buildSentryLifecyclePayload(statusId, extra = {}) {
    const coords = locationRef.current || location || {};
    const sentryDriverId = driverRecord?.sentry_driver_id || driverRecord?.id || driverData?.id || null;
    const sentryVehicleId = driverRecord?.sentry_vehicle_id || driverRecord?.id || null;
    const locationTimestamp = new Date().toISOString();
    const vehiclePlate = driverRecord?.vehicle_plate || '';
    const driverLicenseNumber = driverRecord?.license_number || '';
    const driverLicenseState = driverRecord?.license_state || 'NY';
    const buildAddress = currentTrip?.puAddress || currentTrip?.pu_address || currentTrip?.doAddress || currentTrip?.do_address || '';

    const driver = {};
    if (sentryDriverId) driver.id = sentryDriverId;
    if (driverLicenseNumber) {
      driver.dmv_license = {
        license_number: driverLicenseNumber,
        state_code: driverLicenseState,
      };
    }

    const vehicle = {};
    if (sentryVehicleId) vehicle.id = sentryVehicleId;
    if (vehiclePlate) {
      vehicle.dmv_registration = {
        license_plate_number: vehiclePlate,
      };
    }
    if (
      coords?.lat ||
      coords?.lng ||
      driverRecord?.current_lat ||
      driverRecord?.current_lng ||
      buildAddress
    ) {
      vehicle.location = {
        lat: coords?.lat || driverRecord?.current_lat || null,
        lng: coords?.lng || driverRecord?.current_lng || null,
        address: buildAddress,
        timestamp: locationTimestamp,
      };
    }

    return {
      status_id: statusId,
      is_done_by_not_integrated_provider: 0,
      is_confirmed: statusId >= 3 ? 1 : 0,
      last_modified_at: extra.last_modified_at || currentTrip?.lastModifiedAt || locationTimestamp,
      ...(Object.keys(driver).length ? { driver } : {}),
      ...(Object.keys(vehicle).length ? { vehicle } : {}),
      ...extra,
    };
  }

  async function sendSentryLifecycleStatus(tripId, statusId, extra = {}) {
    if (!tripId || !sentryApi.enabled || !sentryApi.features.tripStatusUpdate) return { skipped: true };
    if (shouldSkipUpstreamSentryForDriverTestTrip({ ...currentTrip, tripId })) {
      await supabase.from('sentry_sync_log').insert({
        sync_type: `trip_status_${statusId}_local_test_skipped`,
        direction: 'internal',
        record_type: 'trip',
        external_id: String(tripId),
        status: 'success',
        error_message: 'Driver test trip; no upstream Sentry status call needed.',
        payload: { status_id: statusId, is_test_trip: Boolean(currentTrip?.isTestTrip) },
      });
      return { skipped: true, ok: true, localTestTrip: true };
    }

    const payload = buildSentryLifecyclePayload(statusId, extra);
    let sentryResult = await sentryApi.updateTripStatus(tripId, payload);
    let retryUsed = false;

    if (!sentryResult.ok && Number(sentryResult.status || 0) === 422) {
      const retryPayload = buildLifecycleRetryPayload(payload);
      const retryResult = await sentryApi.updateTripStatus(tripId, retryPayload);
      retryUsed = true;
      if (retryResult.ok) {
        sentryResult = {
          ...retryResult,
          ok: true,
          recoveredBy: 'retry_minimal_payload',
        };
      } else {
        sentryResult = retryResult;
      }
    }

    const downgradedFailure = !sentryResult.ok && shouldDowngradeLifecycleFailure(statusId, sentryResult);
    const effectiveResult = downgradedFailure
      ? {
          ...sentryResult,
          ok: true,
          downgraded: true,
          skipped: false,
          error: sentryResult.error || `HTTP ${sentryResult.status}`,
        }
      : sentryResult;

    await supabase.from('sentry_sync_log').insert({
      sync_type: `trip_status_${statusId}`,
      direction: 'export',
      record_type: 'trip',
      external_id: String(tripId),
      status: effectiveResult.ok ? 'success' : 'failed',
      error_message: effectiveResult.ok
        ? (effectiveResult.downgraded ? `Downgraded upstream lifecycle warning: ${effectiveResult.error}` : '')
        : (effectiveResult.error || `HTTP ${effectiveResult.status}`),
      payload: {
        ...payload,
        retry_minimal_payload: retryUsed,
        downgraded_warning: Boolean(effectiveResult.downgraded),
      },
    });

    if (!effectiveResult.ok) {
      logFailure(`DriverApp:tripStatus:${statusId}`, { status: effectiveResult.status, error: effectiveResult.error });
    }

    return effectiveResult;
  }

  function normalizeCompletionMeta(meta = {}) {
    const fareValue = meta.collectedFare;
    const parsedFare =
      fareValue === null || fareValue === undefined || fareValue === ''
        ? null
        : Number(fareValue);

    return {
      collectedFare:
        parsedFare === null || Number.isNaN(parsedFare)
          ? null
          : Number(parsedFare.toFixed(2)),
      isNextDay: Boolean(meta.isNextDay),
    };
  }

  async function acceptTrip() {
    if (!currentTrip) return;
    stopCountdown();

    const acceptedAt = new Date().toISOString();
    const trackingUrl = buildRiderTrackingUrl(currentTrip?.riderKey);
    const thisDriverId = driverRecord?.id || driverData?.id;

    if (currentTrip?.tripId) {
      const { data: claimedRows } = await supabase
        .from('trip_assignments')
        .select('driver_id, status')
        .eq('trip_id', currentTrip.tripId)
        .in('status', CLAIMED_ASSIGNMENT_STATUSES);
      const claimedByAnotherDriver = (claimedRows || []).some(row => String(row.driver_id || '') !== String(thisDriverId || ''));
      if (claimedByAnotherDriver) {
        await fbSet(`driver_notifications/${driverData.id}`, null);
        setCurrentTrip(null);
        setSheetState('waiting');
        showToast('Trip is no longer available. Another driver already accepted it.');
        return;
      }
    }

    await fbSet(`trip_assignments/${currentTrip.tripId}`, { status: 'accepted', driverId: driverData.id, acceptedAt: Date.now() });
    await fbSet(`driver_notifications/${driverData.id}`, null);
    if (currentTrip?.riderKey) {
      await fbSet(`rider_tracking/${currentTrip.riderKey}`, {
        status: 'accepted',
        tripId: currentTrip.tripId,
        riderKey: currentTrip.riderKey,
        company_id: driverRecord?.company_id || null,
        driverId: driverData.id,
        driverName: driverRecord?.full_name || driverData?.name || 'Driver',
        driverPhoto: driverRecord?.photo_data || '',
        puAddress: currentTrip?.puAddress || currentTrip?.pu_address || '',
        doAddress: currentTrip?.doAddress || currentTrip?.do_address || '',
        puTime: currentTrip?.puTime || currentTrip?.scheduled_pick_up_timestamp || '',
        acceptedAt: Date.now(),
        trackingUrl,
      });
    }

    if (currentTrip.tripId) {
      let assignUpdate = supabase
        .from('trip_assignments')
        .update({ status: 'accepted', trip_processing_status_id: 1, accepted_at: acceptedAt })
        .eq('trip_id', currentTrip.tripId);
      if (thisDriverId) assignUpdate = assignUpdate.eq('driver_id', thisDriverId);
      const { error: assignRowError } = await assignUpdate;
      if (assignRowError) logFailure('DriverApp:acceptTrip:trip_assignments', assignRowError);

      const { data: pendingRows } = await supabase
        .from('trip_assignments')
        .select('driver_id')
        .eq('trip_id', currentTrip.tripId)
        .eq('status', 'pending');
      const otherPendingDriverIds = (pendingRows || [])
        .map(row => row.driver_id)
        .filter(driverId => String(driverId || '') && String(driverId || '') !== String(thisDriverId || ''));
      if (otherPendingDriverIds.length > 0) {
        await supabase
          .from('trip_assignments')
          .update({
            status: 'rejected',
            trip_processing_status_id: 2,
            rejected_at: acceptedAt,
          })
          .eq('trip_id', currentTrip.tripId)
          .in('driver_id', otherPendingDriverIds)
          .eq('status', 'pending');
        await Promise.all(
          otherPendingDriverIds.map(driverId => fbSet(`driver_notifications/${driverId}`, null).catch(() => {}))
        );
      }

      await supabase
        .from('marketplace_trips')
        .update({ status: 'accepted' })
        .eq('sentry_trip_id', String(currentTrip.tripId))
        .eq('status', 'available');

      if (driverRecord?.id) {
        const { error: driverStatusError } = await supabase
          .from('drivers')
          .update({ status: 'on_trip' })
          .eq('id', driverRecord.id);
        if (driverStatusError) logFailure('DriverApp:acceptTrip:drivers', driverStatusError);
      }

      if (sentryApi.enabled && sentryApi.features.tripAcceptReject && !shouldSkipUpstreamSentryForDriverTestTrip(currentTrip)) {
        const acceptResult = await sentryApi.acceptTrip(currentTrip.tripId, {
          last_modified_at: currentTrip.lastModifiedAt || '',
          accepted_at: acceptedAt,
        });
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'trip_accept',
          direction: 'export',
          record_type: 'trip',
          external_id: String(currentTrip.tripId),
          status: acceptResult.ok ? 'success' : 'failed',
          error_message: acceptResult.ok ? '' : (acceptResult.error || `HTTP ${acceptResult.status}`),
          payload: { driver_id: driverData.id, trip_processing_status_id: 1 },
        });
        if (!acceptResult.ok) {
          showToast(`Trip accepted locally, but Sentry accept sync failed. ${acceptResult.error || `HTTP ${acceptResult.status}`}`);
        }
      } else if (shouldSkipUpstreamSentryForDriverTestTrip(currentTrip)) {
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'trip_accept_local_test_skipped',
          direction: 'internal',
          record_type: 'trip',
          external_id: String(currentTrip.tripId),
          status: 'success',
          error_message: 'Driver test trip accepted in app; no upstream Sentry accept call needed.',
          payload: { driver_id: driverData.id, trip_processing_status_id: 1, is_test_trip: Boolean(currentTrip?.isTestTrip) },
        });
      }

      const statusResult = await sendSentryLifecycleStatus(currentTrip.tripId, 2, {
        assigned_at: acceptedAt,
        accepted_at: acceptedAt,
      });
      toastSentryLifecycleFailure('Trip accepted locally, but Sentry status update failed.', statusResult, {
        isTestTrip: Boolean(currentTrip?.isTestTrip),
      });
    }

    await publishTripAlert(
      'driver_accepted_trip',
      `${driverData?.name || 'Driver'} accepted trip ${String(currentTrip?.tripId || '').slice(-8) || 'current trip'}. Rider tracking link is ready.`,
      'info',
      {
        status: 'accepted',
        accepted_at: acceptedAt,
        rider_key: currentTrip?.riderKey || null,
        tracking_url: trackingUrl || null,
      }
    );

    setCurrentTrip(prev => ({ ...prev, acceptedAt, enRouteAt: null }));
    setSheetState('navigation');
  }

  async function startRouteToPickup() {
    if (!currentTrip?.tripId || currentTrip?.enRouteAt) return;

    const enRouteAt = new Date().toISOString();
    const statusResult = await sendSentryLifecycleStatus(currentTrip.tripId, 3, {
      en_route_at: enRouteAt,
      accepted_at: currentTrip?.acceptedAt || enRouteAt,
      assigned_at: currentTrip?.acceptedAt || enRouteAt,
    });
    toastSentryLifecycleFailure('Route start saved locally, but Sentry status update failed.', statusResult, {
      isTestTrip: Boolean(currentTrip?.isTestTrip),
    });

    await publishTripAlert(
      'driver_started_route_to_pickup',
      `${driverData?.name || 'Driver'} started driving to pickup for trip ${String(currentTrip?.tripId || '').slice(-8) || 'current trip'}.`,
      'info',
      { status: 'en_route', en_route_at: enRouteAt }
    );

    setCurrentTrip(prev => ({ ...prev, enRouteAt }));
  }

  async function rejectTrip() {
    if (!currentTrip) return;
    stopCountdown();

    const rejectedAt = new Date().toISOString();

    await fbSet(`trip_assignments/${currentTrip.tripId}`, { status: 'rejected', driverId: driverData.id });
    await fbSet(`driver_notifications/${driverData.id}`, null);

    if (currentTrip.tripId) {
      await supabase
        .from('trip_assignments')
        .update({ status: 'rejected', trip_processing_status_id: 2, rejected_at: rejectedAt })
        .eq('trip_id', currentTrip.tripId);

      if (sentryApi.enabled) {
        // Align with Sentry lifecycle sheet:
        // - no-show before arrival  -> status_id=7
        // - no-show after arrival   -> status_id=8
        // For pre-accept release, use reject endpoint status_id=1.
        const hasAccepted = Boolean(currentTrip?.acceptedAt);
        const hasArrived = Boolean(currentTrip?.arrivedAt);
        const statusSyncResult = hasAccepted
          ? await sentryApi.updateTripStatus(currentTrip.tripId, {
              status_id: hasArrived ? 8 : 7,
              cancel_reason_id: 1,
              cancel_note: null,
              pick_up_arrival_timestamp: hasArrived ? currentTrip.arrivedAt : null,
              last_modified_at: currentTrip.lastModifiedAt || rejectedAt,
            })
          : await sentryApi.rejectTrip(
              currentTrip.tripId,
              1,
              currentTrip.lastModifiedAt || null,
              null
            );

        await supabase.from('sentry_sync_log').insert({
          sync_type: hasAccepted ? 'trip_cancel_no_show' : 'trip_reject',
          direction: 'export',
          record_type: 'trip',
          external_id: String(currentTrip.tripId),
          status: statusSyncResult.ok ? 'success' : 'failed',
          error_message: statusSyncResult.ok ? '' : (statusSyncResult.error || `HTTP ${statusSyncResult.status}`),
          payload: {
            driver_id: driverData.id,
            trip_processing_status_id: 2,
            sentry_status_id: hasAccepted ? (hasArrived ? 8 : 7) : 1,
            cancel_reason_id: hasAccepted ? 1 : null,
          },
        });
      }
    }

    setCurrentTrip(null);
    setSheetState('waiting');
  }

  async function markArrivedAtPickup() {
    if (!currentTrip) return;
    const arrivedAt = new Date().toISOString();

    await fbUpdate(`rider_tracking/${currentTrip?.riderKey}`, {
      status: 'arrived',
      driverId: driverData.id,
      arrivedAt: Date.now(),
    });
    if (currentTrip?.tripId) {
      const { error } = await supabase
        .from('trip_assignments')
        .update({ status: 'arrived' })
        .eq('trip_id', currentTrip.tripId);
      if (error) logFailure('DriverApp:markArrivedAtPickup:trip_assignments', error);
    }

    setCurrentTrip(prev => ({ ...prev, arrivedAt }));
    const arrivedResult = await sendSentryLifecycleStatus(currentTrip.tripId, 4, {
      pick_up_arrival_timestamp: arrivedAt,
    });
    if (arrivedResult && !arrivedResult.ok && !arrivedResult.skipped) {
      showToast(`Arrival saved locally, but Sentry status update failed. ${arrivedResult.error || `HTTP ${arrivedResult.status}`}`);
    }
    await publishTripAlert(
      'driver_arrived_pickup',
      `${driverData?.name || 'Driver'} arrived at pickup for trip ${String(currentTrip?.tripId || '').slice(-8) || 'current trip'}.`,
      'info',
      { status: 'arrived', arrived_at: arrivedAt }
    );
    startPickupWait(driverWaitMins);
  }

  async function confirmPickup() {
    const pickedUpAt = new Date().toISOString();
    await fbUpdate(`rider_tracking/${currentTrip?.riderKey}`, {
      status: 'picked_up',
      driverId: driverData.id,
      pickedUpAt: Date.now(),
    });
    if (currentTrip?.tripId) {
      const { error } = await supabase
        .from('trip_assignments')
        .update({ status: 'picked_up', actual_pickup_time: pickedUpAt })
        .eq('trip_id', currentTrip.tripId);
      if (error) logFailure('DriverApp:confirmPickup:trip_assignments', error);
    }
    stopPickupWait();
    const pickupResult = await sendSentryLifecycleStatus(currentTrip?.tripId, 5, {
      pick_up_timestamp: pickedUpAt,
      pick_up_arrival_timestamp: currentTrip?.arrivedAt || pickedUpAt,
    });
    if (pickupResult && !pickupResult.ok && !pickupResult.skipped) {
      showToast(`Pickup saved locally, but Sentry status update failed. ${pickupResult.error || `HTTP ${pickupResult.status}`}`);
    }
    await publishTripAlert(
      'driver_picked_up_rider',
      `${driverData?.name || 'Driver'} picked up the rider for trip ${String(currentTrip?.tripId || '').slice(-8) || 'current trip'}.`,
      'info',
      { status: 'picked_up', picked_up_at: pickedUpAt }
    );
    setCurrentTrip(prev => ({ ...prev, pickedUpAt }));
    setSheetState('to_dropoff');
  }

  async function markNoShow() {
    if (!currentTrip) return;
    const noShowAt = new Date().toISOString();

    await fbSet(`trip_assignments/${currentTrip?.tripId}`, { status: 'no_show', driverId: driverData.id, noShowAt: Date.now() });
    await fbUpdate(`rider_tracking/${currentTrip?.riderKey}`, {
      status: 'no_show',
      driverId: driverData.id,
      noShowAt: Date.now(),
    });
    await fbSet(`driver_notifications/${driverData.id}`, null);

    if (currentTrip?.tripId) {
      const { error } = await supabase
        .from('trip_assignments')
        .update({ status: 'no_show' })
        .eq('trip_id', currentTrip.tripId);
      if (error) logFailure('DriverApp:markNoShow:trip_assignments', error);
    }

    if (driverRecord?.id) {
      const { error } = await supabase.from('drivers').update({ status: 'online' }).eq('id', driverRecord.id);
      if (error) logFailure('DriverApp:markNoShow:drivers', error);
    }

    stopPickupWait();
    const noShowResult = await sendSentryLifecycleStatus(currentTrip?.tripId, currentTrip?.arrivedAt ? 8 : 7, {
      cancel_reason_id: 1,
      cancelled_at: noShowAt,
      ...(currentTrip?.arrivedAt ? { pick_up_arrival_timestamp: currentTrip.arrivedAt } : {}),
    });
    if (noShowResult && !noShowResult.ok && !noShowResult.skipped) {
      showToast(`No-show saved locally, but Sentry status update failed. ${noShowResult.error || `HTTP ${noShowResult.status}`}`);
    }
    await publishTripAlert(
      'driver_marked_no_show',
      `${driverData?.name || 'Driver'} marked a rider as no-show for trip ${String(currentTrip?.tripId || '').slice(-8) || 'current trip'}.`,
      'warning',
      { status: 'no_show', no_show_at: noShowAt, waited_mins: driverWaitMins }
    );
    setCurrentTrip(null);
    setSheetState('waiting');
  }

  async function completeTrip(meta = {}) {
    const tripEarnings = driverRecord?.pay_rate && driverRecord?.pay_rate_type === 'per_trip'
      ? parseFloat(driverRecord.pay_rate)
      : null;

    const completedAt = new Date().toISOString();
    const completionMeta = normalizeCompletionMeta(meta);
    const effectiveCollectedFare = completionMeta.collectedFare ?? (
      currentTrip?.isTestTrip ? 1.8 : null
    );
    const lifecycleExtras = {
      drop_off_timestamp: completedAt,
      pick_up_timestamp: currentTrip?.pickedUpAt || null,
      pick_up_arrival_timestamp: currentTrip?.arrivedAt || null,
      collected_fare: effectiveCollectedFare,
      collected_fare_amount: effectiveCollectedFare,
      is_next_day: completionMeta.isNextDay ? 1 : 0,
      next_day: completionMeta.isNextDay ? 1 : 0,
      next_day_requested_at: completionMeta.isNextDay ? completedAt : null,
    };

    await fbSet(`trip_assignments/${currentTrip?.tripId}`, { status: 'completed', driverId: driverData.id, completedAt: Date.now() });
    await fbUpdate(`rider_tracking/${currentTrip?.riderKey}`, {
      status: 'completed',
      completedAt: Date.now(),
    });

    if (currentTrip?.tripId) {
      let taUpdate = supabase
        .from('trip_assignments')
        .update({
          status: 'completed',
          completed_at: completedAt,
          actual_dropoff_time: completedAt,
          collected_fare: effectiveCollectedFare,
          is_next_day: completionMeta.isNextDay,
          next_day_requested_at: completionMeta.isNextDay ? completedAt : null,
        })
        .eq('trip_id', currentTrip.tripId);
      if (driverRecord?.id) taUpdate = taUpdate.eq('driver_id', driverRecord.id);
      const { error: taErr } = await taUpdate;
      if (taErr) logFailure('DriverApp:completeTrip:trip_assignments', taErr);

      await supabase
        .from('marketplace_trips')
        .update({ status: 'completed' })
        .eq('sentry_trip_id', String(currentTrip.tripId));

      const completionResult = await sendSentryLifecycleStatus(currentTrip.tripId, 6, lifecycleExtras);
      toastSentryLifecycleFailure('Trip completed locally, but Sentry completion sync failed.', completionResult, {
        isTestTrip: Boolean(currentTrip?.isTestTrip),
      });
    }

    if (driverRecord?.id) {
      await supabase.from('drivers').update({ status: 'online' }).eq('id', driverRecord.id);
    }

    await publishTripAlert(
      'driver_dropped_off_rider',
      `${driverData?.name || 'Driver'} dropped off the rider for trip ${String(currentTrip?.tripId || '').slice(-8) || 'current trip'}.`,
      'info',
      {
        status: 'completed',
        completed_at: completedAt,
        collected_fare: effectiveCollectedFare,
        is_next_day: completionMeta.isNextDay,
      }
    );

    consecutiveTripsRef.current += 1;

    const newTrips = (earnings.trips || 0) + 1;
    setEarnings(prev => ({ ...prev, trips: newTrips }));

    setPostTripSummary({
      tripNumber: newTrips,
      pickup: currentTrip?.puAddress || currentTrip?.pu_address || 'Pickup',
      dropoff: currentTrip?.doAddress || currentTrip?.do_address || 'Dropoff',
    });

    setCurrentTrip(null);
    setSheetState('waiting');

    if (consecutiveTripsRef.current > 0 && consecutiveTripsRef.current % 5 === 0) {
      setTimeout(() => triggerMotivation({ trigger: 'five_trips' }), 1500);
    }

    const nextDisplayToday = tripEarnings
      ? parseFloat(displayEarnings.today || 0) + parseFloat(tripEarnings || 0)
      : parseFloat(displayEarnings.today || 0);
    const progress = await getIncentiveProgress(driverData?.id, {
      tripCount: newTrips,
      earningsToday: nextDisplayToday,
      hoursWorked: (Date.now() - shiftStartRef.current) / 3600000,
    });
    const nearGoal = progress.some(p => p.goal > 0 && (p.current / p.goal) >= 0.8);
    if (nearGoal) setTimeout(() => triggerMotivation({ trigger: 'near_goal' }), 2000);
    if (progress.length > 0) {
      setTimeout(() => syncIncentiveFeedback(progress), 3000);
    }

    setTimeout(() => setPostTripSummary(null), 6000);
  }

  async function requestRides() {
    if (currentTrip?.tripId) {
      showToast('Finish your active trip first, then request your next ride.');
      return;
    }
    const restoredTrip = await restoreActiveTripFromDb(
      driverRecord || { id: driverData?.id, pay_rate_type: driverRecord?.pay_rate_type || 'hourly' },
      { openSheet: false }
    );
    if (restoredTrip?.tripId) {
      showToast('You already have a trip in progress. Tap Resume to continue it.');
      return;
    }
    if (!location) {
      showToast('GPS is still loading. Enable location and tap Request Rides again.');
      retryGpsLocation();
      return;
    }
    await fbSet(`ride_requests/${driverData.id}`, {
      driverId: driverData.id,
      driverName: driverData.name,
      coords: location,
      preferences: {
        shortTripPreference: ridePreferences.shortTripPreference,
        priorityPreference: ridePreferences.priorityPreference,
        sharedRidePreference: ridePreferences.sharedRidePreference,
      },
      requestedAt: Date.now(),
      status: 'pending',
    });
    setSheetState('suggestions');
    setTimeout(() => {
      setSheetState(prev => (prev === 'suggestions' ? 'waiting' : prev));
    }, 30000);
    await pollForNotifications(driverRecord || { id: driverData.id, pay_rate_type: driverRecord?.pay_rate_type || 'hourly' });
  }

  async function restoreActiveTripFromDb(driver, { openSheet = true } = {}) {
    if (!driver?.id) return null;
    let driverCtx = driver;
    if (!driverCtx?.company_id || !driverCtx?.full_name) {
      const { data: ctxRow } = await supabase
        .from('drivers')
        .select('id, company_id, full_name, tlc_number, login_username, pay_rate_type')
        .eq('id', driver.id)
        .maybeSingle();
      if (ctxRow?.id) {
        driverCtx = { ...driverCtx, ...ctxRow };
      }
    }
    const perTripPay = String(driverRecord?.pay_rate_type || driverCtx?.pay_rate_type || 'hourly').toLowerCase() === 'per_trip';
    const isResumableStatus = (value) => RESUMABLE_ASSIGNMENT_STATUSES.includes(String(value || '').toLowerCase());

    let { data: primaryRows, error: activeErr } = await supabase
      .from('trip_assignments')
      .select('trip_id, pu_address, do_address, pu_time, delivery_price, mileage, notes, accepted_at, actual_pickup_time, status, created_at')
      .eq('driver_id', driverCtx.id)
      .order('accepted_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(25);
    let activeRow = (primaryRows || []).find(row => isResumableStatus(row?.status)) || null;
    if (!activeRow?.trip_id && !activeErr && driverCtx?.company_id && (driverCtx?.full_name || driverData?.name)) {
      const driverName = String(driverCtx.full_name || driverData?.name || '').trim();
      if (driverName) {
        const fallback = await supabase
          .from('trip_assignments')
          .select('trip_id, pu_address, do_address, pu_time, delivery_price, mileage, notes, accepted_at, actual_pickup_time, status, created_at, driver_name')
          .eq('company_id', driverCtx.company_id)
          .order('accepted_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(25);
        activeErr = fallback.error || null;
        if (!activeErr) {
          const normalizeName = (value) => String(value || '').trim().toLowerCase();
          const expected = normalizeName(driverName);
          const rows = (fallback.data || []).filter(row => isResumableStatus(row?.status));
          activeRow = rows.find(row => normalizeName(row.driver_name) === expected) || null;
          if (!activeRow) {
            activeRow = rows.find(row => normalizeName(row.driver_name).includes(expected) || expected.includes(normalizeName(row.driver_name))) || null;
          }
        }
      }
    }
    if (!activeRow?.trip_id && !activeErr && driverCtx?.company_id) {
      const normalizeIdentity = (value) => String(value || '').trim().toLowerCase();
      const targetName = normalizeIdentity(driverCtx.full_name || driverData?.name || '');
      const targetTlc = normalizeIdentity(driverCtx.tlc_number || '');
      const targetLogin = normalizeIdentity(driverCtx.login_username || '');

      const { data: siblingDrivers, error: siblingErr } = await supabase
        .from('drivers')
        .select('id, full_name, tlc_number, login_username')
        .eq('company_id', driverCtx.company_id)
        .eq('is_active', true)
        .limit(200);

      if (!siblingErr) {
        const aliasIds = (siblingDrivers || [])
          .filter(row => {
            const rowName = normalizeIdentity(row.full_name);
            const rowTlc = normalizeIdentity(row.tlc_number);
            const rowLogin = normalizeIdentity(row.login_username);
            return (
              (targetTlc && rowTlc && rowTlc === targetTlc) ||
              (targetLogin && rowLogin && rowLogin === targetLogin) ||
              (targetName && rowName && rowName === targetName)
            );
          })
          .map(row => row.id)
          .filter(Boolean);

        if (aliasIds.length > 0) {
          const aliasLookup = await supabase
            .from('trip_assignments')
            .select('trip_id, pu_address, do_address, pu_time, delivery_price, mileage, notes, accepted_at, actual_pickup_time, status, created_at')
            .in('driver_id', aliasIds)
            .order('accepted_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(25);
          if (!aliasLookup.error) {
            const aliasRow = (aliasLookup.data || []).find(row => isResumableStatus(row?.status));
            if (aliasRow?.trip_id) activeRow = aliasRow;
          }
        }
      }
    }
    if (activeErr) {
      logFailure('DriverApp:restoreActiveTripFromDb', activeErr);
      return null;
    }
    if (!activeRow?.trip_id && !activeErr && driverCtx?.id) {
      const { data: marketplaceRow, error: marketplaceErr } = await supabase
        .from('marketplace_trips')
        .select('sentry_trip_id, status, sentry_last_modified_at, raw_payload, assignment_type_code, pu_address, do_address, pu_time, delivery_price, mileage, loaded_at')
        .eq('taken_by', driverCtx.id)
        .in('status', ['assigned', 'accepted', 'arrived', 'picked_up'])
        .order('loaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (marketplaceErr) {
        logFailure('DriverApp:restoreActiveTripFromDb:marketplaceFallback', marketplaceErr);
      } else if (marketplaceRow?.sentry_trip_id) {
        const fallbackStatus = String(marketplaceRow.status || '').toLowerCase();
        const fallbackTrip = {
          type: 'active_trip',
          tripId: marketplaceRow.sentry_trip_id,
          lastModifiedAt: marketplaceRow.sentry_last_modified_at || '',
          puAddress: marketplaceRow.pu_address || '',
          doAddress: marketplaceRow.do_address || '',
          puTime: marketplaceRow.pu_time || '',
          ...(perTripPay ? { deliveryPrice: marketplaceRow.delivery_price } : {}),
          mileage: marketplaceRow.mileage,
          acceptedAt: ['accepted', 'arrived', 'picked_up'].includes(fallbackStatus) ? new Date().toISOString() : null,
          arrivedAt: fallbackStatus === 'arrived' ? new Date().toISOString() : null,
          pickedUpAt: fallbackStatus === 'picked_up' ? new Date().toISOString() : null,
          testingNote: '',
          isTestTrip: false,
          ...deriveMtaFareInfo(marketplaceRow || {}),
        };
        setCurrentTrip(fallbackTrip);
        setSheetState(deriveSheetStateFromAssignmentStatus(fallbackStatus));
        if (openSheet) setSheetOpen(true);
        return fallbackTrip;
      }
    }
    if (!activeRow?.trip_id) return null;

    const { data: mtRow } = await supabase
      .from('marketplace_trips')
      .select('sentry_last_modified_at, raw_payload, assignment_type_code')
      .eq('sentry_trip_id', String(activeRow.trip_id))
      .maybeSingle();
    const parsedNotes = parseTripAssignmentNotesForOffer(activeRow.notes);
    const restoredTrip = {
      type: 'active_trip',
      tripId: activeRow.trip_id,
      lastModifiedAt: mtRow?.sentry_last_modified_at || '',
      puAddress: activeRow.pu_address || '',
      doAddress: activeRow.do_address || '',
      puTime: activeRow.pu_time || '',
      ...(perTripPay ? { deliveryPrice: activeRow.delivery_price } : {}),
      mileage: activeRow.mileage,
      acceptedAt: activeRow.accepted_at || null,
      arrivedAt: String(activeRow.status || '').toLowerCase() === 'arrived' ? (activeRow.accepted_at || null) : null,
      pickedUpAt: String(activeRow.status || '').toLowerCase() === 'picked_up' ? (activeRow.actual_pickup_time || activeRow.accepted_at || null) : null,
      testingNote: parsedNotes.testingNote,
      isTestTrip: parsedNotes.isTestTrip,
      ...deriveMtaFareInfo(mtRow || {}),
    };
    setCurrentTrip(restoredTrip);
    setSheetState(deriveSheetStateFromAssignmentStatus(activeRow.status));
    if (openSheet) setSheetOpen(true);
    if (String(activeRow.status || '').toLowerCase() !== 'pending' && driverCtx?.id) {
      supabase.from('drivers').update({ status: 'on_trip' }).eq('id', driverCtx.id).then(({ error }) => {
        if (error) logFailure('DriverApp:restoreActiveTripFromDb:setOnTrip', error);
      });
    }
    if (String(activeRow.status || '').toLowerCase() === 'accepted') {
      const acceptedAt = activeRow.accepted_at || new Date().toISOString();
      sendSentryLifecycleStatus(activeRow.trip_id, 2, {
        assigned_at: acceptedAt,
        accepted_at: acceptedAt,
      }).then(result => {
        toastSentryLifecycleFailure('Trip restored, but Sentry status 2 sync failed.', result, {
          isTestTrip: Boolean(parsedNotes.isTestTrip),
        });
      }).catch(err => {
        logFailure('DriverApp:restoreActiveTripFromDb:status2Retry', err);
      });
    }
    return restoredTrip;
  }

  function resumeActiveTrip() {
    (async () => {
      if (resumingTrip) return;
      setResumingTrip(true);
      try {
        let trip = currentTrip;
        if (!trip?.tripId) {
          trip = await restoreActiveTripFromDb(driverRecord || { id: driverData?.id, pay_rate_type: driverRecord?.pay_rate_type || 'hourly' });
          if (!trip?.tripId) {
            showToast('No active ride found to resume right now.');
            return;
          }
        }
        const nextState = trip?.pickedUpAt
          ? 'to_dropoff'
          : (trip?.acceptedAt || trip?.arrivedAt)
            ? 'navigation'
            : 'new_trip';
        setSheetState(nextState);
        setSheetOpen(true);
        setShowSchedule(false);
        setShowMenu(false);
      } finally {
        setResumingTrip(false);
      }
    })();
  }

  function cycleShortTripPreference() {
    setRidePreferences(prev => ({
      ...prev,
      shortTripPreference: prev.shortTripPreference === '2-4 mi' ? 'Any distance' : '2-4 mi',
    }));
  }

  function cyclePriorityPreference() {
    const order = ['Nearby chain', 'Closest pickup', 'Highest payout'];
    const currentIndex = order.indexOf(ridePreferences.priorityPreference);
    const nextValue = order[(currentIndex + 1 + order.length) % order.length];
    setRidePreferences(prev => ({
      ...prev,
      priorityPreference: nextValue,
    }));
  }

  function cycleSharedRidePreference() {
    setRidePreferences(prev => ({
      ...prev,
      sharedRidePreference: prev.sharedRidePreference === 'Same direction' ? 'Shared rides off' : 'Same direction',
    }));
  }

  const statusMeta = {
    waiting: { label: 'Waiting for next trip', hint: 'Stay in a dense zone and the app will keep stacking nearby rides.' },
    suggestions: { label: 'Searching nearby demand', hint: 'Looking for short, high-efficiency trips around you.' },
    new_trip: { label: 'New trip offer', hint: 'Review quickly so you can keep your shift full.' },
    navigation: { label: 'Navigate to pickup', hint: currentTrip?.puAddress || 'Head to the rider pickup location.' },
    to_dropoff: { label: 'Drive to dropoff', hint: currentTrip?.doAddress || 'Complete the current ride, then we will surface the next one.' },
  }[sheetState] || { label: 'Driver mode', hint: 'Ready for the next move.' };

  const rawDisplayEarnings = driverRecord?.pay_rate
    ? calcDriverEarnings(earnings, driverRecord)
    : earnings;
  const displayEarnings = {
    ...(rawDisplayEarnings || {}),
    today: asFiniteNumber(rawDisplayEarnings?.today, 0),
    trips: asFiniteNumber(rawDisplayEarnings?.trips, 0),
  };

  const shiftStartMs = asFiniteNumber(shiftStartRef.current, Date.now());
  const hoursWorked = asFiniteNumber((Date.now() - shiftStartMs) / 3600000, 0).toFixed(1);
  const testChecklist = [
    {
      label: 'Accept trip',
      done:
        Boolean(currentTrip?.acceptedAt) ||
        sheetState === 'navigation' ||
        sheetState === 'to_dropoff',
    },
    {
      label: 'Arrive at pickup',
      done: Boolean(currentTrip?.arrivedAt) || sheetState === 'to_dropoff',
    },
    { label: 'Pick up rider', done: Boolean(currentTrip?.pickedUpAt) },
    {
      label: 'Complete trip',
      done: false,
    },
  ];
  const shouldLockTripSheet = Boolean(currentTrip?.tripId) && ['new_trip', 'navigation', 'to_dropoff'].includes(sheetState);

  if (showOnboarding) {
    return <OnboardingSlides onDone={completeDriverOnboarding} />;
  }

  if (!loggedIn) {
    const companyIdFilter = (() => {
      const params = new URLSearchParams(routerLocation.search);
      return String(params.get('companyId') || '').trim() || null;
    })();
    if (user && (role === 'admin' || role === 'company')) {
      return (
        <DriverAccessChooser
          role={role}
          company={company}
          companyIdFilter={companyIdFilter}
          onSelectDriver={launchDriverSession}
          onExit={() => {
            try {
              localStorage.removeItem(DRIVER_EMBED_SESSION_KEY);
            } catch {}
            if (role === 'admin') {
              navigate('/admin/platform', { replace: true });
              return;
            }
            if (role === 'company') {
              navigate('/company/dashboard', { replace: true });
              return;
            }
            navigate(-1);
          }}
        />
      );
    }
    return <DriverLogin onLogin={launchDriverSession} />;
  }

  return (
    <div className="fixed inset-0 flex flex-col mobile-safe-bottom" style={{ background: '#07090d', fontFamily: 'Inter,sans-serif' }}>
      <div
        className="relative z-[100] shrink-0 px-3 pt-[calc(var(--safe-top)+4px)] pb-2"
        style={{ background: 'rgba(7,9,13,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {role === 'admin' && (
              <Link
                to="/admin/platform"
                className="px-3 h-9 flex items-center justify-center gap-1.5 rounded-full flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#e5e7eb', textDecoration: 'none' }}
              >
                <X className="w-4 h-4" />
                <span className="text-xs font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>Exit</span>
              </Link>
            )}
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-700 flex-shrink-0"
              style={{ background: 'rgba(201,168,76,0.2)', color: '#c9a84c', border: '2px solid rgba(201,168,76,0.4)', fontWeight: 700 }}>
              {driverData?.name?.charAt(0).toUpperCase() || 'D'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-600 truncate" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driverData?.name || 'Driver'}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#00e5a0', boxShadow: '0 0 4px #00e5a0' }} />
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {location ? 'GPS Active' : 'Getting GPS...'}
                </span>
                {gpsIssue && (
                  <button
                    type="button"
                    onClick={retryGpsLocation}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,71,87,0.14)', color: '#ff8a95', border: '1px solid rgba(255,71,87,0.25)' }}
                    title={gpsIssue}
                  >
                    Fix GPS
                  </button>
                )}
                {driverData?.adminPreview && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.14)', color: '#c9a84c' }}>
                    ADMIN TEST DRIVER
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
              style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <TrendingUp className="w-3 h-3" style={{ color: '#00e5a0' }} />
              <span style={{ color: '#e5e7eb' }}>{displayEarnings.trips || 0} trips</span>
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
              <Clock className="w-3 h-3" style={{ color: '#0ea5e9' }} />
              <span style={{ color: '#e5e7eb' }}>{hoursWorked}h</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.2)' }}>
              <DollarSign className="w-3.5 h-3.5" style={{ color: '#c9a84c' }} />
              <span className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>
                ${typeof displayEarnings.today === 'number' ? displayEarnings.today.toFixed(2) : '0.00'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowMenu(true)}
              className="px-2.5 h-9 flex items-center justify-center gap-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <Menu className="w-4 h-4" style={{ color: '#e5e7eb' }} />
              <span className="text-xs font-600 hidden sm:inline" style={{ color: '#e5e7eb', fontWeight: 600 }}>Menu</span>
            </button>
            <button
              type="button"
              onClick={endShiftAndLogout}
              className="px-2.5 h-9 flex items-center justify-center gap-1.5 rounded-full"
              style={{ background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.24)', color: '#ff7a7a' }}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-xs font-700 hidden sm:inline" style={{ fontWeight: 700 }}>Logout</span>
            </button>
            <button
              type="button"
              onClick={resumeActiveTrip}
              disabled={resumingTrip}
              className="px-3 h-9 flex items-center justify-center gap-1.5 rounded-full"
              style={{
                background: 'rgba(0,229,160,0.14)',
                border: '1px solid rgba(0,229,160,0.28)',
                color: '#00e5a0',
                opacity: resumingTrip ? 0.7 : 1,
              }}
            >
              <ChevronRight className="w-4 h-4" />
              <span className="text-xs font-700" style={{ fontWeight: 700 }}>
                {resumingTrip ? 'Loading...' : 'Resume'}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative z-0">
      <DriverMapView location={location} trip={currentTrip} sheetState={sheetState} />

      {(driverInstruction?.message || ((currentTrip?.isTestTrip || currentTrip?.testingNote) && !testChecklistDismissed)) && (
        <div className="absolute top-3 left-3 right-3 z-40 flex flex-col gap-2 pointer-events-none max-w-3xl mx-auto">
          {driverInstruction?.message && (
            <div
              className="rounded-xl px-3 py-2.5 flex items-start gap-3 pointer-events-auto"
              style={{ background: 'rgba(14,165,233,0.14)', border: '1px solid rgba(56,189,248,0.35)', boxShadow: '0 4px 24px rgba(0,0,0,0.35)' }}
            >
              <BellRing className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#38bdf8' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-700 uppercase tracking-wider" style={{ color: '#38bdf8', fontWeight: 700 }}>Dispatch note</p>
                <p className="text-sm mt-0.5 leading-snug" style={{ color: '#e5e7eb' }}>{driverInstruction.message}</p>
              </div>
              <button
                type="button"
                aria-label="Dismiss dispatch note"
                title="Dismiss (Esc)"
                onClick={() => setDriverInstruction(null)}
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full"
                style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', cursor: 'pointer' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {(currentTrip?.isTestTrip || currentTrip?.testingNote) && !testChecklistDismissed && (
            <div
              className="rounded-xl px-3 py-2.5 pointer-events-auto max-h-[30vh] overflow-y-auto"
              style={{ background: 'rgba(13,17,23,0.96)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 24px rgba(0,0,0,0.35)' }}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ClipboardList className="w-4 h-4 flex-shrink-0" style={{ color: '#c9a84c' }} />
                  <p className="text-xs font-700 truncate" style={{ color: '#c9a84c', fontWeight: 700 }}>Test trip checklist</p>
                </div>
                <button
                  type="button"
                  aria-label="Hide checklist"
                  title="Hide (Esc)"
                  onClick={() => setTestChecklistDismissed(true)}
                  className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-base leading-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {testChecklist.map(item => (
                  <div
                    key={item.label}
                    className="px-3 py-2 rounded-xl text-xs"
                    style={{
                      background: item.done ? 'rgba(0,229,160,0.1)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${item.done ? 'rgba(0,229,160,0.22)' : 'rgba(255,255,255,0.07)'}`,
                      color: item.done ? '#00e5a0' : '#e5e7eb',
                    }}
                  >
                    {item.done ? 'Done' : 'Next'}: {item.label}
                  </div>
                ))}
              </div>
              {currentTrip?.testingNote && (
                <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Dispatch note: {currentTrip.testingNote}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!statusDockDismissed && (
        <div
          className="absolute left-3 right-3 z-40 pointer-events-none max-w-3xl mx-auto"
          style={{ bottom: 'calc(52px + env(safe-area-inset-bottom, 0px) + 10px)' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-stretch gap-2 pointer-events-auto">
            <div className="flex-1 flex items-start justify-between gap-2 px-3 py-2 rounded-xl text-xs min-w-0"
              style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
              <div className="min-w-0 pr-1">
                <p className="truncate" style={{ color: '#e5e7eb', fontWeight: 700 }}>{statusMeta.label}</p>
                <p className="text-[11px] leading-snug line-clamp-2 sm:line-clamp-1" style={{ color: 'rgba(255,255,255,0.42)' }}>{statusMeta.hint}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c', fontWeight: 700 }}>
                  {sheetState === 'waiting' ? 'Ready' : sheetState === 'new_trip' ? 'Respond' : 'Active'}
                </span>
                <button
                  type="button"
                  aria-label="Dismiss status"
                  title="Dismiss (Esc)"
                  onClick={() => setStatusDockDismissed(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-base leading-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)' }}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex sm:hidden items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs flex-1 justify-center"
                style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
                <TrendingUp className="w-3 h-3" style={{ color: '#00e5a0' }} />
                <span style={{ color: '#e5e7eb' }}>{displayEarnings.trips || 0} trips</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs flex-1 justify-center"
                style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
                <Clock className="w-3 h-3" style={{ color: '#0ea5e9' }} />
                <span style={{ color: '#e5e7eb' }}>{hoursWorked}h</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {countdown !== null && sheetState === 'new_trip' && !sheetOpen && (
        <div className="absolute z-50 left-1/2 top-[32%] pointer-events-none" style={{ transform: 'translate(-50%, -50%)' }}>
          <div className="flex flex-col items-center gap-1 px-6 py-4 rounded-2xl pointer-events-auto"
            style={{ background: 'rgba(13,17,23,0.97)', border: '1px solid rgba(255,71,87,0.4)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
            <button
              type="button"
              aria-label="Dismiss countdown"
              title="Dismiss"
              onClick={stopCountdown}
              className="self-end -mr-1 -mt-1 w-7 h-7 flex items-center justify-center rounded-full text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}
            >
              ×
            </button>
            <div className="w-14 h-14 rounded-full flex items-center justify-center relative -mt-1">
              <svg className="absolute inset-0" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                <circle cx="28" cy="28" r="24" fill="none"
                  stroke={countdown <= 5 ? '#ff4757' : '#c9a84c'}
                  strokeWidth="4"
                  strokeDasharray={`${(countdown / 15) * 150.8} 150.8`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-2xl font-700 relative z-10" style={{ fontWeight: 700, color: countdown <= 5 ? '#ff4757' : '#e5e7eb' }}>
                {countdown}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>New trip incoming</p>
          </div>
        </div>
      )}

      {postTripSummary && (
        <div className="absolute z-50 top-[30%] left-4 right-4 max-w-lg mx-auto pointer-events-auto" style={{ transform: 'translateY(-50%)' }}>
          <div className="rounded-2xl p-4 relative" style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.3)', backdropFilter: 'blur(20px)' }}>
            <button
              type="button"
              aria-label="Close summary"
              onClick={() => setPostTripSummary(null)}
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', cursor: 'pointer' }}
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-3 pr-8">
              <CheckCircle className="w-5 h-5" style={{ color: '#00e5a0' }} />
              <p className="font-700 text-sm" style={{ color: '#00e5a0', fontWeight: 700 }}>Trip #{postTripSummary.tripNumber} Complete!</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Pickup</p>
                <p className="text-xs" style={{ color: '#e5e7eb' }}>{postTripSummary.pickup}</p>
              </div>
              <div>
                <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Dropoff</p>
                <p className="text-xs" style={{ color: '#e5e7eb' }}>{postTripSummary.dropoff}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {motivationToast && (
        <div className="absolute z-50 mx-4" style={{ top: 52, left: 0, right: 0, background: 'rgba(13,17,23,0.97)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 16, padding: '12px 16px', backdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.25)' }}>
              <span style={{ fontSize: 16 }}>⚡</span>
            </div>
            <div className="flex-1">
              <p className="text-xs font-700 mb-0.5" style={{ color: '#c9a84c', fontWeight: 700 }}>PENTHOUSE AI</p>
              <p className="text-sm" style={{ color: '#e5e7eb', lineHeight: 1.4 }}>{motivationToast}</p>
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => setMotivationToast(null)} className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {sosActive && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(255,71,87,0.12)', backdropFilter: 'blur(4px)' }}>
          <div className="px-8 py-6 rounded-2xl text-center mx-6"
            style={{ background: 'rgba(13,17,23,0.97)', border: '2px solid #ff4757', boxShadow: '0 0 40px rgba(255,71,87,0.4)' }}>
            <AlertTriangle className="w-10 h-10 mx-auto mb-2" style={{ color: '#ff4757' }} />
            <p className="font-700 text-lg mb-1" style={{ color: '#ff4757', fontWeight: 700 }}>SOS ACTIVATED</p>
            <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Dispatch has been alerted</p>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Your GPS location has been shared</p>
            <button
              onClick={cancelSOS}
              className="px-6 py-2.5 rounded-xl text-sm font-700"
              style={{ background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.4)', color: '#ff4757', fontWeight: 700 }}
            >
              Cancel — False Alarm
            </button>
          </div>
        </div>
      )}
      </div>

      {loggedIn && driverData && !sheetOpen && (
        <div className="absolute z-40 left-4 right-4 pointer-events-none" style={{ bottom: 'calc(var(--safe-bottom) + 94px)' }}>
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={resumeActiveTrip}
              className="w-full rounded-2xl px-4 py-3 flex items-center justify-center gap-2"
              style={{ background: 'rgba(0,229,160,0.16)', border: '1px solid rgba(0,229,160,0.35)', color: '#00e5a0' }}
            >
              <Navigation className="w-4 h-4" />
              <span className="text-sm font-700" style={{ fontWeight: 700 }}>Resume Active Ride</span>
            </button>
          </div>
        </div>
      )}

        <TripBottomSheet
        state={sheetState}
        trip={currentTrip}
        open={sheetOpen}
        onToggle={() => {
          if (shouldLockTripSheet) {
            setSheetOpen(true);
            showToast('Finish or reject this trip step before closing the trip panel.');
            return;
          }
          setSheetOpen(!sheetOpen);
        }}
        onRequestRides={requestRides}
        onAccept={acceptTrip}
        onReject={rejectTrip}
        onStartRoute={startRouteToPickup}
        onArrive={markArrivedAtPickup}
        onConfirmPickup={confirmPickup}
        onNoShow={markNoShow}
        onComplete={completeTrip}
        driverData={driverData}
        earnings={displayEarnings}
        ridePreferences={ridePreferences}
        onToggleShortTrips={cycleShortTripPreference}
        onTogglePriority={cyclePriorityPreference}
        onToggleSharedRide={cycleSharedRidePreference}
        countdown={countdown}
        pickupArrived={Boolean(currentTrip?.arrivedAt)}
        waitRemaining={waitRemaining}
        waitTargetMins={driverWaitMins}
        sosButton={
          <button
            onPointerDown={() => handleSosPress(true)}
            onPointerUp={() => handleSosPress(false)}
            onPointerLeave={() => handleSosPress(false)}
            className="w-11 h-11 rounded-full flex items-center justify-center select-none"
            style={{
              background: sosPressed ? `conic-gradient(#ff4757 ${sosProgress * 3.6}deg, rgba(255,71,87,0.15) 0deg)` : 'rgba(255,71,87,0.15)',
              border: '2px solid rgba(255,71,87,0.4)',
              boxShadow: sosPressed ? '0 0 20px rgba(255,71,87,0.5)' : 'none',
              transition: 'box-shadow 0.1s',
            }}
            title="Hold for SOS"
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: '#ff4757', textAlign: 'center', lineHeight: 1.2 }}>SOS</span>
          </button>
        }
      />

      {incentiveGoals && (
        <IncentiveGoalToast
          goals={incentiveGoals}
          onDismiss={() => setIncentiveGoals(null)}
        />
      )}

      {celebration && (
        <IncentiveCelebrationOverlay
          celebration={celebration}
          onDone={() => setCelebration(null)}
        />
      )}

      {onBreak && <BreakOverlay driverId={driverRecord?.id || driverData?.id} onEnd={() => setOnBreak(false)} />}

      {showPaymentSetup && (
        <DriverPaymentSetup
          driverId={driverData?.id}
          driverName={driverData?.name}
          driverEmail={driverData?.email || ''}
          onClose={() => setShowPaymentSetup(false)}
        />
      )}

      {loggedIn && driverData && (
        <DriverChat
          driverId={driverData.id}
          driverName={driverData.name}
          threadId={chatThreadId}
        />
      )}

      {showSchedule && (
        <DriverScheduleView
          driverId={driverRecord?.id || driverData?.id}
          hasActiveTrip={Boolean(currentTrip?.tripId)}
          onResumeTrip={resumeActiveTrip}
          onClose={() => setShowSchedule(false)}
        />
      )}

      {showGuide && <DriverGuide onClose={() => setShowGuide(false)} />}

      {showCommunity && (
        <DriverCommunityHub
          orgId={orgId}
          driver={driverRecord || driverData}
          currentTrip={currentTrip}
          onClose={() => setShowCommunity(false)}
        />
      )}

      {showZonePreferences && (
        <DriverZonePreferences
          initialZones={driverRecord?.preferred_zones || []}
          saving={zoneSaving}
          savedMessage={zoneSavedMessage}
          onSave={savePreferredZones}
          onClose={() => setShowZonePreferences(false)}
        />
      )}

      {showMenu && (
        <div className="fixed inset-0 z-[200] flex" onClick={() => setShowMenu(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
          <div
            className="absolute right-0 top-0 bottom-0 flex flex-col"
            style={{ width: 280, background: '#0d1117', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingTop: 'calc(var(--safe-top) + 12px)', paddingBottom: 'var(--safe-bottom)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.36)', fontWeight: 700 }}>
                  Driver Menu
                </p>
                <button
                  onClick={() => setShowMenu(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <X className="w-4 h-4" style={{ color: '#e5e7eb' }} />
                </button>
              </div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-700"
                  style={{ background: 'rgba(201,168,76,0.2)', color: '#c9a84c', border: '2px solid rgba(201,168,76,0.4)', fontWeight: 700 }}>
                  {driverData?.name?.charAt(0).toUpperCase() || 'D'}
                </div>
                <div>
                  <p className="font-700 text-sm" style={{ color: '#e5e7eb', fontWeight: 700 }}>{driverData?.name || 'Driver'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00e5a0' }} />
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Online</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <div className="flex-1 px-3 py-2 rounded-xl text-center" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)' }}>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Today</p>
                  <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${typeof displayEarnings.today === 'number' ? displayEarnings.today.toFixed(2) : '0.00'}</p>
                </div>
                <div className="flex-1 px-3 py-2 rounded-xl text-center" style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.15)' }}>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Trips</p>
                  <p className="text-sm font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>{displayEarnings.trips || 0}</p>
                </div>
                <div className="flex-1 px-3 py-2 rounded-xl text-center" style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.15)' }}>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Hours</p>
                  <p className="text-sm font-700" style={{ color: '#0ea5e9', fontWeight: 700 }}>{hoursWorked}h</p>
                </div>
              </div>
            </div>

            <div className="flex-1 py-3 overflow-y-auto">
              {[
                {
                  icon: <Navigation className="w-5 h-5" />,
                  color: '#00e5a0',
                  label: 'Resume Active Trip',
                  sub: currentTrip?.tripId
                    ? (currentTrip?.pickedUpAt ? 'Continue to dropoff' : 'Continue current trip flow')
                    : 'Find and reopen your active ride',
                  action: resumeActiveTrip,
                },
                { icon: <Calendar className="w-5 h-5" />, color: '#00e5a0', label: 'My Schedule', sub: 'View today\'s trips', action: () => { setShowSchedule(true); setShowMenu(false); } },
                { icon: <CreditCard className="w-5 h-5" />, color: '#c9a84c', label: 'Earnings & Pay', sub: 'Bank account & payouts', action: () => { setShowPaymentSetup(true); setShowMenu(false); } },
                {
                  icon: <MapPin className="w-5 h-5" />,
                  color: '#0ea5e9',
                  label: 'Preferred Zones',
                  sub: driverRecord?.preferred_zones?.length
                    ? driverRecord.preferred_zones.map(formatServiceZone).join(', ')
                    : 'Choose boroughs you prefer to cover',
                  action: () => { setShowZonePreferences(true); setShowMenu(false); },
                },
                { icon: <Coffee className="w-5 h-5" />, color: '#f59e0b', label: 'Take a Break', sub: '15-minute break timer', action: () => { setOnBreak(true); setShowMenu(false); } },
                { icon: <Trophy className="w-5 h-5" />, color: '#c9a84c', label: 'Community & Leaderboard', sub: 'Compete, post tips, track riders', action: () => { setShowCommunity(true); setShowMenu(false); } },
                { icon: <BookOpen className="w-5 h-5" />, color: '#0ea5e9', label: 'Driver Guide', sub: 'How to use this app', action: () => { setShowGuide(true); setShowMenu(false); } },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={item.action}
                  className="w-full flex items-center gap-3 px-5 py-4"
                  style={{ background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'left' }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${item.color}15`, color: item.color }}>
                    {item.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{item.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{item.sub}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} />
                </button>
              ))}
            </div>

            <div className="px-5 pb-10 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                onClick={endShiftAndLogout}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl"
                style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)' }}
              >
                <LogOut className="w-4 h-4" style={{ color: '#ff4757' }} />
                <span className="text-sm font-600" style={{ color: '#ff4757', fontWeight: 600 }}>End Shift & Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
