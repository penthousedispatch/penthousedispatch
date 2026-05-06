import React, { useState } from 'react';
import { Navigation, Users, ExternalLink, Zap, CheckCircle, AlertTriangle, MoreVertical, Map, Phone, Flag, ChevronRight, X } from 'lucide-react';

function formatTripPickupTime(puTime) {
  if (puTime === null || puTime === undefined) return '';
  const raw = String(puTime).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  }
  return raw;
}

function driverContractPayLabel(driverData) {
  if (!driverData) return '—';
  const t = String(driverData.pay_rate_type || 'hourly').toLowerCase();
  const r = parseFloat(driverData.pay_rate);
  if (t === 'per_trip' && r > 0) return `$${r.toFixed(0)}/trip`;
  if (r > 0) return `$${r.toFixed(0)}/hr`;
  return 'Hourly';
}

function safeFixed(value, digits = 1, fallback = '--') {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num.toFixed(digits) : fallback;
}

function mtaFareLabel(trip) {
  if (!trip?.mtaFareRequired) return '';
  const amount = Number.parseFloat(trip.mtaFareAmount);
  return Number.isFinite(amount)
    ? `MTA fare required: collect $${amount.toFixed(2)}`
    : 'MTA fare required: confirm fare paid';
}

export default function TripBottomSheet({
  state, trip, open, onToggle,
  onRequestRides, onAccept, onReject,
  onStartRoute, onArrive, onConfirmPickup, onNoShow, onComplete,
  driverData, earnings, ridePreferences, onToggleShortTrips, onTogglePriority, onToggleSharedRide,
  countdown, routeStarted = false, pickupArrived, waitRemaining, waitTargetMins, sosButton, acceptingTrip = false,
}) {
  const [confirmingPickup, setConfirmingPickup] = useState(false);
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const fareNotice = mtaFareLabel(trip);
  const [showTripMenu, setShowTripMenu] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueNote, setIssueNote] = useState('');
  const [collectedFare, setCollectedFare] = useState('');
  const [markNextDay, setMarkNextDay] = useState(false);

  async function handleComplete() {
    const trimmedFare = String(collectedFare || '').trim();
    const fareValue = trimmedFare === '' ? null : Number(trimmedFare);

    setCompleting(true);
    await onComplete({
      collectedFare:
        trimmedFare === '' || Number.isNaN(fareValue)
          ? null
          : fareValue,
      isNextDay: Boolean(markNextDay),
    });
    setCompleting(false);
    setConfirmingComplete(false);
    setCollectedFare('');
    setMarkNextDay(false);
  }

  async function handlePickupConfirm() {
    const trimmedFare = String(collectedFare || '').trim();
    const fareValue = trimmedFare === '' ? null : Number(trimmedFare);
    await onConfirmPickup({
      collectedFare:
        trimmedFare === '' || Number.isNaN(fareValue)
          ? null
          : fareValue,
    });
    setConfirmingPickup(false);
    setCollectedFare('');
  }

  const destAddr = state === 'navigation' ? trip?.puAddress : trip?.doAddress;
  const waitMinutes = String(Math.floor((waitRemaining || 0) / 60)).padStart(2, '0');
  const waitSeconds = String((waitRemaining || 0) % 60).padStart(2, '0');
  const googleMapsUrl = (addr) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr || '')}`;
  const appleMapsUrl = (addr) => `https://maps.apple.com/?daddr=${encodeURIComponent(addr || '')}`;
  const wazeUrl = (addr) => `https://waze.com/ul?q=${encodeURIComponent(addr || '')}&navigate=yes`;

  function submitIssue() {
    setShowIssueForm(false);
    setIssueNote('');
    setShowTripMenu(false);
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 transition-transform"
      style={{ transform: open ? 'translateY(0)' : 'translateY(calc(100% - 52px))' }}
    >
      <div
        className="rounded-t-3xl overflow-hidden"
        style={{ background: 'rgba(13,17,23,0.97)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none', boxShadow: '0 -8px 40px rgba(0,0,0,0.6)' }}
      >
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-3 transition-all"
          style={{ background: 'none', border: 'none' }}
        >
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </button>

        <div className="px-4 pb-8">
          {sosButton ? (
            <div className="flex justify-end mb-3">
              {sosButton}
            </div>
          ) : null}

          {state === 'waiting' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(201,168,76,0.1)', animation: 'pulseRing 2s ease-out infinite' }}
                >
                  <Navigation className="w-5 h-5" style={{ color: '#c9a84c' }} />
                </div>
                <div>
                  <p className="font-700 text-base" style={{ fontWeight: 700 }}>Waiting for trips</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {earnings?.trips || 0} trips today
                  </p>
                </div>
              </div>

              <button
                onClick={onRequestRides}
                className="w-full py-4 rounded-2xl text-base font-700 flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #c9a84c, #b8983e)',
                  color: '#07090d',
                  fontWeight: 700,
                  fontSize: 16,
                  boxShadow: '0 4px 20px rgba(201,168,76,0.3)',
                }}
              >
                <Zap className="w-5 h-5" />
                Request Rides Near Me
              </button>

              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Short Trips', ridePreferences?.shortTripPreference || '2-4 mi', onToggleShortTrips],
                  ['Priority', ridePreferences?.priorityPreference || 'Nearby chain', onTogglePriority],
                  ['Shared Ride', ridePreferences?.sharedRidePreference || 'Same direction', onToggleSharedRide],
                ].map(([label, value, handler]) => (
                  <button
                    key={label}
                    onClick={handler}
                    className="rounded-xl px-3 py-2.5 text-center transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</p>
                    <p className="text-xs font-700 mt-1" style={{ color: '#e5e7eb', fontWeight: 700 }}>{value}</p>
                  </button>
                ))}
              </div>

              <div className="px-4 py-3 rounded-xl flex items-center gap-2.5"
                style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)' }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#00e5a0', boxShadow: '0 0 6px #00e5a0' }} />
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  GPS active &mdash; your location is being shared with dispatch
                </p>
              </div>
            </div>
          )}

          {state === 'new_trip' && trip && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)' }}>
                  <div className="w-2.5 h-2.5 rounded-full animate-blink" style={{ background: '#00e5a0', flexShrink: 0 }} />
                  <p className="text-sm font-600" style={{ color: '#00e5a0', fontWeight: 600 }}>New Trip</p>
                </div>
                <button
                  onClick={() => setShowTripMenu(!showTripMenu)}
                  className="w-9 h-9 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <MoreVertical className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
                </button>
              </div>

              {showTripMenu && (
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <p className="px-4 pt-3 pb-2 text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>Trip Options</p>
                  <button
                    onClick={() => { setShowIssueForm(true); setShowTripMenu(false); }}
                    className="w-full flex items-center justify-between px-4 py-3"
                    style={{ background: 'none', border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-center gap-3">
                      <Flag className="w-4 h-4" style={{ color: '#f59e0b' }} />
                      <span className="text-sm" style={{ color: '#e5e7eb' }}>Report an Issue</span>
                    </div>
                    <ChevronRight className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  </button>
                  <button
                    onClick={() => setShowTripMenu(false)}
                    className="w-full flex items-center justify-center py-3"
                    style={{ background: 'none', border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Close</span>
                  </button>
                </div>
              )}

              {showIssueForm && (
                <div className="rounded-2xl p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-700" style={{ color: '#f59e0b', fontWeight: 700 }}>Report Issue</p>
                    <button onClick={() => setShowIssueForm(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={issueNote}
                    onChange={e => setIssueNote(e.target.value)}
                    placeholder="Describe the issue..."
                    rows={3}
                    className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
                  />
                  <button
                    onClick={submitIssue}
                    className="mt-2 w-full py-2.5 rounded-xl text-sm font-700"
                    style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontWeight: 700 }}
                  >
                    Submit to Dispatch
                  </button>
                </div>
              )}

              <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Next Best Ride</p>
                    <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Keep the shift moving</p>
                  </div>
                  <p className="text-xs font-600 text-right max-w-[140px]" style={{ color: 'rgba(255,255,255,0.38)', fontWeight: 600 }}>
                    Trip fare is billed to the company; your pay follows your contract rate.
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <div className="w-3 h-3 rounded-full" style={{ background: '#00e5a0' }} />
                    <div className="w-0.5 h-8 my-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: '#ff4757' }} />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>PICKUP</p>
                      <p className="text-sm font-500" style={{ color: '#e5e7eb' }}>{trip.puAddress || 'Loading...'}</p>
                      {trip.puTime && (
                        <p className="text-xs mt-0.5" style={{ color: '#c9a84c' }}>{formatTripPickupTime(trip.puTime)}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>DROPOFF</p>
                      <p className="text-sm font-500" style={{ color: 'rgba(255,255,255,0.7)' }}>{trip.doAddress || 'Loading...'}</p>
                    </div>
                  </div>
                </div>
                {(trip.passengers > 1 || trip.mileage) && (
                  <div className="flex gap-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {trip.passengers > 1 && <span className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}><Users className="w-3 h-3" />{trip.passengers} passengers</span>}
                    {trip.mileage && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{safeFixed(trip.mileage, 1)} mi</span>}
                  </div>
                )}
                {fareNotice && (
                  <div className="rounded-xl px-3 py-2 text-xs font-700" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', fontWeight: 700 }}>
                    {fareNotice}
                  </div>
                )}
              </div>

              <div className="relative">
                {countdown !== null && countdown > 0 && (
                  <div className="absolute -top-3 right-0 flex items-center gap-2 px-3 py-1 rounded-full"
                    style={{ background: countdown <= 5 ? 'rgba(255,71,87,0.15)' : 'rgba(201,168,76,0.12)', border: `1px solid ${countdown <= 5 ? 'rgba(255,71,87,0.4)' : 'rgba(201,168,76,0.3)'}` }}>
                    <div className="relative w-5 h-5">
                      <svg viewBox="0 0 20 20" className="absolute inset-0">
                        <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
                        <circle cx="10" cy="10" r="8" fill="none"
                          stroke={countdown <= 5 ? '#ff4757' : '#c9a84c'}
                          strokeWidth="2.5"
                          strokeDasharray={`${(countdown / 15) * 50.3} 50.3`}
                          strokeLinecap="round"
                          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-700"
                        style={{ color: countdown <= 5 ? '#ff4757' : '#c9a84c', fontWeight: 700, fontSize: 8 }}>
                        {countdown}
                      </span>
                    </div>
                    <span className="text-xs font-600" style={{ color: countdown <= 5 ? '#ff4757' : '#c9a84c', fontWeight: 600, fontSize: 11 }}>
                      {countdown <= 5 ? 'Expiring!' : 'seconds to accept'}
                    </span>
                  </div>
                )}
                <button
                  onClick={onAccept}
                  disabled={acceptingTrip}
                  className="w-full py-5 rounded-2xl text-lg font-800 flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: acceptingTrip
                      ? 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.08))'
                      : countdown !== null && countdown <= 5
                      ? 'linear-gradient(135deg, #ff6b6b, #ff4757)'
                      : 'linear-gradient(135deg, #00e5a0, #00c88c)',
                    color: acceptingTrip ? 'rgba(255,255,255,0.78)' : '#07090d',
                    fontWeight: 800,
                    fontSize: 18,
                    boxShadow: acceptingTrip
                      ? 'none'
                      : countdown !== null && countdown <= 5
                      ? '0 4px 20px rgba(255,71,87,0.35)'
                      : '0 4px 20px rgba(0,229,160,0.3)',
                    opacity: acceptingTrip ? 0.88 : 1,
                    cursor: acceptingTrip ? 'not-allowed' : 'pointer',
                  }}
                >
                  <CheckCircle className="w-6 h-6" />
                  {acceptingTrip ? 'Checking Trip...' : 'Accept Trip'}
                </button>
              </div>
              <button
                onClick={onReject}
                className="w-full py-3 rounded-2xl text-sm font-600 flex items-center justify-center gap-2"
                style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', color: '#ff4757', fontWeight: 600 }}
              >
                &#10005; Reject Trip
              </button>
            </div>
          )}

          {(state === 'navigation' || state === 'to_dropoff') && trip && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                    {state === 'navigation' ? 'Heading to Pickup' : 'Heading to Dropoff'}
                  </p>
                  <p className="text-base font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{destAddr}</p>
                </div>
                <button
                  onClick={() => setShowTripMenu(!showTripMenu)}
                  className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 ml-3"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <MoreVertical className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Trip', state === 'navigation' ? 'Pickup' : 'Dropoff'],
                  ['Miles', trip.mileage ? safeFixed(trip.mileage, 1) : '--'],
                  ['Your rate', driverContractPayLabel(driverData)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</p>
                    <p className="text-xs font-700 mt-1" style={{ color: '#e5e7eb', fontWeight: 700 }}>{value}</p>
                  </div>
                ))}
              </div>
              {fareNotice && (
                <div className="rounded-xl px-3 py-2 text-xs font-700" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', fontWeight: 700 }}>
                  {fareNotice}
                </div>
              )}

              {showTripMenu && (
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <p className="px-4 pt-3 pb-2 text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>Navigate With</p>
                  <a
                    href={googleMapsUrl(destAddr)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      <Map className="w-4 h-4" style={{ color: '#0ea5e9' }} />
                      <span className="text-sm" style={{ color: '#e5e7eb' }}>Google Maps</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  </a>
                  <a
                    href={appleMapsUrl(destAddr)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      <Map className="w-4 h-4" style={{ color: '#00e5a0' }} />
                      <span className="text-sm" style={{ color: '#e5e7eb' }}>Apple Maps</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  </a>
                  <a
                    href={wazeUrl(destAddr)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      <Navigation className="w-4 h-4" style={{ color: '#c9a84c' }} />
                      <span className="text-sm" style={{ color: '#e5e7eb' }}>Waze</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  </a>
                  {trip.passengerPhone && (
                    <a
                      href={`tel:${trip.passengerPhone}`}
                      className="flex items-center justify-between px-4 py-3"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none' }}
                    >
                      <div className="flex items-center gap-3">
                        <Phone className="w-4 h-4" style={{ color: '#f59e0b' }} />
                        <span className="text-sm" style={{ color: '#e5e7eb' }}>Call Rider</span>
                      </div>
                      <ChevronRight className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                    </a>
                  )}
                  <button
                    onClick={() => { setShowIssueForm(true); setShowTripMenu(false); }}
                    className="w-full flex items-center justify-between px-4 py-3"
                    style={{ background: 'none', border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-center gap-3">
                      <Flag className="w-4 h-4" style={{ color: '#ff4757' }} />
                      <span className="text-sm" style={{ color: '#e5e7eb' }}>Report an Issue</span>
                    </div>
                    <ChevronRight className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  </button>
                  <button
                    onClick={() => setShowTripMenu(false)}
                    className="w-full flex items-center justify-center py-3"
                    style={{ background: 'none', border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Close</span>
                  </button>
                </div>
              )}

              {showIssueForm && (
                <div className="rounded-2xl p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-700" style={{ color: '#f59e0b', fontWeight: 700 }}>Report Issue</p>
                    <button onClick={() => setShowIssueForm(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={issueNote}
                    onChange={e => setIssueNote(e.target.value)}
                    placeholder="Describe the issue..."
                    rows={3}
                    className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
                  />
                  <button
                    onClick={submitIssue}
                    className="mt-2 w-full py-2.5 rounded-xl text-sm font-700"
                    style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontWeight: 700 }}
                  >
                    Submit to Dispatch
                  </button>
                </div>
              )}

              {state === 'navigation' && (
                pickupArrived ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.18)' }}>
                      <p className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: '#c9a84c', fontWeight: 700 }}>
                        Waiting At Pickup
                      </p>
                      <p className="text-sm mb-2" style={{ color: '#e5e7eb' }}>
                        Wait before marking no-show. Current policy: {waitTargetMins} minute{waitTargetMins === 1 ? '' : 's'}.
                      </p>
                      <p className="text-lg font-700" style={{ color: waitRemaining > 0 ? '#c9a84c' : '#00e5a0', fontWeight: 700 }}>
                        {waitRemaining > 0 ? `${waitMinutes}:${waitSeconds} remaining` : 'Wait complete'}
                      </p>
                    </div>
                    {!confirmingPickup ? (
                      <button
                        onClick={() => {
                          if (trip?.mtaFareRequired) {
                            setConfirmingPickup(true);
                            return;
                          }
                          onConfirmPickup({ collectedFare: null });
                        }}
                        className="w-full py-4 rounded-2xl text-base font-700 flex items-center justify-center gap-2"
                        style={{
                          background: 'linear-gradient(135deg, #00e5a0, #00c88c)',
                          color: '#07090d',
                          fontWeight: 700,
                        }}
                      >
                        <CheckCircle className="w-5 h-5" /> Rider Received
                      </button>
                    ) : (
                      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(0,229,160,0.25)', background: 'rgba(0,229,160,0.08)' }}>
                        <div className="px-4 pt-4 pb-3">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#00e5a0' }} />
                            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Confirm Pickup + Fare</p>
                          </div>
                          <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                            Rider is in the car. Enter the fare you collected now so the trip stays correct before dropoff.
                          </p>
                          {fareNotice && (
                            <div className="rounded-xl px-3 py-2 mb-3" style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.22)' }}>
                              <p className="text-xs font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>{fareNotice}</p>
                            </div>
                          )}
                          <label className="block text-[11px] uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.42)' }}>
                            Collected Fare
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={collectedFare}
                            onChange={(event) => setCollectedFare(event.target.value)}
                            placeholder={trip?.mtaFareAmount ? Number(trip.mtaFareAmount).toFixed(2) : '0.00'}
                            className="w-full rounded-xl px-3 py-2.5 text-sm"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
                          />
                          <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            Put the actual amount collected from the rider before continuing.
                          </p>
                        </div>
                        <div className="grid grid-cols-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                          <button
                            onClick={() => {
                              setConfirmingPickup(false);
                              setCollectedFare('');
                            }}
                            className="py-3.5 text-sm font-600"
                            style={{
                              background: 'none',
                              border: 'none',
                              borderRight: '1px solid rgba(255,255,255,0.07)',
                              color: 'rgba(255,255,255,0.5)',
                              fontWeight: 600,
                            }}
                          >
                            Back
                          </button>
                          <button
                            onClick={handlePickupConfirm}
                            className="py-3.5 text-sm font-700 flex items-center justify-center gap-1.5"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#00e5a0',
                              fontWeight: 700,
                            }}
                          >
                            <><CheckCircle className="w-4 h-4" /> Confirm Pickup</>
                          </button>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={onNoShow}
                      disabled={typeof waitRemaining === 'number' && waitRemaining > 0}
                      className="w-full py-3.5 rounded-2xl text-sm font-700 flex items-center justify-center gap-2"
                      style={{
                        background: typeof waitRemaining === 'number' && waitRemaining > 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,71,87,0.1)',
                        border: `1px solid ${typeof waitRemaining === 'number' && waitRemaining > 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,71,87,0.2)'}`,
                        color: typeof waitRemaining === 'number' && waitRemaining > 0 ? 'rgba(255,255,255,0.35)' : '#ff4757',
                        fontWeight: 700,
                      }}
                    >
                      <AlertTriangle className="w-4 h-4" /> Mark No-Show
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {!routeStarted && (
                      <button
                        onClick={onStartRoute}
                        className="w-full py-4 rounded-2xl text-base font-700 flex items-center justify-center gap-2"
                        style={{
                          background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                          color: '#ffffff',
                          fontWeight: 700,
                        }}
                      >
                        <Navigation className="w-5 h-5" /> Start Drive To Pickup
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Release this trip back to dispatch? Only use this if you cannot complete the ride; dispatch can assign another driver.'
                          )
                        ) {
                          return;
                        }
                        onReject();
                      }}
                      className="w-full py-3 rounded-xl text-xs font-600"
                      style={{
                        background: 'rgba(255,71,87,0.06)',
                        border: '1px solid rgba(255,71,87,0.2)',
                        color: '#ff8a95',
                        fontWeight: 600,
                      }}
                    >
                      Release trip to dispatch
                    </button>
                    <button
                      onClick={onArrive}
                      disabled={!(routeStarted || trip?.enRouteAt)}
                      className="w-full py-4 rounded-2xl text-base font-700 flex items-center justify-center gap-2"
                      style={{
                        background: (routeStarted || trip?.enRouteAt) ? 'linear-gradient(135deg, #00e5a0, #00c88c)' : 'rgba(255,255,255,0.05)',
                        color: (routeStarted || trip?.enRouteAt) ? '#07090d' : 'rgba(255,255,255,0.35)',
                        border: (routeStarted || trip?.enRouteAt) ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle className="w-5 h-5" /> Arrived At Pickup
                    </button>
                  </div>
                )
              )}

              {state === 'to_dropoff' && !confirmingComplete && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Release this trip back to dispatch? Only use this if you cannot complete the ride; dispatch can assign another driver.'
                        )
                      ) {
                        return;
                      }
                      onReject();
                    }}
                    className="w-full py-3 rounded-xl text-xs font-600"
                    style={{
                      background: 'rgba(255,71,87,0.06)',
                      border: '1px solid rgba(255,71,87,0.2)',
                      color: '#ff8a95',
                      fontWeight: 600,
                    }}
                  >
                    Release trip to dispatch
                  </button>
                  <button
                    onClick={() => setConfirmingComplete(true)}
                    className="w-full py-4 rounded-2xl text-base font-700 flex items-center justify-center gap-2"
                    style={{
                          background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                          color: '#ffffff',
                          fontWeight: 700,
                    }}
                  >
                    <CheckCircle className="w-5 h-5" /> Rider Dropped Off
                  </button>
                </div>
              )}

              {state === 'to_dropoff' && confirmingComplete && (
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.06)' }}>
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#0ea5e9' }} />
                      <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Confirm Trip Completion</p>
                    </div>
                    <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                      Has the passenger been dropped off at:
                    </p>
                    <p className="text-sm font-600 mb-3" style={{ color: '#0ea5e9', fontWeight: 600 }}>{trip.doAddress || 'Dropoff location'}</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.42)' }}>
                          Collected Fare
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={collectedFare}
                          onChange={(event) => setCollectedFare(event.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-xl px-3 py-2.5 text-sm"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
                        />
                        <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          Leave blank unless this trip requires fare collection for Sentry.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setMarkNextDay(value => !value)}
                        className="w-full rounded-xl px-3 py-3 flex items-center justify-between text-left"
                        style={{
                          background: markNextDay ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${markNextDay ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        }}
                      >
                        <div>
                          <p className="text-sm font-700" style={{ color: markNextDay ? '#c9a84c' : '#e5e7eb', fontWeight: 700 }}>
                            NEXT DAY
                          </p>
                          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            Mark this trip as using the next-day completion flow.
                          </p>
                        </div>
                        <div
                          className="w-11 h-6 rounded-full relative transition-all"
                          style={{ background: markNextDay ? '#c9a84c' : 'rgba(255,255,255,0.14)' }}
                        >
                          <div
                            className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                            style={{ left: markNextDay ? 22 : 2, background: markNextDay ? '#07090d' : '#ffffff' }}
                          />
                        </div>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <button
                      onClick={() => {
                        setConfirmingComplete(false);
                        setCollectedFare('');
                        setMarkNextDay(false);
                      }}
                      disabled={completing}
                      className="py-3.5 text-sm font-600"
                      style={{
                        background: 'none',
                        border: 'none',
                        borderRight: '1px solid rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                      }}
                    >
                      Not Yet
                    </button>
                    <button
                      onClick={handleComplete}
                      disabled={completing}
                      className="py-3.5 text-sm font-700 flex items-center justify-center gap-1.5"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: completing ? 'rgba(255,255,255,0.3)' : '#0ea5e9',
                        fontWeight: 700,
                      }}
                    >
                      {completing ? (
                        <span style={{ fontSize: 12 }}>Saving...</span>
                      ) : (
                        <><CheckCircle className="w-4 h-4" /> Yes, Done</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
