export function getPCarSVG({ isSelected = false, isOnTrip = false, heading = 0 } = {}) {
  const bodyColor = isSelected ? '#e8c76a' : '#c9a84c';
  const glowColor = isOnTrip ? '#00e5a0' : bodyColor;
  const size = isSelected ? 52 : 44;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 52 52">
    ${isOnTrip ? `<circle cx="26" cy="26" r="24" fill="${glowColor}" fill-opacity="0.12" stroke="${glowColor}" stroke-width="1" stroke-opacity="0.4"/>` : ''}
    <g transform="rotate(${heading} 26 26)">
      <circle cx="26" cy="26" r="${isSelected ? 20 : 18}" fill="${bodyColor}" stroke="#07090d" stroke-width="2"/>
      <rect x="18" y="19" width="16" height="10" rx="2" fill="#07090d"/>
      <path d="M20 19 L22 14 L30 14 L32 19 Z" fill="#07090d"/>
      <circle cx="21" cy="30" r="2.5" fill="#1a2332" stroke="${bodyColor}" stroke-width="1"/>
      <circle cx="31" cy="30" r="2.5" fill="#1a2332" stroke="${bodyColor}" stroke-width="1"/>
      <rect x="19" y="21" width="14" height="5" rx="1" fill="#07090d" opacity="0.4"/>
      <text x="26" y="28" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-weight="900" font-size="8" fill="${bodyColor}" opacity="0.95">P</text>
      ${isSelected ? `<path d="M22 14 L26 9 L30 14" fill="${bodyColor}" opacity="0.7"/>` : ''}
    </g>
  </svg>`;

  return svg;
}

export function getPCarIcon(google, options = {}) {
  const svg = getPCarSVG(options);
  const size = options.isSelected ? 52 : 44;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

export function calcBearing(from, to) {
  if (!from || !to) return 0;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}
