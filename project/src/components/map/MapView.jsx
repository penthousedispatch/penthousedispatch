import React, { useEffect, useRef, useState } from 'react';
import { getPCarIcon, calcBearing } from './PCarMarker';

const GMAPS_KEY = 'AIzaSyD5sugXJ0HIUwkVlixF5qdoN-l0McgAQM4';

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4b5563' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#07090d' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2332' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0d1117' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050a0f' }] },
  { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
];

let googleMapsLoaded = false;
let loadPromise = null;

function loadGoogleMaps() {
  if (googleMapsLoaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => { googleMapsLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return loadPromise;
}

export default function MapView({ drivers = [], trips = [], selectedDriver, onDriverClick }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const prevPositionsRef = useRef({});
  const [mapsReady, setMapsReady] = useState(googleMapsLoaded);
  const [mapsError, setMapsError] = useState(false);

  useEffect(() => {
    loadGoogleMaps().then(() => {
      setMapsReady(true);
      setMapsError(false);
      if (!mapRef.current || mapInstanceRef.current) return;
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        zoom: 11,
        center: { lat: 40.7128, lng: -74.0060 },
        styles: DARK_MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
      });
    }).catch(() => {
      setMapsError(true);
    });
  }, []);

  useEffect(() => {
    if (!mapsReady || !mapInstanceRef.current || !window.google) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    drivers.forEach(driver => {
      if (!driver.current_lat || !driver.current_lng) return;

      const isSelected = selectedDriver?.id === driver.id;
      const isOnTrip = driver.status === 'on_trip';
      const pos = { lat: parseFloat(driver.current_lat), lng: parseFloat(driver.current_lng) };

      const prevPos = prevPositionsRef.current[driver.id];
      const heading = prevPos ? calcBearing(prevPos, pos) : 0;
      prevPositionsRef.current[driver.id] = pos;

      const icon = getPCarIcon(window.google, { isSelected, isOnTrip, heading });

      const marker = new window.google.maps.Marker({
        position: pos,
        map: mapInstanceRef.current,
        icon,
        title: driver.full_name,
        zIndex: isSelected ? 100 : isOnTrip ? 60 : 50,
        optimized: false,
      });

      marker.addListener('click', () => onDriverClick?.(driver));

      const statusLabel = driver.status === 'on_trip' ? 'On Trip' : driver.status === 'online' ? 'Available' : driver.status;
      const statusColor = driver.status === 'on_trip' ? '#00e5a0' : driver.status === 'online' ? '#c9a84c' : 'rgba(255,255,255,0.4)';

      const infoWindow = new window.google.maps.InfoWindow({
        content: `<div style="background:#0d1117;color:#e5e7eb;padding:8px 12px;border-radius:8px;font-family:Inter,sans-serif;font-size:12px;min-width:120px;border:1px solid rgba(201,168,76,0.2);">
          <p style="font-weight:700;color:#c9a84c;margin-bottom:3px;">${driver.full_name}</p>
          <p style="color:${statusColor};font-size:11px;">${statusLabel}</p>
        </div>`,
      });

      marker.addListener('mouseover', () => infoWindow.open(mapInstanceRef.current, marker));
      marker.addListener('mouseout', () => infoWindow.close());

      markersRef.current.push(marker);
    });

    trips.slice(0, 50).forEach(trip => {
      if (!trip.coords?.lat) return;
      const marker = new window.google.maps.Marker({
        position: { lat: parseFloat(trip.coords.lat), lng: parseFloat(trip.coords.lng) },
        map: mapInstanceRef.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: '#00e5a0',
          fillOpacity: 0.8,
          strokeColor: '#07090d',
          strokeWeight: 1,
          scale: 5,
        },
        title: trip.pu_address,
        zIndex: 10,
      });
      markersRef.current.push(marker);
    });

    if (selectedDriver?.current_lat) {
      mapInstanceRef.current.panTo({
        lat: parseFloat(selectedDriver.current_lat),
        lng: parseFloat(selectedDriver.current_lng),
      });
    }
  }, [drivers, trips, selectedDriver, mapsReady]);

  useEffect(() => () => {
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];
  }, []);

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />
      {!mapsReady && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#0d1117' }}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {mapsError ? 'Unable to load map.' : 'Loading map...'}
            </p>
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 px-3 py-2 rounded-xl" style={{ background: 'rgba(7,9,13,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-3 h-3 rounded-full" style={{ background: '#c9a84c' }} />
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Drivers</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-3 h-3 rounded-full" style={{ background: '#00e5a0' }} />
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Pickups</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-3 h-3 rounded-full" style={{ background: '#00e5a0', opacity: 0.5 }} />
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>On Trip</span>
        </div>
      </div>
    </div>
  );
}
