import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapPin, Clock, User, CheckCircle, Navigation, Volume2, Pause, Square, Share2, Copy } from 'lucide-react';
import { fbGet, fbListen } from '../../lib/firebase';
import { getPCarSVG, calcBearing } from '../../components/map/PCarMarker';
import AnimatedCar from '../../components/ui/AnimatedCar';
import { loadCompanyBranding, DEFAULT_BRANDING } from '../../lib/companyBranding';
import { getGuideAudioSrc, useGuideAudioPlayback } from '../../lib/guideAudio';
import { useDriverVoiceGuide } from '../../lib/driverVoiceGuide';

const GMAPS_KEY = 'AIzaSyD5sugXJ0HIUwkVlixF5qdoN-l0McgAQM4';
const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4b5563' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2332' }] },
  { featureType: 'water', stylers: [{ color: '#050a0f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

const STATUS_LABELS = {
  assigned: 'Driver Assigned',
  en_route: 'Driver is on the way',
  picked_up: "You've been picked up",
  completed: 'Trip Completed',
};

const STATUS_COLORS = {
  assigned: '#c9a84c',
  en_route: '#0ea5e9',
  picked_up: '#00e5a0',
  completed: '#4b5563',
};

let mapsReady = false;
let mapsPromise = null;
function loadMaps() {
  if (mapsReady) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((res, rej) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}`;
    script.async = true;
    script.onload = () => { mapsReady = true; res(); };
    script.onerror = rej;
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export default function RiderTracking() {
  const [params] = useSearchParams();
  const riderKey = params.get('trip');
  const [tracking, setTracking] = useState(null);
  const [driverCoords, setDriverCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapsLoaded, setMapsLoaded] = useState(mapsReady);
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const previousDriverCoordsRef = useRef(null);
  const riderGuideNarration = useMemo(() => {
    const statusText = STATUS_LABELS[tracking?.status] || 'Your ride is being tracked';
    return [
      `${statusText}.`,
      tracking?.driverName ? `${tracking.driverName} is your driver.` : '',
      tracking?.puAddress ? `Pickup is ${tracking.puAddress}.` : '',
      tracking?.doAddress ? `Dropoff is ${tracking.doAddress}.` : '',
      'Keep this page open to follow your driver in real time.',
    ].filter(Boolean).join(' ');
  }, [tracking]);
  const riderAudioSrc = getGuideAudioSrc('rider_guide');
  const riderAudio = useGuideAudioPlayback(riderAudioSrc);
  const usingUploadedAudio = riderAudio.available;
  const riderVoice = useDriverVoiceGuide(usingUploadedAudio ? '' : riderGuideNarration, { rate: 0.96 });
  const audioControl = usingUploadedAudio ? riderAudio : riderVoice;

  function cancelDriverAnimation() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }

  function buildCarIcon(heading) {
    const svg = getPCarSVG({ isSelected: true, isOnTrip: true, heading });
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new window.google.maps.Size(52, 52),
      anchor: new window.google.maps.Point(26, 26),
    };
  }

  function animateDriverMarker(from, to, heading) {
    if (!driverMarkerRef.current) return;
    cancelDriverAnimation();
    const startedAt = performance.now();
    const durationMs = 1100;

    const step = now => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextPosition = {
        lat: from.lat + (to.lat - from.lat) * eased,
        lng: from.lng + (to.lng - from.lng) * eased,
      };
      driverMarkerRef.current.setPosition(nextPosition);
      driverMarkerRef.current.setIcon(buildCarIcon(heading));

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    if (!riderKey) { setError('No trip key provided'); setLoading(false); return; }

    let cancelled = false;
    let driverUnsub = null;
    fbGet(`rider_tracking/${riderKey}`).then(result => {
      if (cancelled) return;
      if (!result.ok || !result.data) { setError('Trip not found'); setLoading(false); return; }
      setTracking(result.data);
      setLoading(false);

      if (result.data.driverId) {
        driverUnsub = fbListen(`drivers/${result.data.driverId}/coords`, coords => {
          if (coords) setDriverCoords(coords);
        });
      }
    });

    const trackingUnsub = fbListen(`rider_tracking/${riderKey}`, data => {
      if (data) setTracking(data);
    });

    return () => {
      cancelled = true;
      trackingUnsub?.();
      driverUnsub?.();
    };
  }, [riderKey]);

  useEffect(() => {
    loadCompanyBranding(tracking?.company_id || tracking?.companyId || null).then(setBranding);
  }, [tracking?.company_id, tracking?.companyId]);

  useEffect(() => {
    if (loading || !mapRef.current) return;
    loadMaps().then(() => {
      setMapsLoaded(true);
      if (mapInstanceRef.current) return;
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        zoom: 14,
        center: driverCoords || { lat: 40.7128, lng: -74.006 },
        styles: DARK_STYLE,
        disableDefaultUI: true,
        gestureHandling: 'greedy',
      });
    });
  }, [loading, driverCoords]);

  useEffect(() => () => {
    cancelDriverAnimation();
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setMap(null);
      driverMarkerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !driverCoords || !window.google) return;

    const previous = previousDriverCoordsRef.current;
    const heading = previous ? calcBearing(previous, driverCoords) : 0;
    previousDriverCoordsRef.current = driverCoords;

    if (driverMarkerRef.current) {
      if (previous) {
        animateDriverMarker(previous, driverCoords, heading);
      } else {
        driverMarkerRef.current.setPosition(driverCoords);
        driverMarkerRef.current.setIcon(buildCarIcon(heading));
      }
    } else {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: driverCoords,
        map: mapInstanceRef.current,
        icon: buildCarIcon(heading),
        zIndex: 100,
      });
    }
    mapInstanceRef.current.panTo(driverCoords);
  }, [driverCoords, mapsLoaded]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center" style={{ background: '#07090d' }}>
        <div className="flex flex-col items-center gap-6">
          <AnimatedCar size={56} color="#c9a84c" />
          <div>
            <p className="text-center font-700 mb-1" style={{ color: '#e5e7eb', fontWeight: 700 }}>Locating your driver...</p>
            <p className="text-center text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>Connecting to live trip</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#07090d' }}>
        <div className="text-center px-8">
          <AnimatedCar size={48} color="rgba(255,255,255,0.2)" style={{ margin: '0 auto 16px' }} />
          <p className="font-700 text-lg mb-2" style={{ fontWeight: 700 }}>Ride not found</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>{error}</p>
        </div>
      </div>
    );
  }

  const status = tracking?.status || 'assigned';
  const statusColor = STATUS_COLORS[status] || '#c9a84c';
  const initials = tracking?.driverName?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'D';
  const trackingUrl = tracking?.trackingUrl || (riderKey ? `${window.location.origin}/rider?trip=${encodeURIComponent(riderKey)}` : '');

  async function handleShareTracking() {
    if (!trackingUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Ride tracking',
          text: 'Track your ride here.',
          url: trackingUrl,
        });
        return;
      } catch {}
    }
    navigator.clipboard?.writeText(trackingUrl).catch(() => {});
  }

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#07090d' }}>
      <div ref={mapRef} className="flex-1" />

      <div
        className="rounded-t-3xl p-5 space-y-4 flex-shrink-0"
        style={{
          background: 'rgba(13,17,23,0.97)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderBottom: 'none',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="flex items-center justify-center gap-2 py-2 rounded-xl"
          style={{ background: `${statusColor}12`, border: `1px solid ${statusColor}30` }}
        >
          <div className="w-2 h-2 rounded-full animate-blink" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
          <p className="font-700 text-sm" style={{ color: statusColor, fontWeight: 700 }}>{STATUS_LABELS[status] || status}</p>
        </div>

        {(usingUploadedAudio || riderVoice.supported) && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.16)' }}>
            <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {usingUploadedAudio
                ? 'Rider audio guide is available here so instructions can be heard instead of read.'
                : 'Voice helper can read the rider instructions aloud from here.'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={audioControl.toggle}
                className="px-3 py-2 rounded-full text-xs flex items-center gap-1.5"
                style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c' }}
              >
                {audioControl.playing && !audioControl.paused ? <Pause className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                {audioControl.playing || audioControl.paused
                  ? (audioControl.paused ? 'Resume audio' : 'Pause audio')
                  : (usingUploadedAudio ? 'Play rider audio' : 'Listen')}
              </button>
              {(audioControl.playing || audioControl.paused) && (
                <button
                  type="button"
                  onClick={audioControl.stop}
                  className="px-3 py-2 rounded-full text-xs flex items-center gap-1.5"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.72)' }}
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </button>
              )}
            </div>
          </div>
        )}

        {tracking?.driverName && (
          <div className="flex items-center gap-3">
            {tracking.driverPhoto ? (
              <img src={tracking.driverPhoto} alt="" className="w-12 h-12 rounded-full object-cover" style={{ border: '2px solid rgba(201,168,76,0.3)' }} />
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-700" style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', border: '2px solid rgba(201,168,76,0.3)', fontWeight: 700 }}>
                {initials}
              </div>
            )}
            <div>
              <p className="font-700 text-base" style={{ fontWeight: 700 }}>{tracking.driverName}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Your driver</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 min-w-0">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt={branding.app_display_name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${branding.brand_primary}20`, color: branding.brand_primary, fontWeight: 700 }}>
                {branding.app_display_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>Dispatch Provider</p>
              <p className="text-sm font-600 truncate" style={{ color: branding.brand_primary, fontWeight: 600 }}>{branding.app_display_name}</p>
            </div>
          </div>
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: `${branding.brand_primary}18`, color: branding.brand_primary }}>Rider View</span>
        </div>

        <div className="space-y-2">
          {tracking?.puAddress && (
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center" style={{ background: 'rgba(0,229,160,0.15)' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00e5a0' }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>PICKUP</p>
                <p className="text-sm" style={{ color: '#e5e7eb' }}>{tracking.puAddress}</p>
                {tracking.puTime && <p className="text-xs" style={{ color: '#c9a84c' }}>{tracking.puTime}</p>}
              </div>
            </div>
          )}
          {tracking?.doAddress && (
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center" style={{ background: 'rgba(255,71,87,0.15)' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff4757' }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>DROPOFF</p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{tracking.doAddress}</p>
              </div>
            </div>
          )}
        </div>

        {trackingUrl && (
          <div className="rounded-xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>Tracking Link</p>
                <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.62)' }}>{trackingUrl}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(trackingUrl).catch(() => {})}
                  className="px-3 py-2 rounded-xl text-xs flex items-center gap-1.5"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={handleShareTracking}
                  className="px-3 py-2 rounded-xl text-xs flex items-center gap-1.5"
                  style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.24)', color: '#c9a84c' }}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </button>
              </div>
            </div>
          </div>
        )}

        {tracking?.tripId && (
          <p className="text-xs text-center font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Trip #{tracking.tripId}
          </p>
        )}
      </div>
    </div>
  );
}
