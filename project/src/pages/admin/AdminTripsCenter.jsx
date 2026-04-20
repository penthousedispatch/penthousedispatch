import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, RefreshCw, Route, TimerReset } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ACTIVE_STATUSES = new Set(['pending', 'assigned', 'accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip']);
const INACTIVE_STATUSES = new Set(['completed', 'cancelled', 'rejected', 'no_show']);

function formatDateTime(value) {
  if (!value) return 'No time';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function TripRow({ trip }) {
  return (
    <div
      className="grid grid-cols-1 xl:grid-cols-[140px_140px_160px_1fr_1fr] gap-3 rounded-2xl px-4 py-3"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div>
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Status</p>
        <p className="text-sm font-600 capitalize" style={{ color: '#e5e7eb', fontWeight: 600 }}>{trip.status || 'unknown'}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Trip ID</p>
        <p className="text-sm font-600" style={{ color: '#c9a84c', fontWeight: 600 }}>{trip.tripId || 'No trip id'}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Company / Driver</p>
        <p className="text-sm" style={{ color: '#e5e7eb' }}>{trip.companyName || 'No company'}</p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{trip.driverName || 'Unassigned'}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Pickup</p>
        <p className="text-sm" style={{ color: '#e5e7eb' }}>{trip.pickup || 'No pickup address'}</p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{formatDateTime(trip.pickupTime)}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Dropoff</p>
        <p className="text-sm" style={{ color: '#e5e7eb' }}>{trip.dropoff || 'No dropoff address'}</p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{trip.source}</p>
      </div>
    </div>
  );
}

export default function AdminTripsCenter() {
  const [loading, setLoading] = useState(true);
  const [tripRows, setTripRows] = useState([]);
  const [view, setView] = useState('active');

  async function loadTripsForToday() {
    setLoading(true);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [companiesRes, assignmentRes, marketplaceRes] = await Promise.all([
      supabase.from('companies').select('id, company_name'),
      supabase
        .from('trip_assignments')
        .select('trip_id, status, company_id, driver_name, pu_address, do_address, pu_time, assigned_at, completed_at, rejected_at')
        .order('assigned_at', { ascending: false })
        .limit(500),
      supabase
        .from('marketplace_trips')
        .select('sentry_trip_id, status, company_id, pu_address, do_address, pu_time, loaded_at, taken_by')
        .order('loaded_at', { ascending: false })
        .limit(500),
    ]);

    const companyMap = new Map((companiesRes.data || []).map(company => [company.id, company.company_name]));

    const inToday = value => {
      if (!value) return false;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return false;
      return parsed >= dayStart && parsed < dayEnd;
    };

    const assignmentRows = (assignmentRes.data || [])
      .filter(row => inToday(row.pu_time) || inToday(row.assigned_at) || inToday(row.completed_at) || inToday(row.rejected_at))
      .map(row => ({
        source: 'Dispatch Assignment',
        tripId: row.trip_id,
        status: row.status,
        companyName: companyMap.get(row.company_id) || row.company_id || '',
        driverName: row.driver_name || '',
        pickup: row.pu_address || '',
        pickupTime: row.pu_time || row.assigned_at || row.completed_at || row.rejected_at,
        dropoff: row.do_address || '',
      }));

    const marketplaceRows = (marketplaceRes.data || [])
      .filter(row => inToday(row.pu_time) || inToday(row.loaded_at))
      .map(row => ({
        source: 'Marketplace Trip',
        tripId: row.sentry_trip_id,
        status: row.status,
        companyName: companyMap.get(row.company_id) || row.company_id || '',
        driverName: row.taken_by ? `Taken by ${row.taken_by}` : '',
        pickup: row.pu_address || '',
        pickupTime: row.pu_time || row.loaded_at,
        dropoff: row.do_address || '',
      }));

    setTripRows([...assignmentRows, ...marketplaceRows].sort((a, b) => new Date(b.pickupTime || 0) - new Date(a.pickupTime || 0)));
    setLoading(false);
  }

  useEffect(() => {
    loadTripsForToday();
  }, []);

  const activeTrips = useMemo(() => tripRows.filter(trip => ACTIVE_STATUSES.has(String(trip.status || '').toLowerCase())), [tripRows]);
  const inactiveTrips = useMemo(() => tripRows.filter(trip => INACTIVE_STATUSES.has(String(trip.status || '').toLowerCase())), [tripRows]);
  const visibleTrips = view === 'active' ? activeTrips : inactiveTrips;

  return (
    <div className="h-full overflow-y-auto p-6 pb-48" style={{ color: '#e5e7eb' }}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-700 mb-1" style={{ color: '#c9a84c', fontWeight: 700 }}>Trips Today</h1>
            <p style={{ color: 'rgba(255,255,255,0.45)' }}>
              Platform-wide view of active and inactive trips for the current day across dispatch assignments and marketplace trips.
            </p>
          </div>
          <button onClick={loadTripsForToday} className="btn-gold flex items-center gap-2 px-4 py-2 text-sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Active</p>
              <Activity className="w-4 h-4" style={{ color: '#00e5a0' }} />
            </div>
            <p className="text-2xl font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>{activeTrips.length}</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Inactive</p>
              <TimerReset className="w-4 h-4" style={{ color: '#f59e0b' }} />
            </div>
            <p className="text-2xl font-700" style={{ color: '#f59e0b', fontWeight: 700 }}>{inactiveTrips.length}</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Day</p>
              <CalendarDays className="w-4 h-4" style={{ color: '#c9a84c' }} />
            </div>
            <p className="text-lg font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>{new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {[
            { key: 'active', label: 'Active Trips', count: activeTrips.length },
            { key: 'inactive', label: 'Inactive Trips', count: inactiveTrips.length },
          ].map(option => (
            <button
              key={option.key}
              onClick={() => setView(option.key)}
              className="px-4 py-2 rounded-xl text-sm transition-all"
              style={{
                background: view === option.key ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${view === option.key ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.08)'}`,
                color: view === option.key ? '#c9a84c' : 'rgba(255,255,255,0.65)',
                fontWeight: 600,
              }}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>

        <div className="rounded-2xl p-4 space-y-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4" style={{ color: '#c9a84c' }} />
            <p className="text-sm font-600" style={{ fontWeight: 600 }}>{view === 'active' ? 'Active' : 'Inactive'} trips for today</p>
          </div>
          {visibleTrips.length === 0 ? (
            <div className="rounded-2xl px-4 py-8 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
              No {view} trips were found for today.
            </div>
          ) : (
            visibleTrips.map(trip => <TripRow key={`${trip.source}:${trip.tripId}:${trip.pickupTime || 'no-time'}`} trip={trip} />)
          )}
        </div>
      </div>
    </div>
  );
}
