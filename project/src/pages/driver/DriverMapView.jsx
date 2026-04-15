import React, { useEffect, useRef, useState } from 'react';

const GMAPS_KEY = 'AIzaSyD5sugXJ0HIUwkVlixF5qdoN-l0McgAQM4';

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

const CAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="15" fill="#c9a84c" stroke="#07090d" stroke-width="2"/>
  <path d="M10 20 L12 13 L20 13 L22 20 Z" fill="#07090d"/>
  <path d="M12 13 L13 10 L19 10 L20 13 Z" fill="#07090d"/>
  <circle cx="12" cy="21" r="2" fill="#07090d"/>
  <circle cx="20" cy="21" r="2" fill="#07090d"/>
</svg>`;

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
  const routeRef = useRef(null);
  const [mapsLoaded, setMapsLoaded] = useState(mapsReady);

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
    });
  }, [location]);

  useEffect(() => () => {
    if (routeRef.current) {
      routeRef.current.setMap(null);
      routeRef.current = null;
    }
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !location || !window.google) return;

    if (markerRef.current) {
      markerRef.current.setPosition(location);
    } else {
      const icon = {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(CAR_SVG),
        scaledSize: new window.google.maps.Size(40, 40),
        anchor: new window.google.maps.Point(20, 20),
      };
      markerRef.current = new window.google.maps.Marker({
        position: location,
        map: mapInstanceRef.current,
        icon,
        zIndex: 100,
      });
    }

    mapInstanceRef.current.panTo(location);
  }, [location, mapsLoaded]);

  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !window.google) return;
    if (routeRef.current) { routeRef.current.setMap(null); routeRef.current = null; }

    if ((sheetState === 'navigation' || sheetState === 'to_dropoff') && location && trip) {
      const dest = sheetState === 'navigation' ? trip.puAddress : trip.doAddress;
      if (!dest) return;
      const ds = new window.google.maps.DirectionsService();
      const dr = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: true,
        polylineOptions: { strokeColor: '#0ea5e9', strokeWeight: 4, strokeOpacity: 0.8 },
      });
      ds.route({
        origin: location,
        destination: dest,
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === 'OK') {
          dr.setDirections(result);
          routeRef.current = dr;
        }
      });
    }
  }, [sheetState, location, trip, mapsLoaded]);

  return (
    <div className="absolute inset-0">
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
