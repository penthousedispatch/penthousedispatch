import React, { useEffect, useState, useMemo } from 'react';
import {
  RefreshCw, Plus, Upload,
  Users, Navigation, Trash2, CheckSquare, Square, BookOpen, Map as MapIcon, ClipboardList, RotateCcw, Send, AlertTriangle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { sentryApi } from '../../lib/sentryApi';
import { haversineDistance } from '../../lib/geocode';
import { fbSet } from '../../lib/firebase';
import { readCompanySchedulerPrefs } from '../../lib/companySchedulerPrefs';
import { detectServiceZone, getZonePreferenceBonus, normalizePreferredZones } from '../../lib/serviceZones';
import { AI_SCHED } from '../../utils/ai_scheduler';
import DriverCard from '../../components/drivers/DriverCard';
import DriverDetailPanel from '../../components/drivers/DriverDetailPanel';
import TripCard from '../../components/trips/TripCard';
import MapView from '../../components/map/MapView';
import Take5Modal from '../../components/dispatch/Take5Modal';
import AddDriverModal from '../../components/drivers/AddDriverModal';
import CSVImportModal from '../../components/drivers/CSVImportModal';
import DeleteConfirmModal from '../../components/drivers/DeleteConfirmModal';
import DispatchWalkthrough from '../../components/dispatch/DispatchWalkthrough';
import ChatPanel from '../../components/chat/ChatPanel';
import { toastFleetImportSummary } from '../../utils/fleetImportSummaryToast';
import { logFailure } from '../../utils/errorHandler';
import { isSyntheticMarketplaceTrip } from '../../lib/sentrySyntheticTrips';

const TEST_TRIP_MARKER = '[TEST_TRIP]';
const TEST_NOTE_PREFIX = '[TEST_NOTE]';
const LOCAL_ACTIVE_ASSIGNMENT_STATUSES = new Set(['pending', 'accepted', 'arrived', 'picked_up', 'completed']);
/**
 * Any status here means dispatch must treat the offer as locked:
 * pending/assigned = offered or reserved for a driver,
 * accepted/arrived/picked_up = active lifecycle already underway,
 * in_progress/on_trip = older aliases still used by restore/sync paths.
 */
const TRIP_LOCK_STATUSES = new Set([
  'pending',
  'accepted',
  'arrived',
  'picked_up',
  'in_progress',
  'on_trip',
  'assigned',
]);
const IN_PROGRESS_TRIP_STATUSES = new Set(['accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip']);
const QUEUE_WINDOW_MINS = 20;

function normalizeTripId(value) {
  return value === null || value === undefined ? '' : String(value);
}

function isTripLockStatus(status) {
  return TRIP_LOCK_STATUSES.has(String(status || '').toLowerCase());
}

function parseScheduleEpoch(value) {
  const parsed = new Date(value || '').getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveActiveTripCompletionEpoch(assignment) {
  const direct = parseScheduleEpoch(
    assignment?.actual_dropoff_time ||
    assignment?.scheduled_dropoff_time ||
    assignment?.do_time
  );
  if (direct) return direct;
  const pickup = parseScheduleEpoch(assignment?.actual_pickup_time || assignment?.accepted_at || assignment?.assigned_at);
  if (!pickup) return null;
  const fallbackDurationMins = Math.max(12, Math.round((Number(assignment?.mileage || 0) || 0) * 3));
  return pickup + fallbackDurationMins * 60 * 1000;
}

const AI_RECOVERY_WINDOW_MS = 30 * 60 * 1000;
const RELEASE_LOCK_RETRY_MS = 1200;

async function waitMs(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function tripOfferFingerprintFromTrip(t) {
  if (!t) return '';
  return [
    String(t.pu_address || '').trim().toLowerCase(),
    String(t.do_address || '').trim().toLowerCase(),
    String(t.pu_time || ''),
    String(parseFloat(t.delivery_price) || ''),
  ].join('|');
}

function tripOfferFingerprintFromAssignment(a) {
  if (!a) return '';
  return [
    String(a.pu_address || '').trim().toLowerCase(),
    String(a.do_address || '').trim().toLowerCase(),
    String(a.pu_time || ''),
    String(parseFloat(a.delivery_price) || ''),
  ].join('|');
}

function toEpoch(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeSyncEntry(row) {
  if (!row) return null;
  return {
    status: row.status,
    syncType: row.sync_type,
    direction: row.direction || '',
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

function deriveEffectiveSyncEntry(rows, tripState = {}) {
  const sentryRows = (rows || []).filter(row => {
    const direction = String(row?.direction || '').toLowerCase();
    return direction === 'export' || direction === '';
  });
  const sortedRows = [...sentryRows].sort((a, b) => toEpoch(b.created_at) - toEpoch(a.created_at));
  if (!sortedRows.length) return null;

  const latest = sortedRows[0];
  const latestSuccess = sortedRows.find(row => row.status === 'success');
  const tripLoadedAt = toEpoch(tripState.loadedAt);
  const latestAt = toEpoch(latest.created_at);

  if (latest.status === 'failed' && tripLoadedAt && latestAt && latestAt < tripLoadedAt) {
    return normalizeSyncEntry(latestSuccess || null);
  }

  if (latest.status !== 'failed') return normalizeSyncEntry(latest);
  const hasLocalProgress =
    LOCAL_ACTIVE_ASSIGNMENT_STATUSES.has(String(tripState.assignmentStatus || '').toLowerCase()) ||
    ['assigned', 'accepted', 'arrived', 'picked_up', 'completed'].includes(String(tripState.marketplaceStatus || '').toLowerCase()) ||
    Boolean(tripState.takenBy);

  if (hasLocalProgress && latest.sync_type === 'marketplace_take') {
    return normalizeSyncEntry(latestSuccess);
  }

  return normalizeSyncEntry(latest);
}

function parseAssignmentNotes(notes = '') {
  const safeNotes = String(notes || '');
  const isTestTrip = safeNotes.includes(TEST_TRIP_MARKER);
  const testNoteMatch = safeNotes.match(/\[TEST_NOTE\]([\s\S]*)/);
  const testingNote = testNoteMatch?.[1]?.trim() || '';
  const cleanNotes = safeNotes
    .replace(TEST_TRIP_MARKER, '')
    .replace(/\[TEST_NOTE\]([\s\S]*)/, '')
    .trim();

  return {
    isTestTrip,
    testingNote,
    cleanNotes,
  };
}

function buildAssignmentNotes(existingNotes = '', { isTestTrip = false, testingNote = '' } = {}) {
  const parsed = parseAssignmentNotes(existingNotes);
  const lines = [];

  if (parsed.cleanNotes) lines.push(parsed.cleanNotes);
  if (isTestTrip) lines.push(TEST_TRIP_MARKER);
  if (testingNote.trim()) lines.push(`${TEST_NOTE_PREFIX} ${testingNote.trim()}`);

  return lines.join('\n').trim() || null;
}

function extractSentryError(result) {
  if (!result) return 'Unknown Sentry error';
  if (result.error) return result.error;

  const data = result.data;
  if (!data) return `HTTP ${result.status || 500}`;
  if (typeof data === 'string') return data;
  if (data.error) return data.error;
  if (data.message) return data.message;
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map(err => (typeof err === 'string' ? err : (err?.message || JSON.stringify(err)))).join('; ');
  }

  try {
    return JSON.stringify(data);
  } catch {
    return `HTTP ${result.status || 500}`;
  }
}

async function setDriverNotificationWithRetry(driverId, payload) {
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fbSet(`driver_notifications/${driverId}`, payload);
    if (res.ok) return { ok: true };
    lastErr = res.error || 'unknown';
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 280 * (attempt + 1)));
  }
  return { ok: false, error: lastErr };
}

function buildMarketplaceTakePayload(tripId, driver) {
  const payload = {
    related_trips: [{ trip_id: tripId }],
  };

  const licenseNumber = String(driver?.license_number || '').trim();
  const licenseState = String(driver?.license_state || 'NY').trim();
  if (licenseNumber) {
    payload.driver = {
      dmv_license: {
        license_number: licenseNumber,
        state_code: licenseState || 'NY',
      },
    };
  }

  const vehiclePlate = String(driver?.vehicle_plate || '').trim();
  if (vehiclePlate) {
    payload.vehicle = {
      dmv_registration: {
        license_plate_number: vehiclePlate,
      },
    };
  }

  return payload;
}

/** Broker may expect a different marketplace trip id than our row key (e.g. leg suffix STY-…-A vs base STY-…). */
function collectMarketplaceTakeTripIdCandidates(trip = {}) {
  const seen = new Set();
  const ordered = [];
  const push = (raw) => {
    const s = String(raw ?? '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    ordered.push(s);
  };

  push(trip.sentry_trip_id);
  const raw = trip.raw_payload && typeof trip.raw_payload === 'object' ? trip.raw_payload : {};
  push(raw.trip_id);
  push(raw.id);
  push(raw.marketplace_trip_id);
  push(raw.sentry_trip_id);
  push(raw.parent_trip_id);
  push(raw.root_trip_id);
  push(raw.base_trip_id);
  push(raw.external_trip_id);
  push(raw.broker_trip_id);
  if (raw.trip && typeof raw.trip === 'object') {
    push(raw.trip.trip_id);
    push(raw.trip.id);
    push(raw.trip.sentry_trip_id);
  }
  if (Array.isArray(raw.related_trips)) {
    for (const rt of raw.related_trips) {
      if (rt && typeof rt === 'object') {
        push(rt.trip_id);
        push(rt.id);
        push(rt.sentry_trip_id);
      }
    }
  }

  const legBases = [];
  for (const id of ordered) {
    const m = String(id).match(/^(STY-\d+)(-[A-Z])$/i);
    if (m?.[1] && m[1] !== id) legBases.push(m[1]);
  }
  for (const b of legBases) push(b);

  return ordered;
}

function buildMarketplaceTakePayloadDriverOnly(tripId, driver) {
  const payload = {
    related_trips: [{ trip_id: tripId }],
  };
  const licenseNumber = String(driver?.license_number || '').trim();
  const licenseState = String(driver?.license_state || 'NY').trim();
  if (licenseNumber) {
    payload.driver = {
      dmv_license: {
        license_number: licenseNumber,
        state_code: licenseState || 'NY',
      },
    };
  }
  return payload;
}

function buildMarketplaceTakePayloadVehicleOnly(tripId, driver) {
  const payload = {
    related_trips: [{ trip_id: tripId }],
  };
  const vehiclePlate = String(driver?.vehicle_plate || '').trim();
  if (vehiclePlate) {
    payload.vehicle = {
      dmv_registration: {
        license_plate_number: vehiclePlate,
      },
    };
  }
  return payload;
}

/**
 * Take marketplace trip with Sentry-friendly fallbacks (422 payload shapes, alternate ids, 409 conflict).
 * Final fallback: reportTripProcessed when take still returns 422/409/404 (broker may still accept processed signal).
 */
async function executeMarketplaceTakeWithSentryRecoveries(trip, driver, lastModifiedAt) {
  const candidates = collectMarketplaceTakeTripIdCandidates(trip);
  let lastResult = { ok: false, status: 0 };

  for (const takeUrlId of candidates) {
    const payloadBuilders = [
      { strategy: 'full', fn: () => buildMarketplaceTakePayload(takeUrlId, driver) },
      { strategy: 'driver_only', fn: () => buildMarketplaceTakePayloadDriverOnly(takeUrlId, driver) },
      { strategy: 'vehicle_only', fn: () => buildMarketplaceTakePayloadVehicleOnly(takeUrlId, driver) },
      { strategy: 'related_trips_only', fn: () => ({ related_trips: [{ trip_id: takeUrlId }] }) },
      { strategy: 'empty', fn: () => ({}) },
      {
        strategy: 'collection_post_full',
        fn: () => sentryApi.takeMarketplaceTripCollectionBody(takeUrlId, buildMarketplaceTakePayload(takeUrlId, driver)),
        isDirectResult: true,
      },
      {
        strategy: 'collection_post_trip_id_only',
        fn: () => sentryApi.takeMarketplaceTripCollectionBody(takeUrlId, {}),
        isDirectResult: true,
      },
    ];

    for (const entry of payloadBuilders) {
      const { strategy, fn, isDirectResult } = entry;
      lastResult = isDirectResult ? await fn() : await sentryApi.takeMarketplaceTrip(takeUrlId, fn());
      if (lastResult.ok) {
        return { ok: true, takeResult: lastResult, usedTakeUrlId: takeUrlId, recovery: null };
      }

      const st = Number(lastResult.status || 0);

      if (st === 409) {
        let conflictProcessed = await sentryApi.reportTripProcessed(takeUrlId, lastModifiedAt);
        if (!conflictProcessed.ok && lastModifiedAt) {
          conflictProcessed = await sentryApi.reportTripProcessed(takeUrlId, null);
        }
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'marketplace_take_conflict_processed_retry',
          direction: 'export',
          record_type: 'trip',
          external_id: takeUrlId,
          status: conflictProcessed.ok ? 'success' : 'failed',
          error_message: conflictProcessed.ok ? '' : extractSentryError(conflictProcessed),
          payload: {
            take_status: lastResult.status,
            take_error: extractSentryError(lastResult),
            retry_strategy: 'report_trip_processed_after_409',
            payload_strategy: strategy,
            driver_id: driver.id,
            driver_name: driver.full_name,
          },
        });
        if (conflictProcessed.ok) {
          return {
            ok: true,
            takeResult: { ...lastResult, ok: true, recoveredBy: 'report_trip_processed_after_409' },
            usedTakeUrlId: takeUrlId,
            recovery: 'report_trip_processed_after_409',
          };
        }
      }

      if (st !== 422 && st !== 409 && st !== 404) {
        break;
      }
    }
  }

  const failStProbe = Number(lastResult.status || 0);
  let existedAfter404 = false;
  let existenceProbeWinningId = '';
  if (!lastResult.ok && failStProbe === 404 && candidates.length) {
    for (const probeId of candidates) {
      const mp = await sentryApi.getMarketplaceTripById(probeId);
      if (mp.ok) {
        existedAfter404 = true;
        existenceProbeWinningId = probeId;
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'marketplace_take_404_get_marketplace_ok',
          direction: 'export',
          record_type: 'trip',
          external_id: probeId,
          status: 'success',
          error_message: '',
          payload: {
            candidate_ids: candidates,
            last_take_error: extractSentryError(lastResult),
            driver_id: driver.id,
            driver_name: driver.full_name,
            note: 'Segment take returned 404 but marketplace GET succeeded; requiring report_trip_processed success before assign.',
          },
        });
        break;
      }
      const tp = await sentryApi.getTripById(probeId);
      if (tp.ok) {
        existedAfter404 = true;
        existenceProbeWinningId = probeId;
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'marketplace_take_404_get_trip_ok',
          direction: 'export',
          record_type: 'trip',
          external_id: probeId,
          status: 'success',
          error_message: '',
          payload: {
            candidate_ids: candidates,
            last_take_error: extractSentryError(lastResult),
            driver_id: driver.id,
            driver_name: driver.full_name,
            note: 'Segment take returned 404 but trips GET succeeded; requiring report_trip_processed success before assign.',
          },
        });
        break;
      }
    }
  }

  const failSt = Number(lastResult.status || 0);
  const recoverableStatuses = new Set([422, 409, 404]);

  if (!lastResult.ok && recoverableStatuses.has(failSt) && candidates.length) {
    let lastProcessedErr = '';
    for (const pid of candidates) {
      let processed = await sentryApi.reportTripProcessed(pid, lastModifiedAt);
      if (!processed.ok && lastModifiedAt) {
        processed = await sentryApi.reportTripProcessed(pid, null);
      }
      lastProcessedErr = processed.ok ? '' : extractSentryError(processed);
      if (processed.ok) {
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'marketplace_take_processed_recovery_after_take_failure',
          direction: 'export',
          record_type: 'trip',
          external_id: pid,
          status: 'success',
          error_message: '',
          payload: {
            candidate_ids: candidates,
            winning_id: pid,
            last_take_status: lastResult.status,
            last_take_error: extractSentryError(lastResult),
            had_404_existence_probe: existedAfter404,
            existence_probe_winning_id: existenceProbeWinningId || null,
            retry_strategy: 'report_trip_processed_per_candidate',
            driver_id: driver.id,
            driver_name: driver.full_name,
          },
        });
        return {
          ok: true,
          takeResult: { ...lastResult, ok: true, recoveredBy: 'report_trip_processed_after_take_failures' },
          usedTakeUrlId: pid,
          recovery: 'report_trip_processed_after_take_failures',
        };
      }
    }
    await supabase.from('sentry_sync_log').insert({
      sync_type: 'marketplace_take_processed_recovery_failed',
      direction: 'export',
      record_type: 'trip',
      external_id: String(trip?.sentry_trip_id || '').trim() || candidates[0],
      status: 'failed',
      error_message: lastProcessedErr || extractSentryError(lastResult),
      payload: {
        candidate_ids: candidates,
        last_take_status: lastResult.status,
        last_take_error: extractSentryError(lastResult),
        had_404_existence_probe: existedAfter404,
        existence_probe_winning_id: existenceProbeWinningId || null,
        driver_id: driver.id,
        driver_name: driver.full_name,
      },
    });
  }

  const primaryTripId = String(existenceProbeWinningId || '').trim() || String(trip?.sentry_trip_id || '').trim() || candidates[0] || '';
  return { ok: false, takeResult: lastResult, usedTakeUrlId: primaryTripId, recovery: null };
}

function buildLocalOnlyTestTrip({ companyId, driver, testingNote = '', scheduledPickupAt = null } = {}) {
  const now = new Date();
  const pickupEpoch = parseScheduleEpoch(scheduledPickupAt) || (now.getTime() + 10 * 60 * 1000);
  const pickup = new Date(pickupEpoch).toISOString();
  const dropoff = new Date(pickupEpoch + 25 * 60 * 1000).toISOString();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return {
    id: `local-test-${Date.now()}-${suffix}`,
    sentry_trip_id: `LOCAL-TEST-${Date.now()}-${suffix}`,
    sentry_last_modified_at: '',
    date_val: pickup.slice(0, 10),
    los: 'TEST',
    passengers: '1',
    mileage: '4.2',
    pu_address: '55 Water St, New York, NY 10041',
    pu_city: 'New York',
    pu_zip: '10041',
    pu_time: pickup,
    do_address: '350 Jay St, Brooklyn, NY 11201',
    do_city: 'Brooklyn',
    do_zip: '11201',
    do_time: dropoff,
    delivery_price: '98.00',
    status: 'available',
    company_id: companyId || driver?.company_id || null,
    assignment_type_code: 'LOCAL_TEST',
    external_trip_status: 'local_test',
    raw_payload: {
      source: 'penthouse_local_test_trip',
      testing_note: testingNote,
      driver_id: driver?.id || null,
    },
    loaded_at: now.toISOString(),
    localOnlyTestTrip: true,
  };
}

function deriveMtaFareInfo(trip = {}) {
  const raw = trip.raw_payload || {};
  const mta = raw.mta || trip.mta || {};
  const required = Boolean(
    mta.collected_fare_required ||
    mta.fare_required ||
    raw.collected_fare_required ||
    raw.fare_required ||
    raw.mta_fare_required ||
    String(trip.assignment_type_code || raw.assignment_type_code || '').toUpperCase().includes('MTA')
  );
  const amount =
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

export default function LiveDispatch() {
  const {
    profile,
    company,
    adminPreviewCompany,
    isCompany,
    role,
    drivers,
    trips,
    assignments,
    loadDrivers,
    loadTrips,
    loadAssignments,
    refreshTripsFromSentry,
    runAISchedulerPipeline,
    sentryStatus,
  } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [take5Driver, setTake5Driver] = useState(null);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState(null);
  const [companyTripView, setCompanyTripView] = useState('queue');

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [showDeleteSingleModal, setShowDeleteSingleModal] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteToast, setDeleteToast] = useState(null);
  const [takingTestTrip, setTakingTestTrip] = useState(false);
  const [showFleetPanel, setShowFleetPanel] = useState(false);
  const [showTripsPanel, setShowTripsPanel] = useState(false);
  const [testNoteDraft, setTestNoteDraft] = useState('');
  const [tripSyncMap, setTripSyncMap] = useState({});
  const [undoingTripId, setUndoingTripId] = useState(null);
  const [releasingTripId, setReleasingTripId] = useState(null);
  const [sentryActionTripId, setSentryActionTripId] = useState(null);
  const [recoveringTripId, setRecoveringTripId] = useState(null);
  const [noteSavingTripId, setNoteSavingTripId] = useState(null);
  const [sendingInstructionDriverId, setSendingInstructionDriverId] = useState(null);
  const [copyingSteps, setCopyingSteps] = useState(false);
  const [takeConfirmState, setTakeConfirmState] = useState(null);
  const [assignmentNoteDrafts, setAssignmentNoteDrafts] = useState({});
  const [allowMultiTripTake, setAllowMultiTripTake] = useState(false);
  const schedulerPrefs = readCompanySchedulerPrefs(company);
  const handledRejectedTripIdsRef = React.useRef(new Map());
  const tripRecoveryPrefs = {
    tripCopyEnabled: schedulerPrefs.trip_copy_enabled !== false,
    tripRerouteEnabled: schedulerPrefs.trip_reroute_enabled !== false,
    tripReassignEnabled: schedulerPrefs.trip_reassign_enabled !== false,
    aiAutoReassignAfterReject: Boolean(schedulerPrefs.ai_auto_reassign_after_reject),
    aiAutoCopyAfterReject: Boolean(schedulerPrefs.ai_auto_copy_after_reject),
  };

  /** Treat dispatcher/company roles as company workspace users for dispatch controls. */
  const isCompanyUser = isCompany || role === 'company' || role === 'dispatcher';
  const isAdminCompanyPreview = role === 'admin' && !!adminPreviewCompany?.id;
  /** Regular dispatch assigns must stay production-like (not test-tagged). */
  const scopedTestAssignOptions = () => ({});

  const canManageFleet = isCompanyUser;
  const scopedCompanyId = adminPreviewCompany?.id || company?.id || profile?.company_id || null;

  const lockedTripIdSet = useMemo(() => {
    const next = new Set();
    for (const a of assignments || []) {
      const tid = normalizeTripId(a?.trip_id);
      if (!tid) continue;
      if (isTripLockStatus(a?.status)) next.add(tid);
    }
    return next;
  }, [assignments]);

  function driverHasLockConflict(driverId) {
    if (!driverId) return false;
    return (assignments || []).some(
      a => String(a.driver_id || '') === String(driverId) && isTripLockStatus(a?.status)
    );
  }

  function getDriverActiveTripContext(driverId) {
    if (!driverId) return { active: null, queuedCount: 0, completionEpoch: null };
    const scoped = (assignments || []).filter(a => String(a.driver_id || '') === String(driverId || ''));
    const active = scoped
      .filter(a => IN_PROGRESS_TRIP_STATUSES.has(String(a.status || '').toLowerCase()))
      .sort((a, b) => toEpoch(b.accepted_at || b.assigned_at) - toEpoch(a.accepted_at || a.assigned_at))[0] || null;
    const queuedCount = scoped.filter(a => String(a.status || '').toLowerCase() === 'pending').length;
    return {
      active,
      queuedCount,
      completionEpoch: deriveActiveTripCompletionEpoch(active),
    };
  }

  function validateQueueAssignmentTiming(driver, trip, tripIdKey) {
    const context = getDriverActiveTripContext(driver?.id);
    if (!context.active) return { ok: true };
    if (context.queuedCount > 0) {
      return { ok: false, reason: `${driver?.full_name || 'Driver'} already has a queued next trip.` };
    }
    if (!context.completionEpoch) {
      return { ok: false, reason: 'Cannot queue next trip yet because active trip ETA is not available.' };
    }
    const minsToComplete = Math.ceil((context.completionEpoch - Date.now()) / 60000);
    if (minsToComplete > QUEUE_WINDOW_MINS) {
      return { ok: false, reason: `Queue next trip only near end of the ride (${QUEUE_WINDOW_MINS} min window).` };
    }
    const pickupEpoch = parseScheduleEpoch(trip?.pu_time);
    if (!pickupEpoch) {
      return { ok: false, reason: 'Queued next trip must have a valid scheduled pickup time.' };
    }
    if (pickupEpoch < context.completionEpoch + 2 * 60 * 1000) {
      return { ok: false, reason: 'Next trip pickup must be scheduled after current trip completion.' };
    }
    const duplicate = (assignments || []).find(
      a =>
        String(a.driver_id || '') === String(driver?.id || '') &&
        String(a.status || '').toLowerCase() === 'pending' &&
        normalizeTripId(a.trip_id) !== normalizeTripId(tripIdKey)
    );
    if (duplicate) {
      return { ok: false, reason: `${driver?.full_name || 'Driver'} already has a queued next trip.` };
    }
    return { ok: true };
  }

  function canAssignAnotherTrip(driverId) {
    if (!driverId) return false;
    return allowMultiTripTake || !driverHasLockConflict(driverId);
  }

  function scoreDriverForTrip(driver, trip) {
    if (!driver) return Number.NEGATIVE_INFINITY;
    let score = driver.status === 'online' ? 18 : 8;
    const serviceZone = detectServiceZone(trip?.pu_address || '');

    if (driver.current_lat && driver.current_lng && trip?.coords) {
      const dist = haversineDistance(
        parseFloat(driver.current_lat),
        parseFloat(driver.current_lng),
        trip.coords.lat,
        trip.coords.lng
      );
      const driveTime = AI_SCHED.estimateDriveTime(dist, schedulerPrefs.traffic_buffer_pct || 20);
      score += Math.max(0, 10 - dist) * Math.max(0.25, (schedulerPrefs.proximity_weight || 7) / 3.5);
      score -= driveTime * Math.max(0.2, (schedulerPrefs.traffic_weight || 8) / 5);
    }

    score += getZonePreferenceBonus(
      serviceZone,
      normalizePreferredZones(driver?.preferred_zones),
      schedulerPrefs.zone_weight || 10
    );

    return score;
  }

  function getBestDriverForTrip(trip, { excludeDriverId = null } = {}) {
    const eligible = (drivers || []).filter(driver => {
      if (!driver?.id) return false;
      if (excludeDriverId != null && String(driver.id) === String(excludeDriverId)) return false;
      if (driver.is_active === false) return false;
      if (!canAssignAnotherTrip(driver.id)) return false;
      return true;
    });

    if (!eligible.length) return null;

    return eligible
      .map(driver => ({ driver, score: scoreDriverForTrip(driver, trip) }))
      .sort((a, b) => b.score - a.score)[0]?.driver || null;
  }

  useEffect(() => {
    const scopeKey = scopedCompanyId || 'global';
    try {
      const raw = localStorage.getItem(`dispatch_allow_multi_trip_take:${scopeKey}`);
      setAllowMultiTripTake(raw === '1');
    } catch {
      setAllowMultiTripTake(false);
    }
  }, [scopedCompanyId]);

  useEffect(() => {
    const scopeKey = scopedCompanyId || 'global';
    try {
      localStorage.setItem(`dispatch_allow_multi_trip_take:${scopeKey}`, allowMultiTripTake ? '1' : '0');
    } catch {}
  }, [scopedCompanyId, allowMultiTripTake]);

  const availableTrips = useMemo(() => {
    return trips.filter(t => {
      if (t.status !== 'available') return false;
      const tid = normalizeTripId(t.sentry_trip_id);
      if (tid && lockedTripIdSet.has(tid)) return false;
      if (t.taken_by) return false;
      if (search) {
        const q = search.toLowerCase();
        return (t.pu_address || '').toLowerCase().includes(q) ||
               (t.do_address || '').toLowerCase().includes(q) ||
               (t.sentry_trip_id || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [trips, lockedTripIdSet, search]);

  async function handleRefresh() {
    setRefreshing(true);
    await refreshTripsFromSentry();
    await loadDrivers();
    await loadTrips();
    await loadAssignments();
    setRefreshing(false);
  }

  async function loadTripSyncStatus() {
    const tripIds = Array.from(
      new Set([
        ...trips.map(trip => String(trip.sentry_trip_id || '')).filter(Boolean),
        ...assignments.map(assignment => String(assignment.trip_id || '')).filter(Boolean),
      ])
    );

    if (!tripIds.length) {
      setTripSyncMap({});
      return;
    }

    const { data, error } = await supabase
      .from('sentry_sync_log')
      .select('external_id, status, sync_type, direction, error_message, created_at')
      .eq('record_type', 'trip')
      .in('external_id', tripIds)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return;

    const tripStateMap = {};
    for (const trip of trips) {
      const key = String(trip.sentry_trip_id || '');
      if (!key) continue;
      tripStateMap[key] = {
        ...(tripStateMap[key] || {}),
        marketplaceStatus: trip.status,
        takenBy: trip.taken_by,
        loadedAt: trip.loaded_at,
      };
    }

    for (const assignment of assignments) {
      const key = String(assignment.trip_id || '');
      if (!key) continue;
      tripStateMap[key] = {
        ...(tripStateMap[key] || {}),
        assignmentStatus: assignment.status,
      };
    }

    const rowsByTripId = {};
    for (const row of data || []) {
      const key = String(row.external_id || '');
      if (!key) continue;
      if (!rowsByTripId[key]) rowsByTripId[key] = [];
      rowsByTripId[key].push(row);
    }

    const nextMap = {};
    for (const [key, rows] of Object.entries(rowsByTripId)) {
      const resolved = deriveEffectiveSyncEntry(rows, tripStateMap[key] || {});
      if (resolved) nextMap[key] = resolved;
    }
    setTripSyncMap(nextMap);
  }

  useEffect(() => {
    loadTripSyncStatus();
  }, [trips, assignments]);

  function resolveTripLastModifiedForSentry(tripIdKey) {
    const hit = trips.find(t => normalizeTripId(t.sentry_trip_id) === tripIdKey);
    return hit?.sentry_last_modified_at || '';
  }

  /** When Sentry is enabled, callers must treat `ok: false` as a hard stop before mutating local assignment rows. */
  async function syncDispatchSentryRelease(tripIdKey, assignmentRow, tripLastModifiedAt) {
    if (!sentryApi.enabled) return { ok: true, skippedSentry: true };
    const st = String(assignmentRow.status || '').toLowerCase();
    const hasAcceptedProgress = ['accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip'].includes(st);
    const hasArrived = ['arrived', 'picked_up', 'in_progress', 'on_trip'].includes(st);
    const lm = tripLastModifiedAt || new Date().toISOString();

    let statusSyncResult = { ok: true };
    let sentryAction = 'reject';
    if (hasAcceptedProgress) {
      sentryAction = 'cancel_status_update';
      statusSyncResult = await sentryApi.updateTripStatus(tripIdKey, {
        trip_processing_status_id: 2,
        trip_status: 'cancelled',
        cancel_reason_id: 1,
        cancel_note: 'DISPATCH_RELEASE',
        cancelled_at: new Date().toISOString(),
      });
      if (!statusSyncResult.ok) {
        sentryAction = 'cancel_status_update_fallback_reject';
        statusSyncResult = await sentryApi.rejectTrip(tripIdKey, 1, lm, 'DISPATCH_RELEASE');
      }
    } else {
      statusSyncResult = await sentryApi.rejectTrip(tripIdKey, 1, lm, 'DISPATCH_RELEASE');
    }
    await supabase.from('sentry_sync_log').insert({
      sync_type: hasAcceptedProgress ? 'trip_dispatch_release_cancel' : 'trip_reject',
      direction: 'export',
      record_type: 'trip',
      external_id: String(tripIdKey),
      status: statusSyncResult.ok ? 'success' : 'failed',
      error_message: statusSyncResult.ok ? '' : extractSentryError(statusSyncResult),
      payload: {
        driver_id: assignmentRow.driver_id,
        dispatch_release: true,
        sentry_action: sentryAction,
        prior_assignment_status: assignmentRow.status,
        had_accepted_progress: hasAcceptedProgress,
        reached_pickup_arrival: hasArrived,
      },
    });

    if (!statusSyncResult.ok) {
      logFailure('LiveDispatch:dispatchRelease:sentry', {
        tripIdKey,
        detail: extractSentryError(statusSyncResult),
      });
    }
    return { ok: Boolean(statusSyncResult.ok), result: statusSyncResult };
  }

  async function releaseTripLocksForDispatch({ tripIdKey, keepDriverId, tripLastModifiedAt }) {
    const { data: lockedRows, error } = await supabase
      .from('trip_assignments')
      .select('id, trip_id, driver_id, status, actual_pickup_time')
      .eq('trip_id', tripIdKey)
      .in('status', Array.from(TRIP_LOCK_STATUSES));

    if (error) throw new Error(error.message);

    const toRelease = (lockedRows || []).filter(
      row => keepDriverId == null || String(row.driver_id || '') !== String(keepDriverId || '')
    );

    for (const row of toRelease) {
      const rowStatus = String(row?.status || '').toLowerCase();
      const rowHasProgress = IN_PROGRESS_TRIP_STATUSES.has(rowStatus);
      const sentryRelease = await syncDispatchSentryRelease(tripIdKey, row, tripLastModifiedAt);
      if (sentryApi.enabled && !sentryRelease.ok) {
        throw new Error(
          `Broker did not confirm release for trip ${tripIdKey} (driver ${row.driver_id || '?'}). ` +
            `${extractSentryError(sentryRelease.result || {})}. ` +
            `Local state was not updated for this step. If another driver on the same trip was already released in this session, refresh and retry.`
        );
      }

      const { error: upErr } = await supabase
        .from('trip_assignments')
        .update({
          status: rowHasProgress ? 'cancelled' : 'rejected',
          trip_processing_status_id: 2,
          rejected_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (upErr) throw new Error(upErr.message);

      await fbSet(`driver_notifications/${row.driver_id}`, null);
      await fbSet(`trip_assignments/${tripIdKey}`, {
        status: rowHasProgress ? 'cancelled' : 'rejected',
        driverId: row.driver_id,
        releasedByDispatchAt: Date.now(),
      });
    }

    if (toRelease.length) {
      const { error: mErr } = await supabase
        .from('marketplace_trips')
        .update({
          status: 'available',
          taken_by: null,
        })
        .eq('sentry_trip_id', tripIdKey);

      if (mErr) logFailure('LiveDispatch:dispatchRelease:marketplace', mErr);
    }

    return toRelease.length;
  }

  async function waitForTripUnlockAfterDispatchRelease(tripIdKey, driverId) {
    await waitMs(RELEASE_LOCK_RETRY_MS);
    const { data: lockedRows, error } = await supabase
      .from('trip_assignments')
      .select('id, driver_id, status')
      .eq('trip_id', tripIdKey)
      .in('status', Array.from(TRIP_LOCK_STATUSES));
    if (error) throw new Error(error.message);
    const stillLockedByOther = (lockedRows || []).find(
      row => String(row?.driver_id || '') && String(row.driver_id) !== String(driverId || '')
    );
    return !stillLockedByOther;
  }

  function tripStubFromAssignment(assignment) {
    const tid = normalizeTripId(assignment.trip_id);
    const market = trips.find(t => normalizeTripId(t.sentry_trip_id) === tid);
    const lm = resolveTripLastModifiedForSentry(tid);
    if (market) {
      return { ...market, taken_by: null, sentry_last_modified_at: market.sentry_last_modified_at || lm };
    }
    return {
      id: tid,
      sentry_trip_id: tid,
      sentry_last_modified_at: lm,
      pu_address: assignment.pu_address,
      do_address: assignment.do_address,
      pu_time: assignment.pu_time,
      delivery_price: String(assignment.delivery_price ?? ''),
      mileage: String(assignment.mileage ?? ''),
      status: 'available',
      taken_by: null,
      company_id: assignment.company_id || scopedCompanyId,
    };
  }

  async function handleDispatchReleaseTrip(assignment) {
    const tripIdKey = normalizeTripId(assignment.trip_id);
    if (!tripIdKey || !isTripLockStatus(assignment.status)) return;

    if (
      !window.confirm(
        `Release trip ${tripIdKey} from ${assignment.driver_name || 'the assigned driver'}? It goes back to the open queue so another driver can take it.`
      )
    ) {
      return;
    }

    setReleasingTripId(tripIdKey);
    try {
      const lm = resolveTripLastModifiedForSentry(tripIdKey);
      const released = await releaseTripLocksForDispatch({
        tripIdKey,
        keepDriverId: null,
        tripLastModifiedAt: lm,
      });

      if (!released) {
        showToast('Nothing to release for this trip.', 'warning');
        return;
      }

      await loadTrips();
      await loadAssignments();
      await loadTripSyncStatus();
      showToast('Trip released to the queue.');
    } catch (err) {
      showToast(`Release failed: ${err.message}`, 'error');
    } finally {
      setReleasingTripId(null);
    }
  }

  async function handleSentryCopyAction(assignment, mode = 'copy') {
    const tripIdKey = normalizeTripId(assignment?.trip_id);
    if (!tripIdKey) {
      showToast('Trip id missing for Sentry action.', 'error');
      return;
    }
    if (!sentryApi.enabled) {
      showToast('Sentry integration is disabled.', 'error');
      return;
    }
    const actionKey = `${mode}:${tripIdKey}`;
    setSentryActionTripId(actionKey);
    try {
      const payload = {
        source_trip_id: tripIdKey,
        requested_action: mode === 'reroute' ? 'reroute' : 'trip_copy',
        reason: mode === 'reroute' ? 'dispatch_reroute_request' : 'dispatch_trip_copy_request',
      };
      const copyResult = await sentryApi.copyTrip(tripIdKey, payload);
      await supabase.from('sentry_sync_log').insert({
        sync_type: mode === 'reroute' ? 'trip_reroute_copy' : 'trip_copy',
        direction: 'export',
        record_type: 'trip',
        external_id: String(tripIdKey),
        status: copyResult.ok ? 'success' : 'failed',
        error_message: copyResult.ok ? '' : extractSentryError(copyResult),
        payload: {
          source_trip_id: tripIdKey,
          requested_action: payload.requested_action,
          dispatch_requested: true,
        },
      });
      if (copyResult.ok) {
        showToast(
          mode === 'reroute'
            ? 'Reroute request sent to Sentry. Refresh queue for any copied/re-routed trip.'
            : 'Trip copy request sent to Sentry. Refresh queue to load the copy.',
          'success'
        );
        await handleRefresh();
      } else {
        showToast(
          `${mode === 'reroute' ? 'Reroute' : 'Trip copy'} failed: ${extractSentryError(copyResult)}`,
          'error'
        );
      }
    } catch (err) {
      showToast(`${mode === 'reroute' ? 'Reroute' : 'Trip copy'} failed: ${err.message}`, 'error');
    } finally {
      setSentryActionTripId(null);
    }
  }

function isRecentRejectedAssignment(assignment) {
    if (String(assignment?.status || '').toLowerCase() !== 'rejected') return false;
    const rejectedEpoch = toEpoch(
      assignment?.rejected_at ||
      assignment?.updated_at ||
      assignment?.created_at
    );
    if (!rejectedEpoch) return false;
    return Date.now() - rejectedEpoch <= AI_RECOVERY_WINDOW_MS;
  }

  async function handleAiRecoveryAction(assignment, strategy = 'smart', options = {}) {
    const tripIdKey = normalizeTripId(assignment?.trip_id);
    if (!tripIdKey) {
      showToast('Trip id missing for AI recovery.', 'error');
      return { ok: false, reason: 'missing_trip_id' };
    }

    const tripStub = tripStubFromAssignment(assignment);
    const recoveryDriver = tripRecoveryPrefs.tripReassignEnabled
      ? getBestDriverForTrip(tripStub, { excludeDriverId: assignment?.driver_id })
      : null;

    if (tripRecoveryPrefs.tripReassignEnabled && recoveryDriver && strategy !== 'copy') {
      setRecoveringTripId(`reassign:${tripIdKey}`);
      try {
        await assignTrip(tripStub, recoveryDriver, scopedTestAssignOptions());
        const { data: confirmedRecovery } = await supabase
          .from('trip_assignments')
          .select('id')
          .eq('trip_id', tripIdKey)
          .eq('driver_id', recoveryDriver.id)
          .in('status', Array.from(TRIP_LOCK_STATUSES))
          .limit(1)
          .maybeSingle();
        if (!confirmedRecovery?.id) {
          showToast('AI reassign did not confirm on the active trip row.', 'warning');
          return { ok: false, reason: 'reassign_not_confirmed' };
        }
        showToast(
          options.auto
            ? `AI reassigned ${tripIdKey} to ${recoveryDriver.full_name}.`
            : `Trip reassigned to ${recoveryDriver.full_name}.`
        );
        return { ok: true, mode: 'reassign', driverId: recoveryDriver.id };
      } catch (err) {
        showToast(`AI reassign failed: ${err.message}`, 'error');
      } finally {
        setRecoveringTripId(null);
      }
    }

    if (
      tripRecoveryPrefs.tripCopyEnabled &&
      (strategy === 'copy' || (strategy === 'smart' && tripRecoveryPrefs.aiAutoCopyAfterReject))
    ) {
      await handleSentryCopyAction(assignment, 'copy');
      return { ok: true, mode: 'copy' };
    }

    if (strategy === 'reroute' && tripRecoveryPrefs.tripRerouteEnabled) {
      await handleSentryCopyAction(assignment, 'reroute');
      return { ok: true, mode: 'reroute' };
    }

    showToast('No safe AI recovery action is enabled for this trip.', 'warning');
    return { ok: false, reason: 'no_enabled_action' };
  }

  async function assignTrip(trip, driver, options = {}) {
    const tripIdKey = normalizeTripId(trip?.sentry_trip_id);
    if (!tripIdKey) {
      showToast('This trip is missing an id and cannot be assigned.', 'error');
      return;
    }

    let dispatchReleasedOtherDriver = false;
    const conflictingLock = (assignments || []).find(
      a =>
        normalizeTripId(a.trip_id) === tripIdKey &&
        isTripLockStatus(a?.status) &&
        String(a.driver_id || '') !== String(driver?.id || '')
    );

    if (conflictingLock) {
      const priorName = conflictingLock.driver_name || conflictingLock.drivers?.full_name || 'another driver';
      if (
        !window.confirm(
          `This trip is active on ${priorName}. Assign to ${driver.full_name} anyway? The current driver will be removed and Sentry will be notified (reject / cancel per trip stage).`
        )
      ) {
        return;
      }
      try {
        await releaseTripLocksForDispatch({
          tripIdKey,
          keepDriverId: null,
          tripLastModifiedAt: trip.sentry_last_modified_at || resolveTripLastModifiedForSentry(tripIdKey),
        });
        const unlocked = await waitForTripUnlockAfterDispatchRelease(tripIdKey, driver?.id);
        if (!unlocked) {
          showToast('Trip release is still syncing. Please retry in a moment.', 'warning');
          return;
        }
        dispatchReleasedOtherDriver = true;
        await loadAssignments();
        await loadTrips();
      } catch (err) {
        showToast(`Could not release prior assignment: ${err.message}`, 'error');
        return;
      }
    }

    const claimedBy = trip?.taken_by != null && trip?.taken_by !== '' ? String(trip.taken_by) : '';
    if (!dispatchReleasedOtherDriver && claimedBy && claimedBy !== String(driver?.id || '')) {
      showToast('This trip is already claimed on the marketplace by another driver or company.', 'error');
      return;
    }

    if (!dispatchReleasedOtherDriver) {
      const tripAlreadyLocked = (assignments || []).find(
        a => normalizeTripId(a.trip_id) === tripIdKey && isTripLockStatus(a?.status)
      );
      if (tripAlreadyLocked) {
        const sameDriver = String(tripAlreadyLocked.driver_id || '') === String(driver?.id || '');
        showToast(
          sameDriver
            ? 'This trip is already active for that driver.'
            : 'This trip is already assigned to another driver.',
          'error'
        );
        return;
      }
    }

    if (!allowMultiTripTake) {
      const driverBusy = (assignments || []).find(
        a =>
          String(a.driver_id || '') === String(driver?.id || '') &&
          normalizeTripId(a.trip_id) !== tripIdKey &&
          isTripLockStatus(a?.status)
      );
      if (driverBusy) {
        showToast(
          `${driver?.full_name || 'Driver'} already has an active trip. Finish or reject it before assigning another.`,
          'error'
        );
        return;
      }
    }
    if (allowMultiTripTake) {
      const queueTiming = validateQueueAssignmentTiming(driver, trip, tripIdKey);
      if (!queueTiming.ok) {
        showToast(queueTiming.reason, 'error');
        return;
      }
    }

    const offerFp = tripOfferFingerprintFromTrip(trip);
    const ghostDuplicate = (assignments || []).find(
      a =>
        offerFp &&
        tripOfferFingerprintFromAssignment(a) === offerFp &&
        isTripLockStatus(a?.status) &&
        String(a.driver_id || '') === String(driver?.id || '') &&
        normalizeTripId(a.trip_id) !== tripIdKey
    );
    if (ghostDuplicate) {
      showToast(
        'This driver already has the same route active under another assignment. Finish or reject that trip first.',
        'error'
      );
      return;
    }

    const { data: liveTripRow, error: liveTripError } = await supabase
      .from('marketplace_trips')
      .select('status, taken_by')
      .eq('sentry_trip_id', tripIdKey)
      .maybeSingle();
    if (liveTripError) {
      logFailure('LiveDispatch:assignTrip:marketplace_trips', liveTripError);
      showToast('Could not verify live trip availability. Refresh and try again.', 'error');
      return;
    }

    const liveTakenBy =
      liveTripRow?.taken_by != null && liveTripRow?.taken_by !== ''
        ? String(liveTripRow.taken_by)
        : '';
    if (liveTakenBy && liveTakenBy !== String(driver?.id || '')) {
      showToast('This trip was just claimed by another driver or company.', 'error');
      return;
    }

    const { data: liveLockedAssignments, error: liveLockedAssignmentsError } = await supabase
      .from('trip_assignments')
      .select('driver_id, status')
      .eq('trip_id', tripIdKey)
      .in('status', Array.from(TRIP_LOCK_STATUSES));
    if (liveLockedAssignmentsError) {
      logFailure('LiveDispatch:assignTrip:trip_assignments', liveLockedAssignmentsError);
      showToast('Could not verify assignment lock state. Refresh and try again.', 'error');
      return;
    }

    const liveConflict = (liveLockedAssignments || []).find(
      row => String(row?.driver_id || '') && String(row.driver_id) !== String(driver?.id || '')
    );
    if (liveConflict) {
      showToast('This trip is already locked for another driver.', 'error');
      return;
    }

    setAssigning(tripIdKey);
    const assignmentNotes = buildAssignmentNotes('', {
      isTestTrip: Boolean(options.isTestTrip),
      testingNote: options.testingNote || '',
    });

    let lastModifiedAt = trip.sentry_last_modified_at || '';
    /** Fresh row + merged raw_payload for Sentry take / processed id fallbacks. */
    let tripForSentryOps = trip;
    /** Trip id Sentry accepted for take (may differ from row key, e.g. leg vs base id). */
    let sentryTripIdWonTake = tripIdKey;
    let takeResult = { ok: true };
    let testTakeBypassed = false;

    const syntheticTestTrip = isSyntheticMarketplaceTrip(trip, options);
    const localOnlyTestTrip = Boolean(options.localOnlyTestTrip || trip.localOnlyTestTrip);
    const skipUpstreamMarketplaceSync = Boolean(localOnlyTestTrip || syntheticTestTrip);

    if (skipUpstreamMarketplaceSync) {
      testTakeBypassed = true;
      await supabase.from('sentry_sync_log').insert({
        sync_type: localOnlyTestTrip ? 'marketplace_take_test_local_only' : 'marketplace_take_test_synthetic_bypass',
        direction: 'internal',
        record_type: 'trip',
        external_id: tripIdKey,
        status: 'success',
        error_message: localOnlyTestTrip
          ? 'No usable Sentry marketplace row was available; created local-only test trip for driver acceptance testing.'
          : 'Synthetic sandbox marketplace row detected; skipped upstream Sentry take and assigned locally for test coverage.',
        payload: {
          driver_id: driver.id,
          driver_name: driver.full_name,
          company_id: scopedCompanyId || driver.company_id || null,
          reason: localOnlyTestTrip ? 'local_only_test_trip' : 'synthetic_test_marketplace_row',
        },
      });
    } else if (sentryApi.enabled && sentryApi.features.marketplaceTrips) {
      if (scopedCompanyId) {
        try {
          await refreshTripsFromSentry({ companyId: scopedCompanyId });
        } catch (refreshErr) {
          logFailure('LiveDispatch:assignTrip:refreshTripsFromSentry', refreshErr);
        }
      }
      const { data: freshMarketplaceRow, error: freshMarketplaceErr } = await supabase
        .from('marketplace_trips')
        .select('*')
        .eq('sentry_trip_id', tripIdKey)
        .maybeSingle();
      if (!freshMarketplaceErr && freshMarketplaceRow?.sentry_trip_id) {
        const oldRaw = trip.raw_payload && typeof trip.raw_payload === 'object' ? trip.raw_payload : {};
        const newRaw =
          freshMarketplaceRow.raw_payload && typeof freshMarketplaceRow.raw_payload === 'object'
            ? freshMarketplaceRow.raw_payload
            : {};
        tripForSentryOps = {
          ...trip,
          ...freshMarketplaceRow,
          raw_payload: Object.keys(newRaw).length ? { ...oldRaw, ...newRaw } : trip.raw_payload || freshMarketplaceRow.raw_payload || {},
        };
        const lmFresh = String(freshMarketplaceRow.sentry_last_modified_at || '').trim();
        if (lmFresh) lastModifiedAt = lmFresh;
      }
      const takeRecovery = await executeMarketplaceTakeWithSentryRecoveries(tripForSentryOps, driver, lastModifiedAt);
      takeResult = takeRecovery.takeResult;
      sentryTripIdWonTake = String(takeRecovery?.usedTakeUrlId || '').trim() || tripIdKey;

      const takeErrorMessage = takeResult.ok ? '' : extractSentryError(takeResult);

      await supabase.from('sentry_sync_log').insert({
        sync_type: 'marketplace_take',
        direction: 'export',
        record_type: 'trip',
        external_id: trip.sentry_trip_id,
        status: takeResult.ok ? 'success' : 'failed',
        error_message: takeErrorMessage,
        payload: {
          driver_id: driver.id,
          driver_name: driver.full_name,
          vehicle_plate: driver.vehicle_plate || '',
          license_number: driver.license_number || '',
        },
      });
    }

    if (!takeResult.ok) {
      const takeErrorMessage = extractSentryError(takeResult);
      showToast(`Sentry did not confirm this trip take. ${takeErrorMessage}`, 'error');
      setAssigning(null);
      return;
    }

    if (localOnlyTestTrip) {
      const { error: seedTripError } = await supabase.from('marketplace_trips').upsert(
        {
          sentry_trip_id: tripIdKey,
          sentry_last_modified_at: trip.sentry_last_modified_at || '',
          date_val: trip.date_val || new Date().toISOString().slice(0, 10),
          los: trip.los || 'TEST',
          passengers: trip.passengers || '1',
          mileage: String(trip.mileage || ''),
          pu_address: trip.pu_address || '',
          pu_city: trip.pu_city || '',
          pu_zip: trip.pu_zip || '',
          pu_time: trip.pu_time || '',
          do_address: trip.do_address || '',
          do_city: trip.do_city || '',
          do_zip: trip.do_zip || '',
          do_time: trip.do_time || '',
          delivery_price: String(trip.delivery_price || ''),
          status: 'available',
          company_id: scopedCompanyId || driver.company_id || null,
          assignment_type_code: trip.assignment_type_code || 'LOCAL_TEST',
          external_trip_status: trip.external_trip_status || 'local_test',
          raw_payload: trip.raw_payload || { source: 'penthouse_local_test_trip' },
          loaded_at: new Date().toISOString(),
        },
        { onConflict: 'sentry_trip_id' }
      );

      if (seedTripError) {
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'local_test_marketplace_seed',
          direction: 'internal',
          record_type: 'trip',
          external_id: tripIdKey,
          status: 'failed',
          error_message: seedTripError.message,
          payload: { driver_id: driver.id, company_id: scopedCompanyId || driver.company_id || null },
        });
      }
    }

    const { data: insertedAssignment, error } = await supabase.from('trip_assignments').insert({
      trip_id: tripIdKey,
      driver_id: driver.id,
      company_id: driver.company_id || scopedCompanyId || null,
      driver_name: driver.full_name,
      status: 'pending',
      trip_processing_status_id: 0,
      pu_address: trip.pu_address,
      do_address: trip.do_address,
      pu_time: trip.pu_time,
      scheduled_pickup_time: trip.pu_time || null,
      delivery_price: parseFloat(trip.delivery_price) || 0,
      mileage: parseFloat(trip.mileage) || 0,
      notes: assignmentNotes,
    }).select('id').maybeSingle();

    if (error) {
      await supabase.from('sentry_sync_log').insert({
        sync_type: 'local_assignment_create',
        direction: 'internal',
        record_type: 'trip',
        external_id: tripIdKey,
        status: 'failed',
        error_message: error.message,
        payload: {
          driver_id: driver.id,
          driver_name: driver.full_name,
        },
      });
      const dup = error.code === '23505';
      showToast(
        dup
          ? 'This trip (or driver) already has an active assignment.'
          : testTakeBypassed
            ? `Test trip could not be saved locally: ${error.message}`
            : `Trip was taken in Sentry, but local assignment failed: ${error.message}`,
        'error'
      );
      setAssigning(null);
      return;
    }

    await supabase.from('sentry_sync_log').insert({
      sync_type: 'local_assignment_create',
      direction: 'internal',
      record_type: 'trip',
      external_id: tripIdKey,
      status: 'success',
      error_message: '',
      payload: {
        driver_id: driver.id,
        driver_name: driver.full_name,
        assignment_status: 'pending',
      },
    });

    await supabase
      .from('marketplace_trips')
      .update({
        status: 'assigned',
        taken_by: driver.id,
        company_id: driver.company_id || scopedCompanyId || null,
      })
      .eq('sentry_trip_id', trip.sentry_trip_id);

    const driverPayType = String(driver?.pay_rate_type || 'hourly').toLowerCase();
    const mtaFareInfo = deriveMtaFareInfo(trip);
    const notificationPayload = {
      type: 'new_trip',
      tripId: trip.sentry_trip_id,
      lastModifiedAt,
      puAddress: trip.pu_address,
      doAddress: trip.do_address,
      puTime: trip.pu_time,
      ...(driverPayType === 'per_trip' ? { deliveryPrice: trip.delivery_price } : {}),
      mileage: trip.mileage,
      assignedAt: Date.now(),
      testingNote: options.testingNote || '',
      isTestTrip: Boolean(options.isTestTrip || syntheticTestTrip),
      ...mtaFareInfo,
    };
    const notifyResult = await setDriverNotificationWithRetry(driver.id, notificationPayload);
    if (!notifyResult.ok) {
      logFailure('LiveDispatch:driver_notification', {
        driverId: driver.id,
        tripId: trip.sentry_trip_id,
        error: notifyResult.error,
      });
      showToast(
        `Assignment is saved, but the driver's device did not get the Firebase ping after retries (${notifyResult.error || 'unknown'}). The driver app will still pick this up from the assignment record on the next sync.`,
        'error'
      );
    }

    if (sentryApi.enabled) {
      if (testTakeBypassed) {
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'trip_processed_skipped',
          direction: 'internal',
          record_type: 'trip',
          external_id: trip.sentry_trip_id,
          status: 'success',
          error_message: 'Marketplace take did not succeed on Sentry; skipping processed sync.',
          payload: { driver_id: driver.id, driver_name: driver.full_name },
        });
      } else {
        let processedResult = await sentryApi.reportTripProcessed(sentryTripIdWonTake, lastModifiedAt);
        if (!processedResult.ok && lastModifiedAt) {
          processedResult = await sentryApi.reportTripProcessed(sentryTripIdWonTake, null);
        }
        const procSt = Number(processedResult.status || 0);
        if (!processedResult.ok && (procSt === 422 || procSt === 404)) {
          for (const altId of collectMarketplaceTakeTripIdCandidates(tripForSentryOps)) {
            if (String(altId) === String(sentryTripIdWonTake)) continue;
            let altRes = await sentryApi.reportTripProcessed(altId, lastModifiedAt);
            if (!altRes.ok && lastModifiedAt) {
              altRes = await sentryApi.reportTripProcessed(altId, null);
            }
            if (altRes.ok) {
              processedResult = altRes;
              break;
            }
            processedResult = altRes;
          }
        }
        const procStAfterAlts = Number(processedResult.status || 0);
        let processedTreated409AsIdempotent = false;
        if (!processedResult.ok && procStAfterAlts === 409) {
          processedResult = { ...processedResult, ok: true };
          processedTreated409AsIdempotent = true;
        }
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'trip_processed',
          direction: 'export',
          record_type: 'trip',
          external_id: trip.sentry_trip_id,
          status: processedResult.ok ? 'success' : 'failed',
          error_message: processedResult.ok ? '' : (processedResult.error || `HTTP ${processedResult.status}`),
          payload: {
            driver_id: driver.id,
            driver_name: driver.full_name,
            trip_processing_status_id: 0,
            sentry_trip_id_used: sentryTripIdWonTake,
            ...(processedTreated409AsIdempotent
              ? { resolution: 'http_409_treated_as_idempotent_duplicate' }
              : {}),
          },
        });
        if (!processedResult.ok) {
          const detail = extractSentryError(processedResult);
          // Strict assign flow: if Sentry does not confirm, rollback local assignment state.
          if (insertedAssignment?.id) {
            await supabase.from('trip_assignments').delete().eq('id', insertedAssignment.id);
          } else {
            await supabase
              .from('trip_assignments')
              .delete()
              .eq('trip_id', tripIdKey)
              .eq('driver_id', driver.id)
              .eq('status', 'pending');
          }
          await supabase
            .from('marketplace_trips')
            .update({
              status: 'available',
              external_trip_status: 'available',
              taken_by: null,
            })
            .eq('sentry_trip_id', trip.sentry_trip_id);
          await fbSet(`driver_notifications/${driver.id}`, null);
          showToast(
            `Assign was rolled back because Sentry did not confirm trip status sync. ${detail}`,
            'error'
          );
          await loadTrips();
          await loadAssignments();
          await loadTripSyncStatus();
          setAssigning(null);
          return;
        }
      }
    }

    await loadTrips();
    await loadAssignments();
    await loadTripSyncStatus();
    setAssigning(null);
  }

  function getBestAvailableDriver() {
    if (selectedDriver?.id && canAssignAnotherTrip(selectedDriver.id)) return selectedDriver;

    const onlineDrivers = drivers.filter(d => d.status === 'online' && canAssignAnotherTrip(d.id));
    if (onlineDrivers.length > 0) return onlineDrivers[0];

    const activeDrivers = drivers.filter(d => d.is_active !== false && canAssignAnotherTrip(d.id));
    return activeDrivers[0] || null;
  }

  function openTakeConfirm(mode = 'manual', preferredDriver = null) {
    const driver = mode === 'ai'
      ? getBestAvailableDriver()
      : (preferredDriver || selectedDriver || getBestAvailableDriver());
    if (!driver) {
      showToast(
        mode === 'ai'
          ? 'No driver is available for AI-assisted test take.'
          : 'No driver is available to take this trip right now.',
        'error'
      );
      return;
    }
    if (!allowMultiTripTake && driverHasLockConflict(driver.id)) {
      showToast(
        `${driver.full_name} already has an active trip. Finish or reject it before assigning another.`,
        'error'
      );
      return;
    }

    const activeContext = allowMultiTripTake ? getDriverActiveTripContext(driver.id) : { active: null, completionEpoch: null };
    if (allowMultiTripTake && activeContext.active) {
      if (activeContext.queuedCount > 0) {
        showToast(`${driver.full_name} already has a queued next trip.`, 'error');
        return;
      }
      if (!activeContext.completionEpoch) {
        showToast('Cannot queue next trip yet because active trip ETA is unavailable.', 'error');
        return;
      }
      const minsToComplete = Math.ceil((activeContext.completionEpoch - Date.now()) / 60000);
      if (minsToComplete > QUEUE_WINDOW_MINS) {
        showToast(`Queue next trip only near end of the ride (${QUEUE_WINDOW_MINS} min window).`, 'error');
        return;
      }
    }
    const eligibleTrips = activeContext.active
      ? companyOpenTrips.filter(trip => {
          const pickupEpoch = parseScheduleEpoch(trip?.pu_time);
          return Boolean(
            pickupEpoch &&
            activeContext.completionEpoch &&
            pickupEpoch >= activeContext.completionEpoch + 2 * 60 * 1000
          );
        })
      : companyOpenTrips;

    const trip = eligibleTrips[0] || buildLocalOnlyTestTrip({
      companyId: scopedCompanyId || driver.company_id || null,
      driver,
      testingNote: testNoteDraft,
      scheduledPickupAt: activeContext.completionEpoch
        ? new Date(activeContext.completionEpoch + 5 * 60 * 1000).toISOString()
        : null,
    });
    if (trip.localOnlyTestTrip) {
      showToast(
        'Sentry has no open usable marketplace row, so this will create a local-only test ride for the driver app.',
        'warning'
      );
    }

    setTakeConfirmState({ mode, trip, driver });
  }

  async function handleTakeOneTestTrip(mode = 'manual', preferredDriver = null) {
    const driver = mode === 'ai'
      ? getBestAvailableDriver()
      : (preferredDriver || selectedDriver || getBestAvailableDriver());
    if (!driver) return;
    if (!allowMultiTripTake && driverHasLockConflict(driver.id)) {
      showToast(
        `${driver.full_name} already has an active trip. Finish or reject it before taking another test trip.`,
        'error'
      );
      return;
    }

    const trip = companyOpenTrips[0] || buildLocalOnlyTestTrip({
      companyId: scopedCompanyId || driver.company_id || null,
      driver,
      testingNote: testNoteDraft,
    });

    setTakingTestTrip(true);
    try {
      if (mode === 'ai' && !trip.localOnlyTestTrip) {
        await runAISchedulerPipeline();

        const refreshedAssignments = await loadAssignments();
        const aiAssigned = refreshedAssignments.some(
          assignment =>
            String(assignment.trip_id || '') === String(trip.sentry_trip_id || '') &&
            String(assignment.driver_id || '') === String(driver.id || '')
        );

        if (aiAssigned) {
          showToast(`AI took 1 test trip and assigned it to ${driver.full_name}.`);
          return;
        }
      }

      await assignTrip(trip, driver, {
        isTestTrip: true,
        localOnlyTestTrip: Boolean(trip.localOnlyTestTrip),
        testingNote: testNoteDraft,
      });
      showToast(
        trip.localOnlyTestTrip
          ? `Local-only test ride created and assigned to ${driver.full_name}. Open the driver app to accept it.`
          : mode === 'ai'
          ? `AI assist took 1 test trip and assigned it to ${driver.full_name}.`
          : `Test trip taken and assigned to ${driver.full_name}.`
      );
      setTestNoteDraft('');
    } catch (err) {
      showToast(`Test take failed: ${err.message}`, 'error');
    } finally {
      setTakingTestTrip(false);
      setTakeConfirmState(null);
    }
  }

  const scoredTrips = availableTrips.map(t => {
    let score = (parseFloat(t.delivery_price) || 0) * Math.max(0.5, (schedulerPrefs.price_weight || 8) / 8);
    const serviceZone = detectServiceZone(t.pu_address || '');
    if (selectedDriver?.current_lat && selectedDriver?.current_lng && t.coords) {
      const dist = haversineDistance(
        parseFloat(selectedDriver.current_lat), parseFloat(selectedDriver.current_lng),
        t.coords.lat, t.coords.lng
      );
      const driveTime = AI_SCHED.estimateDriveTime(dist, schedulerPrefs.traffic_buffer_pct || 20);
      score += Math.max(0, 10 - dist) * Math.max(0.25, (schedulerPrefs.proximity_weight || 7) / 3.5);
      score -= driveTime * Math.max(0.2, (schedulerPrefs.traffic_weight || 8) / 5);
    }
    score += getZonePreferenceBonus(
      serviceZone,
      normalizePreferredZones(selectedDriver?.preferred_zones),
      schedulerPrefs.zone_weight || 10
    );
    return { ...t, score, serviceZone };
  }).sort((a, b) => b.score - a.score);

  const activeAssignments = assignments.filter(a => !['completed', 'cancelled', 'rejected'].includes(a.status));
  const recentRejectedAssignments = assignments
    .filter(isRecentRejectedAssignment)
    .sort((a, b) => toEpoch(b.rejected_at || b.updated_at || b.created_at) - toEpoch(a.rejected_at || a.updated_at || a.created_at))
    .slice(0, 5);
  const visibleAssignments = activeAssignments.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (a.pu_address || '').toLowerCase().includes(q) ||
           (a.do_address || '').toLowerCase().includes(q) ||
           (a.driver_name || '').toLowerCase().includes(q) ||
           (a.trip_id || '').toLowerCase().includes(q);
  });
  const companyOpenTrips = scoredTrips.filter(trip => !lockedTripIdSet.has(normalizeTripId(trip.sentry_trip_id)));
  const selectedDriverHasActiveTrip =
    Boolean(selectedDriver?.id) &&
    !allowMultiTripTake &&
    driverHasLockConflict(selectedDriver.id);

  const assignTestTripReady = useMemo(
    () => Boolean(getBestAvailableDriver()),
    [drivers, assignments, selectedDriver?.id, allowMultiTripTake]
  );

  useEffect(() => {
    if (!tripRecoveryPrefs.aiAutoReassignAfterReject && !tripRecoveryPrefs.aiAutoCopyAfterReject) return;
    const now = Date.now();
    for (const [k, ts] of handledRejectedTripIdsRef.current.entries()) {
      if (now - Number(ts || 0) > AI_RECOVERY_WINDOW_MS) handledRejectedTripIdsRef.current.delete(k);
    }
    const nextCandidate = recentRejectedAssignments.find(assignment => {
      const tripIdKey = normalizeTripId(assignment.trip_id);
      if (!tripIdKey) return false;
      if (lockedTripIdSet.has(tripIdKey)) return false;
      const dedupeKey = `${tripIdKey}:${assignment.driver_id || ''}:${assignment.rejected_at || assignment.updated_at || assignment.id}`;
      return !handledRejectedTripIdsRef.current.has(dedupeKey);
    });

    if (!nextCandidate) return;

    const tripIdKey = normalizeTripId(nextCandidate.trip_id);
    const dedupeKey = `${tripIdKey}:${nextCandidate.driver_id || ''}:${nextCandidate.rejected_at || nextCandidate.updated_at || nextCandidate.id}`;
    handledRejectedTripIdsRef.current.set(dedupeKey, Date.now());

    let cancelled = false;

    (async () => {
      const result = await handleAiRecoveryAction(nextCandidate, 'smart', { auto: true });
      if (!result.ok && !cancelled) {
        handledRejectedTripIdsRef.current.set(dedupeKey, Date.now());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    recentRejectedAssignments,
    lockedTripIdSet,
    tripRecoveryPrefs.aiAutoReassignAfterReject,
    tripRecoveryPrefs.aiAutoCopyAfterReject,
    tripRecoveryPrefs.tripReassignEnabled,
    tripRecoveryPrefs.tripCopyEnabled,
  ]);

  function showToast(msg, type = 'success') {
    setDeleteToast({ msg, type });
    setTimeout(() => setDeleteToast(null), 4000);
  }

  async function hardDeleteDriver(driver) {
    if (driver.sentry_driver_id && sentryApi.enabled && sentryApi.features.drivers) {
      const result = await sentryApi.deactivateDriver(driver.sentry_driver_id);
      await supabase.from('sentry_sync_log').insert({
        sync_type: 'driver_hard_delete',
        direction: 'export',
        record_type: 'driver',
        external_id: driver.sentry_driver_id,
        internal_id: driver.id,
        status: result.ok ? 'success' : 'failed',
        error_message: result.ok ? '' : (result.error || `HTTP ${result.status}`),
        payload: { full_name: driver.full_name },
      });
    }
    await supabase.from('drivers').delete().eq('id', driver.id);
  }

  async function handleDeleteAll() {
    setDeleting(true);
    try {
      for (const driver of drivers) {
        await hardDeleteDriver(driver);
      }
      const count = drivers.length;
      await loadDrivers();
      setShowDeleteAllModal(false);
      showToast(`${count} driver${count !== 1 ? 's' : ''} permanently deleted`);
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
    setDeleting(false);
  }

  async function handleDeleteSelected() {
    setDeleting(true);
    try {
      const toDelete = drivers.filter(d => selectedIds.has(d.id));
      for (const driver of toDelete) {
        await hardDeleteDriver(driver);
      }
      const count = toDelete.length;
      await loadDrivers();
      setShowDeleteSelectedModal(false);
      setSelectMode(false);
      setSelectedIds(new Set());
      showToast(`${count} driver${count !== 1 ? 's' : ''} permanently deleted`);
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
    setDeleting(false);
  }

  async function handleDeleteSingle() {
    if (!showDeleteSingleModal) return;
    setDeleting(true);
    try {
      await hardDeleteDriver(showDeleteSingleModal);
      await loadDrivers();
      setShowDeleteSingleModal(null);
      showToast(`${showDeleteSingleModal.full_name} permanently deleted`);
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
    setDeleting(false);
  }

  function toggleSelectAll() {
    if (selectedIds.size === drivers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(drivers.map(d => d.id)));
    }
  }

  function toggleSelectDriver(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedDriverNames = drivers
    .filter(d => selectedIds.has(d.id))
    .map(d => d.full_name);

  function centerMapView() {
    setSelectedDriver(null);
    setSelectedTrip(null);
    setShowFleetPanel(false);
    setShowTripsPanel(false);
  }

  const isDesktopViewport = typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  const busyDriverIds = new Set();
  for (const a of assignments || []) {
    if (a?.driver_id && isTripLockStatus(a.status)) busyDriverIds.add(String(a.driver_id));
  }
  const fleetStatusCounts = {
    online: drivers.filter(driver => driver.status === 'online').length,
    on_trip: drivers.filter(
      driver => busyDriverIds.has(String(driver.id)) || driver.status === 'on_trip'
    ).length,
    offline: drivers.filter(driver => !['online', 'on_trip'].includes(driver.status)).length,
  };

  async function handleUndoTestTake(assignment) {
    const meta = parseAssignmentNotes(assignment.notes);
    if (!meta.isTestTrip || assignment.status !== 'pending') return;

    setUndoingTripId(assignment.trip_id);
    try {
      if (sentryApi.enabled && sentryApi.features.tripAcceptReject) {
        const rejectResult = await sentryApi.rejectTrip(
          assignment.trip_id,
          1,
          assignment.last_modified_at || null,
          'TEST_UNDO'
        );

        await supabase.from('sentry_sync_log').insert({
          sync_type: 'trip_reject_test_undo',
          direction: 'export',
          record_type: 'trip',
          external_id: String(assignment.trip_id),
          status: rejectResult.ok ? 'success' : 'failed',
          error_message: rejectResult.ok ? '' : (rejectResult.error || `HTTP ${rejectResult.status}`),
          payload: { driver_id: assignment.driver_id, reason: 'test_undo' },
        });
      }

      await supabase
        .from('trip_assignments')
        .update({
          status: 'rejected',
          trip_processing_status_id: 2,
          rejected_at: new Date().toISOString(),
        })
        .eq('id', assignment.id);

      await supabase
        .from('marketplace_trips')
        .update({
          status: 'available',
          taken_by: null,
          company_id: null,
        })
        .eq('sentry_trip_id', String(assignment.trip_id));

      await fbSet(`driver_notifications/${assignment.driver_id}`, null);
      await loadTrips();
      await loadAssignments();
      await loadTripSyncStatus();
      showToast('Test trip was released back to the queue.');
    } catch (err) {
      showToast(`Undo failed: ${err.message}`, 'error');
    } finally {
      setUndoingTripId(null);
    }
  }

  async function handleSaveAssignmentNote(assignment) {
    setNoteSavingTripId(assignment.id);
    try {
      const updatedNotes = buildAssignmentNotes(assignment.notes, {
        isTestTrip: parseAssignmentNotes(assignment.notes).isTestTrip,
        testingNote: assignmentNoteDrafts[assignment.id] ?? parseAssignmentNotes(assignment.notes).testingNote,
      });

      const { error } = await supabase
        .from('trip_assignments')
        .update({ notes: updatedNotes })
        .eq('id', assignment.id);

      if (error) throw error;

      await loadAssignments();
      showToast('Testing note saved.');
    } catch (err) {
      showToast(`Saving note failed: ${err.message}`, 'error');
    } finally {
      setNoteSavingTripId(null);
    }
  }

  async function handleSendDriverInstruction(driver) {
    setSendingInstructionDriverId(driver.id);
    try {
      await fbSet(`driver_testing_messages/${driver.id}`, {
        message: `Dispatch check-in for ${driver.full_name}: stay online, accept the next test trip, and move it step by step in the app.`,
        sentAt: Date.now(),
        sentBy: profile?.full_name || profile?.email || 'Dispatch',
      });
      showToast(`Ping sent to ${driver.full_name}.`);
    } catch (err) {
      showToast(`Ping failed: ${err.message}`, 'error');
    } finally {
      setSendingInstructionDriverId(null);
    }
  }

  async function handleCopyTestingSteps() {
    const steps = [
      'Sentry test flow',
      '1. Pick a driver in Dispatch.',
      '2. Click Take 1 Test Trip.',
      '3. In Driver App: Accept -> Arrive -> Pick Up -> Complete.',
      '4. Watch sync badges in Dispatch and Admin Testing.',
      '5. Use Undo Test Take only before the driver accepts.',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(steps);
      setCopyingSteps(true);
      showToast('Testing steps copied.');
      setTimeout(() => setCopyingSteps(false), 1500);
    } catch (err) {
      showToast(`Copy failed: ${err.message}`, 'error');
    }
  }

  const assignmentDraftNotes = new Map();
  for (const assignment of visibleAssignments) {
    if (!assignmentDraftNotes.has(assignment.id)) {
      const parsed = parseAssignmentNotes(assignment.notes);
      assignmentDraftNotes.set(assignment.id, {
        ...parsed,
        editingTestingNote: assignmentNoteDrafts[assignment.id] ?? parsed.testingNote,
      });
    }
  }

  return (
    <div className="flex h-full overflow-hidden relative mobile-safe-bottom">
      {deleteToast && (
        <div
          className="fixed top-4 left-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-600 shadow-lg max-w-[min(520px,calc(100vw-24px))]"
          style={{
            transform: 'translateX(-50%)',
            background:
              deleteToast.type === 'error'
                ? 'rgba(255,71,87,0.15)'
                : deleteToast.type === 'warning'
                  ? 'rgba(201,168,76,0.12)'
                  : 'rgba(0,229,160,0.12)',
            border: `1px solid ${
              deleteToast.type === 'error'
                ? 'rgba(255,71,87,0.3)'
                : deleteToast.type === 'warning'
                  ? 'rgba(201,168,76,0.35)'
                  : 'rgba(0,229,160,0.3)'
            }`,
            color:
              deleteToast.type === 'error'
                ? '#ff4757'
                : deleteToast.type === 'warning'
                  ? '#c9a84c'
                  : '#00e5a0',
            fontWeight: 600,
          }}
        >
          {deleteToast.msg}
        </div>
      )}

      <div className="md:hidden absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setShowFleetPanel(prev => !prev);
            setShowTripsPanel(false);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(13,17,23,0.94)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', backdropFilter: 'blur(14px)' }}
        >
          <Users className="w-4 h-4" />
          Drivers
        </button>
        <button
          type="button"
          onClick={centerMapView}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.22)', color: '#c9a84c', backdropFilter: 'blur(14px)' }}
        >
          <MapIcon className="w-4 h-4" />
          Center Map
        </button>
        <button
          type="button"
          onClick={() => {
            setShowTripsPanel(prev => !prev);
            setShowFleetPanel(false);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(13,17,23,0.94)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', backdropFilter: 'blur(14px)' }}
        >
          <Navigation className="w-4 h-4" />
          Trips
        </button>
      </div>

      <aside
        className={`md:w-72 flex-shrink-0 flex flex-col overflow-hidden fixed md:static left-0 right-0 bottom-0 md:inset-y-0 md:right-auto z-40 md:z-auto transition-transform duration-200 rounded-t-3xl md:rounded-none ${
          showFleetPanel ? 'translate-y-0 md:translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-0'
        }`}
        style={{
          height: isDesktopViewport ? '100%' : 'min(56vh, 520px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          borderRight: 'none',
          background: '#07090d',
          paddingTop: '12px',
          paddingBottom: 'calc(var(--safe-bottom) + 10px)',
        }}
      >
        <div className="p-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {selectMode && (
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center justify-center"
                  title={selectedIds.size === drivers.length ? 'Deselect all' : 'Select all'}
                >
                  {selectedIds.size === drivers.length ? (
                    <CheckSquare className="w-4 h-4" style={{ color: '#c9a84c' }} />
                  ) : (
                    <Square className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  )}
                </button>
              )}
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                {selectMode && selectedIds.size > 0
                  ? `${selectedIds.size} of ${drivers.length} selected`
                  : `Fleet — ${drivers.length}`}
              </p>
            </div>
            <div className="flex gap-1">
              {!selectMode ? (
                <>
                  {canManageFleet && (
                    <>
                      <button onClick={() => setShowCSVImport(true)} className="btn-ghost px-2 py-1 text-xs flex items-center gap-1">
                        <Upload className="w-3 h-3" /> CSV
                      </button>
                      <button onClick={() => setShowAddDriver(true)} className="btn-ghost px-2 py-1 text-xs flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add
                      </button>
                      {drivers.length > 0 && (
                        <>
                          <button
                            onClick={() => setSelectMode(true)}
                            className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                            title="Select drivers to delete"
                          >
                            <CheckSquare className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setShowDeleteAllModal(true)}
                            className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all"
                            style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', color: 'rgba(255,71,87,0.7)' }}
                            title="Delete all drivers"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      if (selectedIds.size > 0) setShowDeleteSelectedModal(true);
                    }}
                    disabled={selectedIds.size === 0}
                    className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all"
                    style={{
                      background: selectedIds.size > 0 ? 'rgba(255,71,87,0.1)' : 'rgba(255,71,87,0.03)',
                      border: `1px solid ${selectedIds.size > 0 ? 'rgba(255,71,87,0.3)' : 'rgba(255,71,87,0.1)'}`,
                      color: selectedIds.size > 0 ? '#ff4757' : 'rgba(255,71,87,0.3)',
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                    {selectedIds.size > 0 ? `Delete ${selectedIds.size}` : 'Delete'}
                  </button>
                  <button
                    onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {[
              { label: 'Online', value: fleetStatusCounts.online, color: '#00e5a0', bg: 'rgba(0,229,160,0.1)' },
              { label: 'On Trip', value: fleetStatusCounts.on_trip, color: '#c9a84c', bg: 'rgba(201,168,76,0.12)' },
              { label: 'Offline', value: fleetStatusCounts.offline, color: 'rgba(255,255,255,0.68)', bg: 'rgba(255,255,255,0.05)' },
            ].map(item => (
              <div
                key={item.label}
                className="px-2.5 py-1 rounded-full text-[11px]"
                style={{ background: item.bg, color: item.color, border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {item.label}: {item.value}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {drivers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)' }}>
                <Users className="w-6 h-6" style={{ color: '#c9a84c' }} />
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {canManageFleet
                  ? 'No drivers yet. Import CSV or add manually.'
                  : 'No company drivers are loaded yet. Drivers are managed inside each company account.'}
              </p>
              {canManageFleet && (
                <button onClick={() => setShowCSVImport(true)} className="btn-gold text-xs px-4 py-2">Import CSV</button>
              )}
            </div>
          ) : (
            drivers.map(driver => (
              <div key={driver.id} className="relative">
                {selectMode && (
                  <button
                    onClick={() => toggleSelectDriver(driver.id)}
                    className="absolute top-2 left-2 z-10 w-5 h-5 flex items-center justify-center"
                    style={{ background: 'rgba(13,17,23,0.9)', borderRadius: 4 }}
                  >
                    {selectedIds.has(driver.id) ? (
                      <CheckSquare className="w-4 h-4" style={{ color: '#c9a84c' }} />
                    ) : (
                      <Square className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                    )}
                  </button>
                )}
                <DriverCard
                  driver={driver}
                  selected={!selectMode && selectedDriver?.id === driver.id}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelectDriver(driver.id);
                    } else {
                      setSelectedDriver(prev => prev?.id === driver.id ? null : driver);
                    }
                  }}
                  onTake5={() => setTake5Driver(driver)}
                  onSendTestTrip={() => openTakeConfirm('manual', driver)}
                  onSendInstruction={() => handleSendDriverInstruction(driver)}
                  sendingTestTrip={takingTestTrip && takeConfirmState?.driver?.id === driver.id}
                  sendingInstruction={sendingInstructionDriverId === driver.id}
                  onPhotoUpdate={() => loadDrivers()}
                  onRemove={() => setShowDeleteSingleModal(driver)}
                  tripCount={assignments.filter(a => String(a.driver_id) === String(driver.id) && isTripLockStatus(a.status)).length}
                />
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="flex-1 relative overflow-hidden">
        <MapView
          drivers={drivers}
          trips={availableTrips}
          selectedDriver={selectedDriver}
          onDriverClick={(driver) => {
            setSelectedDriver(prev => prev?.id === driver.id ? null : driver);
          }}
        />

        {selectedDriver && (
          <DriverDetailPanel
            driver={selectedDriver}
            assignments={assignments}
            availableTrips={companyOpenTrips}
            onClose={() => setSelectedDriver(null)}
            onDriverUpdated={async (updatedDriver) => {
              if (updatedDriver) {
                setSelectedDriver(updatedDriver);
              }
              const refreshedDrivers = await loadDrivers();
              const refreshedDriver = refreshedDrivers.find(driver => driver.id === (updatedDriver?.id || selectedDriver.id));
              if (refreshedDriver) {
                setSelectedDriver(refreshedDriver);
              }
            }}
            onAssignTrip={(trip) => {
              if (!selectedDriver) return;
              if (!allowMultiTripTake && driverHasLockConflict(selectedDriver.id)) {
                showToast(
                  `${selectedDriver.full_name} already has an active trip. Finish or reject it before assigning another.`,
                  'error'
                );
                return;
              }
              assignTrip(trip, selectedDriver, scopedTestAssignOptions());
            }}
          />
        )}
      </div>

      <aside
        className={`md:w-72 flex-shrink-0 flex flex-col overflow-hidden fixed md:static left-0 right-0 bottom-0 md:inset-y-0 md:left-auto z-40 md:z-auto transition-transform duration-200 rounded-t-3xl md:rounded-none ${
          showTripsPanel ? 'translate-y-0 md:translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-0'
        }`}
        style={{
          height: isDesktopViewport ? '100%' : 'min(56vh, 520px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          borderLeft: 'none',
          background: '#07090d',
          paddingTop: '12px',
          paddingBottom: 'calc(var(--safe-bottom) + 10px)',
        }}
      >
        <div className="p-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
              {isCompanyUser
                ? companyTripView === 'queue'
                  ? `Open Trips — ${companyOpenTrips.length}`
                  : `Active Trips — ${visibleAssignments.length}`
                : `Trips — ${availableTrips.length}`}
            </p>
            <div className="flex gap-1.5">
              {!isCompanyUser && (
                <button
                  onClick={() => setShowWalkthrough(true)}
                  className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                  title="Test dispatch walkthrough"
                >
                  <BookOpen className="w-3 h-3" /> Test
                </button>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                title={isCompanyUser ? 'Refresh company trips' : 'Refresh trips'}
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing' : 'Refresh'}
              </button>
              <button
                onClick={() => openTakeConfirm('manual')}
                disabled={takingTestTrip || assigning !== null || drivers.length === 0 || !assignTestTripReady}
                className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                title="Take one trip for testing (selected driver or best available)"
              >
                <Navigation className="w-3 h-3" />
                {takingTestTrip ? 'Taking...' : 'Take 1 Test Trip'}
              </button>
              <button
                onClick={() => openTakeConfirm('ai')}
                disabled={takingTestTrip || assigning !== null || drivers.length === 0 || !assignTestTripReady}
                className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                title="Let AI assist take one trip for testing"
              >
                <MapIcon className="w-3 h-3" />
                {takingTestTrip ? 'AI Taking...' : 'AI Take 1'}
              </button>
              <button
                onClick={handleCopyTestingSteps}
                className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                title="Copy the short test steps"
              >
                <ClipboardList className="w-3 h-3" />
                {copyingSteps ? 'Copied' : 'Copy Steps'}
              </button>
            </div>
          </div>
          <p className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Drivers do not self-take marketplace trips yet. Dispatch can take them manually, or AI assist can take one test trip and auto-pick a driver.
          </p>
          {!selectedDriver && drivers.length > 0 && (
            <p className="text-[11px] mb-2" style={{ color: 'rgba(201,168,76,0.8)' }}>
              No driver selected — test take will auto-pick the best available driver.
            </p>
          )}
          {isCompanyUser && (
            <div className="flex gap-1 p-1 rounded-lg mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {[
                { key: 'queue', label: 'Open Queue' },
                { key: 'active', label: 'Assigned' },
              ].map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setCompanyTripView(option.key)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: companyTripView === option.key ? 'rgba(201,168,76,0.15)' : 'transparent',
                    color: companyTripView === option.key ? '#c9a84c' : 'rgba(255,255,255,0.45)',
                    fontWeight: companyTripView === option.key ? 600 : 400,
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <input
            placeholder={
              isCompanyUser
                ? companyTripView === 'queue'
                  ? 'Search open trips...'
                  : 'Search active trips...'
                : 'Search trips...'
            }
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-xs py-1.5"
            style={{ fontSize: 12 }}
          />
          <textarea
            value={testNoteDraft}
            onChange={e => setTestNoteDraft(e.target.value)}
            rows={2}
            placeholder="Optional testing note for the next test trip"
            className="w-full mt-2 text-xs p-2 rounded-lg"
            style={{
              fontSize: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#e5e7eb',
            }}
          />
          <button
            type="button"
            onClick={() => setAllowMultiTripTake(value => !value)}
            className="w-full mt-2 px-2.5 py-2 rounded-lg text-xs flex items-center justify-between"
            style={{
              background: allowMultiTripTake ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${allowMultiTripTake ? 'rgba(0,229,160,0.28)' : 'rgba(255,255,255,0.08)'}`,
              color: allowMultiTripTake ? '#00e5a0' : 'rgba(255,255,255,0.72)',
            }}
            title="Allow multiple active trips per driver when upstream Sentry accepts the take"
          >
            <span>Allow multi-trip take if Sentry allows</span>
            <span>{allowMultiTripTake ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {isCompanyUser ? (
            companyTripView === 'queue' ? (
              companyOpenTrips.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)' }}>
                  <Navigation className="w-6 h-6" style={{ color: '#c9a84c' }} />
                </div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  No open trips are available for dispatch right now.
                </p>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
                  Imported provider trips will appear here for your company dispatch team to assign.
                </p>
                <button onClick={handleRefresh} disabled={refreshing} className="btn-gold text-xs px-4 py-2">
                  {refreshing ? 'Refreshing...' : 'Refresh Trips'}
                </button>
              </div>
            ) : (
                companyOpenTrips.map(trip => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    selected={selectedTrip?.id === trip.id}
                    onClick={() => setSelectedTrip(prev => prev?.id === trip.id ? null : trip)}
                    onAssign={selectedDriver && !selectedDriverHasActiveTrip ? () => assignTrip(trip, selectedDriver, scopedTestAssignOptions()) : null}
                    assigning={normalizeTripId(assigning) === normalizeTripId(trip.sentry_trip_id)}
                    assigned={lockedTripIdSet.has(normalizeTripId(trip.sentry_trip_id))}
                    syncStatus={tripSyncMap[String(trip.sentry_trip_id || '')] || null}
                  />
                ))
              )
            ) : visibleAssignments.length === 0 && recentRejectedAssignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)' }}>
                  <Navigation className="w-6 h-6" style={{ color: '#c9a84c' }} />
                </div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {company?.company_name
                    ? `No active trips for ${company.company_name} right now.`
                    : 'No active trips for this company right now.'}
                </p>
              </div>
            ) : (
              <>
                {recentRejectedAssignments.length > 0 && (
                  <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(255,71,87,0.05)', border: '1px solid rgba(255,71,87,0.14)' }}>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <p className="text-xs font-700 uppercase tracking-wider" style={{ color: '#ff8a95', fontWeight: 700 }}>
                          Recovery Queue
                        </p>
                        <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
                          Latest driver rejects in the last 30 minutes. Use manual recovery actions below; automatic reassign or copy after reject only runs when enabled in company scheduler prefs (off by default).
                        </p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.65)' }}>
                        {recentRejectedAssignments.length} recent
                      </span>
                    </div>
                    <div className="space-y-3">
                      {recentRejectedAssignments.map(assignment => {
                        const tripIdKey = normalizeTripId(assignment.trip_id);
                        const recoveryDriver = tripRecoveryPrefs.tripReassignEnabled
                          ? getBestDriverForTrip(tripStubFromAssignment(assignment), { excludeDriverId: assignment.driver_id })
                          : null;

                        return (
                          <div
                            key={`rejected-${assignment.id}`}
                            className="rounded-xl p-3"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-700 uppercase tracking-wider" style={{ color: '#ff8a95', fontWeight: 700 }}>
                                  Rejected
                                </p>
                                <p className="text-sm mt-2" style={{ color: '#e5e7eb' }}>{assignment.pu_address || 'Unknown pickup'}</p>
                                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{assignment.do_address || 'Unknown dropoff'}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{tripIdKey || 'No trip id'}</p>
                                <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                  Last driver: {assignment.driver_name || assignment.drivers?.full_name || 'Unknown'}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              <button
                                type="button"
                                onClick={() => handleAiRecoveryAction(assignment, 'smart')}
                                disabled={Boolean(recoveringTripId)}
                                className="px-3 py-1.5 rounded-lg text-xs"
                                style={{
                                  background: 'rgba(0,229,160,0.12)',
                                  border: '1px solid rgba(0,229,160,0.24)',
                                  color: '#00e5a0',
                                }}
                              >
                                {recoveringTripId === `reassign:${tripIdKey}` ? 'AI Recovering…' : recoveryDriver ? `AI Reassign → ${recoveryDriver.full_name}` : 'AI Recover'}
                              </button>
                              {tripRecoveryPrefs.tripCopyEnabled && (
                                <button
                                  type="button"
                                  onClick={() => handleSentryCopyAction(assignment, 'copy')}
                                  disabled={sentryActionTripId === `copy:${tripIdKey}`}
                                  className="px-3 py-1.5 rounded-lg text-xs"
                                  style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid rgba(255,255,255,0.16)',
                                    color: '#e5e7eb',
                                  }}
                                >
                                  {sentryActionTripId === `copy:${tripIdKey}` ? 'Copying…' : 'Trip Copy'}
                                </button>
                              )}
                              {tripRecoveryPrefs.tripRerouteEnabled && (
                                <button
                                  type="button"
                                  onClick={() => handleAiRecoveryAction(assignment, 'reroute')}
                                  disabled={sentryActionTripId === `reroute:${tripIdKey}`}
                                  className="px-3 py-1.5 rounded-lg text-xs"
                                  style={{
                                    background: 'rgba(14,165,233,0.12)',
                                    border: '1px solid rgba(14,165,233,0.24)',
                                    color: '#7dd3fc',
                                  }}
                                >
                                  {sentryActionTripId === `reroute:${tripIdKey}` ? 'Rerouting…' : 'Reroute'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {visibleAssignments.map(assignment => {
                const noteMeta = parseAssignmentNotes(assignment.notes);
                const draftTestingNote =
                  assignmentNoteDrafts[assignment.id] !== undefined
                    ? assignmentNoteDrafts[assignment.id]
                    : noteMeta.testingNote;
                const showDispatchActions =
                  (isCompanyUser || isAdminCompanyPreview) && isTripLockStatus(assignment.status);

                return (
                  <div
                    key={assignment.id}
                    className="rounded-xl p-3"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-xs font-700 uppercase tracking-wider" style={{ color: '#c9a84c', fontWeight: 700 }}>
                        {assignment.status || 'assigned'}
                      </p>
                      <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {assignment.driver_name || assignment.drivers?.full_name || 'Unassigned'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {noteMeta.isTestTrip && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8' }}>
                          Test Mode
                        </span>
                      )}
                      {tripSyncMap[String(assignment.trip_id || '')] && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{
                            background: tripSyncMap[String(assignment.trip_id || '')]?.status === 'failed'
                              ? 'rgba(255,71,87,0.1)'
                              : 'rgba(0,229,160,0.1)',
                            color: tripSyncMap[String(assignment.trip_id || '')]?.status === 'failed'
                              ? '#ff4757'
                              : '#00e5a0',
                          }}
                        >
                          {tripSyncMap[String(assignment.trip_id || '')]?.status === 'failed' ? 'Sync Failed' : 'Sync OK'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm" style={{ color: '#e5e7eb' }}>{assignment.pu_address || 'Unknown pickup'}</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{assignment.do_address || 'Unknown dropoff'}</p>
                    <textarea
                      rows={2}
                      value={draftTestingNote}
                      onChange={e => {
                        const value = e.target.value;
                        setAssignmentNoteDrafts(prev => ({ ...prev, [assignment.id]: value }));
                      }}
                      placeholder="Testing note for this trip"
                      className="w-full mt-3 p-2 rounded-lg text-xs"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        color: '#e5e7eb',
                      }}
                    />
                    <div className="flex items-center justify-between mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      <span>{assignment.pu_time || 'No pickup time'}</span>
                      <span>${parseFloat(assignment.delivery_price || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => handleSaveAssignmentNote(assignment)}
                        disabled={noteSavingTripId === assignment.id}
                        className="px-3 py-1.5 rounded-lg text-xs"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: '#e5e7eb',
                        }}
                      >
                        {noteSavingTripId === assignment.id ? 'Saving...' : 'Save Note'}
                      </button>
                      {noteMeta.isTestTrip && assignment.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleUndoTestTake(assignment)}
                          disabled={undoingTripId === assignment.trip_id}
                          className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1"
                          style={{
                            background: 'rgba(255,71,87,0.08)',
                            border: '1px solid rgba(255,71,87,0.18)',
                            color: '#ff8a95',
                          }}
                        >
                          <RotateCcw className="w-3 h-3" />
                          {undoingTripId === assignment.trip_id ? 'Undoing...' : 'Undo Test Take'}
                        </button>
                      )}
                      {showDispatchActions && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDispatchReleaseTrip(assignment)}
                            disabled={releasingTripId === normalizeTripId(assignment.trip_id)}
                            className="px-3 py-1.5 rounded-lg text-xs"
                            style={{
                              background: 'rgba(255,71,87,0.1)',
                              border: '1px solid rgba(255,71,87,0.22)',
                              color: '#ff8a95',
                            }}
                          >
                            {releasingTripId === normalizeTripId(assignment.trip_id) ? 'Rejecting…' : 'Reject + Release'}
                          </button>
                          {tripRecoveryPrefs.tripRerouteEnabled && (
                            <button
                              type="button"
                              onClick={() => handleSentryCopyAction(assignment, 'reroute')}
                              disabled={sentryActionTripId === `reroute:${normalizeTripId(assignment.trip_id)}`}
                              className="px-3 py-1.5 rounded-lg text-xs"
                              style={{
                                background: 'rgba(14,165,233,0.12)',
                                border: '1px solid rgba(14,165,233,0.24)',
                                color: '#7dd3fc',
                              }}
                            >
                              {sentryActionTripId === `reroute:${normalizeTripId(assignment.trip_id)}` ? 'Rerouting…' : 'Reroute'}
                            </button>
                          )}
                          {tripRecoveryPrefs.tripCopyEnabled && (
                            <button
                              type="button"
                              onClick={() => handleSentryCopyAction(assignment, 'copy')}
                              disabled={sentryActionTripId === `copy:${normalizeTripId(assignment.trip_id)}`}
                              className="px-3 py-1.5 rounded-lg text-xs"
                              style={{
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.16)',
                                color: '#e5e7eb',
                              }}
                            >
                              {sentryActionTripId === `copy:${normalizeTripId(assignment.trip_id)}` ? 'Copying…' : 'Trip Copy'}
                            </button>
                          )}
                          {tripRecoveryPrefs.tripReassignEnabled &&
                            selectedDriver &&
                            String(selectedDriver.id) !== String(assignment.driver_id) &&
                            canAssignAnotherTrip(selectedDriver.id) && (
                            <button
                              type="button"
                              onClick={() =>
                                assignTrip(tripStubFromAssignment(assignment), selectedDriver, scopedTestAssignOptions())
                              }
                              disabled={normalizeTripId(assigning) === normalizeTripId(assignment.trip_id)}
                              className="px-3 py-1.5 rounded-lg text-xs"
                              style={{
                                background: 'rgba(201,168,76,0.12)',
                                border: '1px solid rgba(201,168,76,0.25)',
                                color: '#c9a84c',
                              }}
                            >
                              {normalizeTripId(assigning) === normalizeTripId(assignment.trip_id)
                                ? 'Assigning…'
                                : `Reassign → ${selectedDriver.full_name}`}
                            </button>
                          )}
                          {tripRecoveryPrefs.tripReassignEnabled &&
                            (!selectedDriver || String(selectedDriver.id) === String(assignment.driver_id)) && (
                            <button
                              type="button"
                              disabled
                              className="px-3 py-1.5 rounded-lg text-xs"
                              style={{
                                background: 'rgba(201,168,76,0.06)',
                                border: '1px solid rgba(201,168,76,0.16)',
                                color: 'rgba(201,168,76,0.6)',
                              }}
                            >
                              Reassign (pick another driver)
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {tripSyncMap[String(assignment.trip_id || '')]?.errorMessage && (
                      <p className="mt-2 text-[10px]" style={{ color: '#ff8a95' }}>
                        {tripSyncMap[String(assignment.trip_id || '')].errorMessage}
                      </p>
                    )}
                  </div>
                );
              })}
              </>
            )
          ) : scoredTrips.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)' }}>
                <Navigation className="w-6 h-6" style={{ color: '#c9a84c' }} />
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {sentryStatus.ok ? 'No trips available. Click Refresh.' : 'Connect Sentry API in Settings.'}
              </p>
              <button onClick={handleRefresh} disabled={refreshing} className="btn-gold text-xs px-4 py-2">
                {refreshing ? 'Loading...' : 'Refresh Trips'}
              </button>
            </div>
          ) : (
            scoredTrips.map(trip => (
              <TripCard
                key={trip.id}
                trip={trip}
                selected={selectedTrip?.id === trip.id}
                onClick={() => setSelectedTrip(prev => prev?.id === trip.id ? null : trip)}
                onAssign={selectedDriver && !selectedDriverHasActiveTrip ? () => assignTrip(trip, selectedDriver, scopedTestAssignOptions()) : null}
                assigning={normalizeTripId(assigning) === normalizeTripId(trip.sentry_trip_id)}
                assigned={lockedTripIdSet.has(normalizeTripId(trip.sentry_trip_id))}
                syncStatus={tripSyncMap[String(trip.sentry_trip_id || '')] || null}
              />
            ))
          )}
        </div>
      </aside>

      {(showFleetPanel || showTripsPanel) && (
        <button
          type="button"
          className="md:hidden fixed inset-0 z-20"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => {
            setShowFleetPanel(false);
            setShowTripsPanel(false);
          }}
          aria-label="Close dispatch panels"
        />
      )}

      {take5Driver && (
        <Take5Modal
          driver={take5Driver}
          trips={scoredTrips.slice(0, 5)}
          onClose={() => setTake5Driver(null)}
          onAssign={(trip) => assignTrip(trip, take5Driver, scopedTestAssignOptions())}
        />
      )}

      {takeConfirmState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5"
            style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.12)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: '#c9a84c' }} />
              </div>
              <div className="flex-1">
                <p className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>
                  Confirm test take
                </p>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  This will take the trip from the marketplace and send it to {takeConfirmState.driver.full_name}.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Trip</p>
              <p className="text-sm mt-1" style={{ color: '#e5e7eb' }}>
                {takeConfirmState.trip.pu_address || 'Unknown pickup'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {takeConfirmState.trip.do_address || 'Unknown dropoff'}
              </p>
              {testNoteDraft && (
                <p className="text-xs mt-2" style={{ color: '#38bdf8' }}>
                  Note: {testNoteDraft}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setTakeConfirmState(null)}
                className="px-4 py-2 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleTakeOneTestTrip(takeConfirmState.mode, takeConfirmState.driver)}
                className="px-4 py-2 rounded-xl text-sm flex items-center gap-2"
                style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.24)', color: '#c9a84c' }}
              >
                <Send className="w-4 h-4" />
                Confirm Test Take
              </button>
            </div>
          </div>
        </div>
      )}

      {canManageFleet && showAddDriver && (
        <AddDriverModal onClose={() => { setShowAddDriver(false); loadDrivers(); }} />
      )}

      {canManageFleet && showCSVImport && (
        <CSVImportModal
          companyIdOverride={company?.id || null}
          onImported={(payload) => {
            toastFleetImportSummary(payload);
            loadDrivers();
          }}
          onClose={() => { setShowCSVImport(false); loadDrivers(); }}
        />
      )}

      {canManageFleet && showDeleteAllModal && (
        <DeleteConfirmModal
          title="Delete All Drivers"
          subtitle={`This will permanently remove all ${drivers.length} drivers`}
          names={drivers.map(d => d.full_name)}
          requireTyping={true}
          confirmWord="DELETE ALL"
          confirmLabel={`Delete All ${drivers.length} Drivers`}
          onConfirm={handleDeleteAll}
          onClose={() => setShowDeleteAllModal(false)}
          loading={deleting}
        />
      )}

      {canManageFleet && showDeleteSelectedModal && (
        <DeleteConfirmModal
          title={`Delete ${selectedIds.size} Driver${selectedIds.size !== 1 ? 's' : ''}`}
          subtitle="Selected drivers will be permanently removed"
          names={selectedDriverNames}
          requireTyping={false}
          confirmLabel={`Delete ${selectedIds.size} Driver${selectedIds.size !== 1 ? 's' : ''}`}
          onConfirm={handleDeleteSelected}
          onClose={() => setShowDeleteSelectedModal(false)}
          loading={deleting}
        />
      )}

      {canManageFleet && showDeleteSingleModal && (
        <DeleteConfirmModal
          title={`Delete ${showDeleteSingleModal.full_name}`}
          subtitle="This driver will be permanently removed"
          names={[showDeleteSingleModal.full_name]}
          requireTyping={false}
          confirmLabel="Delete Driver"
          onConfirm={handleDeleteSingle}
          onClose={() => setShowDeleteSingleModal(null)}
          loading={deleting}
        />
      )}

      {!isCompanyUser && showWalkthrough && (
        <DispatchWalkthrough
          onClose={() => setShowWalkthrough(false)}
          onTriggerAction={(action) => {
            if (action === 'csv') {
              setShowWalkthrough(false);
              setShowCSVImport(true);
            }
          }}
        />
      )}

      <ChatPanel />
    </div>
  );
}
