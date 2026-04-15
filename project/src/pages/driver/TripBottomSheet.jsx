import React, { useState } from 'react';
import { Navigation, Users, ExternalLink, Zap, CheckCircle, AlertTriangle, MoreVertical, Map, Phone, Flag, ChevronRight, X } from 'lucide-react';

export default function TripBottomSheet({
  state, trip, open, onToggle,
  onRequestRides, onAccept, onReject,
  onConfirmPickup, onComplete,
  driverData, earnings, countdown,
}) {
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showTripMenu, setShowTripMenu] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueNote, setIssueNote] = useState('');

  async function handleComplete() {
    setCompleting(true);
    await onComplete();
    setCompleting(false);
    setConfirmingComplete(false);
  }

  const destAddr = state === 'navigation' ? trip?.puAddress : trip?.doAddress;
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
                    {earnings.trips || 0} trips today &bull; ${typeof earnings.today === 'number' ? earnings.today.toFixed(2) : '0.00'}
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
                  ['Short Trips', '2-4 mi'],
                  ['Priority', 'Nearby chain'],
                  ['Shared Ride', 'Same direction'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</p>
                    <p className="text-xs font-700 mt-1" style={{ color: '#e5e7eb', fontWeight: 700 }}>{value}</p>
                  </div>
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
                  {trip.deliveryPrice && <p className="text-base font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${parseFloat(trip.deliveryPrice).toFixed(2)}</p>}
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
                      {trip.puTime && <p className="text-xs mt-0.5" style={{ color: '#c9a84c' }}>{trip.puTime}</p>}
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>DROPOFF</p>
                      <p className="text-sm font-500" style={{ color: 'rgba(255,255,255,0.7)' }}>{trip.doAddress || 'Loading...'}</p>
                    </div>
                  </div>
                </div>
                {(trip.passengers > 1 || trip.deliveryPrice || trip.mileage) && (
                  <div className="flex gap-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {trip.passengers > 1 && <span className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}><Users className="w-3 h-3" />{trip.passengers} passengers</span>}
                    {trip.mileage && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{parseFloat(trip.mileage).toFixed(1)} mi</span>}
                    {trip.deliveryPrice && <span className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${parseFloat(trip.deliveryPrice).toFixed(2)}</span>}
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
                  className="w-full py-5 rounded-2xl text-lg font-800 flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: countdown !== null && countdown <= 5
                      ? 'linear-gradient(135deg, #ff6b6b, #ff4757)'
                      : 'linear-gradient(135deg, #00e5a0, #00c88c)',
                    color: '#07090d',
                    fontWeight: 800,
                    fontSize: 18,
                    boxShadow: countdown !== null && countdown <= 5
                      ? '0 4px 20px rgba(255,71,87,0.35)'
                      : '0 4px 20px rgba(0,229,160,0.3)',
                  }}
                >
                  <CheckCircle className="w-6 h-6" />
                  Accept Trip
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
                  ['Miles', trip.mileage ? parseFloat(trip.mileage).toFixed(1) : '--'],
                  ['Pay', trip.deliveryPrice ? `$${parseFloat(trip.deliveryPrice).toFixed(0)}` : '--'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</p>
                    <p className="text-xs font-700 mt-1" style={{ color: '#e5e7eb', fontWeight: 700 }}>{value}</p>
                  </div>
                ))}
              </div>

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
                <button
                  onClick={onConfirmPickup}
                  className="w-full py-4 rounded-2xl text-base font-700 flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #00e5a0, #00c88c)',
                    color: '#07090d',
                    fontWeight: 700,
                  }}
                >
                  <CheckCircle className="w-5 h-5" /> Arrived — Confirm Pickup
                </button>
              )}

              {state === 'to_dropoff' && !confirmingComplete && (
                <button
                  onClick={() => setConfirmingComplete(true)}
                  className="w-full py-4 rounded-2xl text-base font-700 flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                    color: '#ffffff',
                    fontWeight: 700,
                  }}
                >
                  <CheckCircle className="w-5 h-5" /> Trip Complete
                </button>
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
                  </div>
                  <div className="grid grid-cols-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <button
                      onClick={() => setConfirmingComplete(false)}
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
