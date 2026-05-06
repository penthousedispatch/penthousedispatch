import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapPin, Clock, User, CheckCircle, Navigation, Volume2, Pause, Square, Share2, Copy, Maximize2, Minimize2, X } from 'lucide-react';
import { fbGet, fbListen } from '../../lib/firebase';
import { getPCarSVG, calcBearing } from '../../components/map/PCarMarker';
import AnimatedCar from '../../components/ui/AnimatedCar';
import { loadCompanyBranding, DEFAULT_BRANDING } from '../../lib/companyBranding';
import { getGuideAudioSrc, useGuideAudioPlayback } from '../../lib/guideAudio';
import { useDriverVoiceGuide } from '../../lib/driverVoiceGuide';
import { getPublicAppUrl } from '../../lib/mobileRuntime';

const RECENT_TRIPS_STORAGE_KEY = 'pd_rider_recent_tracking';
const GMAPS_KEY = 'AIzaSyD5sugXJ0HIUwkVlixF5qdoN-l0McgAQM4';
const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4b5563' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2332' }] },
  { featureType: 'water', stylers: [{ color: '#050a0f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

// Rider-facing only. Internal dispatch statuses (no_show / rejected / cancelled / on_trip /
// raw "accepted") are intentionally translated into friendly wording — riders should not
// see operational terms.
const SEARCHING_LABEL = 'Looking for a new driver';
const SEARCHING_COLOR = '#c9a84c';

const STATUS_LABELS = {
  assigned: 'Driver Assigned',
  accepted: 'Driver Assigned',
  en_route: 'Your driver is on the way',
  in_progress: 'Your driver is on the way',
  arrived: 'Your driver has arrived',
  picked_up: 'In progress',
  on_trip: 'In progress',
  completed: 'Trip Completed',
  cancelled: SEARCHING_LABEL,
  canceled: SEARCHING_LABEL,
  no_show: SEARCHING_LABEL,
  rejected: SEARCHING_LABEL,
};

const STATUS_COLORS = {
  assigned: '#c9a84c',
  accepted: '#c9a84c',
  en_route: '#0ea5e9',
  in_progress: '#0ea5e9',
  arrived: '#00e5a0',
  picked_up: '#00e5a0',
  on_trip: '#00e5a0',
  completed: '#4b5563',
  cancelled: SEARCHING_COLOR,
  canceled: SEARCHING_COLOR,
  no_show: SEARCHING_COLOR,
  rejected: SEARCHING_COLOR,
};

const STATUS_HINTS = {
  assigned: "We're connecting you with your driver. You'll see them on the map any moment now.",
  accepted: "We're connecting you with your driver. You'll see them on the map any moment now.",
  en_route: 'Look out for your driver — they are heading to your pickup.',
  in_progress: 'Look out for your driver — they are heading to your pickup.',
  arrived: 'Your driver is at the pickup spot. Head out when you are ready.',
  picked_up: 'Enjoy the ride. We will let you know when you arrive.',
  on_trip: 'Enjoy the ride. We will let you know when you arrive.',
  completed: 'Thanks for riding with us.',
  cancelled: "Hang tight. We're looking for a new driver for you.",
  canceled: "Hang tight. We're looking for a new driver for you.",
  no_show: "Hang tight. We're looking for a new driver for you.",
  rejected: "Hang tight. We're looking for a new driver for you.",
};

function normalizeCoords(coords) {
  const lat = Number(coords?.lat);
  const lng = Number(coords?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function coordsDelta(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.max(Math.abs(a.lat - b.lat), Math.abs(a.lng - b.lng));
}

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
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const riderKey = params.get('trip');
  const source = params.get('source');
  const [tracking, setTracking] = useState(null);
  const [driverCoords, setDriverCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapsLoaded, setMapsLoaded] = useState(mapsReady);
  const [mapError, setMapError] = useState('');
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [compactMap, setCompactMap] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const pickupRouteRef = useRef(null);
  const dropoffRouteRef = useRef(null);
  const animationFrameRef = useRef(null);
  const previousDriverCoordsRef = useRef(null);
  const routeRenderKeyRef = useRef('');
  const riderGuideNarration = useMemo(() => {
    const statusKey = tracking?.status;
    const statusText = STATUS_LABELS[statusKey] || 'Your ride is being tracked';
    const hintText = STATUS_HINTS[statusKey] || '';
    return [
      `${statusText}.`,
      hintText,
      tracking?.driverName ? `${tracking.driverName} is your driver.` : '',
      tracking?.puAddress ? `Pickup is ${tracking.puAddress}.` : '',
      tracking?.doAddress ? `Dropoff is ${tracking.doAddress}.` : '',
      'Keep this page open to follow your driver in real time.',
      'You can use the compact map button to make more room for trip details.',
      tracking?.trackingUrl ? 'Use the copy or share buttons to send the tracking link to a family member or caregiver.' : '',
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
    fbGet(`rider_tracking/${riderKey}`).then(result => {
      if (cancelled) return;
      if (!result.ok || !result.data) { setError('Trip not found'); setLoading(false); return; }
      setTracking(result.data);
      setLoading(false);
    });

    const trackingUnsub = fbListen(`rider_tracking/${riderKey}`, data => {
      if (data) setTracking(data);
    });

    return () => {
      cancelled = true;
      trackingUnsub?.();
    };
  }, [riderKey]);

  useEffect(() => {
    const driverId = String(tracking?.driverId || '').trim();
    if (!driverId) {
      setDriverCoords(null);
      return undefined;
    }

    const driverUnsub = fbListen(`drivers/${driverId}/coords`, coords => {
      const normalized = normalizeCoords(coords);
      if (!normalized) return;
      setDriverCoords(prev => (coordsDelta(prev, normalized) < 0.00001 ? prev : normalized));
    });
    return () => driverUnsub?.();
  }, [tracking?.driverId]);

  useEffect(() => {
    if (!riderKey || !tracking) return;

    const nextEntry = {
      riderKey,
      driverName: tracking.driverName || '',
      pickup: tracking.puAddress || tracking.pu_address || '',
      dropoff: tracking.doAddress || tracking.do_address || '',
      trackingUrl: getPublicAppUrl(`/rider?trip=${encodeURIComponent(riderKey)}`),
      updatedAt: Date.now(),
    };

    try {
      const existing = JSON.parse(localStorage.getItem(RECENT_TRIPS_STORAGE_KEY) || '[]');
      const merged = [
        nextEntry,
        ...(Array.isArray(existing) ? existing : []).filter(entry => entry?.riderKey !== riderKey),
      ].slice(0, 10);
      localStorage.setItem(RECENT_TRIPS_STORAGE_KEY, JSON.stringify(merged));
    } catch {}
  }, [riderKey, tracking]);

  useEffect(() => {
    loadCompanyBranding(tracking?.company_id || tracking?.companyId || null).then(setBranding);
  }, [tracking?.company_id, tracking?.companyId]);

  useEffect(() => {
    if (loading || !mapRef.current) return;
    loadMaps()
      .then(() => {
        setMapsLoaded(true);
        setMapError('');
        if (mapInstanceRef.current) return;
        mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
          zoom: 14,
          center: driverCoords || { lat: 40.7128, lng: -74.006 },
          styles: DARK_STYLE,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
        });
      })
      .catch(error => {
        console.warn('RiderTracking: failed to load Google Maps', error);
        setMapsLoaded(false);
        setMapError('Live map is temporarily unavailable, but trip updates are still working.');
      });
  }, [loading]);

  useEffect(() => () => {
    cancelDriverAnimation();
    if (pickupRouteRef.current) pickupRouteRef.current.setMap(null);
    if (dropoffRouteRef.current) dropoffRouteRef.current.setMap(null);
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
    if (!previous || coordsDelta(previous, driverCoords) > 0.0025) {
      mapInstanceRef.current.panTo(driverCoords);
    }
  }, [driverCoords, mapsLoaded]);

  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !window.google || !tracking || !driverCoords) return;

    const pickupAddress = tracking.puAddress || tracking.pu_address;
    const dropoffAddress = tracking.doAddress || tracking.do_address;
    const status = tracking.status || 'assigned';
    const routeMode = ['picked_up', 'completed'].includes(status) ? 'dropoff_live' : 'pickup_live';
    const coarseOrigin = `${driverCoords.lat.toFixed(2)},${driverCoords.lng.toFixed(2)}`;
    const nextRouteKey = [pickupAddress || '', dropoffAddress || '', status, routeMode, coarseOrigin].join('|');
    if (routeRenderKeyRef.current === nextRouteKey) return;
    routeRenderKeyRef.current = nextRouteKey;

    if (pickupRouteRef.current) { pickupRouteRef.current.setMap(null); pickupRouteRef.current = null; }
    if (dropoffRouteRef.current) { dropoffRouteRef.current.setMap(null); dropoffRouteRef.current = null; }

    const ds = new window.google.maps.DirectionsService();

    if (pickupAddress && !['picked_up', 'completed'].includes(status)) {
      const pickupRenderer = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: { strokeColor: '#00e5a0', strokeWeight: 5, strokeOpacity: 0.92 },
      });
      ds.route({
        origin: driverCoords,
        destination: pickupAddress,
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (result, routeStatus) => {
        if (routeStatus === 'OK') {
          pickupRenderer.setDirections(result);
          pickupRouteRef.current = pickupRenderer;
        }
      });
    }

    if (dropoffAddress) {
      const dropoffRenderer = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: {
          strokeColor: ['picked_up', 'completed'].includes(status) ? '#0ea5e9' : '#c9a84c',
          strokeWeight: 4,
          strokeOpacity: ['picked_up', 'completed'].includes(status) ? 0.9 : 0.65,
          icons: ['picked_up', 'completed'].includes(status)
            ? []
            : [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }],
        },
      });
      ds.route({
        origin: ['picked_up', 'completed'].includes(status) ? driverCoords : (pickupAddress || driverCoords),
        destination: dropoffAddress,
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (result, routeStatus) => {
        if (routeStatus === 'OK') {
          dropoffRenderer.setDirections(result);
          dropoffRouteRef.current = dropoffRenderer;
        }
      });
    }
  }, [mapsLoaded, tracking, driverCoords]);

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
  const trackingUrl = tracking?.trackingUrl || (riderKey ? getPublicAppUrl(`/rider?trip=${encodeURIComponent(riderKey)}`) : '');

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

  function handleExitRiderView() {
    if (source === 'admin') {
      navigate('/admin/platform', { replace: true });
      return;
    }

    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/auth', { replace: true });
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden mobile-safe-top mobile-safe-bottom native-shell" style={{ background: '#07090d' }}>
      <div
        ref={mapRef}
        className="flex-shrink-0 transition-all duration-300"
        style={{
          height: compactMap ? '28vh' : '42vh',
          minHeight: compactMap ? 190 : 280,
          borderRadius: compactMap ? 22 : 28,
          overflow: 'hidden',
        }}
      >
        {mapError && (
          <div
            className="w-full h-full flex items-center justify-center px-6 text-center"
            style={{ background: '#0d1117', color: 'rgba(255,255,255,0.72)' }}
          >
            <div>
              <p className="text-sm font-700 mb-2" style={{ color: '#c9a84c', fontWeight: 700 }}>Map Unavailable</p>
              <p className="text-xs" style={{ lineHeight: 1.7 }}>{mapError}</p>
            </div>
          </div>
        )}
      </div>

      <div
        className="rounded-t-3xl p-5 space-y-4 flex-1 overflow-y-auto native-scroll native-glass"
        style={{
          background: 'rgba(13,17,23,0.97)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderBottom: 'none',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div className="native-handle" />
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleExitRiderView}
            className="px-3 py-2 rounded-xl text-xs flex items-center gap-1.5"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
          >
            <X className="w-3.5 h-3.5" />
            Exit Rider View
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl"
            style={{ background: `${statusColor}12`, border: `1px solid ${statusColor}30` }}
          >
            <div className="w-2 h-2 rounded-full animate-blink" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
            <p className="font-700 text-sm" style={{ color: statusColor, fontWeight: 700 }}>{STATUS_LABELS[status] || 'Your ride is being tracked'}</p>
          </div>
          <button
            type="button"
            onClick={() => setCompactMap(prev => !prev)}
            className="px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
          >
            {compactMap ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            {compactMap ? 'Expand Map' : 'Compact Map'}
          </button>
        </div>

        {STATUS_HINTS[status] && (
          <div
            className="rounded-xl px-3 py-2"
            style={{ background: `${statusColor}10`, border: `1px solid ${statusColor}26` }}
          >
            <p className="text-xs" style={{ color: '#e5e7eb', lineHeight: 1.6 }}>
              {STATUS_HINTS[status]}
            </p>
          </div>
        )}

        {(usingUploadedAudio || riderVoice.supported) && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.16)' }}>
            <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {usingUploadedAudio
                ? 'Rider audio guide is available here so instructions can be heard instead of read.'
                : 'Voice helper can read the rider instructions aloud from here, including pickup, dropoff, and live tracking help.'}
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

        <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>RIDER GUIDE</p>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>
            Watch the live map, use <strong style={{ color: '#e5e7eb' }}>Compact Map</strong> if you need more room for trip details, and use <strong style={{ color: '#e5e7eb' }}>Copy</strong> or <strong style={{ color: '#e5e7eb' }}>Share</strong> to send your tracking link to someone helping you follow the ride.
          </p>
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
          <div className="rounded-xl px-3 py-3 native-glass" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>Tracking Link</p>
                <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.62)' }}>{trackingUrl}</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(trackingUrl).catch(() => {})}
                  className="px-3 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={handleShareTracking}
                  className="px-3 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
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
