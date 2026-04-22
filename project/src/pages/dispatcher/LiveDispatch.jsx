import React, { useEffect, useState } from 'react';
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

const TEST_TRIP_MARKER = '[TEST_TRIP]';
const TEST_NOTE_PREFIX = '[TEST_NOTE]';
const LOCAL_ACTIVE_ASSIGNMENT_STATUSES = new Set(['pending', 'accepted', 'arrived', 'picked_up', 'completed']);

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

export default function LiveDispatch() {
  const {
    profile,
    company,
    adminPreviewCompany,
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
  const [noteSavingTripId, setNoteSavingTripId] = useState(null);
  const [sendingInstructionDriverId, setSendingInstructionDriverId] = useState(null);
  const [copyingSteps, setCopyingSteps] = useState(false);
  const [takeConfirmState, setTakeConfirmState] = useState(null);
  const [assignmentNoteDrafts, setAssignmentNoteDrafts] = useState({});
  const schedulerPrefs = readCompanySchedulerPrefs(company);

  const isCompanyUser = profile?.role === 'company';
  const isAdminCompanyPreview = profile?.role === 'admin' && !!adminPreviewCompany?.id;
  /** Company workspace or admin previewing a company: manual assigns should still run locally when Sentry marketplace take fails (e.g. HTTP 409). */
  const scopedDispatchTestMode = isCompanyUser || isAdminCompanyPreview;
  const scopedTestAssignOptions = () =>
    scopedDispatchTestMode ? { isTestTrip: true, testingNote: testNoteDraft } : {};

  const canManageFleet = isCompanyUser;

  const assignedTripIds = new Set(assignments.filter(a => a.status !== 'rejected').map(a => a.trip_id));

  const availableTrips = trips.filter(t => {
    if (t.status !== 'available') return false;
    if (search) {
      const q = search.toLowerCase();
      return (t.pu_address || '').toLowerCase().includes(q) ||
             (t.do_address || '').toLowerCase().includes(q) ||
             (t.sentry_trip_id || '').toLowerCase().includes(q);
    }
    return true;
  });

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

  async function assignTrip(trip, driver, options = {}) {
    setAssigning(trip.sentry_trip_id);
    const assignmentNotes = buildAssignmentNotes('', {
      isTestTrip: Boolean(options.isTestTrip),
      testingNote: options.testingNote || '',
    });

    const lastModifiedAt = trip.sentry_last_modified_at || '';
    let takeResult = { ok: true };
    let testTakeBypassed = false;

    if (sentryApi.enabled && sentryApi.features.marketplaceTrips) {
      takeResult = await sentryApi.takeMarketplaceTrip(
        trip.sentry_trip_id,
        buildMarketplaceTakePayload(trip.sentry_trip_id, driver)
      );

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
      if (options.isTestTrip) {
        testTakeBypassed = true;
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'marketplace_take_test_local_bypass',
          direction: 'internal',
          record_type: 'trip',
          external_id: trip.sentry_trip_id,
          status: 'success',
          error_message: takeErrorMessage,
          payload: {
            driver_id: driver.id,
            driver_name: driver.full_name,
            reason: 'isTestTrip',
          },
        });
        showToast(
          `Sentry did not confirm this marketplace take, but a test trip will still be assigned locally so the driver can run the in-app checklist. ${takeErrorMessage}`,
          'error'
        );
      } else {
        showToast(`Sentry did not confirm this trip take. ${takeErrorMessage}`, 'error');
        setAssigning(null);
        return;
      }
    }

    const { error } = await supabase.from('trip_assignments').insert({
      trip_id: trip.sentry_trip_id,
      driver_id: driver.id,
      company_id: driver.company_id || company?.id || null,
      driver_name: driver.full_name,
      status: 'pending',
      trip_processing_status_id: 0,
      pu_address: trip.pu_address,
      do_address: trip.do_address,
      pu_time: trip.pu_time,
      delivery_price: parseFloat(trip.delivery_price) || 0,
      mileage: parseFloat(trip.mileage) || 0,
      notes: assignmentNotes,
    });

    if (error) {
      await supabase.from('sentry_sync_log').insert({
        sync_type: 'local_assignment_create',
        direction: 'internal',
        record_type: 'trip',
        external_id: trip.sentry_trip_id,
        status: 'failed',
        error_message: error.message,
        payload: {
          driver_id: driver.id,
          driver_name: driver.full_name,
        },
      });
      showToast(
        testTakeBypassed
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
      external_id: trip.sentry_trip_id,
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
        company_id: driver.company_id || company?.id || null,
      })
      .eq('sentry_trip_id', trip.sentry_trip_id);

    const notificationPayload = {
      type: 'new_trip',
      tripId: trip.sentry_trip_id,
      lastModifiedAt,
      puAddress: trip.pu_address,
      doAddress: trip.do_address,
      puTime: trip.pu_time,
      deliveryPrice: trip.delivery_price,
      mileage: trip.mileage,
      assignedAt: Date.now(),
      testingNote: options.testingNote || '',
      isTestTrip: Boolean(options.isTestTrip),
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

    if (sentryApi.enabled && sentryApi.features.tripAcceptReject) {
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
        let processedResult = await sentryApi.reportTripProcessed(trip.sentry_trip_id, lastModifiedAt);
        if (!processedResult.ok && lastModifiedAt) {
          processedResult = await sentryApi.reportTripProcessed(trip.sentry_trip_id, null);
        }
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'trip_processed',
          direction: 'export',
          record_type: 'trip',
          external_id: trip.sentry_trip_id,
          status: processedResult.ok ? 'success' : 'failed',
          error_message: processedResult.ok ? '' : (processedResult.error || `HTTP ${processedResult.status}`),
          payload: { driver_id: driver.id, driver_name: driver.full_name, trip_processing_status_id: 0 },
        });
        if (!processedResult.ok) {
          const detail = extractSentryError(processedResult);
          if (options.isTestTrip) {
            showToast(
              `Trip assigned locally. Sentry processed sync failed (${detail}) — safe to ignore for sandbox test flows; the driver can still accept.`,
              'warning'
            );
          } else {
            showToast(
              `Trip was assigned locally, but Sentry did not confirm the processed status. ${detail}`,
              'error'
            );
          }
        }
      }
    }

    await loadTrips();
    await loadAssignments();
    await loadTripSyncStatus();
    setAssigning(null);
  }

  function getBestAvailableDriver() {
    if (selectedDriver) return selectedDriver;

    const onlineDrivers = drivers.filter(driver => driver.status === 'online');
    if (onlineDrivers.length > 0) return onlineDrivers[0];

    const activeDrivers = drivers.filter(driver => driver.is_active !== false);
    return activeDrivers[0] || null;
  }

  function openTakeConfirm(mode = 'manual', preferredDriver = null) {
    const trip = companyOpenTrips[0] || scoredTrips[0] || null;
    if (!trip) {
      showToast('No marketplace trip is available to take right now.', 'error');
      return;
    }

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

    setTakeConfirmState({ mode, trip, driver });
  }

  async function handleTakeOneTestTrip(mode = 'manual', preferredDriver = null) {
    const trip = companyOpenTrips[0] || scoredTrips[0] || null;
    const driver = mode === 'ai'
      ? getBestAvailableDriver()
      : (preferredDriver || selectedDriver || getBestAvailableDriver());
    if (!trip || !driver) return;

    setTakingTestTrip(true);
    try {
      if (mode === 'ai') {
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
        testingNote: testNoteDraft,
      });
      showToast(
        mode === 'ai'
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
  const visibleAssignments = activeAssignments.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (a.pu_address || '').toLowerCase().includes(q) ||
           (a.do_address || '').toLowerCase().includes(q) ||
           (a.driver_name || '').toLowerCase().includes(q) ||
           (a.trip_id || '').toLowerCase().includes(q);
  });
  const companyOpenTrips = scoredTrips.filter(trip => !assignedTripIds.has(trip.sentry_trip_id));

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
  const fleetStatusCounts = {
    online: drivers.filter(driver => driver.status === 'online').length,
    on_trip: drivers.filter(driver => driver.status === 'on_trip').length,
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
                  tripCount={assignments.filter(a => a.driver_id === driver.id && a.status !== 'completed').length}
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
            availableTrips={scoredTrips}
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
                disabled={takingTestTrip || assigning !== null || drivers.length === 0}
                className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                title="Take one trip for testing (selected driver or best available)"
              >
                <Navigation className="w-3 h-3" />
                {takingTestTrip ? 'Taking...' : 'Take 1 Test Trip'}
              </button>
              <button
                onClick={() => openTakeConfirm('ai')}
                disabled={takingTestTrip || assigning !== null || drivers.length === 0}
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
                    onAssign={selectedDriver ? () => assignTrip(trip, selectedDriver, scopedTestAssignOptions()) : null}
                    assigning={assigning === trip.sentry_trip_id}
                    assigned={assignedTripIds.has(trip.sentry_trip_id)}
                    syncStatus={tripSyncMap[String(trip.sentry_trip_id || '')] || null}
                  />
                ))
              )
            ) : visibleAssignments.length === 0 ? (
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
              visibleAssignments.map(assignment => (
                (() => {
                  const parsedNotes = assignmentDraftNotes.get(assignment.id) || parseAssignmentNotes(assignment.notes);
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
                    {parsedNotes.isTestTrip && (
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
                    value={parsedNotes.editingTestingNote}
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
                  <div className="flex items-center gap-2 mt-3">
                    <button
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
                    {parsedNotes.isTestTrip && assignment.status === 'pending' && (
                      <button
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
                  </div>
                  {tripSyncMap[String(assignment.trip_id || '')]?.errorMessage && (
                    <p className="mt-2 text-[10px]" style={{ color: '#ff8a95' }}>
                      {tripSyncMap[String(assignment.trip_id || '')].errorMessage}
                    </p>
                  )}
                </div>
                    );
                })()
              ))
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
                onAssign={selectedDriver ? () => assignTrip(trip, selectedDriver, scopedTestAssignOptions()) : null}
                assigning={assigning === trip.sentry_trip_id}
                assigned={assignedTripIds.has(trip.sentry_trip_id)}
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
