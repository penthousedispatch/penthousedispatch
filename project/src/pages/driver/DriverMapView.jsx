import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layers3, Route, TrafficCone, Compass, Navigation2 } from 'lucide-react';
import { calcBearing, getPCarIcon } from '../../components/map/PCarMarker';

const GMAPS_KEY = 'AIzaSyD5sugXJ0HIUwkVlixF5qdoN-l0McgAQM4';

function sanitizeHtmlInstruction(text) {
  return String(text || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function maneuverGlyph(maneuver) {
  const m = String(maneuver || '').toLowerCase();
  if (m.includes('uturn') || m.includes('u-turn')) return '↶';
  if (m.includes('sharp') && m.includes('right')) return '↱';
  if (m.includes('sharp') && m.includes('left')) return '↰';
  if (m.includes('right')) return '→';
  if (m.includes('left')) return '←';
  if (m.includes('merge')) return '⤵';
  if (m.includes('roundabout')) return '⟲';
  return '↑';
}

function primaryStreetFromInstruction(instruction, addressFallback) {
  const t = sanitizeHtmlInstruction(instruction);
  const onMatch = t.match(/\bon\s+([^,(]+)/i);
  if (onMatch) return onMatch[1].replace(/\s+toward\s+.*$/i, '').trim();
  const onto = t.match(/\bonto\s+([^,(]+)/i);
  if (onto) return onto[1].trim();
  if (addressFallback) return String(addressFallback).split(',')[0].trim();
  return t.slice(0, 36) || 'Next';
}

const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4b5563' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#07090d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2332' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050a0f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

let mapsReady = false;
let mapsPromise = null;

function loadMaps() {
  if (mapsReady) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}`;
    script.async = true;
    script.onload = () => { mapsReady = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export default function DriverMapView({ location, trip, sheetState }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const pickupRouteRef = useRef(null);
  const dropoffRouteRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const prevLocationRef = useRef(null);
  const [mapsLoaded, setMapsLoaded] = useState(mapsReady);
  const [mapMode, setMapMode] = useState('route');
  const [showTraffic, setShowTraffic] = useState(false);
  const [navSummary, setNavSummary] = useState(null);
  const activeDestination = useMemo(() => {
    if (!trip) return '';
    if (sheetState === 'to_dropoff') {
      return trip.doAddress || trip.do_address || '';
    }
    return trip.puAddress || trip.pu_address || '';
  }, [trip, sheetState]);

  useEffect(() => {
    loadMaps().then(() => {
      setMapsLoaded(true);
      if (!mapRef.current || mapInstanceRef.current) return;
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        zoom: 15,
        center: location || { lat: 40.7128, lng: -74.006 },
        styles: DARK_STYLE,
        disableDefaultUI: true,
        zoomControl: false,
        gestureHandling: 'greedy',
      });
      trafficLayerRef.current = new window.google.maps.TrafficLayer();
    });
  }, [location]);

  useEffect(() => () => {
    if (pickupRouteRef.current) pickupRouteRef.current.setMap(null);
    if (dropoffRouteRef.current) dropoffRouteRef.current.setMap(null);
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    if (trafficLayerRef.current) {
      trafficLayerRef.current.setMap(null);
      trafficLayerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;

    if (mapMode === 'satellite') {
      map.setMapTypeId(window.google.maps.MapTypeId.HYBRID);
      map.setTilt(45);
      map.setHeading(0);
    } else if (mapMode === 'pov') {
      map.setMapTypeId(window.google.maps.MapTypeId.HYBRID);
      map.setTilt(45);
      map.setHeading(headingFromLocation(prevLocationRef.current, location));
    } else {
      map.setMapTypeId(window.google.maps.MapTypeId.ROADMAP);
      map.setTilt(0);
      map.setHeading(0);
    }
  }, [mapMode, mapsLoaded, location]);

  useEffect(() => {
    if (!mapsLoaded || !trafficLayerRef.current) return;
    trafficLayerRef.current.setMap(showTraffic ? mapInstanceRef.current : null);
  }, [showTraffic, mapsLoaded]);

  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !location || !window.google) return;

    const previous = prevLocationRef.current;
    const heading = previous ? calcBearing(previous, location) : 0;
    prevLocationRef.current = location;

    if (markerRef.current) {
      markerRef.current.setPosition(location);
      markerRef.current.setIcon(
        getPCarIcon(window.google, {
          isSelected: true,
          isOnTrip: Boolean(trip),
          heading,
        })
      );
    } else {
      markerRef.current = new window.google.maps.Marker({
        position: location,
        map: mapInstanceRef.current,
        icon: getPCarIcon(window.google, {
          isSelected: true,
          isOnTrip: Boolean(trip),
          heading,
        }),
        zIndex: 100,
        optimized: false,
      });
    }

    mapInstanceRef.current.panTo(location);
  }, [location, mapsLoaded, trip]);

  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !window.google) return;
    if (pickupRouteRef.current) { pickupRouteRef.current.setMap(null); pickupRouteRef.current = null; }
    if (dropoffRouteRef.current) { dropoffRouteRef.current.setMap(null); dropoffRouteRef.current = null; }
    setNavSummary(null);

    if (!location || !trip) return;

    const ds = new window.google.maps.DirectionsService();
    const pickupAddress = trip.puAddress || trip.pu_address;
    const dropoffAddress = trip.doAddress || trip.do_address;

    if (pickupAddress && sheetState !== 'to_dropoff') {
      const pickupRenderer = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: { strokeColor: '#00e5a0', strokeWeight: 5, strokeOpacity: 0.92 },
      });
      ds.route({
        origin: location,
        destination: pickupAddress,
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === 'OK') {
          pickupRenderer.setDirections(result);
          pickupRouteRef.current = pickupRenderer;
          const leg = result.routes?.[0]?.legs?.[0];
          const firstStep = leg?.steps?.[0];
          setNavSummary({
            mode: 'pickup',
            eta: leg?.duration?.text || '',
            distance: leg?.distance?.text || '',
            stepDistance: firstStep?.distance?.text || leg?.distance?.text || '',
            maneuver: firstStep?.maneuver || '',
            streetLine: primaryStreetFromInstruction(firstStep?.instructions || '', pickupAddress),
            instruction: sanitizeHtmlInstruction(firstStep?.instructions || 'Head to pickup'),
          });
        }
      });
    }

    if (dropoffAddress) {
      const dropoffRenderer = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: {
          strokeColor: sheetState === 'to_dropoff' ? '#0ea5e9' : '#c9a84c',
          strokeWeight: 4,
          strokeOpacity: sheetState === 'to_dropoff' ? 0.92 : 0.65,
          icons: sheetState === 'to_dropoff'
            ? []
            : [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }],
        },
      });
      ds.route({
        origin: sheetState === 'to_dropoff' ? location : (pickupAddress || location),
        destination: dropoffAddress,
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === 'OK') {
          dropoffRenderer.setDirections(result);
          dropoffRouteRef.current = dropoffRenderer;
          if (sheetState === 'to_dropoff' || !pickupAddress) {
            const leg = result.routes?.[0]?.legs?.[0];
            const firstStep = leg?.steps?.[0];
            setNavSummary({
              mode: 'dropoff',
              eta: leg?.duration?.text || '',
              distance: leg?.distance?.text || '',
              stepDistance: firstStep?.distance?.text || leg?.distance?.text || '',
              maneuver: firstStep?.maneuver || '',
              streetLine: primaryStreetFromInstruction(firstStep?.instructions || '', dropoffAddress),
              instruction: sanitizeHtmlInstruction(firstStep?.instructions || 'Head to dropoff'),
            });
          }
        }
      });
    }
  }, [sheetState, location, trip, mapsLoaded]);

  const immersiveNav = Boolean(
    trip && (sheetState === 'navigation' || sheetState === 'to_dropoff') && navSummary
  );

  return (
    <div className="absolute inset-0 z-0">
      <div ref={mapRef} className="w-full h-full" />
      <div
        className="absolute left-3 right-3 z-30 flex flex-wrap items-start justify-between gap-2 pointer-events-auto"
        style={{ top: 12, maxWidth: '100%' }}
      >
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'route', label: 'Route', icon: Route },
            { id: 'satellite', label: 'Satellite', icon: Layers3 },
            { id: 'pov', label: 'POV', icon: Compass },
          ].map(option => {
            const Icon = option.icon;
            const active = mapMode === option.id;
            return (
              <button
                key={option.id}
                onClick={() => setMapMode(option.id)}
                className="px-3 py-2 rounded-full text-xs flex items-center gap-1.5"
                style={{
                  background: active ? 'rgba(201,168,76,0.16)' : 'rgba(13,17,23,0.88)',
                  border: `1px solid ${active ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: active ? '#c9a84c' : '#e5e7eb',
                  backdropFilter: 'blur(14px)',
                  fontWeight: active ? 700 : 600,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {option.label}
              </button>
            );
          })}
          <button
            onClick={() => setShowTraffic(prev => !prev)}
            className="px-3 py-2 rounded-full text-xs flex items-center gap-1.5"
            style={{
              background: showTraffic ? 'rgba(14,165,233,0.16)' : 'rgba(13,17,23,0.88)',
              border: `1px solid ${showTraffic ? 'rgba(14,165,233,0.3)' : 'rgba(255,255,255,0.08)'}`,
              color: showTraffic ? '#7dd3fc' : '#e5e7eb',
              backdropFilter: 'blur(14px)',
              fontWeight: 600,
            }}
          >
            <TrafficCone className="w-3.5 h-3.5" />
            Traffic
          </button>
        </div>
      </div>
      {immersiveNav && (
        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: 72 }}>
          <div
            className="pointer-events-auto"
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0.92) 0%, #080808 78%, rgba(7,9,13,0) 100%)',
              padding: '12px 14px 18px',
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="flex items-center justify-center rounded-2xl shrink-0"
                style={{
                  width: 48,
                  height: 48,
                  background: 'rgba(255,255,255,0.1)',
                  fontSize: 26,
                  lineHeight: 1,
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                {maneuverGlyph(navSummary.maneuver)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-600 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                  {navSummary.stepDistance || navSummary.distance}
                </p>
                <p className="text-[22px] font-800 leading-tight truncate" style={{ color: '#fff', fontWeight: 800 }}>
                  {navSummary.streetLine || navSummary.instruction}
                </p>
                <p className="text-[12px] mt-1 leading-snug" style={{ color: 'rgba(255,255,255,0.52)' }}>
                  {navSummary.instruction}
                </p>
              </div>
              <div className="text-right shrink-0 pt-0.5">
                <p className="text-sm font-800" style={{ color: '#fff', fontWeight: 800 }}>{navSummary.eta}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>ETA</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {navSummary && activeDestination && !immersiveNav && (
        <div className="absolute left-3 right-3 z-20 max-w-full pointer-events-auto" style={{ top: 88 }}>
          <div
            className="rounded-2xl px-4 py-3"
            style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
          >
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <Navigation2 className="w-4 h-4" style={{ color: navSummary.mode === 'pickup' ? '#00e5a0' : '#0ea5e9' }} />
                <span className="text-xs font-700 uppercase tracking-wider" style={{ color: navSummary.mode === 'pickup' ? '#00e5a0' : '#7dd3fc', fontWeight: 700 }}>
                  {navSummary.mode === 'pickup' ? 'To Pickup' : 'To Dropoff'}
                </span>
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: '#e5e7eb' }}>{navSummary.distance}</p>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{navSummary.eta}</p>
              </div>
            </div>
            <p className="text-sm" style={{ color: '#e5e7eb', fontWeight: 600 }}>
              {navSummary.instruction}
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
              Destination: {activeDestination}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function headingFromLocation(previous, current) {
  if (!previous || !current) return 0;
  return calcBearing(previous, current);
}
