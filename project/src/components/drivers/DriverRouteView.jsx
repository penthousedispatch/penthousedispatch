import React, { useState, useEffect } from 'react';
import {
  X, MapPin, Clock, Navigation, CheckCircle, Circle,
  AlertCircle, RefreshCw, Car, ArrowDown, Route
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const BOROUGH_COLORS = {
  manhattan: '#c9a84c',
  brooklyn: '#0ea5e9',
  queens: '#00e5a0',
  bronx: '#f59e0b',
  'staten island': '#a78bfa',
  'long island': '#f472b6',
  default: 'rgba(255,255,255,0.5)',
};

const BOROUGH_KEYWORDS = {
  manhattan: ['manhattan', 'new york, ny', ' ny 10', 'midtown', 'harlem', 'upper east', 'upper west', 'lower east', 'tribeca', 'soho', 'chelsea', 'greenwich', 'battery'],
  brooklyn: ['brooklyn', 'bk', ' ny 112', 'bedford', 'williamsburg', 'bushwick', 'park slope', 'crown heights', 'flatbush', 'bay ridge', 'bensonhurst', 'coney island'],
  queens: ['queens', 'flushing', 'astoria', 'jackson heights', 'jamaica', 'long island city', 'lic', 'forest hills', 'bayside', 'ozone park', 'richmond hill', 'woodside'],
  bronx: ['bronx', ' ny 104', 'riverdale', 'fordham', 'pelham', 'hunts point', 'morrisania', 'co-op city'],
  'staten island': ['staten island', 'si ', ' ny 103'],
  'long island': ['long island', 'nassau', 'suffolk', 'hempstead', 'garden city', 'great neck', 'jericho', 'mineola', 'valley stream', 'hicksville', 'plainview', 'syosset', 'huntington', 'islip', 'babylon'],
};

function detectBorough(address) {
  if (!address) return 'default';
  const lower = address.toLowerCase();
  for (const [borough, keywords] of Object.entries(BOROUGH_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return borough;
  }
  return 'default';
}

function BoroughBadge({ address }) {
  const borough = detectBorough(address);
  const color = BOROUGH_COLORS[borough];
  const label = borough === 'default' ? 'Unknown' : borough.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{ background: `${color}15`, color, fontWeight: 600, border: `1px solid ${color}30`, fontSize: 10 }}
    >
      {label}
    </span>
  );
}

function TripStopRow({ num, type, address, time, status }) {
  const isPickup = type === 'pickup';
  const statusColor = status === 'completed' ? '#00e5a0' : status === 'in_progress' ? '#c9a84c' : 'rgba(255,255,255,0.25)';

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 28 }}>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: isPickup ? 'rgba(0,229,160,0.12)' : 'rgba(255,71,87,0.12)',
            border: `1.5px solid ${isPickup ? 'rgba(0,229,160,0.35)' : 'rgba(255,71,87,0.35)'}`,
          }}
        >
          <MapPin className="w-3 h-3" style={{ color: isPickup ? '#00e5a0' : '#ff4757' }} />
        </div>
        {type === 'pickup' && (
          <div className="flex-1 w-px my-0.5" style={{ background: 'rgba(255,255,255,0.08)', minHeight: 16 }} />
        )}
      </div>
      <div className="flex-1 min-w-0 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span className="text-xs font-600" style={{ color: isPickup ? '#00e5a0' : '#ff4757', fontWeight: 600 }}>
                {isPickup ? 'Pickup' : 'Drop-off'} #{num}
              </span>
              <BoroughBadge address={address} />
            </div>
            <p className="text-xs leading-snug" style={{ color: '#e5e7eb' }}>{address || 'Address not set'}</p>
          </div>
          <div className="flex flex-col items-end flex-shrink-0 gap-1">
            {time && (
              <div className="flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <Clock className="w-3 h-3" />
                <span className="text-xs">{time}</span>
              </div>
            )}
            <div className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DriverRouteView({ driver, onClose }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (driver?.id) loadRoute();
  }, [driver?.id, selectedDate]);

  async function loadRoute() {
    setLoading(true);
    const start = `${selectedDate}T00:00:00`;
    const end = `${selectedDate}T23:59:59`;

    const { data } = await supabase
      .from('trip_assignments')
      .select('*')
      .eq('driver_id', driver.id)
      .gte('scheduled_pickup_time', start)
      .lte('scheduled_pickup_time', end)
      .order('scheduled_pickup_time', { ascending: true });

    setAssignments(data || []);
    setLoading(false);
  }

  if (!driver) return null;

  const completed = assignments.filter(a => a.status === 'completed').length;
  const totalMiles = assignments.reduce((s, a) => s + (parseFloat(a.mileage) || 0), 0);
  const totalRevenue = assignments.reduce((s, a) => s + (parseFloat(a.delivery_price) || 0), 0);

  function formatTime(ts) {
    if (!ts) return null;
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const statusColors = { online: '#00e5a0', on_trip: '#c9a84c', offline: 'rgba(255,255,255,0.3)', break: '#f59e0b' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: '#0d1117',
          border: '1px solid rgba(255,255,255,0.08)',
          maxHeight: '90vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            {driver.photo_data ? (
              <img src={driver.photo_data} alt="" className="w-10 h-10 rounded-full object-cover" style={{ border: '2px solid rgba(201,168,76,0.3)' }} />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 700 }}>
                {driver.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{driver.full_name}</p>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusColors[driver.status] || 'rgba(255,255,255,0.2)' }} />
                  <span className="text-xs capitalize" style={{ color: statusColors[driver.status] || 'rgba(255,255,255,0.4)' }}>{driver.status}</span>
                </div>
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>TLC: {driver.tlc_number || 'N/A'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Route className="w-4 h-4 flex-shrink-0" style={{ color: '#c9a84c' }} />
          <p className="text-sm font-600" style={{ color: '#c9a84c', fontWeight: 600 }}>Daily Route</p>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="ml-auto text-xs rounded-lg px-2 py-1.5"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', fontSize: 12 }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { label: 'Trips', value: `${completed}/${assignments.length}`, color: '#00e5a0' },
            { label: 'Miles', value: totalMiles.toFixed(1), color: '#0ea5e9' },
            { label: 'Revenue', value: `$${totalRevenue.toFixed(0)}`, color: '#c9a84c' },
          ].map(s => (
            <div key={s.label} className="text-center py-2 rounded-xl" style={{ background: `${s.color}08`, border: `1px solid ${s.color}20` }}>
              <p className="text-base font-800" style={{ color: s.color, fontWeight: 800 }}>{s.value}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
            </div>
          ) : assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Car className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.1)' }} />
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No trips scheduled for this date</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((a, idx) => (
                <div
                  key={a.id}
                  className="rounded-xl overflow-hidden"
                  style={{
                    background: a.status === 'completed' ? 'rgba(0,229,160,0.03)' : a.status === 'in_progress' ? 'rgba(201,168,76,0.05)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${a.status === 'completed' ? 'rgba(0,229,160,0.15)' : a.status === 'in_progress' ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-700 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(201,168,76,0.1)', color: '#c9a84c', fontWeight: 700, fontSize: 11 }}>
                        {idx + 1}
                      </span>
                      <span className="text-xs font-600" style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                        Trip {(a.sentry_trip_id || a.id || '').toString().slice(-6)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {a.mileage > 0 && (
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{parseFloat(a.mileage).toFixed(1)} mi</span>
                      )}
                      {a.delivery_price > 0 && (
                        <span className="text-xs font-600" style={{ color: '#c9a84c', fontWeight: 600 }}>${parseFloat(a.delivery_price).toFixed(2)}</span>
                      )}
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{
                          background: a.status === 'completed' ? 'rgba(0,229,160,0.12)' : a.status === 'in_progress' ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.05)',
                          color: a.status === 'completed' ? '#00e5a0' : a.status === 'in_progress' ? '#c9a84c' : 'rgba(255,255,255,0.35)',
                          fontSize: 10,
                        }}
                      >
                        {a.status}
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <TripStopRow
                      num={idx + 1}
                      type="pickup"
                      address={a.pu_address}
                      time={formatTime(a.scheduled_pickup_time || a.actual_pickup_time)}
                      status={a.status === 'completed' ? 'completed' : a.status === 'in_progress' ? 'in_progress' : 'pending'}
                    />
                    <TripStopRow
                      num={idx + 1}
                      type="dropoff"
                      address={a.do_address}
                      time={formatTime(a.actual_dropoff_time)}
                      status={a.status === 'completed' ? 'completed' : 'pending'}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
