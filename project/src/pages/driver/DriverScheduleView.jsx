import React, { useState, useEffect } from 'react';
import { Clock, MapPin, DollarSign, AlertTriangle, ChevronRight, Zap, CheckCircle, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

function minToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
}

function TripRow({ trip, index, onAcceptShared, isShared }) {
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
              {trip.puTime || (trip.scheduledStart ? minToTime(trip.scheduledStart) : '--')}
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
            {trip.deliveryPrice && (
              <span className="flex items-center gap-1 text-xs font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>
                <DollarSign className="w-3 h-3" />
                {parseFloat(trip.deliveryPrice).toFixed(2)}
              </span>
            )}
            {trip.mileage && (
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {parseFloat(trip.mileage).toFixed(1)} mi
              </span>
            )}
          </div>
        </div>

        {isShared && onAcceptShared && (
          <button
            onClick={() => onAcceptShared(trip)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-700"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            Add
          </button>
        )}
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

export default function DriverScheduleView({ driverId, onClose }) {
  const [schedule, setSchedule] = useState([]);
  const [sharedCandidates, setSharedCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalRevenue: 0, revenuePerHour: 0, tripCount: 0 });
  const [dismissedShared, setDismissedShared] = useState(new Set());

  useEffect(() => {
    loadSchedule();

    const channel = supabase
      .channel(`driver-schedule-${driverId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trip_assignments',
        filter: `driver_id=eq.${driverId}`,
      }, () => loadSchedule())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [driverId]);

  async function loadSchedule() {
    if (!driverId) return;
    setLoading(true);

    const { data: assignments } = await supabase
      .from('trip_assignments')
      .select('*')
      .eq('driver_id', driverId)
      .in('status', ['pending', 'accepted'])
      .order('scheduled_order', { ascending: true, nullsFirst: false });

    if (assignments) {
      const sorted = [...assignments].sort((a, b) => {
        if (a.scheduled_order != null && b.scheduled_order != null) return a.scheduled_order - b.scheduled_order;
        return (a.pu_time || '').localeCompare(b.pu_time || '');
      });

      const enriched = sorted.map((a, i) => ({
        tripId: a.trip_id,
        puAddress: a.pu_address,
        doAddress: a.do_address,
        puTime: a.pu_time,
        deliveryPrice: String(a.delivery_price || ''),
        mileage: String(a.mileage || ''),
        driveTimeFromPrev: a.travel_time_mins || 0,
        scheduledStart: null,
        tightBuffer: a.travel_time_mins != null && a.travel_time_mins < 10,
        isSharedRide: a.is_shared_ride || false,
        status: a.status,
      }));

      setSchedule(enriched);

      const total = enriched.reduce((s, t) => s + (parseFloat(t.deliveryPrice) || 0), 0);
      setStats({
        totalRevenue: total,
        revenuePerHour: enriched.length > 0 ? total / Math.max(1, enriched.length / 2) : 0,
        tripCount: enriched.length,
      });
    }

    const { data: available } = await supabase
      .from('marketplace_trips')
      .select('*')
      .eq('status', 'available')
      .limit(20);

    if (available && assignments) {
      const assignedIds = new Set(assignments.map(a => a.trip_id));
      const candidates = (available || [])
        .filter(t => !assignedIds.has(t.sentry_trip_id))
        .slice(0, 3)
        .map(t => ({
          tripId: t.sentry_trip_id,
          puAddress: t.pu_address,
          doAddress: t.do_address,
          puTime: t.pu_time,
          deliveryPrice: String(t.delivery_price || ''),
          mileage: String(t.mileage || ''),
          driveTimeFromPrev: 0,
          tightBuffer: false,
          raw: t,
        }));
      setSharedCandidates(candidates);
    }

    setLoading(false);
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
      style={{ background: '#07090d', fontFamily: 'Inter,sans-serif' }}
    >
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div>
          <h2 className="font-700 text-base" style={{ color: '#e5e7eb', fontWeight: 700 }}>
            My Day
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            AI-built schedule
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
        </button>
      </div>

      <div
        className="flex gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,229,160,0.07)', border: '1px solid rgba(0,229,160,0.15)' }}>
          <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Today's Revenue</p>
          <p className="font-700 text-base" style={{ color: '#00e5a0', fontWeight: 700 }}>
            ${stats.totalRevenue.toFixed(2)}
          </p>
        </div>
        <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.15)' }}>
          <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Trips</p>
          <p className="font-700 text-base" style={{ color: '#c9a84c', fontWeight: 700 }}>
            {stats.tripCount}
          </p>
        </div>
        <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.15)' }}>
          <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>/hr Est.</p>
          <p className="font-700 text-base" style={{ color: '#0ea5e9', fontWeight: 700 }}>
            ${stats.revenuePerHour.toFixed(0)}
          </p>
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
            <TripRow key={trip.tripId} trip={trip} index={i} isShared={false} />
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
    </div>
  );
}
