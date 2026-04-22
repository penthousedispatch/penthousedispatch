import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { APP_VARIANT_META } from '../../lib/appVariant';
import { getPublicAppUrl } from '../../lib/mobileRuntime';
import { LogOut, Navigation, Copy, Link2, History, ArrowRight } from 'lucide-react';

const RECENT_TRIPS_STORAGE_KEY = 'pd_rider_recent_tracking';

function parseTrackingInput(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (parsed.searchParams.get('trip')) {
      return parsed.searchParams.get('trip');
    }
  } catch {}

  if (trimmed.includes('trip=')) {
    const params = new URLSearchParams(trimmed.split('?')[1] || '');
    if (params.get('trip')) return params.get('trip');
  }

  return trimmed;
}

export default function RiderHome() {
  const navigate = useNavigate();
  const [trackingInput, setTrackingInput] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [inputError, setInputError] = useState('');
  const [recentTrips, setRecentTrips] = useState([]);

  function loadRecentTrips() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_TRIPS_STORAGE_KEY) || '[]');
      setRecentTrips(Array.isArray(parsed) ? parsed : []);
    } catch {
      setRecentTrips([]);
    }
  }

  useEffect(() => {
    loadRecentTrips();
    const handleFocus = () => loadRecentTrips();
    const handleStorage = (event) => {
      if (!event.key || event.key === RECENT_TRIPS_STORAGE_KEY) {
        loadRecentTrips();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  function openTracking(tripKey) {
    if (!tripKey) {
      setInputError('Enter a rider link or trip key first.');
      return;
    }
    setInputError('');
    navigate(`/rider?trip=${encodeURIComponent(tripKey)}`);
  }

  async function handleCopyExample() {
    const exampleUrl = getPublicAppUrl('/rider?trip=example-trip-key');
    try {
      await navigator.clipboard.writeText(exampleUrl);
      setCopyMessage('Example rider tracking link copied.');
      setTimeout(() => setCopyMessage(''), 2200);
    } catch {
      setCopyMessage('Copy failed. You can still use the example below.');
      setTimeout(() => setCopyMessage(''), 2200);
    }
  }

  return (
    <div className="min-h-screen px-4 py-6" style={{ background: '#07090d' }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <div
          className="rounded-3xl p-5"
          style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p style={{ color: '#c9a84c', fontSize: 22, fontWeight: 800 }}>
                {APP_VARIANT_META.rider.label}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.46)' }}>
                Open a live trip link, follow your driver, and keep recent trip links handy in one place.
              </p>
            </div>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="px-3 py-2 rounded-xl text-sm flex items-center gap-2"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e5e7eb',
              }}
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </button>
          </div>
        </div>

        <div
          className="rounded-3xl p-5"
          style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-sm font-700 mb-2" style={{ color: '#e5e7eb', fontWeight: 700 }}>
            Open a ride
          </p>
          <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.42)', lineHeight: 1.6 }}>
            Paste the full rider link from dispatch, or just paste the trip key.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={trackingInput}
              onChange={e => {
                setTrackingInput(e.target.value);
                if (inputError) setInputError('');
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  openTracking(parseTrackingInput(trackingInput));
                }
              }}
              placeholder="Paste rider link or trip key"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => openTracking(parseTrackingInput(trackingInput))}
              className="px-4 py-3 rounded-xl text-sm font-700 flex items-center justify-center gap-2"
              style={{
                background: '#c9a84c',
                color: '#07090d',
                border: '1px solid rgba(201,168,76,0.42)',
                fontWeight: 700,
              }}
            >
              <Navigation className="w-4 h-4" />
              Open Tracking
            </button>
          </div>
          {inputError && (
            <p className="text-xs mt-3" style={{ color: '#ff6b7a' }}>
              {inputError}
            </p>
          )}
        </div>

        <div
          className="rounded-3xl p-5"
          style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>
                Recent rider links
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
                Trips you opened on this device stay here for quick access.
              </p>
            </div>
            <History className="w-4 h-4" style={{ color: '#c9a84c' }} />
          </div>

          {recentTrips.length === 0 ? (
            <div
              className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.48)' }}>
                No recent ride links yet. Open a trip from a shared link and it will show here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTrips.map((trip, index) => (
                <button
                  key={`${trip.riderKey}-${index}`}
                  type="button"
                  onClick={() => openTracking(trip.riderKey)}
                  className="w-full text-left rounded-2xl p-4 flex items-center justify-between gap-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-600 truncate" style={{ color: '#e5e7eb', fontWeight: 600 }}>
                      {trip.driverName || 'Driver assigned'}
                    </p>
                    <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.42)' }}>
                      {trip.pickup || 'Pickup pending'} to {trip.dropoff || 'Dropoff pending'}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: '#c9a84c' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="rounded-3xl p-5"
          style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>
                Shareable link format
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.42)', lineHeight: 1.6 }}>
                Dispatch and drivers can send riders a direct tracking link using this same format.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyExample}
              className="px-3 py-2 rounded-xl text-sm flex items-center gap-2"
              style={{
                background: 'rgba(201,168,76,0.08)',
                border: '1px solid rgba(201,168,76,0.18)',
                color: '#c9a84c',
              }}
            >
              <Copy className="w-4 h-4" />
              Copy Example
            </button>
          </div>
          <div
            className="rounded-2xl px-4 py-3 mt-4 text-xs break-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#d4d4d4' }}
          >
            <Link2 className="w-4 h-4 inline-block mr-2" style={{ color: '#c9a84c' }} />
            {getPublicAppUrl('/rider?trip=example-trip-key')}
          </div>
          {copyMessage && (
            <p className="text-xs mt-3" style={{ color: '#7ee787' }}>
              {copyMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
