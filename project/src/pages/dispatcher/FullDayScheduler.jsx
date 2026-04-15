import React, { useState, useEffect } from 'react';
import { Calendar, Zap, Send, RefreshCw, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';

const DAY_OFFSETS = [
  { label: 'Today', offset: 0 },
  { label: 'Tomorrow', offset: 1 },
  { label: '+2', offset: 2 },
  { label: '+3', offset: 3 },
  { label: '+5', offset: 5 },
];

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function displayDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function FullDayScheduler() {
  const { drivers, trips, loadDrivers } = useApp();
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [schedules, setSchedules] = useState({});
  const [building, setBuilding] = useState(false);
  const [driverToggles, setDriverToggles] = useState({});
  const [shiftTimes, setShiftTimes] = useState({});
  const [sendingDriverId, setSendingDriverId] = useState(null);

  const targetDate = addDays(new Date(), selectedOffset);
  const dateStr = formatDate(targetDate);

  useEffect(() => {
    const toggles = {};
    const shifts = {};
    drivers.forEach(d => {
      toggles[d.id] = d.working_today ?? false;
      shifts[d.id] = d.shift_hours || '7am-5pm';
    });
    setDriverToggles(toggles);
    setShiftTimes(shifts);
    loadSchedules();
  }, [drivers, dateStr]);

  async function loadSchedules() {
    const { data } = await supabase.from('driver_schedules').select('*').eq('schedule_date', dateStr);
    const map = {};
    (data || []).forEach(s => { map[s.driver_id] = s; });
    setSchedules(map);
  }

  async function updateDriverWorking(driverId, value) {
    setDriverToggles(prev => ({ ...prev, [driverId]: value }));
    await supabase.from('drivers').update({ working_today: value }).eq('id', driverId);
  }

  async function buildScheduleForDriver(driver) {
    const tripList = trips.map(t => ({
      tripId: t.sentry_trip_id,
      coords: t.coords,
      doCoords: t.do_coords,
      deliveryPrice: t.delivery_price,
      mileage: t.mileage,
      puAddress: t.pu_address,
      doAddress: t.do_address,
      puTime: t.pu_time,
      startMin: t.pu_time ? parseTimeToMin(t.pu_time) : null,
    }));

    const already = new Set(
      Object.values(schedules).flatMap(s => (s.trips || []).map(t => t.tripId))
    );

    const shift = shiftTimes[driver.id] || '7am-5pm';
    const { startMin, endMin } = parseShift(shift);
    const shiftHours = (endMin - startMin) / 60;

    const available = tripList
      .filter(t => t.startMin && !already.has(t.tripId) && t.startMin >= startMin - 30 && t.startMin <= endMin)
      .sort((a, b) => (parseFloat(b.deliveryPrice) || 0) - (parseFloat(a.deliveryPrice) || 0))
      .slice(0, 15);

    const selected = [];
    let lastEndMin = startMin;

    for (const trip of available) {
      if (selected.length >= 10) break;
      if (trip.startMin < lastEndMin + 15) continue;
      selected.push(trip);
      lastEndMin = trip.startMin + 25;
    }

    const totalRevenue = selected.reduce((s, t) => s + (parseFloat(t.deliveryPrice) || 0), 0);
    const rph = shiftHours > 0 ? totalRevenue / shiftHours : 0;
    const issues = [];
    if (rph < 60) issues.push(`$${rph.toFixed(0)}/hr below $60 target`);
    if (selected.length < 10) issues.push(`Only ${selected.length} trips (target 10+)`);

    const sched = {
      driver_id: driver.id,
      schedule_date: dateStr,
      trips: selected,
      total_revenue: totalRevenue,
      revenue_per_hour: rph,
      shift_hours_count: shiftHours,
      issues: JSON.stringify(issues),
      is_confirmed: false,
    };

    await supabase.from('driver_schedules').upsert(sched, { onConflict: 'driver_id,schedule_date' });
    return sched;
  }

  async function buildAll() {
    setBuilding(true);
    const workingDrivers = drivers.filter(d => driverToggles[d.id]);
    for (const d of workingDrivers) {
      const sched = await buildScheduleForDriver(d);
      setSchedules(prev => ({ ...prev, [d.id]: sched }));
    }
    setBuilding(false);
  }

  async function sendToDriver(driverId) {
    setSendingDriverId(driverId);
    await supabase.from('driver_schedules').update({ is_confirmed: true }).eq('driver_id', driverId).eq('schedule_date', dateStr);
    await loadSchedules();
    setSendingDriverId(null);
  }

  const workingDrivers = drivers.filter(d => driverToggles[d.id]);

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#07090d' }}>
      <aside className="w-64 flex-shrink-0 border-r flex flex-col overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="p-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Drivers</p>
          <div className="flex flex-wrap gap-1 mb-3">
            {DAY_OFFSETS.map(({ label, offset }) => (
              <button
                key={offset}
                onClick={() => setSelectedOffset(offset)}
                className="px-2.5 py-1 rounded-lg text-xs transition-all"
                style={{
                  background: selectedOffset === offset ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)',
                  color: selectedOffset === offset ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                  border: '1px solid',
                  borderColor: selectedOffset === offset ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.07)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{displayDate(targetDate)}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {drivers.map(driver => {
            const working = driverToggles[driver.id] || false;
            return (
              <div
                key={driver.id}
                className="rounded-xl p-3 transition-all"
                style={{
                  background: working ? 'rgba(201,168,76,0.06)' : '#0d1117',
                  border: `1px solid ${working ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-600 truncate" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driver.full_name}</p>
                  <button
                    onClick={() => updateDriverWorking(driver.id, !working)}
                    className="w-9 h-5 rounded-full transition-all flex-shrink-0 ml-2 relative"
                    style={{ background: working ? '#c9a84c' : 'rgba(255,255,255,0.1)' }}
                  >
                    <div
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: working ? '18px' : '2px' }}
                    />
                  </button>
                </div>
                {working && (
                  <input
                    type="text"
                    value={shiftTimes[driver.id] || '7am-5pm'}
                    onChange={e => setShiftTimes(prev => ({ ...prev, [driver.id]: e.target.value }))}
                    className="w-full text-xs py-1"
                    style={{ fontSize: 11 }}
                    placeholder="7am-5pm"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <button
            onClick={buildAll}
            disabled={building || workingDrivers.length === 0}
            className="btn-gold w-full py-2.5 flex items-center justify-center gap-2 text-sm"
          >
            <Zap className="w-4 h-4" />
            {building ? 'Building...' : `Build All (${workingDrivers.length})`}
          </button>
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto p-4">
        {drivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Calendar className="w-12 h-12" style={{ color: 'rgba(255,255,255,0.15)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No drivers. Import from Live Dispatch first.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {drivers.filter(d => driverToggles[d.id]).map(driver => {
              const sched = schedules[driver.id];
              const tripList = sched?.trips || [];
              const revenue = sched?.total_revenue || 0;
              const rph = sched?.revenue_per_hour || 0;
              const issues = sched?.issues ? (typeof sched.issues === 'string' ? JSON.parse(sched.issues) : sched.issues) : [];

              return (
                <div key={driver.id} className="rounded-xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-3">
                      <p className="font-700 text-sm" style={{ fontWeight: 700 }}>{driver.full_name}</p>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{shiftTimes[driver.id]}</span>
                      {sched && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{
                          background: rph >= 60 ? 'rgba(0,229,160,0.1)' : 'rgba(255,71,87,0.1)',
                          color: rph >= 60 ? '#00e5a0' : '#ff4757',
                        }}>
                          ${rph.toFixed(0)}/hr
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {sched && (
                        <span className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${revenue.toFixed(2)}</span>
                      )}
                      <button
                        onClick={() => buildScheduleForDriver(driver).then(s => setSchedules(prev => ({ ...prev, [driver.id]: s })))}
                        className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Rebuild
                      </button>
                      {sched && tripList.length > 0 && (
                        <button
                          onClick={() => sendToDriver(driver.id)}
                          disabled={sendingDriverId === driver.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-600 transition-all"
                          style={{
                            background: sched.is_confirmed ? 'rgba(0,229,160,0.1)' : 'rgba(201,168,76,0.12)',
                            border: '1px solid',
                            borderColor: sched.is_confirmed ? 'rgba(0,229,160,0.25)' : 'rgba(201,168,76,0.25)',
                            color: sched.is_confirmed ? '#00e5a0' : '#c9a84c',
                            fontWeight: 600,
                          }}
                        >
                          {sched.is_confirmed ? <><CheckCircle className="w-3 h-3" /> Sent</> : <><Send className="w-3 h-3" /> Send</>}
                        </button>
                      )}
                    </div>
                  </div>

                  {issues.length > 0 && (
                    <div className="px-4 py-2 flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
                      <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#f59e0b', flexShrink: 0 }} />
                      <p className="text-xs" style={{ color: '#f59e0b' }}>{issues.join(' • ')}</p>
                    </div>
                  )}

                  {tripList.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>No schedule built yet. Click Rebuild.</p>
                    </div>
                  ) : (
                    <div className="p-3 space-y-1.5">
                      {tripList.map((trip, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                        >
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-700 flex-shrink-0"
                            style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', fontWeight: 700 }}
                          >
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-500 truncate" style={{ color: '#e5e7eb' }}>{trip.puAddress}</p>
                            <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{trip.puTime}</p>
                          </div>
                          <span className="text-sm font-700 flex-shrink-0" style={{ color: '#c9a84c', fontWeight: 700 }}>
                            ${parseFloat(trip.deliveryPrice || 0).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {workingDrivers.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <Calendar className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.15)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Toggle drivers "Working Today" to build schedules.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function parseShift(shiftStr) {
  const clean = (shiftStr || '7am-5pm').toLowerCase().replace(/\s/g, '');
  const parts = clean.split(/[-to]+/);
  return { startMin: parseTimeToMin(parts[0]), endMin: parseTimeToMin(parts[1] || '5pm') };
}

function parseTimeToMin(s) {
  if (!s) return 0;
  s = s.trim().toLowerCase();
  const ampm = s.includes('pm') ? 'pm' : 'am';
  s = s.replace(/[apm]/g, '');
  const parts = s.split(':');
  let h = parseInt(parts[0]) || 0;
  const m = parseInt(parts[1]) || 0;
  if (ampm === 'pm' && h !== 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return h * 60 + m;
}
