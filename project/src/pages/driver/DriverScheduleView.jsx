import React, { useState, useEffect } from 'react';
import { Clock, MapPin, AlertTriangle, ChevronRight, Zap, CheckCircle, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

function minToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
}

function safeMiles(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n.toFixed(1) : '0.0';
}

function TripRow({ trip, index, onAcceptShared, isShared, onActivateTrip = null }) {
  const timingLabel = trip.doTime
    ? `${trip.puTime || (trip.scheduledStart ? minToTime(trip.scheduledStart) : '--')} - ${trip.doTime}`
    : (trip.puTime || (trip.scheduledStart ? minToTime(trip.scheduledStart) : '--'));

  return (
    <div
      className="relative"
      style={{
        background: isShared
          ? 'rgba(14,165,233,0.06)'
          : trip.tightBuffer
          ? 'rgba(245,158,11,0.05)'
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${
          isShared
            ? 'rgba(14,165,233,0.2)'
            : trip.tightBuffer
            ? 'rgba(245,158,11,0.2)'
            : 'rgba(255,255,255,0.07)'
        }`,
        borderRadius: 14,
        padding: '12px 14px',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-700"
          style={{
            background: isShared ? 'rgba(14,165,233,0.15)' : 'rgba(201,168,76,0.15)',
            color: isShared ? '#0ea5e9' : '#c9a84c',
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          {isShared ? '+' : index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>
              {timingLabel}
            </span>
            {trip.tightBuffer && !isShared && (
              <span
                className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: 10 }}
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                Tight
              </span>
            )}
            {isShared && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(14,165,233,0.12)', color: '#0ea5e9', fontSize: 10 }}
              >
                Bonus Ride
              </span>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-start gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: '#00e5a0' }} />
              <p className="text-xs" style={{ color: '#e5e7eb', lineHeight: 1.4 }}>
                {trip.puAddress || trip.puAddress || 'Pickup'}
              </p>
            </div>
            <div className="flex items-start gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: '#ff4757' }} />
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                {trip.doAddress || 'Dropoff'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2">
            {trip.driveTimeFromPrev > 0 && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <Clock className="w-3 h-3" />
                {trip.driveTimeFromPrev}min drive
              </span>
            )}
            {trip.mileage !== null && trip.mileage !== undefined && String(trip.mileage).trim() !== '' && (
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {safeMiles(trip.mileage)} mi
              </span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-col gap-2">
          {isShared && onAcceptShared && (
            <button
              onClick={() => onAcceptShared(trip)}
              className="px-3 py-1.5 rounded-lg text-xs font-700"
              style={{
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              Add
            </button>
          )}
          {!isShared && onActivateTrip && ['accepted', 'arrived', 'picked_up', 'pending'].includes(String(trip.status || '').toLowerCase()) && (
            <button
              onClick={() => onActivateTrip(trip)}
              className="px-3 py-1.5 rounded-lg text-xs font-700"
              style={{
                background: 'rgba(0,229,160,0.14)',
                border: '1px solid rgba(0,229,160,0.28)',
                color: '#00e5a0',
                fontWeight: 700,
              }}
            >
              Open
            </button>
          )}
        </div>
      </div>

      {!isShared && index > 0 && trip.driveTimeFromPrev > 0 && (
        <div
          className="absolute left-3.5 -top-4 flex flex-col items-center"
          style={{ height: 18 }}
        >
          <div className="w-px flex-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
        </div>
      )}
    </div>
  );
}

export default function DriverScheduleView({
  driverId,
  onClose,
  hasActiveTrip = false,
  onResumeTrip = null,
  /** Bumped by DriverApp single shared trip_assignments realtime channel (Phase 1). */
  assignmentSignal = 0,
}) {
  const [schedule, setSchedule] = useState([]);
  const [sharedCandidates, setSharedCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalMiles: 0, tripCount: 0, avgBufferMin: 0 });
  const [dismissedShared, setDismissedShared] = useState(new Set());
  const [shiftHours, setShiftHours] = useState('7am-5pm');
  const [savingShift, setSavingShift] = useState(false);
  const [shiftSaved, setShiftSaved] = useState('');

  useEffect(() => {
    if (!driverId) {
      setLoading(false);
      setSchedule([]);
      setSharedCandidates([]);
      return undefined;
    }

    loadSchedule();
  }, [driverId, assignmentSignal]);

  async function loadSchedule() {
    if (!driverId) return;
    setLoading(true);
    try {
      const { data: driverRow } = await supabase
        .from('drivers')
        .select('shift_hours')
        .eq('id', driverId)
        .maybeSingle();

      if (driverRow?.shift_hours) {
        setShiftHours(driverRow.shift_hours);
      }

      const { data: assignments } = await supabase
        .from('trip_assignments')
        .select('*')
        .eq('driver_id', driverId)
        .in('status', ['pending', 'accepted'])
        .order('scheduled_order', { ascending: true, nullsFirst: false });

      const safeAssignments = assignments || [];
      const sorted = [...safeAssignments].sort((a, b) => {
        if (a.scheduled_order != null && b.scheduled_order != null) return a.scheduled_order - b.scheduled_order;
        return (a.pu_time || '').localeCompare(b.pu_time || '');
      });

      const enriched = sorted.map(a => ({
        tripId: a.trip_id,
        puAddress: a.pu_address,
        doAddress: a.do_address,
        puTime: a.pu_time,
        deliveryPrice: String(a.delivery_price || ''),
        mileage: String(a.mileage || ''),
        driveTimeFromPrev: a.travel_time_mins || 0,
        doTime: a.do_time || null,
        scheduledStart: null,
        tightBuffer: a.travel_time_mins != null && a.travel_time_mins < 10,
        isSharedRide: a.is_shared_ride || false,
        status: a.status,
      }));

      setSchedule(enriched);

      const total = enriched.reduce((s, t) => s + (Number.parseFloat(t.deliveryPrice) || 0), 0);
      const totalMiles = enriched.reduce((sum, t) => sum + (Number.parseFloat(t.mileage) || 0), 0);
      const avgBuffer =
        enriched.length > 0
          ? Math.round(enriched.reduce((sum, t) => sum + (Number(t.driveTimeFromPrev) || 0), 0) / enriched.length)
          : 0;
      setStats({
        totalMiles,
        avgBufferMin: avgBuffer,
        totalRevenue: total,
        revenuePerHour: enriched.length > 0 ? total / Math.max(1, enriched.length / 2) : 0,
        tripCount: enriched.length,
      });

      const { data: available } = await supabase
        .from('marketplace_trips')
        .select('*')
        .eq('status', 'available')
        .limit(20);

      if (available && safeAssignments.length >= 0) {
        const tripIds = (available || []).map(t => t.sentry_trip_id).filter(Boolean);
        let lockedTripIds = new Set();
        if (tripIds.length > 0) {
          const { data: activeTripRows } = await supabase
            .from('trip_assignments')
            .select('trip_id, status')
            .in('trip_id', tripIds)
            .in('status', ['pending', 'accepted', 'arrived', 'picked_up']);
          lockedTripIds = new Set((activeTripRows || []).map(row => row.trip_id).filter(Boolean));
        }
        const assignedIds = new Set(safeAssignments.map(a => a.trip_id));
        const candidates = (available || [])
          .filter(t => !assignedIds.has(t.sentry_trip_id) && !lockedTripIds.has(t.sentry_trip_id))
          .slice(0, 3)
          .map(t => ({
            tripId: t.sentry_trip_id,
            puAddress: t.pu_address,
            doAddress: t.do_address,
            puTime: t.pu_time,
            doTime: t.do_time || null,
            deliveryPrice: String(t.delivery_price || ''),
            mileage: String(t.mileage || ''),
            driveTimeFromPrev: 0,
            tightBuffer: false,
            raw: t,
          }));
        setSharedCandidates(candidates);
      }
    } catch {
      setSchedule([]);
      setSharedCandidates([]);
      setStats({ totalMiles: 0, tripCount: 0, avgBufferMin: 0 });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveShift() {
    if (!driverId) return;
    const nextShift = String(shiftHours || '').trim() || '7am-5pm';
    setSavingShift(true);
    setShiftSaved('');

    const { error } = await supabase
      .from('drivers')
      .update({
        shift_hours: nextShift,
        updated_at: new Date().toISOString(),
      })
      .eq('id', driverId);

    if (!error) {
      setShiftSaved('Saved');
    }

    setSavingShift(false);
  }

  async function handleAcceptShared(trip) {
    const nextOrder = schedule.length + 1;
    await supabase.from('trip_assignments').insert({
      trip_id: trip.tripId,
      driver_id: driverId,
      status: 'pending',
      trip_processing_status_id: 1,
      pu_address: trip.puAddress,
      do_address: trip.doAddress,
      pu_time: trip.puTime,
      scheduled_pickup_time: trip.puTime || null,
      do_time: trip.doTime || '',
      delivery_price: parseFloat(trip.deliveryPrice) || 0,
      mileage: parseFloat(trip.mileage) || 0,
      scheduled_order: nextOrder,
      is_shared_ride: true,
      assigned_at: new Date().toISOString(),
    });
    await supabase
      .from('marketplace_trips')
      .update({ status: 'assigned', taken_by: driverId })
      .eq('sentry_trip_id', trip.tripId);
    setDismissedShared(prev => new Set([...prev, trip.tripId]));
    loadSchedule();
  }

  const visibleShared = sharedCandidates.filter(c => !dismissedShared.has(c.tripId));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: '#07090d', fontFamily: 'Inter,sans-serif', paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingTop: 'calc(var(--safe-top) + 12px)' }}
      >
        <div>
          <h2 className="font-700 text-base" style={{ color: '#e5e7eb', fontWeight: 700 }}>
            My Day
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            AI-built schedule
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onResumeTrip && (
            <button
              type="button"
              onClick={onResumeTrip}
              className="px-3 py-1.5 rounded-lg text-xs font-700 flex items-center gap-1.5"
              style={{ background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.24)', color: '#00e5a0', fontWeight: 700 }}
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Resume Trip
            </button>
          )}
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            title="Close schedule"
          >
            <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
          </button>
        </div>
      </div>

      <div
        className="flex gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,229,160,0.07)', border: '1px solid rgba(0,229,160,0.15)' }}>
          <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Est. miles</p>
          <p className="font-700 text-base" style={{ color: '#00e5a0', fontWeight: 700 }}>
            {Number(stats.totalMiles || 0).toFixed(1)}
          </p>
        </div>
        <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.15)' }}>
          <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Trips</p>
          <p className="font-700 text-base" style={{ color: '#c9a84c', fontWeight: 700 }}>
            {stats.tripCount}
          </p>
        </div>
        <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.15)' }}>
          <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Avg gap</p>
          <p className="font-700 text-base" style={{ color: '#0ea5e9', fontWeight: 700 }}>
            {stats.avgBufferMin ? `${stats.avgBufferMin}m` : '—'}
          </p>
        </div>
      </div>

      <div
        className="px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>My Work Shift</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)', lineHeight: 1.5 }}>
                Set your normal hours so company dispatch and AI can build the day around your shift.
              </p>
            </div>
            {shiftSaved && (
              <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,229,160,0.12)', color: '#00e5a0' }}>
                {shiftSaved}
              </span>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <input
              type="text"
              value={shiftHours}
              onChange={e => {
                setShiftHours(e.target.value);
                if (shiftSaved) setShiftSaved('');
              }}
              placeholder="7am-5pm"
              className="flex-1"
              style={{ minWidth: 0 }}
            />
            <button
              type="button"
              onClick={handleSaveShift}
              disabled={savingShift}
              className="px-4 py-2 rounded-xl text-xs font-700"
              style={{
                background: 'rgba(201,168,76,0.12)',
                border: '1px solid rgba(201,168,76,0.24)',
                color: '#c9a84c',
                fontWeight: 700,
              }}
            >
              {savingShift ? 'Saving...' : 'Save Shift'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
          </div>
        ) : schedule.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
              <Clock className="w-7 h-7" style={{ color: '#c9a84c' }} />
            </div>
            <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>No trips scheduled yet</p>
            <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.35)', maxWidth: 220 }}>
              The AI is building your day. Trips will appear here automatically as they're assigned.
            </p>
          </div>
        ) : (
          schedule.map((trip, i) => (
            <TripRow key={trip.tripId} trip={trip} index={i} isShared={false} onActivateTrip={onResumeTrip} />
          ))
        )}

        {visibleShared.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2 px-1">
              <Zap className="w-3.5 h-3.5" style={{ color: '#0ea5e9' }} />
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: '#0ea5e9', fontWeight: 700 }}>
                Bonus Rides Along Your Route
              </p>
            </div>
            <div className="space-y-2">
              {visibleShared.map(trip => (
                <TripRow
                  key={trip.tripId}
                  trip={trip}
                  index={0}
                  isShared
                  onAcceptShared={handleAcceptShared}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          type="button"
          onClick={onResumeTrip ? onResumeTrip : onClose}
          className="w-full py-3 rounded-xl text-sm font-700"
          style={{
            background: hasActiveTrip ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${hasActiveTrip ? 'rgba(0,229,160,0.24)' : 'rgba(255,255,255,0.12)'}`,
            color: hasActiveTrip ? '#00e5a0' : '#e5e7eb',
            fontWeight: 700,
          }}
        >
          {onResumeTrip ? 'Back To Active Trip' : 'Close Schedule'}
        </button>
      </div>
    </div>
  );
}
