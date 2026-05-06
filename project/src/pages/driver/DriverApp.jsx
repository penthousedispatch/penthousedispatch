import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DollarSign, Coffee, X, AlertTriangle, TrendingUp, Clock, CheckCircle, CreditCard, Menu, Calendar, BookOpen, LogOut, ChevronRight, Trophy, MapPin, ClipboardList, BellRing, Navigation } from 'lucide-react';
import { fbSet, fbGet, fbUpdate } from '../../lib/firebase';
import { supabase } from '../../lib/supabase';
import { getMotivationMessage } from '../../utils/aiMotivation';
import { logFailure } from '../../utils/errorHandler';
import {
  logDriverLifecycleStateWrite,
  isBackwardLifecycleStageChange,
  lifecycleStageRank,
  isDriverLifecycleDiagnosticVerbose,
} from '../../utils/driverLifecycleDiagnostic';
import { shouldApplyAssignmentRow } from '../../lib/driverTripLifecycleMerge';
import { claimDriverTripIdempotency } from '../../lib/claimDriverTripIdempotency';
import { resolveNextDriverTrip, describeDriverTripCommit } from '../../lib/driverTripCommit';
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
import DriverIncentivesView from './DriverIncentivesView';
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
/** Last accepted/active trip — survives refresh if DB row is slow or status string differs (e.g. in_progress). */
const DRIVER_ACTIVE_TRIP_CACHE_PREFIX = 'pd_driver_active_trip_v2:';
/** Sticky local lifecycle lock so UI step progress does not roll back on transient sync jitter. */
const DRIVER_LIFECYCLE_LOCK_PREFIX = 'pd_driver_lifecycle_lock_v2:';

const DRIVER_TEST_TRIP_MARKER = '[TEST_TRIP]';
const ACTIVE_DRIVER_ASSIGNMENT_STATUSES = ['accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip'];
const CLAIMED_ASSIGNMENT_STATUSES = [...ACTIVE_DRIVER_ASSIGNMENT_STATUSES, 'completed', 'no_show'];
const ACCEPTABLE_ASSIGNMENT_STATUSES = ['pending', 'assigned', 'accepted'];
const OFFER_ASSIGNMENT_STATUSES = ['pending', 'assigned'];
const RESUMABLE_ASSIGNMENT_STATUSES = [...ACTIVE_DRIVER_ASSIGNMENT_STATUSES, ...OFFER_ASSIGNMENT_STATUSES];

function driverSessionOriginTag() {
  if (typeof window === 'undefined') return 'ssr';
  try {
    return String(window.location.origin || 'null').replace(/[^a-z0-9]+/gi, '_').slice(0, 96) || 'host';
  } catch {
    return 'unknown';
  }
}

function isStySentryTripId(tripId) {
  const value = String(tripId || '').trim();
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (normalized === 'null' || normalized === 'undefined') return false;
  // Historically this gate only allowed STY-* sandbox ids; keep the helper name
  // for compatibility, but accept any valid trip id so assigned trips never hide.
  return true;
}

/** Trip assignments eligible for rider no-show (driver arrived at PU). */
const NO_SHOW_FROM_ASSIGNMENT_STATUSES = ['accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip'];

function driverActiveTripCacheKey(driverId) {
  return `${DRIVER_ACTIVE_TRIP_CACHE_PREFIX}${driverSessionOriginTag()}:${driverId}`;
}

function driverLifecycleLockKey(driverId) {
  return `${DRIVER_LIFECYCLE_LOCK_PREFIX}${driverSessionOriginTag()}:${driverId}`;
}

function normalizeUiTripId(value) {
  return String(value || '').trim();
}

function applyTripAssignmentTarget(query, trip = {}, fallbackDriverId = null) {
  const assignmentRowId = trip?.assignmentRowId || null;
  const assignmentDriverId = trip?.assignmentDriverId || fallbackDriverId || null;

  if (assignmentRowId) {
    return query.eq('id', assignmentRowId);
  }

  let scoped = query.eq('trip_id', String(trip?.tripId || trip?.trip_id || '').trim());
  if (assignmentDriverId) {
    scoped = scoped.eq('driver_id', assignmentDriverId);
  }
  return scoped;
}

function persistDriverActiveTripSnapshot(driverId, trip) {
  if (!driverId || !trip?.tripId || !isStySentryTripId(trip.tripId)) return;
  try {
    localStorage.setItem(
      driverActiveTripCacheKey(driverId),
      JSON.stringify({
        driverId: String(driverId),
        tripId: String(trip.tripId),
        acceptedAt: trip.acceptedAt || null,
        arrivedAt: trip.arrivedAt || null,
        pickedUpAt: trip.pickedUpAt || null,
        enRouteAt: trip.enRouteAt || null,
        lastModifiedAt: trip.lastModifiedAt || '',
        puAddress: trip.puAddress || trip.pu_address || '',
        doAddress: trip.doAddress || trip.do_address || '',
        puTime: trip.puTime || trip.scheduled_pick_up_timestamp || '',
        mileage: trip.mileage,
        deliveryPrice: trip.deliveryPrice ?? null,
        riderKey: trip.riderKey || null,
        assignmentRowId: trip.assignmentRowId || null,
        assignmentDriverId: trip.assignmentDriverId || null,
        isTestTrip: Boolean(trip.isTestTrip),
        savedAt: Date.now(),
      })
    );
  } catch {}
}

function readDriverActiveTripSnapshot(driverId) {
  if (!driverId) return null;
  try {
    const raw = localStorage.getItem(driverActiveTripCacheKey(driverId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function clearDriverActiveTripSnapshot(driverId) {
  if (!driverId) return;
  try {
    localStorage.removeItem(driverActiveTripCacheKey(driverId));
    localStorage.removeItem(driverLifecycleLockKey(driverId));
  } catch {}
}

function readDriverLifecycleLock(driverId) {
  if (!driverId) return null;
  try {
    const raw = localStorage.getItem(driverLifecycleLockKey(driverId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function persistDriverLifecycleLock(driverId, lock) {
  if (!driverId || !lock?.tripId) return;
  try {
    localStorage.setItem(
      driverLifecycleLockKey(driverId),
      JSON.stringify({
        tripId: normalizeUiTripId(lock.tripId),
        accepted: Boolean(lock.accepted),
        enRoute: Boolean(lock.enRoute),
        arrived: Boolean(lock.arrived),
        pickedUp: Boolean(lock.pickedUp),
        savedAt: Date.now(),
      })
    );
  } catch {}
}

function clearDriverLifecycleLock(driverId) {
  if (!driverId) return;
  try {
    localStorage.removeItem(driverLifecycleLockKey(driverId));
  } catch {}
}

function isLocalOnlyTestTripId(tripId) {
  return String(tripId || '').startsWith('LOCAL-TEST-');
}

function shouldSkipUpstreamSentryForDriverTestTrip(trip) {
  // Only true local-only synthetic ids should bypass Sentry sync.
  // `[TEST_TRIP]` marker is for UI/testing context and must still sync upstream.
  return isLocalOnlyTestTripId(trip?.tripId || trip?.trip_id);
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
  if (normalized === 'picked_up' || normalized === 'on_trip') return 'to_dropoff';
  if (['accepted', 'arrived', 'in_progress'].includes(normalized)) return 'navigation';
  return 'new_trip';
}

function deriveLifecycleStatusFromAssignmentRow(row = {}) {
  const normalized = String(row?.status || '').toLowerCase();
  if (normalized === 'picked_up' || row?.actual_pickup_time) return 'picked_up';
  if (normalized === 'arrived') return 'arrived';
  if (normalized === 'accepted' || row?.accepted_at) return 'accepted';
  // Dispatch / admin often store active legs as in_progress while driver is en route or on trip.
  if (normalized === 'in_progress' || normalized === 'on_trip') return 'accepted';
  return normalized;
}

function deriveLifecycleStatusFromMarketplaceRow(row = {}) {
  const normalized = String(row?.status || row?.external_trip_status || '').toLowerCase().trim();
  const raw = asJsonObject(row?.raw_payload);
  const nestedTrip = asJsonObject(raw.trip);
  const acceptanceId = Number(
    row?.acceptance_status_id ??
    raw?.acceptance_status_id ??
    nestedTrip?.acceptance_status_id
  );
  const tpNotAccepted = Number.isFinite(acceptanceId) && acceptanceId === 0;
  const statusId = Number(
    row?.status_id ??
    row?.trip_status_id ??
    row?.trip_processing_status_id ??
    raw?.status_id ??
    raw?.trip_status_id ??
    raw?.trip_processing_status_id ??
    nestedTrip?.status_id ??
    nestedTrip?.trip_status_id
  );

  // Prefer numeric Sentry lifecycle over stale marketplace_trips.status (e.g. still "available" after webhook lag).
  if (statusId === 5 || ['picked_up', 'picked-up', 'passenger_picked_up'].includes(normalized)) return 'picked_up';
  if (statusId === 4 || ['arrived', 'arrived_at_pickup'].includes(normalized)) return 'arrived';
  if (
    !tpNotAccepted &&
    (statusId === 3 ||
      statusId === 2 ||
      ['accepted', 'assigned', 'in_progress', 'in progress', 'en_route', 'en route'].includes(normalized))
  ) {
    return 'accepted';
  }
  if (['on_trip'].includes(normalized)) return 'on_trip';
  if (['completed', 'complete', 'done', 'closed'].includes(normalized)) return 'completed';
  if (['cancelled', 'canceled', 'no_show', 'rejected'].includes(normalized)) return 'cancelled';
  return normalized;
}

function resolveDriverLifecycleStatus(assignmentRow = {}, marketplaceRow = {}) {
  const assignmentStatus = deriveLifecycleStatusFromAssignmentRow(assignmentRow);
  const marketplaceStatus = deriveLifecycleStatusFromMarketplaceRow(marketplaceRow);
  const rank = {
    pending: 0,
    assigned: 1,
    accepted: 2,
    in_progress: 3,
    arrived: 3,
    on_trip: 4,
    picked_up: 4,
    completed: 5,
    cancelled: 5,
  };
  return (rank[marketplaceStatus] ?? 0) > (rank[assignmentStatus] ?? 0)
    ? marketplaceStatus
    : assignmentStatus;
}

function marketplaceClaimOwner(row = {}, driverId) {
  const takenBy = row?.taken_by;
  if (takenBy == null || takenBy === '') return 'unclaimed';
  return String(takenBy) === String(driverId || '') ? 'mine' : 'other';
}

function resolveDriverLifecycleStatusForDriver(assignmentRow = {}, marketplaceRow = {}, driverId) {
  const merged = resolveDriverLifecycleStatus(assignmentRow, marketplaceRow);
  const claimOwner = marketplaceClaimOwner(marketplaceRow, driverId);

  // If marketplace already says this driver owns the trip, do not reopen it as a fresh offer.
  if (claimOwner === 'mine' && ['pending', 'assigned', 'available', ''].includes(String(merged || '').toLowerCase())) {
    return 'accepted';
  }

  return merged;
}

/** Supabase json/jsonb may return object or serialized string — normalize for safe reads. */
function asJsonObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Prefer Sentry timestamps embedded on marketplace_trips.raw_payload when trip_assignments lags. */
function extractMarketplaceLifecycleTimestamps(mtRow = {}) {
  const raw = asJsonObject(mtRow.raw_payload);
  const pick = value => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  };
  return {
    acceptedAt: pick(raw.accepted_at || raw.acceptedAt),
    enRouteAt: pick(raw.en_route_at || raw.enRouteAt || raw.assigned_at),
    arrivedAt: pick(raw.pick_up_arrival_timestamp || raw.pickUpArrivalTimestamp),
    pickedUpAt: pick(raw.pick_up_timestamp || raw.pickUpTimestamp),
  };
}

function hasMarketplaceEnRouteProgress(mtRow = {}) {
  const raw = asJsonObject(mtRow.raw_payload);
  const nestedTrip = asJsonObject(raw.trip);
  const statusId = Number(
    mtRow?.status_id ??
    mtRow?.trip_status_id ??
    mtRow?.trip_processing_status_id ??
    raw?.status_id ??
    raw?.trip_status_id ??
    raw?.trip_processing_status_id ??
    nestedTrip?.status_id ??
    nestedTrip?.trip_status_id
  );
  const normalized = String(mtRow?.status || mtRow?.external_trip_status || '').toLowerCase().trim();
  return statusId >= 3 || ['in_progress', 'in progress', 'en_route', 'en route', 'arrived', 'picked_up', 'on_trip'].includes(normalized);
}

function preserveTripProgressForSameTrip(existingTrip, nextTrip) {
  if (!existingTrip?.tripId || !nextTrip?.tripId) return nextTrip;
  if (String(existingTrip.tripId) !== String(nextTrip.tripId)) return nextTrip;
  return {
    ...nextTrip,
    acceptedAt: nextTrip.acceptedAt || existingTrip.acceptedAt || null,
    enRouteAt: nextTrip.enRouteAt || existingTrip.enRouteAt || null,
    arrivedAt: nextTrip.arrivedAt || existingTrip.arrivedAt || null,
    pickedUpAt: nextTrip.pickedUpAt || existingTrip.pickedUpAt || null,
  };
}

function deriveLifecycleStatusFromTripSnapshot(trip = {}, fallback = 'assigned') {
  if (trip?.pickedUpAt) return 'picked_up';
  if (trip?.arrivedAt) return 'arrived';
  if (trip?.enRouteAt) return 'in_progress';
  if (trip?.acceptedAt) return 'accepted';
  return fallback;
}

function lifecycleStatusFromLock(lock = {}, tripId) {
  if (!tripId || normalizeUiTripId(lock?.tripId) !== normalizeUiTripId(tripId)) return '';
  if (lock?.pickedUp) return 'picked_up';
  if (lock?.arrived) return 'arrived';
  if (lock?.enRoute || lock?.accepted) return 'accepted';
  return '';
}

function deriveMtaFareInfo(row = {}) {
  const raw = asJsonObject(row.raw_payload);
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

function parseOfferSortTimestamp(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function deriveOfferCandidateSortTimestamp(row = {}) {
  return parseOfferSortTimestamp(
    row?.scheduled_pickup_time ||
    row?.scheduledPickupTime ||
    row?.pu_time ||
    row?.puTime ||
    row?.assigned_at ||
    row?.assignedAt ||
    null
  );
}

function sortDriverOfferCandidates(rows = []) {
  return [...rows].sort((a, b) => {
    const timeDiff = deriveOfferCandidateSortTimestamp(a) - deriveOfferCandidateSortTimestamp(b);
    if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff;
    return parseOfferSortTimestamp(a?.assigned_at || a?.assignedAt) - parseOfferSortTimestamp(b?.assigned_at || b?.assignedAt);
  });
}

function buildLifecycleRetryPayload(payload = {}) {
  const safe = payload && typeof payload === 'object' ? payload : {};
  const driver = safe.driver && typeof safe.driver === 'object' ? safe.driver : null;
  const vehicle = safe.vehicle && typeof safe.vehicle === 'object' ? safe.vehicle : null;
  const mta = safe.mta && typeof safe.mta === 'object' ? safe.mta : null;
  return Object.fromEntries(
    Object.entries({
      status_id: safe.status_id,
      last_modified_at: safe.last_modified_at,
      cancel_reason_id: safe.cancel_reason_id,
      cancel_note: safe.cancel_note,
      cancelled_at: safe.cancelled_at,
      assigned_at: safe.assigned_at,
      accepted_at: safe.accepted_at,
      pick_up_arrival_timestamp: safe.pick_up_arrival_timestamp,
      pick_up_timestamp: safe.pick_up_timestamp,
      drop_off_timestamp: safe.drop_off_timestamp,
      is_next_day: safe.is_next_day,
      next_day: safe.next_day,
      next_day_requested_at: safe.next_day_requested_at,
      driver: driver && Object.keys(driver).length ? driver : undefined,
      vehicle: vehicle && Object.keys(vehicle).length ? vehicle : undefined,
      mta: mta && Object.keys(mta).length ? mta : undefined,
    }).filter(([, value]) => value !== null && value !== undefined && value !== '')
  );
}

function buildStatus2RetryPayload(payload = {}) {
  const safe = payload && typeof payload === 'object' ? payload : {};
  const driver = safe.driver && typeof safe.driver === 'object' ? safe.driver : null;
  const vehicle = safe.vehicle && typeof safe.vehicle === 'object' ? safe.vehicle : null;
  return Object.fromEntries(
    Object.entries({
      status_id: safe.status_id,
      last_modified_at: safe.last_modified_at,
      driver: driver && Object.keys(driver).length ? driver : undefined,
      vehicle: vehicle && Object.keys(vehicle).length ? vehicle : undefined,
    }).filter(([, value]) => value !== null && value !== undefined && value !== '')
  );
}

function shouldDowngradeLifecycleFailure(statusId, result, trip = null) {
  const status = Number(result?.status || 0);
  const lifecycleId = Number(statusId || 0);
  const localTestTrip = shouldSkipUpstreamSentryForDriverTestTrip(trip || {});

  // Never mask acceptance / en-route failures: Sentry proof depends on these.
  if ([2, 3].includes(lifecycleId)) return false;

  // Only tolerate known sandbox noise on local test trips.
  if (localTestTrip && status === 422) return true;
  // Completion/no-show can race with broker closure on local sandbox rows.
  if (localTestTrip && status === 404 && [6, 7, 8].includes(lifecycleId)) return true;
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
  const [currentTrip, setTripStateInternal] = useState(null);
  /** Single entry for all driver trip object mutations (Phase 1 state layer). */
  const commitDriverTrip = useCallback((update, meta = {}) => {
    setTripStateInternal(prev => {
      const next = resolveNextDriverTrip(prev, update);
      if (isDriverLifecycleDiagnosticVerbose() && meta?.source) {
        try {
          // eslint-disable-next-line no-console
          console.info('[driverTripCommit]', JSON.stringify(describeDriverTripCommit(prev, next, meta)));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, []);
  const [acceptingTrip, setAcceptingTrip] = useState(false);
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
  const [showIncentives, setShowIncentives] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showZonePreferences, setShowZonePreferences] = useState(false);
  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneSavedMessage, setZoneSavedMessage] = useState('');
  const [driverInstruction, setDriverInstruction] = useState(null);
  const [statusDockDismissed, setStatusDockDismissed] = useState(false);
  const [testChecklistDismissed, setTestChecklistDismissed] = useState(false);
  const [lifecycleUiLock, setLifecycleUiLock] = useState({
    tripId: null,
    accepted: false,
    enRoute: false,
    arrived: false,
    pickedUp: false,
  });
  const [ridePreferences, setRidePreferences] = useState(DEFAULT_RIDE_PREFERENCES);
  const [driverWaitMins, setDriverWaitMins] = useState(5);
  const [waitRemaining, setWaitRemaining] = useState(null);
  const watchRef = useRef(null);
  const pollRef = useRef(null);
  const sheetStateRef = useRef(sheetState);
  const currentTripRef = useRef(currentTrip);
  const ensureSentryAcceptedSyncRef = useRef(null);
  const shiftStartRef = useRef(Date.now());
  const motivationTimerRef = useRef(null);
  const consecutiveTripsRef = useRef(0);
  const lastMotivationRef = useRef(0);
  const sosTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const countdownDeadlineRef = useRef({ tripId: null, deadlineMs: 0 });
  const pickupWaitRef = useRef(null);
  const locationRef = useRef(location);
  const incentiveSnapshotRef = useRef([]);
  /** Last committed driver lifecycle stage per trip (for staging monotonic diagnostics). */
  const lastCommittedLifecycleRef = useRef({ tripId: null, stage: '' });
  const assignmentRevisionByTripRef = useRef(new Map());
  const lastFetchSourceByTripRef = useRef(new Map());
  const [assignmentRealtimeEpoch, setAssignmentRealtimeEpoch] = useState(0);

  const closeDriverPanels = useCallback(() => {
    setShowMenu(false);
    setShowSchedule(false);
    setShowPaymentSetup(false);
    setShowGuide(false);
    setShowIncentives(false);
    setShowCommunity(false);
    setShowZonePreferences(false);
    setOnBreak(false);
  }, []);

  const openDriverPanel = useCallback((panel) => {
    setShowMenu(false);
    setShowSchedule(panel === 'schedule');
    setShowPaymentSetup(panel === 'payment');
    setShowGuide(panel === 'guide');
    setShowIncentives(panel === 'incentives');
    setShowCommunity(panel === 'community');
    setShowZonePreferences(panel === 'zones');
    setOnBreak(panel === 'break');
  }, []);

  useEffect(() => { sheetStateRef.current = sheetState; }, [sheetState]);
  useEffect(() => { currentTripRef.current = currentTrip; }, [currentTrip]);

  useEffect(() => {
    function onOutboundResumed() {
      const trip = currentTripRef.current;
      const id = String(trip?.tripId || '').trim();
      if (!id) return;
      if (shouldSkipUpstreamSentryForDriverTestTrip(trip)) return;
      const fn = ensureSentryAcceptedSyncRef.current;
      if (typeof fn === 'function') {
        fn(trip, { source: 'outbound_resumed', throttleMs: 0, notifyOnFailure: true });
      }
    }
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('pd-sentry-outbound-resumed', onOutboundResumed);
    return () => window.removeEventListener('pd-sentry-outbound-resumed', onOutboundResumed);
  }, []);
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => {
    const tripId = normalizeUiTripId(currentTrip?.tripId);
    if (!tripId) {
      // Keep previous lock through short-lived null transitions; explicit terminal actions clear it.
      return;
    }
    setLifecycleUiLock(prev => {
      const persistedLock = readDriverLifecycleLock(driverData?.id);
      const prevId = normalizeUiTripId(prev.tripId);
      const persistedId = normalizeUiTripId(persistedLock?.tripId);
      if (prevId !== tripId) {
        const seed = persistedId === tripId ? persistedLock : null;
        return {
          tripId,
          accepted: Boolean(seed?.accepted || currentTrip?.acceptedAt),
          enRoute: Boolean(seed?.enRoute || currentTrip?.enRouteAt),
          arrived: Boolean(seed?.arrived || currentTrip?.arrivedAt),
          pickedUp: Boolean(seed?.pickedUp || currentTrip?.pickedUpAt),
        };
      }
      return {
        tripId,
        accepted: prev.accepted || Boolean(currentTrip?.acceptedAt),
        enRoute: prev.enRoute || Boolean(currentTrip?.enRouteAt),
        arrived: prev.arrived || Boolean(currentTrip?.arrivedAt),
        pickedUp: prev.pickedUp || Boolean(currentTrip?.pickedUpAt),
      };
    });
  }, [driverData?.id, currentTrip?.tripId, currentTrip?.acceptedAt, currentTrip?.enRouteAt, currentTrip?.arrivedAt, currentTrip?.pickedUpAt]);

  useEffect(() => {
    if (!driverData?.id || !lifecycleUiLock?.tripId) return;
    persistDriverLifecycleLock(driverData.id, lifecycleUiLock);
  }, [driverData?.id, lifecycleUiLock]);

  useEffect(() => {
    const lockTripId = normalizeUiTripId(lifecycleUiLock?.tripId);
    const currentTripId = normalizeUiTripId(currentTrip?.tripId);
    if (!lockTripId || !currentTripId || lockTripId !== currentTripId) return;
    if (!(lifecycleUiLock.accepted || lifecycleUiLock.arrived || lifecycleUiLock.pickedUp)) return;
    const forcedState = lifecycleUiLock.pickedUp ? 'to_dropoff' : 'navigation';
    if (sheetState !== forcedState) setSheetState(forcedState);
  }, [lifecycleUiLock, currentTrip?.tripId, sheetState]);

  useEffect(() => {
    setStatusDockDismissed(false);
  }, [sheetState]);

  useEffect(() => {
    setTestChecklistDismissed(false);
  }, [currentTrip?.tripId]);

  useEffect(() => {
    const driverId = driverRecord?.id || driverData?.id;
    if (!loggedIn || !driverId) return undefined;
    const channel = supabase
      .channel(`driver-trip-session-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_assignments',
          filter: `driver_id=eq.${driverId}`,
        },
        () => setAssignmentRealtimeEpoch(n => n + 1)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loggedIn, driverRecord?.id, driverData?.id]);

  useEffect(() => {
    if (!assignmentRealtimeEpoch || !loggedIn) return undefined;
    const driver = driverRecord || driverData;
    if (!driver?.id) return undefined;
    const t = setTimeout(() => {
      pollForNotifications(driver).catch(err => logFailure('DriverApp:assignment_realtime_poll', err));
    }, 400);
    return () => clearTimeout(t);
  }, [assignmentRealtimeEpoch, loggedIn, driverRecord?.id, driverData?.id]);

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
    await restoreActiveTripFromDb(loadedDriver?.id ? loadedDriver : { id: data.id, pay_rate_type: data.pay_rate_type || 'hourly' }, { openSheet: false });
    const onboardingSeen = localStorage.getItem(getDriverOnboardingKey(data.id));
    const onboardingComplete = Number(loadedDriver?.layer1_pct || data.layer1_pct || 0) >= 100;
    const isEmbeddedAdminPreview = role === 'admin' || data?.adminPreview;
    setShowOnboarding(!isEmbeddedAdminPreview && !onboardingSeen && !onboardingComplete);

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
    if (loggedIn) return;
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
    stopPickupWait();

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
      clearDriverLifecycleLock(driverData.id);
    }

    closeDriverPanels();
    setLifecycleUiLock({ tripId: null, accepted: false, enRoute: false, arrived: false, pickedUp: false });
    if (currentTripRef.current?.tripId) {
      telemetryLifecycleStage('DriverApp:end_shift_logout', currentTripRef.current.tripId, 'cancelled', {
        skipBackwardCheck: true,
        resetAfter: true,
        reason: 'driver_ended_shift_or_logged_out',
      });
    } else {
      lastCommittedLifecycleRef.current = { tripId: null, stage: '' };
    }
    commitDriverTrip(null, { source: 'end_shift_logout', reason: 'driver_ended_shift' });
    setSheetState('waiting');
    setGpsIssue('');
    try {
      localStorage.removeItem(DRIVER_EMBED_SESSION_KEY);
      localStorage.removeItem(DRIVER_LAST_SESSION_KEY);
      if (driverData?.id) clearDriverActiveTripSnapshot(driverData.id);
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

  function telemetryLifecycleStage(source, tripId, toStage, meta = {}) {
    const {
      revision = null,
      reason = '',
      proposedStage = null,
      decision = 'accepted',
      skipBackwardCheck = false,
      resetAfter = false,
    } = meta;
    const tid = normalizeUiTripId(tripId);
    const driverId = driverRecord?.id || driverData?.id || null;
    const prev = lastCommittedLifecycleRef.current;
    const fromStage =
      tid && prev.tripId && String(prev.tripId) === String(tid) ? prev.stage : '';
    const normalizedTo = String(toStage || '').toLowerCase();

    logDriverLifecycleStateWrite({
      source,
      driverId,
      tripId: tid,
      fromStage,
      toStage: normalizedTo,
      proposedStage: proposedStage != null ? String(proposedStage).toLowerCase() : null,
      revision,
      decision,
      reason,
      skipBackwardCheck,
    });

    if (resetAfter) {
      lastCommittedLifecycleRef.current = { tripId: null, stage: '' };
    } else if (!normalizedTo) {
      lastCommittedLifecycleRef.current = { tripId: null, stage: '' };
    } else if (tid) {
      lastCommittedLifecycleRef.current = { tripId: tid, stage: normalizedTo };
    }
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
    const lockTripId = normalizeUiTripId(lifecycleUiLock?.tripId);
    const lockHasActiveTrip = Boolean(
      lockTripId &&
      (lifecycleUiLock?.accepted || lifecycleUiLock?.arrived || lifecycleUiLock?.pickedUp)
    );
    if (lockHasActiveTrip) {
      const forcedState = lifecycleUiLock?.pickedUp ? 'to_dropoff' : 'navigation';
      if (sheetStateRef.current !== forcedState) {
        setSheetState(forcedState);
      }
    }
    let surfacedTripFromFirebase = false;
    const result = await fbGet(`driver_notifications/${driver.id}`);
    if (!lockHasActiveTrip && result.ok && result.data) {
      const notif = result.data;
      if (notif.type === 'daily_schedule') {
        setShowSchedule(true);
      } else if (notif.tripId && sheetStateRef.current === 'waiting') {
        if (!isStySentryTripId(notif.tripId)) {
          await fbSet(`driver_notifications/${driver.id}`, null);
          return;
        }
        const { data: taNotifGate } = await supabase
          .from('trip_assignments')
          .select('status')
          .eq('trip_id', String(notif.tripId))
          .eq('driver_id', driver.id)
          .maybeSingle();
        const notifGateStatus = String(taNotifGate?.status || '').toLowerCase();
        if (['completed', 'cancelled', 'rejected', 'no_show'].includes(notifGateStatus)) {
          await fbSet(`driver_notifications/${driver.id}`, null);
        } else {
          const { data: mtRow } = await supabase
            .from('marketplace_trips')
            .select('status, taken_by, sentry_last_modified_at, raw_payload, assignment_type_code, external_trip_status')
            .eq('sentry_trip_id', String(notif.tripId))
            .maybeSingle();
          const notifClaimOwner = marketplaceClaimOwner(mtRow || {}, driver.id);
          if (notifClaimOwner === 'other') {
            await supabase
              .from('trip_assignments')
              .update({
                status: 'rejected',
                trip_processing_status_id: 2,
                rejected_at: new Date().toISOString(),
              })
              .eq('trip_id', String(notif.tripId))
              .eq('driver_id', driver.id)
              .in('status', ['pending', 'assigned']);
            await fbSet(`driver_notifications/${driver.id}`, null);
            return;
          }
          let normalizedNotifStatus = resolveDriverLifecycleStatusForDriver({ status: 'pending' }, mtRow || {}, driver.id);
          const lockStatus = lifecycleStatusFromLock(lifecycleUiLock, notif.tripId);
          if (lockStatus) normalizedNotifStatus = lockStatus;
          if (['completed', 'cancelled', 'rejected', 'no_show'].includes(normalizedNotifStatus)) {
            await fbSet(`driver_notifications/${driver.id}`, null);
            const currentTripId = String(currentTripRef.current?.tripId || '');
            if (currentTripId && currentTripId === String(notif.tripId || '')) {
              commitDriverTrip(null, { source: 'firebase_notification', reason: 'terminal_notification_cleared' });
              setSheetState('waiting');
            }
            return;
          }
          const tripPayload = { ...notif };
          if (!perTripPay) delete tripPayload.deliveryPrice;
          Object.assign(tripPayload, deriveMtaFareInfo(notif));
          tripPayload.assignmentRowId = tripPayload.assignmentRowId || tripPayload.assignment_id || null;
          tripPayload.assignmentDriverId = tripPayload.assignmentDriverId || tripPayload.driver_id || driver.id;
          const nMp = extractMarketplaceLifecycleTimestamps(mtRow || {});
          if (['accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip'].includes(normalizedNotifStatus)) {
            tripPayload.acceptedAt = tripPayload.acceptedAt || nMp.acceptedAt || new Date().toISOString();
          }
          if (['arrived', 'picked_up', 'on_trip'].includes(normalizedNotifStatus)) {
            tripPayload.arrivedAt = tripPayload.arrivedAt || nMp.arrivedAt || tripPayload.acceptedAt || new Date().toISOString();
          }
          if (['picked_up', 'on_trip'].includes(normalizedNotifStatus)) {
            tripPayload.pickedUpAt = tripPayload.pickedUpAt || nMp.pickedUpAt || tripPayload.arrivedAt || tripPayload.acceptedAt || new Date().toISOString();
          }
          telemetryLifecycleStage('DriverApp:poll_firebase_notification', notif.tripId, normalizedNotifStatus, {
            revision: mtRow?.sentry_last_modified_at ?? null,
            reason: 'firebase_driver_notification',
          });
          commitDriverTrip(tripPayload, { source: 'firebase_notification', reason: 'driver_notification_trip' });
          setSheetState(deriveSheetStateFromAssignmentStatus(normalizedNotifStatus));
          if (normalizedNotifStatus === 'pending' || normalizedNotifStatus === 'assigned') {
            startTripCountdown(15, {
              tripId: tripPayload.tripId || notif.tripId || null,
              baseMs: notif.assignedAt || notif.assigned_at || Date.now(),
            });
          } else if (driver?.id && tripPayload?.tripId) {
            persistDriverActiveTripSnapshot(driver.id, tripPayload);
          }
          if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
          surfacedTripFromFirebase = true;
        }
      }
    }

    if (!lockHasActiveTrip && !surfacedTripFromFirebase && ['waiting', 'suggestions'].includes(sheetStateRef.current) && driver?.id) {
      let candidateRows = [];
      let pendingErr = null;
      try {
        const { data: pack, error: peekErr } = await supabase.rpc('peek_driver_trip_offer', { p_driver_id: driver.id });
        if (peekErr) {
          logFailure('DriverApp:pollForNotifications:peek_driver_trip_offer', peekErr);
        } else if (pack && typeof pack === 'object' && pack.assignment) {
          candidateRows = [
            {
              ...pack.assignment,
              _marketplaceRow:
                pack.marketplace && typeof pack.marketplace === 'object' && Object.keys(pack.marketplace).length
                  ? pack.marketplace
                  : null,
            },
          ];
        }
      } catch (e) {
        logFailure('DriverApp:pollForNotifications:peek_driver_trip_offer', e);
      }

      if (!candidateRows.length) {
        const pr = await supabase
          .from('trip_assignments')
          .select(
            'id, trip_id, driver_id, pu_address, do_address, pu_time, scheduled_pickup_time, delivery_price, mileage, notes, assigned_at, status, accepted_at, actual_pickup_time, lifecycle_revision'
          )
          .eq('driver_id', driver.id)
          .in('status', OFFER_ASSIGNMENT_STATUSES)
          .order('scheduled_pickup_time', { ascending: true, nullsFirst: false })
          .order('assigned_at', { ascending: true, nullsFirst: false })
          .limit(10);
        pendingErr = pr.error;
        candidateRows = sortDriverOfferCandidates(pr.data || []);
      }

      if (pendingErr) {
        logFailure('DriverApp:pollForNotifications:pending_assignment', pendingErr);
      } else if (!candidateRows.length) {
        // no-op: no pending/assigned offers to surface
      } else {
        let shouldRestoreActiveTrip = false;

        for (const candidateRow of sortDriverOfferCandidates(candidateRows)) {
          const pendingRow = candidateRow;
          let mtRow =
            candidateRow?._marketplaceRow && typeof candidateRow._marketplaceRow === 'object'
              ? candidateRow._marketplaceRow
              : null;

          if (!pendingRow?.trip_id) continue;
          if (!isStySentryTripId(pendingRow.trip_id)) continue;

          if (!mtRow || !Object.keys(mtRow).length) {
            const { data: mtFetched } = await supabase
              .from('marketplace_trips')
              .select('status, taken_by, sentry_last_modified_at, raw_payload, assignment_type_code, external_trip_status')
              .eq('sentry_trip_id', String(pendingRow.trip_id))
              .maybeSingle();
            mtRow = mtFetched || {};
          }

          const rawMerged = resolveDriverLifecycleStatusForDriver(pendingRow, mtRow || {}, driver.id);
          let mergedLifecycle = rawMerged;
          const lockStatus = lifecycleStatusFromLock(lifecycleUiLock, pendingRow.trip_id);
          if (lockStatus) mergedLifecycle = lockStatus;
          const tidPoll = normalizeUiTripId(pendingRow.trip_id);
          const prevPoll = lastCommittedLifecycleRef.current;
          const fromPoll =
            tidPoll && prevPoll.tripId && String(prevPoll.tripId) === String(tidPoll) ? prevPoll.stage : '';
          let pollDecision = 'accepted';
          let pollReason = 'poll_pending_assignment';
          let pollProposed = null;
          if (
            lockStatus &&
            isBackwardLifecycleStageChange(fromPoll, rawMerged) &&
            lifecycleStageRank(String(mergedLifecycle).toLowerCase()) >
              lifecycleStageRank(String(rawMerged).toLowerCase())
          ) {
            pollDecision = 'rejected';
            pollProposed = rawMerged;
            pollReason = 'lifecycle_ui_lock_blocked_backward_incoming';
          }
          const tripKeyPoll = String(pendingRow.trip_id || '');
          let skipStaleOffer = false;
          if (tripKeyPoll && Number(pendingRow?.lifecycle_revision ?? 0) > 0) {
            const lastRev = assignmentRevisionByTripRef.current.get(tripKeyPoll) ?? 0;
            const lastSrc = lastFetchSourceByTripRef.current.get(tripKeyPoll) || 'polling';
            const gate = shouldApplyAssignmentRow({
              incomingRevision: pendingRow.lifecycle_revision,
              lastAppliedRevision: lastRev,
              source: 'polling',
              lastSource: lastSrc,
            });
            if (!gate.apply) skipStaleOffer = true;
          }
          telemetryLifecycleStage('DriverApp:poll_pending_assignment', pendingRow.trip_id, mergedLifecycle, {
            revision: mtRow?.sentry_last_modified_at ?? null,
            reason: pollReason,
            proposedStage: pollProposed,
            decision: pollDecision,
          });

          if (!['pending', 'assigned'].includes(mergedLifecycle)) {
            shouldRestoreActiveTrip = true;
            continue;
          }

          const { data: claimedRows } = await supabase
            .from('trip_assignments')
            .select('driver_id, status')
            .eq('trip_id', pendingRow.trip_id)
            .in('status', ACTIVE_DRIVER_ASSIGNMENT_STATUSES);
          const claimedByAnotherDriver = (claimedRows || []).some(row => String(row.driver_id || '') !== String(driver.id || ''));
          const marketplaceStatus = String(mtRow?.status || '').toLowerCase();
          const marketplaceExternalStatus = String(mtRow?.external_trip_status || '').toLowerCase();
          const marketplaceTakenByAnotherDriver =
            mtRow?.taken_by != null &&
            mtRow?.taken_by !== '' &&
            String(mtRow.taken_by) !== String(driver.id || '');
          const marketplaceClosed =
            ['cancelled', 'completed'].includes(marketplaceStatus) ||
            ['cancelled', 'canceled', 'completed', 'complete', 'done', 'closed', 'no_show', 'rejected'].includes(marketplaceExternalStatus);
          const marketplaceOfferStillValid =
            !mtRow ||
            (
              ['available', 'assigned', ''].includes(marketplaceStatus) &&
              !['accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip', 'completed', 'complete', 'done', 'closed', 'cancelled', 'canceled', 'no_show', 'rejected'].includes(marketplaceExternalStatus)
            );

          if (claimedByAnotherDriver || marketplaceTakenByAnotherDriver || marketplaceClosed || !marketplaceOfferStillValid) {
            await supabase
              .from('trip_assignments')
              .update({
                status: 'rejected',
                trip_processing_status_id: 2,
                rejected_at: new Date().toISOString(),
              })
              .eq('trip_id', pendingRow.trip_id)
              .eq('driver_id', driver.id)
              .in('status', ['pending', 'assigned']);
            await fbSet(`driver_notifications/${driver.id}`, null);
            continue;
          }

          const parsedNotes = parseTripAssignmentNotesForOffer(pendingRow.notes);
          const mpTs = extractMarketplaceLifecycleTimestamps(mtRow || {});
          const hasEnRouteProgress =
            hasMarketplaceEnRouteProgress(mtRow || {}) ||
            String(pendingRow?.status || '').toLowerCase() === 'in_progress';
          const existingTrip = currentTripRef.current;
          const sameTrip = String(existingTrip?.tripId || '') === String(pendingRow.trip_id || '');
          const preservedEnRouteAt = sameTrip ? (existingTrip?.enRouteAt || null) : null;
          const offer = {
            type: 'new_trip',
            tripId: pendingRow.trip_id,
            assignmentRowId: pendingRow.id || null,
            assignmentDriverId: pendingRow.driver_id || driver.id,
            lastModifiedAt: mtRow?.sentry_last_modified_at || '',
            puAddress: pendingRow.pu_address || '',
            doAddress: pendingRow.do_address || '',
            puTime: pendingRow.scheduled_pickup_time || pendingRow.pu_time || '',
            ...(perTripPay ? { deliveryPrice: pendingRow.delivery_price } : {}),
            mileage: pendingRow.mileage,
            assignedAt: Date.now(),
            acceptedAt: ['accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip'].includes(mergedLifecycle)
              ? (mpTs.acceptedAt || pendingRow.accepted_at || pendingRow.assigned_at || new Date().toISOString())
              : null,
            enRouteAt: preservedEnRouteAt || (hasEnRouteProgress
              ? (mpTs.enRouteAt || mpTs.acceptedAt || pendingRow.accepted_at || pendingRow.assigned_at || new Date().toISOString())
              : null),
            arrivedAt: ['arrived', 'picked_up', 'on_trip'].includes(mergedLifecycle)
              ? (mpTs.arrivedAt || pendingRow.actual_pickup_time || pendingRow.accepted_at || pendingRow.assigned_at || new Date().toISOString())
              : null,
            pickedUpAt: ['picked_up', 'on_trip'].includes(mergedLifecycle)
              ? (mpTs.pickedUpAt || pendingRow.actual_pickup_time || pendingRow.accepted_at || pendingRow.assigned_at || new Date().toISOString())
              : null,
            testingNote: parsedNotes.testingNote,
            isTestTrip: parsedNotes.isTestTrip,
            ...deriveMtaFareInfo(mtRow || {}),
          };
          const mergedOffer = preserveTripProgressForSameTrip(existingTrip, offer);
          const mergedOfferLifecycle = deriveLifecycleStatusFromTripSnapshot(mergedOffer, mergedLifecycle);
          if (skipStaleOffer) {
            continue;
          }

          commitDriverTrip(mergedOffer, { source: 'poll_pending', reason: 'peek_or_pending_assignment_offer' });
          setSheetState(deriveSheetStateFromAssignmentStatus(mergedOfferLifecycle));
          if (mergedOfferLifecycle === 'pending' || mergedOfferLifecycle === 'assigned') {
            startTripCountdown(15, {
              tripId: mergedOffer.tripId || pendingRow.trip_id || null,
              baseMs: Date.now(),
            });
          } else {
            persistDriverActiveTripSnapshot(driver.id, mergedOffer);
          }
          if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
          assignmentRevisionByTripRef.current.set(
            tripKeyPoll,
            Math.max(
              Number(pendingRow.lifecycle_revision ?? 0),
              assignmentRevisionByTripRef.current.get(tripKeyPoll) ?? 0
            )
          );
          lastFetchSourceByTripRef.current.set(tripKeyPoll, 'polling');
          shouldRestoreActiveTrip = false;
          break;
        }

        if (shouldRestoreActiveTrip) {
          await restoreActiveTripFromDb(driver, { openSheet: !surfacedTripFromFirebase });
        }
      }
    }

    const liveTrip = currentTripRef.current;
    if (driver?.id && (!liveTrip?.tripId || ['waiting', 'suggestions'].includes(sheetStateRef.current))) {
      const shouldOpenSheet = !liveTrip?.tripId;
      await restoreActiveTripFromDb(driver, { openSheet: shouldOpenSheet });
    }

    // Auto-heal acceptance sync so accepted Sentry trips keep status_id=2 upstream.
    const latestTrip = currentTripRef.current;
    if (
      driver?.id &&
      latestTrip?.tripId &&
      (latestTrip?.acceptedAt || latestTrip?.arrivedAt) &&
      !latestTrip?.pickedUpAt
    ) {
      await ensureSentryAcceptedSync(latestTrip, {
        acceptedAt: latestTrip.acceptedAt || new Date().toISOString(),
        source: 'poll_retry',
        throttleMs: 45000,
        notifyOnFailure: false,
      });
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

  function startTripCountdown(seconds, options = {}) {
    const tripId = options.tripId || currentTripRef.current?.tripId || null;
    const now = Date.now();
    const baseMsRaw = options.baseMs;
    const baseMs = Number.isFinite(Number(baseMsRaw))
      ? Number(baseMsRaw)
      : (baseMsRaw ? new Date(baseMsRaw).getTime() : now);
    const proposedDeadlineMs = (Number.isFinite(baseMs) ? baseMs : now) + Math.max(1, Number(seconds || 0)) * 1000;
    const sameTrip = Boolean(tripId) && String(countdownDeadlineRef.current.tripId || '') === String(tripId || '');
    const existingDeadlineMs = sameTrip ? Number(countdownDeadlineRef.current.deadlineMs || 0) : 0;
    const effectiveDeadlineMs =
      existingDeadlineMs > now ? existingDeadlineMs : proposedDeadlineMs;

    countdownDeadlineRef.current = { tripId: tripId || null, deadlineMs: effectiveDeadlineMs };

    if (countdownRef.current) clearInterval(countdownRef.current);

    const updateCountdown = () => {
      const remainingMs = effectiveDeadlineMs - Date.now();
      const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        countdownDeadlineRef.current = { tripId: null, deadlineMs: 0 };
        setCountdown(null);
        if (sheetStateRef.current === 'new_trip') {
          (async () => {
            const tripIdInner = currentTripRef.current?.tripId || null;
            const driverId = driverRecord?.id || driverData?.id || null;
            if (!tripIdInner || !driverId) return;
            const [{ data: row }, { data: mtRow }] = await Promise.all([
              supabase
                .from('trip_assignments')
                .select('status, accepted_at, actual_pickup_time, assigned_at')
                .eq('trip_id', tripIdInner)
                .eq('driver_id', driverId)
                .maybeSingle(),
              supabase
                .from('marketplace_trips')
                .select('status, external_trip_status, raw_payload')
                .eq('sentry_trip_id', String(tripIdInner))
                .maybeSingle(),
            ]);
            const merged = resolveDriverLifecycleStatus(row || {}, mtRow || {});
            if (['pending', 'assigned'].includes(merged) && String(row?.status || '').toLowerCase() === 'pending') {
              rejectTrip();
            }
          })();
        }
      }
    };

    updateCountdown();
    countdownRef.current = setInterval(() => {
      updateCountdown();
    }, 1000);
  }

  function stopCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    countdownDeadlineRef.current = { tripId: null, deadlineMs: 0 };
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

  useEffect(() => {
    const tid = normalizeUiTripId(currentTrip?.tripId);
    if (!tid) stopPickupWait();
  }, [currentTrip?.tripId]);

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
    const locationPayload = Object.fromEntries(
      Object.entries({
        lat: coords?.lat || driverRecord?.current_lat,
        lng: coords?.lng || driverRecord?.current_lng,
        address: buildAddress || undefined,
        timestamp: locationTimestamp,
      }).filter(([, value]) => value !== null && value !== undefined && value !== '')
    );
    if (Object.keys(locationPayload).length > 1) {
      vehicle.location = locationPayload;
    }

    const payload = {
      status_id: statusId,
      last_modified_at: extra.last_modified_at || currentTrip?.lastModifiedAt || locationTimestamp,
      ...(Object.keys(driver).length ? { driver } : {}),
      ...(Object.keys(vehicle).length ? { vehicle } : {}),
      ...extra,
    };

    const explicitFare =
      extra?.mta?.collected_fare ??
      extra?.collected_fare ??
      null;
    if ([5, 6].includes(Number(statusId)) && explicitFare !== null && explicitFare !== undefined && explicitFare !== '') {
      payload.mta = {
        ...(payload.mta && typeof payload.mta === 'object' ? payload.mta : {}),
        collected_fare: Number(explicitFare),
      };
    }

    delete payload.is_done_by_not_integrated_provider;
    delete payload.is_confirmed;
    delete payload.collected_fare;
    delete payload.collected_fare_amount;

    return payload;
  }

  async function sendSentryLifecycleStatus(tripId, statusId, extra = {}) {
    if (!tripId || !sentryApi.enabled) return { skipped: true };
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
      const retryPayload = Number(statusId) === 2
        ? buildStatus2RetryPayload(payload)
        : buildLifecycleRetryPayload(payload);
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

    const downgradedFailure = !sentryResult.ok && shouldDowngradeLifecycleFailure(statusId, sentryResult, {
      ...currentTrip,
      tripId,
    });
    const effectiveResult = downgradedFailure
      ? {
          ...sentryResult,
          ok: true,
          downgraded: true,
          skipped: false,
          error: sentryResult.error || `HTTP ${sentryResult.status}`,
        }
      : sentryResult;

    const outboundPausedLog = sentryResult?.data?.reason === 'sandbox_outbound_paused';
    await supabase.from('sentry_sync_log').insert({
      sync_type: `trip_status_${statusId}`,
      direction: 'export',
      record_type: 'trip',
      external_id: String(tripId),
      status: outboundPausedLog ? 'skipped' : (effectiveResult.ok ? 'success' : 'failed'),
      error_message: outboundPausedLog
        ? 'sandbox_outbound_paused — turn off in Admin → Sentry'
        : (effectiveResult.ok
          ? (effectiveResult.downgraded ? `Downgraded upstream lifecycle warning: ${effectiveResult.error}` : '')
          : (effectiveResult.error || `HTTP ${effectiveResult.status}`)),
      payload: {
        ...payload,
        retry_minimal_payload: retryUsed,
        downgraded_warning: Boolean(effectiveResult.downgraded),
      },
    });

    if (!effectiveResult.ok && !outboundPausedLog) {
      logFailure(`DriverApp:tripStatus:${statusId}`, { status: effectiveResult.status, error: effectiveResult.error });
    }

    if (outboundPausedLog) {
      return { ...effectiveResult, ok: false, skipped: true, outboundPaused: true };
    }

    return effectiveResult;
  }

  async function ensureSentryAcceptedSync(
    trip,
    { acceptedAt = null, source = 'unknown', throttleMs = 0, notifyOnFailure = true } = {}
  ) {
    const tripId = String(trip?.tripId || trip?.trip_id || '').trim();
    if (!tripId) return { skipped: true, reason: 'missing_trip_id' };
    if (shouldSkipUpstreamSentryForDriverTestTrip(trip)) return { skipped: true, reason: 'local_test_trip' };
    if (!sentryApi.enabled) return { skipped: true, reason: 'sentry_disabled' };

    ensureSentryAcceptedSync._state = ensureSentryAcceptedSync._state || {
      tripId: '',
      lastAttemptMs: 0,
      inFlight: false,
    };
    const retryState = ensureSentryAcceptedSync._state;
    const now = Date.now();
    if (retryState.inFlight && retryState.tripId === tripId) return { skipped: true, reason: 'in_flight' };
    if (throttleMs > 0 && retryState.tripId === tripId && now - retryState.lastAttemptMs < throttleMs) {
      return { skipped: true, reason: 'throttled' };
    }

    retryState.tripId = tripId;
    retryState.lastAttemptMs = now;
    retryState.inFlight = true;

    try {
      let acceptResult = await sentryApi.acceptTrip(tripId, {
        last_modified_at: trip?.lastModifiedAt || '',
        accepted_at: acceptedAt || trip?.acceptedAt || new Date().toISOString(),
      });
      const acceptOutboundPaused = acceptResult.data?.reason === 'sandbox_outbound_paused';
      await supabase.from('sentry_sync_log').insert({
        sync_type: source === 'driver_accept' ? 'trip_accept' : 'trip_accept_retry',
        direction: 'export',
        record_type: 'trip',
        external_id: String(tripId),
        status: acceptOutboundPaused ? 'skipped' : (acceptResult.ok ? 'success' : 'failed'),
        error_message: acceptOutboundPaused
          ? 'sandbox_outbound_paused — turn off in Admin → Sentry'
          : (acceptResult.ok ? '' : (acceptResult.error || `HTTP ${acceptResult.status}`)),
        payload: {
          driver_id: driverData?.id || null,
          source,
        },
      });

      const effectiveAcceptedAt = acceptedAt || trip?.acceptedAt || new Date().toISOString();
      const statusResult = await sendSentryLifecycleStatus(tripId, 2, {
        last_modified_at: effectiveAcceptedAt,
      });
      const statusOutboundPaused = statusResult.data?.reason === 'sandbox_outbound_paused';
      const blockedByOutboundPause = Boolean(acceptResult.data?.reason === 'sandbox_outbound_paused' || statusOutboundPaused);
      const syntheticOk = Boolean((acceptResult.ok || acceptResult.skipped) && (statusResult.ok || statusResult.skipped));
      const ok = !blockedByOutboundPause && syntheticOk;

      if (!ok && notifyOnFailure) {
        if (blockedByOutboundPause) {
          showToast('Sentry outbound is paused in Admin. Turn it off, then we will re-sync this trip to Sentry.');
        } else if (!acceptResult.ok) {
          showToast(`Trip accepted locally, but Sentry accept sync failed. ${acceptResult.error || `HTTP ${acceptResult.status}`}`);
        }
        if (!blockedByOutboundPause) {
          toastSentryLifecycleFailure('Trip accepted locally, but Sentry status update failed.', statusResult, {
            isTestTrip: Boolean(trip?.isTestTrip),
          });
        }
      }

      return { ok, acceptResult, statusResult };
    } finally {
      retryState.inFlight = false;
      retryState.lastAttemptMs = Date.now();
    }
  }

  ensureSentryAcceptedSyncRef.current = ensureSentryAcceptedSync;

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
    if (!currentTrip || acceptingTrip) return;
    setAcceptingTrip(true);
    stopCountdown();

    try {
      const acceptedAt = new Date().toISOString();
      const trackingUrl = buildRiderTrackingUrl(currentTrip?.riderKey);
      const thisDriverId = driverRecord?.id || driverData?.id;
      const tripId = String(currentTrip?.tripId || '').trim();

      if (!tripId || !thisDriverId) {
        showToast('Trip or driver session is missing. Refresh and try again.');
        return;
      }

      const acceptIdemKey = crypto.randomUUID();
      const acceptClaim = await claimDriverTripIdempotency(supabase, {
        driverId: thisDriverId,
        tripId,
        action: 'accept',
        idempotencyKey: acceptIdemKey,
      });
      if (!acceptClaim.ok) {
        logFailure('DriverApp:acceptTrip:idempotency', acceptClaim.error);
        showToast('Could not secure accept. Try again.');
        return;
      }
      if (!acceptClaim.firstClaim) {
        showToast('This accept is already being processed.');
        return;
      }

      const [
        { data: marketplaceRow, error: marketplaceError },
        { data: driverAssignment, error: driverAssignmentError },
        { data: claimedRows, error: claimedRowsError },
      ] = await Promise.all([
        supabase
          .from('marketplace_trips')
          .select('status, taken_by')
          .eq('sentry_trip_id', tripId)
          .maybeSingle(),
        applyTripAssignmentTarget(
          supabase
            .from('trip_assignments')
            .select('id, status, driver_id'),
          currentTrip,
          thisDriverId
        ).maybeSingle(),
        supabase
          .from('trip_assignments')
          .select('driver_id, status')
          .eq('trip_id', tripId)
          .in('status', ACTIVE_DRIVER_ASSIGNMENT_STATUSES),
      ]);

      if (!driverAssignmentError && driverAssignment?.id && !currentTrip?.assignmentRowId) {
        currentTrip.assignmentRowId = driverAssignment.id;
      }
      if (!driverAssignmentError && driverAssignment?.driver_id && !currentTrip?.assignmentDriverId) {
        currentTrip.assignmentDriverId = driverAssignment.driver_id;
      }

      if (marketplaceError) {
        logFailure('DriverApp:acceptTrip:marketplace_precheck', marketplaceError);
        showToast('Could not verify trip availability. Refresh and try again.');
        return;
      }
      if (driverAssignmentError) {
        logFailure('DriverApp:acceptTrip:driver_assignment_precheck', driverAssignmentError);
        showToast('Could not verify your assignment. Refresh and try again.');
        return;
      }
      if (claimedRowsError) {
        logFailure('DriverApp:acceptTrip:claimed_rows_precheck', claimedRowsError);
        showToast('Could not verify whether another driver already claimed this trip.');
        return;
      }

      const claimedByAnotherDriver = (claimedRows || []).some(
        row => String(row.driver_id || '') !== String(thisDriverId || '')
      );
      const takenByAnotherDriver =
        marketplaceRow?.taken_by != null &&
        marketplaceRow?.taken_by !== '' &&
        String(marketplaceRow.taken_by) !== String(thisDriverId || '');
      const normalizedAssignmentStatus = String(driverAssignment?.status || '').toLowerCase();
      const canUseAssignment =
        driverAssignment &&
        ACCEPTABLE_ASSIGNMENT_STATUSES.includes(normalizedAssignmentStatus);

      if (claimedByAnotherDriver || takenByAnotherDriver || !canUseAssignment) {
        await fbSet(`driver_notifications/${driverData.id}`, null);
        if (driverData?.id) clearDriverActiveTripSnapshot(driverData.id);
        telemetryLifecycleStage('DriverApp:accept_trip_lost_race', tripId, 'cancelled', {
          skipBackwardCheck: true,
          resetAfter: true,
          reason: 'another_driver_claimed_or_invalid_assignment',
        });
        commitDriverTrip(null, { source: 'accept_trip', reason: 'lost_race_or_invalid_assignment' });
        setSheetState('waiting');
        showToast(
          claimedByAnotherDriver || takenByAnotherDriver
            ? 'Trip is no longer available. Another driver already accepted it.'
            : 'That trip offer already closed. Looking for the next one.'
        );
        return;
      }

      let assignUpdate = supabase
        .from('trip_assignments')
        .update({ status: 'accepted', trip_processing_status_id: 2, accepted_at: acceptedAt });
      assignUpdate = applyTripAssignmentTarget(assignUpdate, currentTrip, thisDriverId)
        .in('status', ['pending', 'assigned', 'accepted']);
      const { error: assignRowError } = await assignUpdate;
      if (assignRowError) {
        logFailure('DriverApp:acceptTrip:trip_assignments', assignRowError);
        showToast('Could not accept trip right now. Refresh and try again.');
        return;
      }

      const { data: acceptedMarketplaceRow, error: marketplaceAcceptError } = await supabase
        .from('marketplace_trips')
        .update({
          status: 'accepted',
          external_trip_status: 'accepted',
          taken_by: thisDriverId || null,
        })
        .eq('sentry_trip_id', tripId)
        .in('status', ['available', 'assigned', 'accepted'])
        .or(`taken_by.is.null,taken_by.eq.${thisDriverId}`)
        .select('sentry_trip_id, taken_by, status')
        .maybeSingle();
      if (marketplaceAcceptError) {
        logFailure('DriverApp:acceptTrip:marketplace_trips', marketplaceAcceptError);
        showToast('Trip was accepted in your queue, but marketplace state could not be updated. Refresh and try again.');
        return;
      }
      if (!acceptedMarketplaceRow) {
        await fbSet(`driver_notifications/${driverData.id}`, null);
        if (driverData?.id) clearDriverActiveTripSnapshot(driverData.id);
        telemetryLifecycleStage('DriverApp:accept_trip_marketplace_unavailable', tripId, 'cancelled', {
          skipBackwardCheck: true,
          resetAfter: true,
          reason: 'marketplace_row_missing_after_accept',
        });
        commitDriverTrip(null, { source: 'accept_trip', reason: 'marketplace_unavailable_after_accept' });
        setSheetState('waiting');
        showToast('That trip offer already closed. Looking for the next one.');
        return;
      }

      const { data: pendingRows } = await supabase
        .from('trip_assignments')
        .select('driver_id')
        .eq('trip_id', tripId)
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
          .eq('trip_id', tripId)
          .in('driver_id', otherPendingDriverIds)
          .eq('status', 'pending');
        await Promise.all(
          otherPendingDriverIds.map(driverId => fbSet(`driver_notifications/${driverId}`, null).catch(() => {}))
        );
      }

      if (driverRecord?.id) {
        const { error: driverStatusError } = await supabase
          .from('drivers')
          .update({ status: 'on_trip' })
          .eq('id', driverRecord.id);
        if (driverStatusError) logFailure('DriverApp:acceptTrip:drivers', driverStatusError);
      }

      await fbSet(`trip_assignments/${tripId}`, { status: 'accepted', driverId: driverData.id, acceptedAt: Date.now() });
      await fbSet(`driver_notifications/${driverData.id}`, null);
      if (currentTrip?.riderKey) {
        await fbSet(`rider_tracking/${currentTrip.riderKey}`, {
          status: 'accepted',
          tripId,
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

      if (shouldSkipUpstreamSentryForDriverTestTrip(currentTrip)) {
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'trip_accept_local_test_skipped',
          direction: 'internal',
          record_type: 'trip',
          external_id: tripId,
          status: 'success',
          error_message: 'Driver test trip accepted in app; no upstream Sentry accept call needed.',
          payload: { driver_id: driverData.id, trip_processing_status_id: 2, is_test_trip: Boolean(currentTrip?.isTestTrip) },
        });
      } else {
        if (!sentryApi.enabled || (!sentryApi.features.tripAcceptReject && !sentryApi.features.tripStatusUpdate)) {
          showToast('Sentry accept/status sync is disabled. This trip cannot be accepted in live mode until Sentry sync is enabled.');
          return;
        }
        const sentryAcceptSync = await ensureSentryAcceptedSync(currentTrip, {
          acceptedAt,
          source: 'driver_accept',
          notifyOnFailure: true,
        });
        if (!sentryAcceptSync?.ok) {
          // Prevent local "accepted" state when broker did not acknowledge.
          let rollbackAssignment = supabase
            .from('trip_assignments')
            .update({ status: 'pending', trip_processing_status_id: 0, accepted_at: null });
          rollbackAssignment = applyTripAssignmentTarget(rollbackAssignment, currentTrip, thisDriverId)
            .in('status', ['accepted']);
          await rollbackAssignment;
          await supabase
            .from('marketplace_trips')
            .update({
              status: 'assigned',
              external_trip_status: 'assigned',
              taken_by: thisDriverId || null,
            })
            .eq('sentry_trip_id', tripId);
          if (currentTrip?.riderKey) {
            await fbUpdate(`rider_tracking/${currentTrip.riderKey}`, {
              status: 'assigned',
              acceptedAt: null,
            });
          }
          await fbSet(`trip_assignments/${tripId}`, { status: 'pending', driverId: thisDriverId || null });
          showToast('Sentry did not confirm trip acceptance. Trip was kept in assigned state.');
          return;
        }
      }

      await publishTripAlert(
        'driver_accepted_trip',
        `${driverData?.name || 'Driver'} accepted trip ${tripId || 'current trip'}. Rider tracking link is ready.`,
        'info',
        {
          status: 'accepted',
          accepted_at: acceptedAt,
          rider_key: currentTrip?.riderKey || null,
          tracking_url: trackingUrl || null,
        }
      );

      const mergedTrip = { ...currentTrip, acceptedAt, enRouteAt: null };
      telemetryLifecycleStage('DriverApp:accept_trip', tripId, 'accepted', {
        revision: currentTrip?.lastModifiedAt ?? null,
        reason: 'driver_accepted_offer',
      });
      commitDriverTrip(mergedTrip, { source: 'driver_accept', reason: 'accept_trip_success' });
      setLifecycleUiLock({
        tripId,
        accepted: true,
        enRoute: false,
        arrived: false,
        pickedUp: false,
      });
      setSheetState('navigation');
      if (driverData?.id && tripId) {
        persistDriverActiveTripSnapshot(driverData.id, mergedTrip);
      }
    } finally {
      setAcceptingTrip(false);
    }
  }

  async function startRouteToPickup() {
    if (!currentTrip?.tripId || currentTrip?.enRouteAt) return;

    const thisDriverId = driverRecord?.id || driverData?.id || '';
    if (!thisDriverId) {
      showToast('Driver session missing. Refresh and try again.');
      return;
    }
    const routeClaim = await claimDriverTripIdempotency(supabase, {
      driverId: thisDriverId,
      tripId: currentTrip.tripId,
      action: 'en_route',
      idempotencyKey: crypto.randomUUID(),
    });
    if (!routeClaim.ok) {
      logFailure('DriverApp:startRouteToPickup:idempotency', routeClaim.error);
      return;
    }
    if (!routeClaim.firstClaim) {
      showToast('Route start already recorded.');
      return;
    }

    const enRouteAt = new Date().toISOString();
    const statusResult = await sendSentryLifecycleStatus(currentTrip.tripId, 3, {
      en_route_at: enRouteAt,
      accepted_at: currentTrip?.acceptedAt || enRouteAt,
      assigned_at: currentTrip?.acceptedAt || enRouteAt,
    });
    toastSentryLifecycleFailure('Route start saved locally, but Sentry status update failed.', statusResult, {
      isTestTrip: Boolean(currentTrip?.isTestTrip),
    });

    if (currentTrip?.tripId) {
      let routeUpdate = supabase
        .from('trip_assignments')
        .update({
          status: 'in_progress',
          accepted_at: currentTrip?.acceptedAt || enRouteAt,
        });
      routeUpdate = applyTripAssignmentTarget(routeUpdate, currentTrip, driverRecord?.id || driverData?.id);
      const { error: routeErr } = await routeUpdate;
      if (routeErr) logFailure('DriverApp:startRouteToPickup:trip_assignments', routeErr);

      let mtUpdate = supabase
        .from('marketplace_trips')
        .update({ status: 'in_progress' })
        .eq('sentry_trip_id', currentTrip.tripId);
      if (thisDriverId) {
        mtUpdate = mtUpdate.or(`taken_by.is.null,taken_by.eq.${thisDriverId}`);
      }
      const { error: mtErr } = await mtUpdate;
      if (mtErr) logFailure('DriverApp:startRouteToPickup:marketplace_trips', mtErr);
    }

    await publishTripAlert(
      'driver_started_route_to_pickup',
      `${driverData?.name || 'Driver'} started driving to pickup for trip ${String(currentTrip?.tripId || '').trim() || 'current trip'}.`,
      'info',
      { status: 'en_route', en_route_at: enRouteAt }
    );

    commitDriverTrip(
      prev => {
        const next = { ...prev, enRouteAt };
        if (driverData?.id && next?.tripId) persistDriverActiveTripSnapshot(driverData.id, next);
        telemetryLifecycleStage('DriverApp:start_route_to_pickup', next.tripId, 'in_progress', {
          reason: 'driver_started_en_route',
        });
        return next;
      },
      { source: 'driver_en_route', reason: 'start_route_to_pickup' }
    );
    setLifecycleUiLock(prev => ({
      tripId: normalizeUiTripId(currentTrip?.tripId) || normalizeUiTripId(prev.tripId),
      accepted: true,
      enRoute: true,
      arrived: prev.arrived || false,
      pickedUp: prev.pickedUp || false,
    }));
  }

  async function rejectTrip() {
    if (!currentTrip) return;

    const tripId = currentTrip.tripId;
    const rejectedAt = new Date().toISOString();
    const hasAccepted = Boolean(currentTrip?.acceptedAt);

    const reachedPickupArrival =
      Boolean(currentTrip?.arrivedAt) ||
      Boolean(currentTrip?.pickedUpAt) ||
      Boolean(lifecycleUiLock?.arrived) ||
      Boolean(lifecycleUiLock?.pickedUp);

    const sandboxOrLocalTrip = isLocalOnlyTestTripId(tripId);

    /** Only block local release if broker integration must acknowledge (avoids orphan local rejects). */
    const sentryHardGate =
      Boolean(tripId) &&
      sentryApi.enabled &&
      !sandboxOrLocalTrip;

    let sentryAttempted = false;
    let sentryResult = { ok: true };

    if (tripId && sentryApi.enabled) {
      sentryAttempted = true;
      sentryResult = await sentryApi.rejectTrip(
        currentTrip.tripId,
        1,
        currentTrip.lastModifiedAt || null,
        null
      );

      if (sentryAttempted) {
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'trip_reject',
          direction: 'export',
          record_type: 'trip',
          external_id: String(currentTrip.tripId),
          status: sentryResult.ok ? 'success' : 'failed',
          error_message: sentryResult.ok ? '' : (sentryResult.error || `HTTP ${sentryResult.status}`),
          payload: {
            driver_id: driverData.id,
            trip_processing_status_id: 2,
            sentry_status_id: 1,
            had_accepted_progress: hasAccepted,
            reached_pickup_arrival: reachedPickupArrival,
            driver_release: true,
          },
        });
      }
    }

    if (sentryHardGate && sentryAttempted && !sentryResult.ok) {
      const detail = sentryResult.error || `HTTP ${sentryResult.status}`;
      logFailure('DriverApp:rejectTrip:sentry_blocked', { tripId, detail });
      showToast(
        `The broker did not confirm this release (${detail}). Your trip is still active — try again or contact dispatch.`
      );
      return;
    }

    stopCountdown();

    await fbSet(`trip_assignments/${currentTrip.tripId}`, { status: 'rejected', driverId: driverData.id });
    await fbSet(`driver_notifications/${driverData.id}`, null);

    if (currentTrip.tripId) {
      let rejectUpdate = supabase
        .from('trip_assignments')
        .update({ status: 'rejected', trip_processing_status_id: 2, rejected_at: rejectedAt });
      rejectUpdate = applyTripAssignmentTarget(rejectUpdate, currentTrip, driverRecord?.id || driverData?.id);
      await rejectUpdate;

      await supabase
        .from('marketplace_trips')
        .update({
          status: 'available',
          external_trip_status: 'rejected',
          taken_by: null,
        })
        .eq('sentry_trip_id', String(currentTrip.tripId));
    }

    if (driverData?.id) {
      await supabase
        .from('drivers')
        .update({ status: 'online', updated_at: new Date().toISOString() })
        .eq('id', driverData.id)
        .eq('status', 'on_trip');
    }

    if (driverData?.id) clearDriverActiveTripSnapshot(driverData.id);
    if (driverData?.id) clearDriverLifecycleLock(driverData.id);
    setLifecycleUiLock({ tripId: null, accepted: false, enRoute: false, arrived: false, pickedUp: false });
    if (currentTrip?.tripId) {
      telemetryLifecycleStage('DriverApp:reject_trip', currentTrip.tripId, 'rejected', {
        skipBackwardCheck: true,
        resetAfter: true,
        reason: 'driver_declined_or_cancelled_offer',
      });
    } else {
      lastCommittedLifecycleRef.current = { tripId: null, stage: '' };
    }
    commitDriverTrip(null, { source: 'reject_trip', reason: 'driver_rejected_or_cancelled_offer' });
    setSheetState('waiting');
  }

  async function markArrivedAtPickup() {
    if (!currentTrip) return;
    const thisDriverId = driverRecord?.id || driverData?.id;
    const tripIdPre = currentTrip?.tripId || null;
    if (thisDriverId && tripIdPre) {
      const arriveClaim = await claimDriverTripIdempotency(supabase, {
        driverId: thisDriverId,
        tripId: tripIdPre,
        action: 'arrived',
        idempotencyKey: crypto.randomUUID(),
      });
      if (!arriveClaim.ok) {
        logFailure('DriverApp:markArrivedAtPickup:idempotency', arriveClaim.error);
        return;
      }
      if (!arriveClaim.firstClaim) {
        showToast('Arrival already recorded.');
        return;
      }
    }
    const arrivedAt = new Date().toISOString();
    const tripId = currentTrip?.tripId || null;

    // Optimistic-first progression so checklist/buttons don't revert during sync lag.
    commitDriverTrip(
      prev => {
        const next = { ...prev, arrivedAt };
        if (driverData?.id && next?.tripId) persistDriverActiveTripSnapshot(driverData.id, next);
        telemetryLifecycleStage('DriverApp:mark_arrived_pickup', next.tripId, 'arrived', {
          reason: 'driver_marked_arrived',
        });
        return next;
      },
      { source: 'driver_arrived', reason: 'mark_arrived_at_pickup' }
    );
    setLifecycleUiLock(prev => ({
      tripId: normalizeUiTripId(tripId) || normalizeUiTripId(prev.tripId),
      accepted: true,
      enRoute: true,
      arrived: true,
      pickedUp: prev.pickedUp || false,
    }));

    try {
      await fbUpdate(`rider_tracking/${currentTrip?.riderKey}`, {
        status: 'arrived',
        driverId: driverData.id,
        arrivedAt: Date.now(),
      });
    } catch (err) {
      logFailure('DriverApp:markArrivedAtPickup:rider_tracking', err);
    }
    if (tripId) {
      let arriveUpdate = supabase
        .from('trip_assignments')
        .update({ status: 'arrived' });
      arriveUpdate = applyTripAssignmentTarget(arriveUpdate, currentTrip, driverRecord?.id || driverData?.id);
      const { error } = await arriveUpdate;
      if (error) logFailure('DriverApp:markArrivedAtPickup:trip_assignments', error);
    }

    const arrivedResult = await sendSentryLifecycleStatus(tripId, 4, {
      pick_up_arrival_timestamp: arrivedAt,
    });
    if (arrivedResult && !arrivedResult.ok && !arrivedResult.skipped) {
      showToast(`Arrival saved locally, but Sentry status update failed. ${arrivedResult.error || `HTTP ${arrivedResult.status}`}`);
    }
    await publishTripAlert(
      'driver_arrived_pickup',
      `${driverData?.name || 'Driver'} arrived at pickup for trip ${String(currentTrip?.tripId || '').trim() || 'current trip'}.`,
      'info',
      { status: 'arrived', arrived_at: arrivedAt }
    );
    startPickupWait(driverWaitMins);
  }

  async function confirmPickup(meta = {}) {
    const thisDriverId = driverRecord?.id || driverData?.id;
    const tripIdPre = currentTrip?.tripId || null;
    if (thisDriverId && tripIdPre) {
      const pickupClaim = await claimDriverTripIdempotency(supabase, {
        driverId: thisDriverId,
        tripId: tripIdPre,
        action: 'picked_up',
        idempotencyKey: crypto.randomUUID(),
      });
      if (!pickupClaim.ok) {
        logFailure('DriverApp:confirmPickup:idempotency', pickupClaim.error);
        return;
      }
      if (!pickupClaim.firstClaim) {
        showToast('Pickup already recorded.');
        return;
      }
    }
    const pickedUpAt = new Date().toISOString();
    const normalizedPickupMeta = normalizeCompletionMeta(meta);
    const tripId = currentTrip?.tripId || null;

    // Optimistic-first progression so dropoff flow stays active if sync calls lag.
    commitDriverTrip(
      prev => {
        const next = {
          ...prev,
          pickedUpAt,
          collectedFare: normalizedPickupMeta.collectedFare ?? prev?.collectedFare ?? null,
          mtaFareCollectedAt: normalizedPickupMeta.collectedFare !== null ? pickedUpAt : (prev?.mtaFareCollectedAt || null),
        };
        if (driverData?.id && next?.tripId) persistDriverActiveTripSnapshot(driverData.id, next);
        telemetryLifecycleStage('DriverApp:confirm_pickup', next.tripId, 'picked_up', {
          reason: 'driver_confirmed_pickup',
        });
        return next;
      },
      { source: 'driver_pickup', reason: 'confirm_pickup' }
    );
    setLifecycleUiLock(prev => ({
      tripId: normalizeUiTripId(tripId) || normalizeUiTripId(prev.tripId),
      accepted: true,
      enRoute: true,
      arrived: true,
      pickedUp: true,
    }));
    setSheetState('to_dropoff');

    try {
      await fbUpdate(`rider_tracking/${currentTrip?.riderKey}`, {
        status: 'picked_up',
        driverId: driverData.id,
        pickedUpAt: Date.now(),
      });
    } catch (err) {
      logFailure('DriverApp:confirmPickup:rider_tracking', err);
    }
    if (tripId) {
      let pickupUpdate = supabase
        .from('trip_assignments')
        .update({
          status: 'picked_up',
          actual_pickup_time: pickedUpAt,
          collected_fare: normalizedPickupMeta.collectedFare,
        });
      pickupUpdate = applyTripAssignmentTarget(pickupUpdate, currentTrip, driverRecord?.id || driverData?.id);
      const { error } = await pickupUpdate;
      if (error) logFailure('DriverApp:confirmPickup:trip_assignments', error);
    }
    stopPickupWait();
    const pickupResult = await sendSentryLifecycleStatus(tripId, 5, {
      pick_up_timestamp: pickedUpAt,
      pick_up_arrival_timestamp: currentTrip?.arrivedAt || pickedUpAt,
      ...(normalizedPickupMeta.collectedFare != null ? {
        mta: {
          collected_fare: normalizedPickupMeta.collectedFare,
        },
      } : {}),
    });
    if (pickupResult && !pickupResult.ok && !pickupResult.skipped) {
      showToast(`Pickup saved locally, but Sentry status update failed. ${pickupResult.error || `HTTP ${pickupResult.status}`}`);
    }
    await publishTripAlert(
      'driver_picked_up_rider',
      `${driverData?.name || 'Driver'} picked up the rider for trip ${String(currentTrip?.tripId || '').trim() || 'current trip'}.`,
      'info',
      { status: 'picked_up', picked_up_at: pickedUpAt }
    );
    // Keep the optimistic state; network sync above only confirms it.
  }

  async function markNoShow() {
    if (!currentTrip?.tripId) {
      showToast('No trip to mark as no-show.');
      return;
    }
    const thisDriverId = driverRecord?.id || driverData?.id;
    if (!thisDriverId) {
      showToast('Driver session missing. Refresh and try again.');
      return;
    }
    if (!currentTrip.arrivedAt) {
      showToast('Tap “Arrived at pickup” first, wait the required period, then mark no-show.');
      return;
    }

    try {
      const nsClaim = await claimDriverTripIdempotency(supabase, {
        driverId: thisDriverId,
        tripId: currentTrip.tripId,
        action: 'no_show',
        idempotencyKey: crypto.randomUUID(),
      });
      if (!nsClaim.ok) {
        logFailure('DriverApp:markNoShow:idempotency', nsClaim.error);
        showToast('Could not record no-show. Try again.');
        return;
      }
      if (!nsClaim.firstClaim) {
        showToast('No-show already recorded.');
        return;
      }

      const noShowAt = new Date().toISOString();
      const tripIdStr = String(currentTrip.tripId);

      await fbSet(`trip_assignments/${tripIdStr}`, { status: 'no_show', driverId: driverData.id, noShowAt: Date.now() });

      if (currentTrip?.riderKey) {
        const rtl = await fbUpdate(`rider_tracking/${currentTrip.riderKey}`, {
          status: 'no_show',
          driverId: driverData.id,
          noShowAt: Date.now(),
        });
        if (!rtl.ok) logFailure('DriverApp:markNoShow:rider_tracking', rtl.error);
      }

      if (driverData?.id) {
        await fbSet(`driver_notifications/${driverData.id}`, null);
      }

      let noShowUpdate = supabase
        .from('trip_assignments')
        .update({ status: 'no_show' })
        .in('status', NO_SHOW_FROM_ASSIGNMENT_STATUSES);
      noShowUpdate = applyTripAssignmentTarget(noShowUpdate, currentTrip, thisDriverId);
      const { data: updatedAssign, error: assignErr } = await noShowUpdate.select('id').maybeSingle();
      if (assignErr) {
        logFailure('DriverApp:markNoShow:trip_assignments', assignErr);
        showToast('Could not update trip assignment. Refresh or contact dispatch.');
        return;
      }
      if (!updatedAssign?.id) {
        showToast('Could not save no-show (assignment missing or wrong status).');
        return;
      }

      const { error: mpErr } = await supabase
        .from('marketplace_trips')
        .update({
          status: 'cancelled',
          external_trip_status: 'no_show',
        })
        .eq('sentry_trip_id', tripIdStr);
      if (mpErr) logFailure('DriverApp:markNoShow:marketplace_trips', mpErr);

      if (driverRecord?.id) {
        const { error: drErr } = await supabase.from('drivers').update({ status: 'online' }).eq('id', driverRecord.id);
        if (drErr) logFailure('DriverApp:markNoShow:drivers', drErr);
      }

      stopPickupWait();
      const noShowResult = await sendSentryLifecycleStatus(tripIdStr, 8, {
        cancel_reason_id: 1,
        cancelled_at: noShowAt,
        pick_up_arrival_timestamp: currentTrip.arrivedAt,
      });
      if (noShowResult && !noShowResult.ok && !noShowResult.skipped) {
        showToast(`No-show saved locally, but Sentry status update failed. ${noShowResult.error || `HTTP ${noShowResult.status}`}`);
      }

      await publishTripAlert(
        'driver_marked_no_show',
        `${driverData?.name || 'Driver'} marked a rider as no-show for trip ${tripIdStr}.`,
        'warning',
        { status: 'no_show', no_show_at: noShowAt, waited_mins: driverWaitMins }
      );

      if (driverData?.id) clearDriverActiveTripSnapshot(driverData.id);
      if (driverData?.id) clearDriverLifecycleLock(driverData.id);
      setLifecycleUiLock({ tripId: null, accepted: false, enRoute: false, arrived: false, pickedUp: false });
      telemetryLifecycleStage('DriverApp:mark_no_show', tripIdStr, 'no_show', {
        skipBackwardCheck: true,
        resetAfter: true,
        reason: 'driver_marked_no_show',
      });
      commitDriverTrip(null, { source: 'mark_no_show', reason: 'driver_no_show' });
      setSheetState('waiting');
    } catch (err) {
      logFailure('DriverApp:markNoShow', err);
      showToast('No-show failed. Try again.');
    }
  }

  async function completeTrip(meta = {}) {
    const thisDriverId = driverRecord?.id || driverData?.id;
    const tripIdPre = currentTrip?.tripId || null;
    if (thisDriverId && tripIdPre) {
      const completeClaim = await claimDriverTripIdempotency(supabase, {
        driverId: thisDriverId,
        tripId: tripIdPre,
        action: 'completed',
        idempotencyKey: crypto.randomUUID(),
      });
      if (!completeClaim.ok) {
        logFailure('DriverApp:completeTrip:idempotency', completeClaim.error);
        return;
      }
      if (!completeClaim.firstClaim) {
        showToast('Completion already recorded.');
        return;
      }
    }
    const tripEarnings = driverRecord?.pay_rate && driverRecord?.pay_rate_type === 'per_trip'
      ? parseFloat(driverRecord.pay_rate)
      : null;

    const completedAt = new Date().toISOString();
    const completionMeta = normalizeCompletionMeta(meta);
    const effectiveCollectedFare =
      completionMeta.collectedFare ??
      currentTrip?.collectedFare ??
      currentTrip?.mtaFareAmount ??
      null;
    const lifecycleExtras = {
      drop_off_timestamp: completedAt,
      pick_up_timestamp: currentTrip?.pickedUpAt || null,
      pick_up_arrival_timestamp: currentTrip?.arrivedAt || null,
      is_next_day: completionMeta.isNextDay ? 1 : 0,
      next_day: completionMeta.isNextDay ? 1 : 0,
      next_day_requested_at: completionMeta.isNextDay ? completedAt : null,
      ...(effectiveCollectedFare != null ? {
        mta: {
          collected_fare: effectiveCollectedFare,
        },
      } : {}),
    };

    await fbSet(`trip_assignments/${currentTrip?.tripId}`, { status: 'completed', driverId: driverData.id, completedAt: Date.now() });
    await fbUpdate(`rider_tracking/${currentTrip?.riderKey}`, {
      status: 'completed',
      completedAt: Date.now(),
    });
    // Same as no-show / reject: stale Firebase notifications otherwise resurrect the trip every poll tick.
    if (driverData?.id) {
      await fbSet(`driver_notifications/${driverData.id}`, null);
    }

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
        });
      taUpdate = applyTripAssignmentTarget(taUpdate, currentTrip, driverRecord?.id || driverData?.id);
      const { error: taErr } = await taUpdate;
      if (taErr) logFailure('DriverApp:completeTrip:trip_assignments', taErr);

      await supabase
        .from('marketplace_trips')
        .update({ status: 'completed', external_trip_status: 'completed' })
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
      `${driverData?.name || 'Driver'} dropped off the rider for trip ${String(currentTrip?.tripId || '').trim() || 'current trip'}.`,
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

    if (driverData?.id) clearDriverActiveTripSnapshot(driverData.id);
    if (driverData?.id) clearDriverLifecycleLock(driverData.id);
    setLifecycleUiLock({ tripId: null, accepted: false, enRoute: false, arrived: false, pickedUp: false });
    if (currentTrip?.tripId) {
      telemetryLifecycleStage('DriverApp:complete_trip', currentTrip.tripId, 'completed', {
        reason: 'driver_completed_trip',
        resetAfter: true,
      });
    } else {
      lastCommittedLifecycleRef.current = { tripId: null, stage: '' };
    }
    commitDriverTrip(null, { source: 'complete_trip', reason: 'driver_completed_trip' });
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
      showToast('You already have a trip in progress. Open Menu → Resume Active Trip to continue.');
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
    const cachedSnapshot = readDriverActiveTripSnapshot(driverCtx.id);
    const cachedSnapshotTrip = cachedSnapshot?.tripId
      ? {
          tripId: cachedSnapshot.tripId,
          assignmentRowId: cachedSnapshot.assignmentRowId || null,
          assignmentDriverId: cachedSnapshot.assignmentDriverId || null,
          acceptedAt: cachedSnapshot.acceptedAt || null,
          enRouteAt: cachedSnapshot.enRouteAt || null,
          arrivedAt: cachedSnapshot.arrivedAt || null,
          pickedUpAt: cachedSnapshot.pickedUpAt || null,
        }
      : null;

    let { data: primaryRows, error: activeErr } = await supabase
      .from('trip_assignments')
      .select('id, trip_id, driver_id, pu_address, do_address, pu_time, delivery_price, mileage, notes, accepted_at, actual_pickup_time, status, assigned_at, lifecycle_revision')
      .eq('driver_id', driverCtx.id)
      .order('accepted_at', { ascending: false, nullsFirst: false })
      .order('assigned_at', { ascending: false })
      .limit(25);
    let activeRow = (primaryRows || []).find(row => (
      isResumableStatus(row?.status) && isStySentryTripId(row?.trip_id)
    )) || null;
    if (!activeRow?.trip_id && !activeErr && driverCtx?.company_id && (driverCtx?.full_name || driverData?.name)) {
      const driverName = String(driverCtx.full_name || driverData?.name || '').trim();
      if (driverName) {
        const fallback = await supabase
          .from('trip_assignments')
          .select('id, trip_id, driver_id, pu_address, do_address, pu_time, delivery_price, mileage, notes, accepted_at, actual_pickup_time, status, assigned_at, driver_name, lifecycle_revision')
          .eq('company_id', driverCtx.company_id)
          .order('accepted_at', { ascending: false, nullsFirst: false })
          .order('assigned_at', { ascending: false })
          .limit(25);
        activeErr = fallback.error || null;
        if (!activeErr) {
          const normalizeName = (value) => String(value || '').trim().toLowerCase();
          const expected = normalizeName(driverName);
          const rows = (fallback.data || []).filter(row => (
            isResumableStatus(row?.status) && isStySentryTripId(row?.trip_id)
          ));
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
            .select('id, trip_id, driver_id, pu_address, do_address, pu_time, delivery_price, mileage, notes, accepted_at, actual_pickup_time, status, assigned_at, lifecycle_revision')
            .in('driver_id', aliasIds)
            .order('accepted_at', { ascending: false, nullsFirst: false })
            .order('assigned_at', { ascending: false })
            .limit(25);
          if (!aliasLookup.error) {
            const aliasRow = (aliasLookup.data || []).find(row => (
              isResumableStatus(row?.status) && isStySentryTripId(row?.trip_id)
            ));
            if (aliasRow?.trip_id) activeRow = aliasRow;
          }
        }
      }
    }
    if (activeErr) {
      logFailure('DriverApp:restoreActiveTripFromDb', activeErr);
      return null;
    }
    if (!activeRow?.trip_id) {
      const cached = readDriverActiveTripSnapshot(driverCtx.id);
      const maxAgeMs = 72 * 3600000;
      const cacheFresh = Boolean(cached?.savedAt && Date.now() - Number(cached.savedAt) < maxAgeMs);
      const cachedOk =
        cached?.tripId &&
        isStySentryTripId(cached.tripId) &&
        String(cached.driverId || driverCtx.id) === String(driverCtx.id);
      if (cacheFresh && cachedOk) {
        const { data: byTrip, error: byTripErr } = await supabase
          .from('trip_assignments')
          .select('id, trip_id, driver_id, pu_address, do_address, pu_time, delivery_price, mileage, notes, accepted_at, actual_pickup_time, status, assigned_at, driver_name, lifecycle_revision')
          .eq('trip_id', cached.tripId)
          .eq('driver_id', driverCtx.id)
          .maybeSingle();
        if (
          !byTripErr &&
          byTrip?.trip_id &&
          isResumableStatus(byTrip.status) &&
          isStySentryTripId(byTrip.trip_id)
        ) {
          activeRow = byTrip;
        }
      }
      if (!activeRow?.trip_id) return null;
    }

    const { data: mtRow } = await supabase
      .from('marketplace_trips')
      .select('status, taken_by, sentry_last_modified_at, raw_payload, assignment_type_code, external_trip_status')
      .eq('sentry_trip_id', String(activeRow.trip_id))
      .maybeSingle();
    const parsedNotes = parseTripAssignmentNotesForOffer(activeRow.notes);
    const normalizedLifecycleStatus = resolveDriverLifecycleStatusForDriver(activeRow, mtRow || {}, driverCtx?.id);
    const mpTs = extractMarketplaceLifecycleTimestamps(mtRow || {});
    const hasEnRouteProgress =
      hasMarketplaceEnRouteProgress(mtRow || {}) ||
      String(activeRow?.status || '').toLowerCase() === 'in_progress';
    const existingTrip = currentTripRef.current;
    const sameTrip = String(existingTrip?.tripId || '') === String(activeRow.trip_id || '');
    const preservedEnRouteAt = sameTrip ? (existingTrip?.enRouteAt || null) : null;
    const restoredTrip = {
      type: 'active_trip',
      tripId: activeRow.trip_id,
      assignmentRowId: activeRow.id || null,
      assignmentDriverId: activeRow.driver_id || driverCtx.id,
      lastModifiedAt: mtRow?.sentry_last_modified_at || '',
      puAddress: activeRow.pu_address || '',
      doAddress: activeRow.do_address || '',
      puTime: activeRow.pu_time || '',
      ...(perTripPay ? { deliveryPrice: activeRow.delivery_price } : {}),
      mileage: activeRow.mileage,
      acceptedAt: ['accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip'].includes(normalizedLifecycleStatus)
        ? (mpTs.acceptedAt || activeRow.accepted_at || activeRow.assigned_at || new Date().toISOString())
        : null,
      enRouteAt: preservedEnRouteAt || (hasEnRouteProgress
        ? (mpTs.enRouteAt || mpTs.acceptedAt || activeRow.accepted_at || activeRow.assigned_at || null)
        : null),
      arrivedAt: ['arrived', 'picked_up', 'on_trip'].includes(normalizedLifecycleStatus)
        ? (mpTs.arrivedAt || activeRow.actual_pickup_time || activeRow.accepted_at || activeRow.assigned_at || null)
        : null,
      pickedUpAt: ['picked_up', 'on_trip'].includes(normalizedLifecycleStatus)
        ? (mpTs.pickedUpAt || activeRow.actual_pickup_time || activeRow.accepted_at || activeRow.assigned_at || null)
        : null,
      testingNote: parsedNotes.testingNote,
      isTestTrip: parsedNotes.isTestTrip,
      ...deriveMtaFareInfo(mtRow || {}),
    };
    const mergedRestored = preserveTripProgressForSameTrip(
      cachedSnapshotTrip || existingTrip,
      restoredTrip
    );
    const mergedRestoredLifecycle = deriveLifecycleStatusFromTripSnapshot(mergedRestored, normalizedLifecycleStatus);
    telemetryLifecycleStage('DriverApp:restore_db_assignment', activeRow.trip_id, normalizedLifecycleStatus, {
      revision: mtRow?.sentry_last_modified_at ?? null,
      reason: 'restore_active_trip_db_row',
    });
    commitDriverTrip(mergedRestored, { source: 'restore_db', reason: 'trip_assignment_row' });
    if (mergedRestored?.arrivedAt && !mergedRestored?.pickedUpAt) {
      startPickupWait(driverWaitMins);
    }
    if (activeRow?.trip_id && activeRow?.lifecycle_revision != null) {
      const tk = String(activeRow.trip_id);
      assignmentRevisionByTripRef.current.set(
        tk,
        Math.max(Number(activeRow.lifecycle_revision ?? 0), assignmentRevisionByTripRef.current.get(tk) ?? 0)
      );
      lastFetchSourceByTripRef.current.set(tk, 'db');
    }
    setSheetState(deriveSheetStateFromAssignmentStatus(mergedRestoredLifecycle));
    if (openSheet) setSheetOpen(true);
    if (normalizedLifecycleStatus !== 'pending' && driverCtx?.id) {
      supabase.from('drivers').update({ status: 'on_trip' }).eq('id', driverCtx.id).then(({ error }) => {
        if (error) logFailure('DriverApp:restoreActiveTripFromDb:setOnTrip', error);
      });
    }
    if (['accepted', 'in_progress'].includes(normalizedLifecycleStatus)) {
      const acceptedAt = mergedRestored.acceptedAt || activeRow.accepted_at || activeRow.assigned_at || new Date().toISOString();
      ensureSentryAcceptedSync(mergedRestored, {
        acceptedAt,
        source: 'restore_active_trip',
        notifyOnFailure: true,
      }).catch(err => {
        logFailure('DriverApp:restoreActiveTripFromDb:status2Retry', err);
      });
    }
    return mergedRestored;
  }

  function resumeActiveTrip() {
    (async () => {
      if (resumingTrip) return;
      setResumingTrip(true);
      try {
        const driverPayload =
          driverRecord || { id: driverData?.id, pay_rate_type: driverRecord?.pay_rate_type || 'hourly' };
        const restored = await restoreActiveTripFromDb(driverPayload, { openSheet: true });
        const trip = restored || currentTripRef.current;
        if (!trip?.tripId) {
          showToast('No active ride found to resume right now.');
          return;
        }
        const nextState = trip.pickedUpAt
          ? 'to_dropoff'
          : trip.arrivedAt || trip.acceptedAt || trip.enRouteAt
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
  const lockApplies = Boolean(normalizeUiTripId(currentTrip?.tripId)) && normalizeUiTripId(lifecycleUiLock.tripId) === normalizeUiTripId(currentTrip?.tripId);
  const stepAccepted = lockApplies ? lifecycleUiLock.accepted : Boolean(currentTrip?.acceptedAt);
  const stepEnRoute = lockApplies ? lifecycleUiLock.enRoute : Boolean(currentTrip?.enRouteAt);
  const stepArrived = lockApplies ? lifecycleUiLock.arrived : Boolean(currentTrip?.arrivedAt);
  const stepPickedUp = lockApplies ? lifecycleUiLock.pickedUp : Boolean(currentTrip?.pickedUpAt);
  const testChecklist = [
    {
      label: 'Accept trip',
      done:
        stepAccepted ||
        sheetState === 'navigation' ||
        sheetState === 'to_dropoff',
    },
    {
      label: 'Arrive at pickup',
      done: stepArrived || sheetState === 'to_dropoff',
    },
    { label: 'Pick up rider', done: stepPickedUp },
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
              localStorage.removeItem(DRIVER_LAST_SESSION_KEY);
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
    <div className="fixed inset-0 flex flex-col mobile-safe-bottom native-shell" style={{ background: '#07090d', fontFamily: 'Inter,sans-serif' }}>
      <div
        className="relative z-[100] shrink-0 px-3 pt-[calc(var(--safe-top)+4px)] pb-2 native-glass"
        style={{ background: 'rgba(7,9,13,0.92)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
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
              className="px-3 h-10 flex items-center justify-center gap-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <Menu className="w-4 h-4" style={{ color: '#e5e7eb' }} />
              <span className="text-xs font-600 hidden sm:inline" style={{ color: '#e5e7eb', fontWeight: 600 }}>Menu</span>
            </button>
            <button
              type="button"
              onClick={endShiftAndLogout}
              className="px-3 h-10 flex items-center justify-center gap-1.5 rounded-full"
              style={{ background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.24)', color: '#ff7a7a' }}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-xs font-700 hidden sm:inline" style={{ fontWeight: 700 }}>Logout</span>
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
              style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', boxShadow: '0 10px 24px rgba(0,0,0,0.24)' }}>
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
        acceptingTrip={acceptingTrip}
        routeStarted={stepEnRoute}
        pickupArrived={stepArrived}
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
          onOpen={() => openDriverPanel('incentives')}
          onDismiss={() => setIncentiveGoals(null)}
        />
      )}

      {celebration && (
        <IncentiveCelebrationOverlay
          celebration={celebration}
          onDone={() => setCelebration(null)}
        />
      )}

      {onBreak && <BreakOverlay driverId={driverRecord?.id || driverData?.id} onEnd={() => openDriverPanel(null)} />}

      {showPaymentSetup && (
        <DriverPaymentSetup
          driverId={driverData?.id}
          driverName={driverData?.name}
          driverEmail={driverData?.email || ''}
          onClose={() => openDriverPanel(null)}
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
          assignmentSignal={assignmentRealtimeEpoch}
          hasActiveTrip={Boolean(currentTrip?.tripId)}
          onResumeTrip={resumeActiveTrip}
          onClose={() => openDriverPanel(null)}
        />
      )}

      {showGuide && <DriverGuide onClose={() => openDriverPanel(null)} />}

      {showIncentives && (
        <DriverIncentivesView
          goals={incentiveGoals || incentiveSnapshotRef.current || []}
          onClose={() => openDriverPanel(null)}
        />
      )}

      {showCommunity && (
        <DriverCommunityHub
          orgId={orgId}
          driver={driverRecord || driverData}
          currentTrip={currentTrip}
          onClose={() => openDriverPanel(null)}
        />
      )}

      {showZonePreferences && (
        <DriverZonePreferences
          initialZones={driverRecord?.preferred_zones || []}
          saving={zoneSaving}
          savedMessage={zoneSavedMessage}
          onSave={savePreferredZones}
          onClose={() => openDriverPanel(null)}
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
                  sub: resumingTrip
                    ? 'Syncing with your trip…'
                    : currentTrip?.tripId
                      ? (currentTrip?.pickedUpAt ? 'Continue to dropoff' : 'Continue current trip flow')
                      : 'Find and reopen your active ride',
                  disabled: resumingTrip,
                  action: () => {
                    if (resumingTrip) return;
                    setShowMenu(false);
                    resumeActiveTrip();
                  },
                },
                { icon: <Calendar className="w-5 h-5" />, color: '#00e5a0', label: 'My Schedule', sub: 'View today\'s trips', action: () => openDriverPanel('schedule') },
                {
                  icon: <Trophy className="w-5 h-5" />,
                  color: '#c9a84c',
                  label: 'My Incentives',
                  sub: 'Check your bonus goals and progress',
                  action: () => openDriverPanel('incentives'),
                },
                { icon: <CreditCard className="w-5 h-5" />, color: '#c9a84c', label: 'Earnings & Pay', sub: 'Bank account & payouts', action: () => openDriverPanel('payment') },
                {
                  icon: <MapPin className="w-5 h-5" />,
                  color: '#0ea5e9',
                  label: 'Preferred Zones',
                  sub: driverRecord?.preferred_zones?.length
                    ? driverRecord.preferred_zones.map(formatServiceZone).join(', ')
                    : 'Choose boroughs you prefer to cover',
                  action: () => openDriverPanel('zones'),
                },
                { icon: <Coffee className="w-5 h-5" />, color: '#f59e0b', label: 'Take a Break', sub: '15-minute break timer', action: () => openDriverPanel('break') },
                { icon: <Trophy className="w-5 h-5" />, color: '#c9a84c', label: 'Community & Leaderboard', sub: 'Compete, post tips, track riders', action: () => openDriverPanel('community') },
                { icon: <BookOpen className="w-5 h-5" />, color: '#0ea5e9', label: 'Driver Guide', sub: 'How to use this app', action: () => openDriverPanel('guide') },
              ].map((item, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={Boolean(item.disabled)}
                  onClick={item.action}
                  className="w-full flex items-center gap-3 px-5 py-4"
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    textAlign: 'left',
                    opacity: item.disabled ? 0.55 : 1,
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                  }}
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
