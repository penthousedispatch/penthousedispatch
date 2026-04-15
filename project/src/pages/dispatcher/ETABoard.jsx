import React, { useState, useEffect } from 'react';
import { Navigation, Clock, RefreshCw, MapPin, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { haversineDistance } from '../../lib/geocode';

const AVG_SPEED_MPH = 20;

function calcETA(driverLat, driverLng, destLat, destLng) {
  if (!driverLat || !driverLng || !destLat || !destLng) return null;
  const miles = haversineDistance(
    parseFloat(driverLat), parseFloat(driverLng),
    parseFloat(destLat), parseFloat(destLng)
  );
  const hours = miles / AVG_SPEED_MPH;
  const mins = Math.round(hours * 60);
  return { miles: miles.toFixed(1), mins };
}

function etaColor(mins) {
  if (mins == null) return 'rgba(255,255,255,0.3)';
  if (mins <= 5) return '#00e5a0';
  if (mins <= 15) return '#c9a84c';
  return '#ff4757';
}

export default function ETABoard() {
  const { drivers, assignments } = useApp();
  const [now, setNow] = useState(Date.now());
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const activeDrivers = drivers.filter(d => d.status === 'on_trip' || d.status === 'online');

  const rows = activeDrivers.map(driver => {
    const latestAssignment = assignments.find(a => a.driver_id === driver.id && (a.status === 'accepted' || a.status === 'pending'));

    let destLat = null, destLng = null, destLabel = '', destType = '';
    if (latestAssignment) {
      if (driver.status === 'on_trip') {
        destLabel = latestAssignment.do_address || 'Drop-off';
        destType = 'dropoff';
      } else {
        destLabel = latestAssignment.pu_address || 'Pick-up';
        destType = 'pickup';
      }
    }

    const lastUpdate = driver.last_location_update ? new Date(driver.last_location_update) : null;
    const gpsAgeMin = lastUpdate ? Math.floor((now - lastUpdate.getTime()) / 60000) : null;

    return { driver, latestAssignment, destLabel, destType, destLat, destLng, gpsAgeMin };
  });

  const onTripCount = drivers.filter(d => d.status === 'on_trip').length;
  const onlineCount = drivers.filter(d => d.status === 'online').length;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#07090d' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-4">
          <p className="font-700 text-sm" style={{ fontWeight: 700 }}>ETA Board</p>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: '#00e5a0', display: 'inline-block' }} />
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{onTripCount} on trip</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: '#c9a84c', display: 'inline-block' }} />
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{onlineCount} available</span>
            </span>
          </div>
        </div>
        <button
          onClick={() => setRefresh(r => r + 1)}
          className="btn-ghost px-3 py-2 flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Navigation className="w-12 h-12 mb-4" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="font-600" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>No active drivers</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Drivers will appear here when online</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Driver', 'Status', 'Destination', 'Trip', 'GPS Age', 'ETA'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.35)', fontWeight: 600, fontSize: 10, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ driver, latestAssignment, destLabel, destType, gpsAgeMin }) => {
                  const statusColor = driver.status === 'on_trip' ? '#00e5a0' : '#c9a84c';
                  const gpsStale = gpsAgeMin != null && gpsAgeMin > 5;

                  return (
                    <tr key={driver.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div className="flex items-center gap-2.5">
                          {driver.photo_data ? (
                            <img src={driver.photo_data} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-700 flex-shrink-0" style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c', fontWeight: 700 }}>
                              {driver.full_name?.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm" style={{ color: '#e5e7eb' }}>{driver.full_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: `${statusColor}15`,
                            color: statusColor,
                            border: `1px solid ${statusColor}30`,
                            fontWeight: 600,
                          }}
                        >
                          {driver.status === 'on_trip' ? 'On Trip' : 'Available'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', maxWidth: 200 }}>
                        {destLabel ? (
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: destType === 'dropoff' ? '#ff4757' : '#00e5a0' }} />
                            <span className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>{destLabel}</span>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {latestAssignment ? (
                          <div>
                            <p className="text-xs" style={{ color: '#c9a84c', fontWeight: 600 }}>${parseFloat(latestAssignment.delivery_price || 0).toFixed(2)}</p>
                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{latestAssignment.pu_time || '—'}</p>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>No assignment</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div className="flex items-center gap-1.5">
                          {gpsStale && <AlertCircle className="w-3 h-3 flex-shrink-0" style={{ color: '#f59e0b' }} />}
                          <span className="text-xs" style={{ color: gpsStale ? '#f59e0b' : 'rgba(255,255,255,0.5)' }}>
                            {gpsAgeMin != null ? `${gpsAgeMin}m ago` : '—'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className="text-xs font-700" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>—</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-center mt-4" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Auto-refreshes every 30 seconds · ETA calculated at {AVG_SPEED_MPH}mph average
        </p>
      </div>
    </div>
  );
}
