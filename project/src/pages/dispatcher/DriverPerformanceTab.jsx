import React, { useState, useEffect } from 'react';
import {
  Activity, TrendingUp, Clock, MapPin, CheckCircle,
  ChevronDown, ChevronUp, ArrowUpDown, Filter, Route
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import DriverRouteView from '../../components/drivers/DriverRouteView';

function calcDriverPay(driver, totalTrips, totalHours) {
  const rate = parseFloat(driver.pay_rate) || 0;
  const type = driver.pay_rate_type || 'hourly';
  if (type === 'per_trip') return rate * totalTrips;
  return rate * totalHours;
}

function StatCard({ label, value, sub, color = '#c9a84c', icon: Icon }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color }} />}
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
      </div>
      <p className="text-xl font-800" style={{ color, fontWeight: 800 }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>}
    </div>
  );
}

function DriverRow({ stat, rank, expanded, onToggle, onViewRoute }) {
  const { driver, totalTrips, completedTrips, totalMiles, totalHours, tripFees, earningsPerHour, earningsPerMile, driverPay, completionRate, assignments } = stat;

  const statusColors = { online: '#00e5a0', on_trip: '#c9a84c', offline: 'rgba(255,255,255,0.25)', break: '#f59e0b' };
  const rankColors = ['#c9a84c', '#9ca3af', '#cd7f32'];

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ background: expanded ? 'rgba(201,168,76,0.05)' : '#0d1117', border: `1px solid ${expanded ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.06)'}` }}
    >
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={onToggle}>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0"
          style={{
            background: rank < 3 ? `rgba(${rank === 0 ? '201,168,76' : rank === 1 ? '156,163,175' : '205,127,50'},0.15)` : 'rgba(255,255,255,0.05)',
            color: rankColors[rank] || 'rgba(255,255,255,0.35)',
            fontWeight: 800,
          }}
        >
          {rank + 1}
        </div>

        {driver.photo_data ? (
          <img src={driver.photo_data} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" style={{ border: '2px solid rgba(201,168,76,0.2)' }} />
        ) : (
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs flex-shrink-0" style={{ background: 'rgba(201,168,76,0.1)', color: '#c9a84c', fontWeight: 700 }}>
            {driver.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driver.full_name}</p>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusColors[driver.status] || 'rgba(255,255,255,0.2)' }} />
              <span className="text-xs" style={{ color: statusColors[driver.status] || 'rgba(255,255,255,0.3)' }}>{driver.status}</span>
            </div>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
              {driver.pay_rate_type === 'per_trip' ? `$${driver.pay_rate}/trip` : `$${driver.pay_rate}/hr`}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs flex-wrap" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <span>{completedTrips}/{totalTrips} trips</span>
            <span>{totalHours.toFixed(1)}h worked</span>
            <span>{totalMiles.toFixed(1)} mi</span>
          </div>
        </div>

        <div className="hidden sm:grid grid-cols-3 gap-4 text-right mr-2">
          <div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Trip Fees</p>
            <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${tripFees.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>/hr</p>
            <p className="text-sm font-700" style={{ color: earningsPerHour >= 20 ? '#00e5a0' : earningsPerHour >= 10 ? '#c9a84c' : '#ff4757', fontWeight: 700 }}>
              ${earningsPerHour.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>/mi</p>
            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>${earningsPerMile.toFixed(2)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right hidden lg:block">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Driver Pay</p>
            <p className="text-sm font-700" style={{ color: '#f59e0b', fontWeight: 700 }}>${driverPay.toFixed(2)}</p>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
          )}
        </div>
      </div>

      {totalTrips > 0 && (
        <div className="px-4 pb-2">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${completionRate}%`, background: completionRate >= 90 ? '#00e5a0' : completionRate >= 70 ? '#c9a84c' : '#ff4757' }}
            />
          </div>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>{completionRate.toFixed(0)}% completion rate</p>
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 mt-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
            <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Trip Fees</p>
              <p className="text-base font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${tripFees.toFixed(2)}</p>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Earnings / hr</p>
              <p className="text-base font-700" style={{ color: earningsPerHour >= 20 ? '#00e5a0' : '#c9a84c', fontWeight: 700 }}>${earningsPerHour.toFixed(2)}</p>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Earnings / mi</p>
              <p className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>${earningsPerMile.toFixed(2)}</p>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Driver Pay Owed</p>
              <p className="text-base font-700" style={{ color: '#f59e0b', fontWeight: 700 }}>${driverPay.toFixed(2)}</p>
            </div>
          </div>

          <button
            onClick={e => { e.stopPropagation(); onViewRoute(stat.driver); }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs mb-3 transition-all"
            style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', fontWeight: 600 }}
          >
            <Route className="w-3.5 h-3.5" />
            View Today's Route
          </button>

          {assignments.length > 0 && (
            <>
              <p className="text-xs font-700 uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>Trip Breakdown</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {assignments.map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: a.status === 'completed' ? '#00e5a0' : '#ff4757' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{a.pu_address || 'Unknown pickup'}</p>
                      <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{a.do_address || 'Unknown dropoff'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {a.delivery_price > 0 && (
                        <p className="text-xs font-600" style={{ color: '#c9a84c', fontWeight: 600 }}>${parseFloat(a.delivery_price).toFixed(2)}</p>
                      )}
                      {a.mileage > 0 && (
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{parseFloat(a.mileage).toFixed(1)} mi</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'tripFees', label: 'Trip Fees' },
  { value: 'earningsPerHour', label: 'Earnings/hr' },
  { value: 'earningsPerMile', label: 'Earnings/mi' },
  { value: 'completedTrips', label: 'Trips Done' },
  { value: 'completionRate', label: 'Completion %' },
];

export default function DriverPerformanceTab() {
  const { drivers } = useApp();
  const [assignments, setAssignments] = useState([]);
  const [earningsRecords, setEarningsRecords] = useState([]);
  const [period, setPeriod] = useState('week');
  const [sortBy, setSortBy] = useState('tripFees');
  const [expandedDriver, setExpandedDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payTypeFilter, setPayTypeFilter] = useState('all');
  const [routeDriver, setRouteDriver] = useState(null);

  useEffect(() => {
    load();
  }, [period]);

  async function load() {
    setLoading(true);
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [assignRes, earnRes] = await Promise.all([
      supabase
        .from('trip_assignments')
        .select('id, driver_id, status, delivery_price, mileage, pu_address, do_address, completed_at, assigned_at')
        .gte('assigned_at', since)
        .order('assigned_at', { ascending: false }),
      supabase
        .from('driver_earnings')
        .select('driver_id, trips_completed, hours_worked, total_revenue, bonuses')
        .gte('earn_date', new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)),
    ]);

    setAssignments(assignRes.data || []);
    setEarningsRecords(earnRes.data || []);
    setLoading(false);
  }

  const driverStats = drivers
    .filter(d => payTypeFilter === 'all' || d.pay_rate_type === payTypeFilter)
    .map(driver => {
      const driverAssignments = assignments.filter(a => a.driver_id === driver.id);
      const completedAssignments = driverAssignments.filter(a => a.status === 'completed');
      const driverEarnings = earningsRecords.filter(e => e.driver_id === driver.id);

      const totalTrips = driverAssignments.length;
      const completedTrips = completedAssignments.length;
      const tripFees = completedAssignments.reduce((s, a) => s + parseFloat(a.delivery_price || 0), 0);
      const totalMiles = completedAssignments.reduce((s, a) => s + parseFloat(a.mileage || 0), 0);
      const totalHours = driverEarnings.reduce((s, e) => s + parseFloat(e.hours_worked || 0), 0);
      const completionRate = totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0;
      const earningsPerHour = totalHours > 0 ? tripFees / totalHours : 0;
      const earningsPerMile = totalMiles > 0 ? tripFees / totalMiles : 0;
      const driverPay = calcDriverPay(driver, completedTrips, totalHours);

      return {
        driver,
        totalTrips,
        completedTrips,
        tripFees,
        totalMiles,
        totalHours,
        completionRate,
        earningsPerHour,
        earningsPerMile,
        driverPay,
        assignments: driverAssignments,
      };
    })
    .sort((a, b) => b[sortBy] - a[sortBy]);

  const fleetTripFees = driverStats.reduce((s, d) => s + d.tripFees, 0);
  const fleetMiles = driverStats.reduce((s, d) => s + d.totalMiles, 0);
  const fleetHours = driverStats.reduce((s, d) => s + d.totalHours, 0);
  const fleetTrips = driverStats.reduce((s, d) => s + d.completedTrips, 0);
  const fleetEarningsPerHour = fleetHours > 0 ? fleetTripFees / fleetHours : 0;

  return (
    <>
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#07090d' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0 flex-wrap gap-2" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {['day', 'week', 'month'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="text-xs px-2.5 py-1 rounded-full capitalize transition-all"
                style={{
                  background: period === p ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)',
                  color: period === p ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                  border: '1px solid',
                  borderColor: period === p ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.07)',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-2">
            <ArrowUpDown className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="text-xs rounded-lg px-2 py-1 outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value} style={{ background: '#0d1117' }}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <select
              value={payTypeFilter}
              onChange={e => setPayTypeFilter(e.target.value)}
              className="text-xs rounded-lg px-2 py-1 outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <option value="all" style={{ background: '#0d1117' }}>All Pay Types</option>
              <option value="hourly" style={{ background: '#0d1117' }}>Hourly</option>
              <option value="per_trip" style={{ background: '#0d1117' }}>Per Trip</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Fleet Avg/hr</p>
            <p className="text-base font-800" style={{ color: '#00e5a0', fontWeight: 800 }}>${fleetEarningsPerHour.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Total Trip Fees</p>
            <p className="text-base font-800" style={{ color: '#c9a84c', fontWeight: 800 }}>${fleetTripFees.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatCard label="Trips Completed" value={fleetTrips} icon={CheckCircle} color="#00e5a0" sub={`this ${period}`} />
          <StatCard label="Total Trip Fees" value={`$${fleetTripFees.toFixed(2)}`} icon={TrendingUp} color="#c9a84c" sub="from completed trips" />
          <StatCard label="Fleet Avg / hr" value={`$${fleetEarningsPerHour.toFixed(2)}`} icon={Clock} color="#0ea5e9" sub="trip fees per hour" />
          <StatCard label="Total Miles" value={`${fleetMiles.toFixed(0)} mi`} icon={MapPin} color="#f59e0b" sub="fleet-wide" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 700 }}>
                Driver Performance — {driverStats.length} drivers
              </p>
              <div className="hidden sm:flex items-center gap-4 text-xs mr-10" style={{ color: 'rgba(255,255,255,0.25)' }}>
                <span style={{ width: 80, textAlign: 'right' }}>Trip Fees</span>
                <span style={{ width: 60, textAlign: 'right' }}>/hr</span>
                <span style={{ width: 60, textAlign: 'right' }}>/mi</span>
              </div>
            </div>
            {driverStats.map((stat, i) => (
              <DriverRow
                key={stat.driver.id}
                stat={stat}
                rank={i}
                expanded={expandedDriver === stat.driver.id}
                onToggle={() => setExpandedDriver(prev => prev === stat.driver.id ? null : stat.driver.id)}
                onViewRoute={setRouteDriver}
              />
            ))}
            {driverStats.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 rounded-xl gap-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
                <Activity className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.15)' }} />
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No performance data for this period</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {routeDriver && (
      <DriverRouteView driver={routeDriver} onClose={() => setRouteDriver(null)} />
    )}
    </>
  );
}
