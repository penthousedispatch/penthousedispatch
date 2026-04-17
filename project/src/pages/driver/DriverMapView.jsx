import React, { useEffect, useRef, useState } from 'react';
import { calcBearing, getPCarIcon } from '../../components/map/PCarMarker';

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
  const prevLocationRef = useRef(null);
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
