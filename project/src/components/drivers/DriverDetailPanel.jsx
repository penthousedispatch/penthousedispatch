import React, { useState, useEffect } from 'react';
import { X, MapPin, Navigation, Clock, DollarSign, Phone, Car, CheckCircle, Circle, ArrowRight, Activity, Zap, TrendingUp, AlertTriangle, ChevronRight, CreditCard as Edit2, Save, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logFailure } from '../../utils/errorHandler';

const STATUS_CONFIG = {
  online:      { color: '#00e5a0', label: 'Available',  glow: '0 0 8px rgba(0,229,160,0.4)' },
  on_trip:     { color: '#c9a84c', label: 'On Trip',    glow: '0 0 8px rgba(201,168,76,0.4)' },
  offline:     { color: 'rgba(255,255,255,0.25)', label: 'Offline', glow: 'none' },
  break:       { color: '#f59e0b', label: 'On Break',   glow: '0 0 8px rgba(245,158,11,0.4)' },
  unavailable: { color: 'rgba(255,255,255,0.25)', label: 'Unavailable', glow: 'none' },
};

export default function DriverDetailPanel({ driver, assignments = [], onClose, onAssignTrip, availableTrips = [], onDriverUpdated }) {
  const [earnings, setEarnings] = useState(null);
  const [recentPayouts, setRecentPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPay, setEditingPay] = useState(false);
  const [payRate, setPayRate] = useState('');
  const [payType, setPayType] = useState('hourly');
  const [displayPay, setDisplayPay] = useState({ pay_rate: '', pay_rate_type: 'hourly' });
  const [payRateSaving, setPayRateSaving] = useState(false);
  const [payRateSaved, setPayRateSaved] = useState(false);
  const [payRateError, setPayRateError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    if (!driver?.id) return;
    loadDriverData();
    setPayRate(driver.pay_rate ?? '');
    setPayType(driver.pay_rate_type || 'hourly');
    setDisplayPay({ pay_rate: driver.pay_rate ?? '', pay_rate_type: driver.pay_rate_type || 'hourly' });
    setEditingPay(false);
    setPayRateSaved(false);
    setPayRateError('');
  }, [driver?.id]);

  async function savePayRate() {
    if (!driver?.id) return;
    setPayRateSaving(true);
    setPayRateError('');
    const normalizedRate = parseFloat(payRate) || 0;
    const { data, error } = await supabase
      .from('drivers')
      .update({
        pay_rate: normalizedRate,
        pay_rate_type: payType,
      })
      .eq('id', driver.id)
      .select('id, pay_rate, pay_rate_type')
      .maybeSingle();
    if (error || !data) {
      logFailure('DriverDetailPanel:savePayRate', error || new Error('No driver row was updated'));
      setPayRateSaving(false);
      setPayRateSaved(false);
      setPayRateError(error?.message || 'No driver row was updated. Check your permissions and try again.');
      return;
    }
    setPayRateSaving(false);
    setPayRateSaved(true);
    setDisplayPay({ pay_rate: data.pay_rate, pay_rate_type: data.pay_rate_type });
    setEditingPay(false);
    setTimeout(() => setPayRateSaved(false), 3000);
    if (onDriverUpdated) onDriverUpdated();
  }

  async function changeDriverStatus(nextStatus) {
    if (!driver?.id) return;
    setStatusSaving(true);
    setStatusError('');
    const { error } = await supabase
      .from('drivers')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', driver.id);

    if (error) {
      logFailure('DriverDetailPanel:changeDriverStatus', error);
      setStatusError(error.message || 'Status update failed');
      setStatusSaving(false);
      return;
    }

    setStatusSaving(false);
    if (onDriverUpdated) onDriverUpdated();
  }

  async function loadDriverData() {
    setLoading(true);
    try {
      const [{ data: earnLog }, { data: payouts }] = await Promise.all([
        supabase.from('driver_earnings_log')
          .select('total_pay, trips_completed, hours_worked, earn_date')
          .eq('driver_id', driver.id)
          .gte('earn_date', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
          .order('earn_date', { ascending: false })
          .limit(7),
        supabase.from('driver_payouts')
          .select('net_amount, status, pay_period_start, pay_period_end')
          .eq('driver_id', driver.id)
          .order('created_at', { ascending: false })
          .limit(3),
      ]);

      const weekTotal = (earnLog || []).reduce((s, e) => s + parseFloat(e.total_pay || 0), 0);
      const weekTrips = (earnLog || []).reduce((s, e) => s + (e.trips_completed || 0), 0);
      const weekHours = (earnLog || []).reduce((s, e) => s + parseFloat(e.hours_worked || 0), 0);

      setEarnings({ weekTotal, weekTrips, weekHours });
      setRecentPayouts(payouts || []);
    } catch (err) {
      logFailure('DriverDetailPanel:loadDriverData', err);
    }
    setLoading(false);
  }

  if (!driver) return null;

  const status = STATUS_CONFIG[driver.status] || STATUS_CONFIG.offline;
  const initials = driver.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';

  const activeAssignments = assignments.filter(
    a => a.driver_id === driver.id && !['completed', 'cancelled', 'rejected'].includes(a.status)
  );

  const gpsAge = driver.last_location_update
    ? Math.floor((Date.now() - new Date(driver.last_location_update).getTime()) / 60000)
    : null;

  const hasGPS = !!driver.current_lat && !!driver.current_lng;

  return (
    <div
      className="absolute top-0 right-0 bottom-0 z-20 flex flex-col overflow-hidden"
      style={{
        width: 320,
        background: 'rgba(7,9,13,0.97)',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 700 }}>
          Driver Detail
        </p>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <X className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-shrink-0">
              {driver.photo_data ? (
                <img
                  src={driver.photo_data}
                  alt={driver.full_name}
                  className="w-14 h-14 rounded-2xl object-cover"
                  style={{ border: '2px solid rgba(201,168,76,0.3)' }}
                />
              ) : (
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-700"
                  style={{
                    background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))',
                    border: '2px solid rgba(201,168,76,0.3)',
                    color: '#c9a84c',
                    fontWeight: 700,
                  }}
                >
                  {initials}
                </div>
              )}
              <div
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2"
                style={{
                  background: status.color,
                  borderColor: '#07090d',
                  boxShadow: status.glow,
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-700 truncate" style={{ color: '#e5e7eb', fontWeight: 700 }}>{driver.full_name}</p>
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mt-1"
                style={{ background: `${status.color}18`, color: status.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.color }} />
                {status.label}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {driver.tlc_number && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>TLC #</p>
                <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driver.tlc_number}</p>
              </div>
            )}
            {driver.vehicle_plate && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Plate</p>
                <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driver.vehicle_plate}</p>
              </div>
            )}
            {driver.phone && (
              <div className="rounded-xl p-3 col-span-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Phone</p>
                <a href={`tel:${driver.phone}`} className="text-sm font-600" style={{ color: '#0ea5e9', fontWeight: 600 }}>{driver.phone}</a>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{
                background: hasGPS ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)',
                border: `1px solid ${hasGPS ? 'rgba(0,229,160,0.15)' : 'rgba(255,71,87,0.15)'}`,
                color: hasGPS ? '#00e5a0' : '#ff4757',
              }}
            >
              <Navigation className="w-3 h-3" />
              {hasGPS
                ? gpsAge !== null
                  ? `GPS ${gpsAge < 1 ? 'Live' : `${gpsAge}m ago`}`
                  : 'GPS Active'
                : 'No GPS'}
            </div>
            <button
              onClick={() => setEditingPay(v => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: payRateSaved ? 'rgba(0,229,160,0.08)' : 'rgba(201,168,76,0.08)',
                border: `1px solid ${payRateSaved ? 'rgba(0,229,160,0.2)' : 'rgba(201,168,76,0.2)'}`,
                color: payRateSaved ? '#00e5a0' : '#c9a84c',
              }}
            >
              {payRateSaved ? <Check className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
              {payRateSaved
                ? `Saved $${parseFloat(payRate).toFixed(2)}/${payType === 'per_trip' ? 'trip' : 'hr'}`
                : displayPay.pay_rate !== ''
                  ? `$${parseFloat(displayPay.pay_rate).toFixed(2)}/${displayPay.pay_rate_type === 'per_trip' ? 'trip' : 'hr'}`
                  : 'Set pay rate'}
            </button>
            <button
              onClick={() => changeDriverStatus(driver.status === 'offline' ? 'online' : 'offline')}
              disabled={statusSaving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: driver.status === 'offline' ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)',
                border: `1px solid ${driver.status === 'offline' ? 'rgba(0,229,160,0.2)' : 'rgba(255,71,87,0.2)'}`,
                color: driver.status === 'offline' ? '#00e5a0' : '#ff4757',
              }}
            >
              {statusSaving ? 'Saving...' : driver.status === 'offline' ? 'Bring Online' : 'Take Offline'}
            </button>
          </div>
          {statusError && (
            <p className="text-xs mt-2" style={{ color: '#ff4757' }}>{statusError}</p>
          )}
        </div>

        {editingPay && (
          <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(201,168,76,0.03)' }}>
            <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>Edit Pay Rate</p>
            <div className="flex gap-2 mb-3">
              {['hourly', 'per_trip'].map(t => (
                <button
                  key={t}
                  onClick={() => setPayType(t)}
                  className="flex-1 py-2 rounded-lg text-xs font-600 transition-all"
                  style={{
                    background: payType === t ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${payType === t ? 'rgba(201,168,76,0.35)' : 'rgba(255,255,255,0.08)'}`,
                    color: payType === t ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                    fontWeight: 600,
                  }}
                >
                  {t === 'hourly' ? 'Per Hour' : 'Per Trip'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center flex-1 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(255,255,255,0.03)' }}>
                <span className="px-3 text-sm" style={{ color: '#c9a84c' }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={payRate}
                  onChange={e => setPayRate(e.target.value)}
                  placeholder={payType === 'hourly' ? 'e.g. 18.00' : 'e.g. 12.00'}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e5e7eb', padding: '10px 8px', fontSize: 14 }}
                />
                <span className="px-3 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>/{payType === 'per_trip' ? 'trip' : 'hr'}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={savePayRate}
                disabled={payRateSaving || !payRate}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-700 transition-all"
                style={{ background: 'linear-gradient(135deg, #c9a84c, #b8983e)', color: '#07090d', fontWeight: 700 }}
              >
                {payRateSaving ? 'Saving...' : <><Save className="w-4 h-4" /> Save Pay Rate</>}
              </button>
              <button
                onClick={() => setEditingPay(false)}
                className="px-4 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
              >
                Cancel
              </button>
            </div>
            {payRateError && (
              <p className="text-xs mt-2" style={{ color: '#ff4757' }}>{payRateError}</p>
            )}
          </div>
        )}

        <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
            Active Trips
          </p>

          {activeAssignments.length === 0 ? (
            <div className="text-center py-5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Circle className="w-6 h-6 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.12)' }} />
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>No active trips assigned</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeAssignments.map(a => {
                const tripStatus = {
                  pending:   { color: '#f59e0b', label: 'Pending' },
                  accepted:  { color: '#00e5a0', label: 'Accepted' },
                  in_progress: { color: '#c9a84c', label: 'In Progress' },
                }[a.status] || { color: 'rgba(255,255,255,0.4)', label: a.status };

                return (
                  <div
                    key={a.id}
                    className="rounded-xl p-3"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: `${tripStatus.color}18`, color: tripStatus.color }}
                      >
                        {tripStatus.label}
                      </span>
                      {a.delivery_price > 0 && (
                        <span className="text-xs font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>
                          ${parseFloat(a.delivery_price).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {a.pu_address && (
                        <div className="flex items-start gap-2">
                          <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: '#00e5a0' }} />
                          <p className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.6)' }}>{a.pu_address}</p>
                        </div>
                      )}
                      {a.do_address && (
                        <div className="flex items-start gap-2">
                          <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: '#ff4757' }} />
                          <p className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.6)' }}>{a.do_address}</p>
                        </div>
                      )}
                      {a.pu_time && (
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            Pickup {new Date(a.pu_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                      {a.mileage > 0 && (
                        <div className="flex items-center gap-2">
                          <Navigation className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{parseFloat(a.mileage).toFixed(1)} mi</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {driver.status === 'online' && availableTrips.length > 0 && (
            <div className="mt-3">
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Nearby available trips</p>
              {availableTrips.slice(0, 3).map(t => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-2.5 rounded-xl mb-1.5 group cursor-pointer transition-all"
                  style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.1)' }}
                  onClick={() => onAssignTrip?.(t)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate" style={{ color: '#e5e7eb' }}>{t.pu_address || 'Unknown pickup'}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {t.do_address ? `→ ${t.do_address}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {t.delivery_price > 0 && (
                      <span className="text-xs font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>
                        ${parseFloat(t.delivery_price).toFixed(2)}
                      </span>
                    )}
                    <span
                      className="text-xs px-2 py-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(201,168,76,0.2)', color: '#c9a84c' }}
                    >
                      Assign
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
            This Week's Earnings
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
            </div>
          ) : earnings ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.12)' }}>
                <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Pay</p>
                <p className="text-base font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>${earnings.weekTotal.toFixed(0)}</p>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.12)' }}>
                <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Trips</p>
                <p className="text-base font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>{earnings.weekTrips}</p>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.12)' }}>
                <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Hours</p>
                <p className="text-base font-700" style={{ color: '#0ea5e9', fontWeight: 700 }}>{earnings.weekHours.toFixed(1)}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.2)' }}>No earnings data</p>
          )}
        </div>

        {recentPayouts.length > 0 && (
          <div className="px-4 py-4">
            <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
              Recent Payouts
            </p>
            <div className="space-y-1.5">
              {recentPayouts.map((p, i) => {
                const pColors = {
                  paid: '#00e5a0', processing: '#c9a84c', pending: 'rgba(255,255,255,0.4)', failed: '#ff4757',
                };
                return (
                  <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {p.pay_period_start} – {p.pay_period_end}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>${parseFloat(p.net_amount).toFixed(2)}</p>
                      <p className="text-xs capitalize" style={{ color: pColors[p.status] || '#aaa' }}>{p.status}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
