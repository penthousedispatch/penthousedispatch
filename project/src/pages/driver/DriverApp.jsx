import React, { useState, useEffect, useRef } from 'react';
import { DollarSign, Coffee, X, AlertTriangle, TrendingUp, Clock, CheckCircle, CreditCard, Menu, Calendar, BookOpen, LogOut, ChevronRight, Trophy } from 'lucide-react';
import { fbSet, fbGet } from '../../lib/firebase';
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

export default function DriverApp() {
  const [driverData, setDriverData] = useState(null);
  const [driverRecord, setDriverRecord] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [sheetState, setSheetState] = useState('waiting');
  const [currentTrip, setCurrentTrip] = useState(null);
  const [onBreak, setOnBreak] = useState(false);
  const [location, setLocation] = useState(null);
  const [earnings, setEarnings] = useState({ today: 0, trips: 0 });
  const [sheetOpen, setSheetOpen] = useState(true);
  const [motivationToast, setMotivationToast] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [chatThreadId, setChatThreadId] = useState(null);
  const [showPaymentSetup, setShowPaymentSetup] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
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
  const watchRef = useRef(null);
  const pollRef = useRef(null);
  const sheetStateRef = useRef(sheetState);
  const shiftStartRef = useRef(Date.now());
  const motivationTimerRef = useRef(null);
  const consecutiveTripsRef = useRef(0);
  const lastMotivationRef = useRef(0);
  const sosTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const locationRef = useRef(location);
  const incentiveSnapshotRef = useRef([]);

  useEffect(() => { sheetStateRef.current = sheetState; }, [sheetState]);
  useEffect(() => { locationRef.current = location; }, [location]);

  useEffect(() => {
    const seen = localStorage.getItem('pds_onboarding_seen');
    if (!seen) setShowOnboarding(true);
    return () => {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (motivationTimerRef.current) clearInterval(motivationTimerRef.current);
      if (sosTimerRef.current) clearInterval(sosTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

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
    setCurrentTrip(null);
    setSheetState('waiting');
    setLoggedIn(false);
    setDriverData(null);
    setDriverRecord(null);
  }

  async function loadDriverRecord(id) {
    const { data: driver, error: driverErr } = await supabase.from('drivers').select('*').eq('id', id).maybeSingle();
    if (driverErr) logFailure('DriverApp:loadDriverRecord', driverErr);
    setDriverRecord(driver);
    if (driver) {
      const { data: membership, error: memErr } = await supabase.from('org_members').select('org_id').limit(1).maybeSingle();
      if (memErr) logFailure('DriverApp:loadDriverRecord:membership', memErr);
      if (membership) {
        setOrgId(membership.org_id);
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

  function startShift(driver) {
    shiftStartRef.current = Date.now();
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(coords);
        locationRef.current = coords;
        fbSet(`drivers/${driver.id}/coords`, coords);
        fbSet(`drivers/${driver.id}/lastSeen`, Date.now());
        if (driver.id) {
          supabase.from('drivers').update({
            current_lat: coords.lat,
            current_lng: coords.lng,
            last_location_update: new Date().toISOString(),
            status: 'online',
          }).eq('id', driver.id).then(({ error }) => {
            if (error) logFailure('DriverApp:startShift:locationUpdate', error);
          });
        }
      },
      err => console.warn('GPS error', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    pollRef.current = setInterval(() => pollForNotifications(driver), 8000);
    pollForNotifications(driver);

    motivationTimerRef.current = setInterval(() => {
      if (sheetStateRef.current === 'waiting') {
        triggerMotivation({ trigger: 'idle' });
      }
    }, 25 * 60 * 1000);
  }

  async function pollForNotifications(driver) {
    const result = await fbGet(`driver_notifications/${driver.id}`);
    if (result.ok && result.data) {
      const notif = result.data;
      if (notif.type === 'daily_schedule') {
        setShowSchedule(true);
      } else if (notif.tripId && sheetStateRef.current === 'waiting') {
        setCurrentTrip(notif);
        setSheetState('new_trip');
        startTripCountdown(15);
        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
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
          rejectTrip();
        }
      }
    }, 1000);
  }

  function stopCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(null);
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
      org_id: orgId,
      alert_type: 'sos',
      message: `SOS activated by driver ${driverData?.name || 'Unknown'}`,
      driver_id: driverRecord?.id || null,
      severity: 'critical',
      metadata: { lat: loc?.lat, lng: loc?.lng, driver_name: driverData?.name },
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

  async function acceptTrip() {
    if (!currentTrip) return;
    stopCountdown();

    const acceptedAt = new Date().toISOString();

    await fbSet(`trip_assignments/${currentTrip.tripId}`, { status: 'accepted', driverId: driverData.id, acceptedAt: Date.now() });
    await fbSet(`driver_notifications/${driverData.id}`, null);

    if (currentTrip.tripId) {
      await supabase
        .from('trip_assignments')
        .update({ status: 'accepted', trip_processing_status_id: 1, accepted_at: acceptedAt })
        .eq('trip_id', currentTrip.tripId);

      if (sentryApi.enabled && sentryApi.features.tripAcceptReject) {
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
      }
    }

    setSheetState('navigation');
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

      if (sentryApi.enabled && sentryApi.features.tripAcceptReject) {
        const rejectResult = await sentryApi.rejectTrip(currentTrip.tripId, 1, currentTrip.lastModifiedAt || null);
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'trip_reject',
          direction: 'export',
          record_type: 'trip',
          external_id: String(currentTrip.tripId),
          status: rejectResult.ok ? 'success' : 'failed',
          error_message: rejectResult.ok ? '' : (rejectResult.error || `HTTP ${rejectResult.status}`),
          payload: { driver_id: driverData.id, trip_processing_status_id: 2 },
        });
      }
    }

    setCurrentTrip(null);
    setSheetState('waiting');
  }

  async function confirmPickup() {
    await fbSet(`rider_tracking/${currentTrip?.riderKey}`, { status: 'picked_up', driverId: driverData.id });
    setSheetState('to_dropoff');
  }

  async function completeTrip() {
    const tripEarnings = driverRecord?.pay_rate && driverRecord?.pay_rate_type === 'per_trip'
      ? parseFloat(driverRecord.pay_rate)
      : null;

    const completedAt = new Date().toISOString();

    await fbSet(`trip_assignments/${currentTrip?.tripId}`, { status: 'completed', driverId: driverData.id, completedAt: Date.now() });
    await fbSet(`rider_tracking/${currentTrip?.riderKey}`, { status: 'completed' });

    if (currentTrip?.tripId) {
      const { error: taErr } = await supabase
        .from('trip_assignments')
        .update({ status: 'completed', completed_at: completedAt })
        .eq('trip_id', currentTrip.tripId);
      if (taErr) logFailure('DriverApp:completeTrip:trip_assignments', taErr);

      await supabase
        .from('marketplace_trips')
        .update({ status: 'completed' })
        .eq('sentry_trip_id', String(currentTrip.tripId));

      if (sentryApi.enabled && sentryApi.features.tripStatusUpdate) {
        const sentryResult = await sentryApi.updateTripStatus(currentTrip.tripId, {
          status_id: 7,
          completed_at: completedAt,
        });
        if (!sentryResult.ok) {
          logFailure('DriverApp:completeTrip:sentryUpdateStatus', { status: sentryResult.status, error: sentryResult.error });
        }
      }
    }

    if (driverRecord?.id) {
      await supabase.from('drivers').update({ status: 'online' }).eq('id', driverRecord.id);
    }

    consecutiveTripsRef.current += 1;

    const newTrips = (earnings.trips || 0) + 1;
    setEarnings(prev => ({ ...prev, trips: newTrips }));

    setPostTripSummary({
      tripNumber: newTrips,
      earned: tripEarnings,
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
    if (!location) return;
    await fbSet(`ride_requests/${driverData.id}`, {
      driverId: driverData.id,
      driverName: driverData.name,
      coords: location,
      requestedAt: Date.now(),
      status: 'pending',
    });
    setSheetState('suggestions');
    setTimeout(() => setSheetState('waiting'), 30000);
  }

  const statusMeta = {
    waiting: { label: 'Waiting for next trip', hint: 'Stay in a dense zone and the app will keep stacking nearby rides.' },
    suggestions: { label: 'Searching nearby demand', hint: 'Looking for short, high-efficiency trips around you.' },
    new_trip: { label: 'New trip offer', hint: 'Review quickly so you can keep your shift full.' },
    navigation: { label: 'Navigate to pickup', hint: currentTrip?.puAddress || 'Head to the rider pickup location.' },
    to_dropoff: { label: 'Drive to dropoff', hint: currentTrip?.doAddress || 'Complete the current ride, then we will surface the next one.' },
  }[sheetState] || { label: 'Driver mode', hint: 'Ready for the next move.' };

  const displayEarnings = driverRecord?.pay_rate
    ? calcDriverEarnings(earnings, driverRecord)
    : earnings;

  const hoursWorked = ((Date.now() - shiftStartRef.current) / 3600000).toFixed(1);

  if (showOnboarding) {
    return <OnboardingSlides onDone={() => { setShowOnboarding(false); localStorage.setItem('pds_onboarding_seen', '1'); }} />;
  }

  if (!loggedIn) {
    return <DriverLogin onLogin={(data) => { setLoggedIn(true); setDriverData(data); startShift(data); loadDriverRecord(data.id); }} />;
  }

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#07090d', fontFamily: 'Inter,sans-serif' }}>
      <div className="flex items-center justify-between px-4 py-3 z-10 absolute top-0 left-0 right-0"
        style={{ background: 'linear-gradient(to bottom, rgba(7,9,13,0.95), transparent)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-700"
            style={{ background: 'rgba(201,168,76,0.2)', color: '#c9a84c', border: '2px solid rgba(201,168,76,0.4)', fontWeight: 700 }}>
            {driverData?.name?.charAt(0).toUpperCase() || 'D'}
          </div>
          <div>
            <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driverData?.name || 'Driver'}</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00e5a0', boxShadow: '0 0 4px #00e5a0' }} />
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {location ? 'GPS Active' : 'Getting GPS...'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.2)' }}>
            <DollarSign className="w-3.5 h-3.5" style={{ color: '#c9a84c' }} />
            <span className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>
              ${typeof displayEarnings.today === 'number' ? displayEarnings.today.toFixed(2) : '0.00'}
            </span>
          </div>
          <button
            onClick={() => setShowMenu(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <Menu className="w-4 h-4" style={{ color: '#e5e7eb' }} />
          </button>
        </div>
      </div>

      <div className="absolute z-10 left-0 right-0 flex gap-2 px-4"
        style={{ top: 68, pointerEvents: 'none' }}>
        <div className="flex-1 flex items-center justify-between gap-3 px-3 py-2 rounded-2xl text-xs"
          style={{ background: 'rgba(13,17,23,0.92)', border: '1px solid rgba(255,255,255,0.08)', pointerEvents: 'auto' }}>
          <div>
            <p style={{ color: '#e5e7eb', fontWeight: 700 }}>{statusMeta.label}</p>
            <p style={{ color: 'rgba(255,255,255,0.42)' }}>{statusMeta.hint}</p>
          </div>
          <div className="px-2.5 py-1 rounded-full" style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c', fontWeight: 700 }}>
            {sheetState === 'waiting' ? 'Ready' : sheetState === 'new_trip' ? 'Respond' : 'Active'}
          </div>
        </div>
      </div>

      <div className="absolute z-10 left-0 right-0 flex gap-2 px-4"
        style={{ top: 140, pointerEvents: 'none' }}>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
          style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.08)', pointerEvents: 'auto' }}>
          <TrendingUp className="w-3 h-3" style={{ color: '#00e5a0' }} />
          <span style={{ color: '#e5e7eb' }}>{displayEarnings.trips || 0} trips</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
          style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.08)', pointerEvents: 'auto' }}>
          <Clock className="w-3 h-3" style={{ color: '#0ea5e9' }} />
          <span style={{ color: '#e5e7eb' }}>{hoursWorked}h shift</span>
        </div>
      </div>

      {countdown !== null && (
        <div className="absolute z-30 top-36 left-1/2" style={{ transform: 'translateX(-50%)' }}>
          <div className="flex flex-col items-center gap-1 px-6 py-4 rounded-2xl"
            style={{ background: 'rgba(13,17,23,0.97)', border: '1px solid rgba(255,71,87,0.4)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center relative">
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
        <div className="absolute z-30 top-24 left-4 right-4">
          <div className="rounded-2xl p-4" style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.3)', backdropFilter: 'blur(20px)' }}>
            <div className="flex items-center gap-2 mb-3">
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
              {postTripSummary.earned && (
                <div className="col-span-2">
                  <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Earned</p>
                  <p className="text-sm font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>${postTripSummary.earned.toFixed(2)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {motivationToast && (
        <div className="absolute z-50 mx-4" style={{ top: 72, left: 0, right: 0, background: 'rgba(13,17,23,0.97)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 16, padding: '12px 16px', backdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.25)' }}>
              <span style={{ fontSize: 16 }}>⚡</span>
            </div>
            <div className="flex-1">
              <p className="text-xs font-700 mb-0.5" style={{ color: '#c9a84c', fontWeight: 700 }}>PENTHOUSE AI</p>
              <p className="text-sm" style={{ color: '#e5e7eb', lineHeight: 1.4 }}>{motivationToast}</p>
            </div>
            <button onClick={() => setMotivationToast(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 2 }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {sosActive && (
        <div className="absolute inset-0 z-40 flex items-center justify-center"
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

      <DriverMapView location={location} trip={currentTrip} sheetState={sheetState} />

      <TripBottomSheet
        state={sheetState}
        trip={currentTrip}
        open={sheetOpen}
        onToggle={() => setSheetOpen(!sheetOpen)}
        onRequestRides={requestRides}
        onAccept={acceptTrip}
        onReject={rejectTrip}
        onConfirmPickup={confirmPickup}
        onComplete={completeTrip}
        driverData={driverData}
        earnings={displayEarnings}
        countdown={countdown}
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

      <button
        onPointerDown={() => handleSosPress(true)}
        onPointerUp={() => handleSosPress(false)}
        onPointerLeave={() => handleSosPress(false)}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center select-none"
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

      {showMenu && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setShowMenu(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
          <div
            className="absolute right-0 top-0 bottom-0 flex flex-col"
            style={{ width: 280, background: '#0d1117', borderLeft: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 pt-12 pb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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
                { icon: <Calendar className="w-5 h-5" />, color: '#00e5a0', label: 'My Schedule', sub: 'View today\'s trips', action: () => { setShowSchedule(true); setShowMenu(false); } },
                { icon: <CreditCard className="w-5 h-5" />, color: '#c9a84c', label: 'Earnings & Pay', sub: 'Bank account & payouts', action: () => { setShowPaymentSetup(true); setShowMenu(false); } },
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
