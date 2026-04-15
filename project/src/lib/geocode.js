const GMAPS_KEY = 'AIzaSyD5sugXJ0HIUwkVlixF5qdoN-l0McgAQM4';
const cache = new Map();

export async function geocodeAddress(address) {
  if (!address || address.length < 5) return null;
  const key = address.toLowerCase().trim();
  if (cache.has(key)) return cache.get(key);

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GMAPS_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.results[0]) {
      const loc = data.results[0].geometry.location;
      cache.set(key, loc);
      return loc;
    }
    return null;
  } catch {
    return null;
  }
}

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function getMapsUrl(origin, destination) {
  const base = 'https://www.google.com/maps/dir/';
  return `${base}${encodeURIComponent(origin)}/${encodeURIComponent(destination)}`;
}

export const GMAPS_KEY_EXPORT = GMAPS_KEY;
