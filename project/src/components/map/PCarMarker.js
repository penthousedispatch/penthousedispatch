export function getPCarSVG({ isSelected = false, isOnTrip = false, heading = 0 } = {}) {
  const roofColor = isSelected ? '#ffd84f' : '#f1c93c';
  const accentColor = isOnTrip ? '#00e5a0' : '#f59e0b';
  const size = isSelected ? 64 : 56;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <defs>
      <filter id="carShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.45"/>
      </filter>
      <linearGradient id="carBody" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1f232a"/>
        <stop offset="45%" stop-color="#0d1015"/>
        <stop offset="100%" stop-color="#05070b"/>
      </linearGradient>
      <linearGradient id="roofGlass" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#91b7d2"/>
        <stop offset="100%" stop-color="#36485b"/>
      </linearGradient>
      <linearGradient id="roofSeat" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#f7d44d"/>
        <stop offset="100%" stop-color="${roofColor}"/>
      </linearGradient>
    </defs>
    ${isOnTrip ? `<circle cx="32" cy="32" r="28" fill="${accentColor}" fill-opacity="0.12" stroke="${accentColor}" stroke-width="1.5" stroke-opacity="0.35"/>` : ''}
    ${isSelected ? `<circle cx="32" cy="32" r="29" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1"/>` : ''}
    <g transform="rotate(${heading} 32 32)" filter="url(#carShadow)">
      <path d="M22 6
               C18 7, 14.5 12, 13.5 18
               L11 28
               C10.4 30.5, 10.4 33.5, 11 36
               L13.5 46
               C14.7 52, 18.4 57, 22.6 58
               L41.4 58
               C45.6 57, 49.3 52, 50.5 46
               L53 36
               C53.6 33.5, 53.6 30.5, 53 28
               L50.5 18
               C49.5 12, 46 7, 42 6
               Z"
            fill="url(#carBody)"
            stroke="#05070b"
            stroke-width="1.8"/>
      <path d="M23.8 11.2
               C21.2 11.9, 18.7 15.4, 17.9 19.4
               L16.4 27.8
               C15.9 30.4, 15.9 33.6, 16.4 36.2
               L17.9 44.6
               C18.8 49, 21.5 52.6, 24.1 53.3
               L39.9 53.3
               C42.5 52.6, 45.2 49, 46.1 44.6
               L47.6 36.2
               C48.1 33.6, 48.1 30.4, 47.6 27.8
               L46.1 19.4
               C45.3 15.4, 42.8 11.9, 40.2 11.2
               Z"
            fill="#0a0d12"
            stroke="#2a2f36"
            stroke-width="1"/>
      <path d="M24.5 14.5
               C22.4 15.1, 20.3 18, 19.7 21.2
               L18.8 26.4
               L45.2 26.4
               L44.3 21.2
               C43.7 18, 41.6 15.1, 39.5 14.5
               Z"
            fill="url(#roofGlass)"
            opacity="0.95"/>
      <rect x="19.6" y="27.6" width="24.8" height="16.8" rx="4.2" fill="#e8edf1"/>
      <rect x="21.6" y="29.2" width="20.8" height="13.8" rx="3.2" fill="url(#roofSeat)"/>
      <text x="32" y="37.2" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-weight="900" font-size="11" fill="#242933">P</text>
      <path d="M21.2 14.4 L17.8 17.4 L17 20.6 L20.2 19 Z" fill="#0b0f14"/>
      <path d="M42.8 14.4 L46.2 17.4 L47 20.6 L43.8 19 Z" fill="#0b0f14"/>
      <path d="M19.8 11.6 C20.9 9.4, 22.6 8.1, 24.5 7.8 L27 8.2 L24.8 13.4 L20.8 14.8 Z" fill="${accentColor}" opacity="0.9"/>
      <path d="M44.2 11.6 C43.1 9.4, 41.4 8.1, 39.5 7.8 L37 8.2 L39.2 13.4 L43.2 14.8 Z" fill="${accentColor}" opacity="0.9"/>
      <path d="M20.8 49.2 L17.3 46.6 L16.5 43.6 L20 44.9 Z" fill="${accentColor}" opacity="0.85"/>
      <path d="M43.2 49.2 L46.7 46.6 L47.5 43.6 L44 44.9 Z" fill="${accentColor}" opacity="0.85"/>
      <rect x="14.5" y="25.2" width="3" height="9.6" rx="1.5" fill="#07090d"/>
      <rect x="46.5" y="25.2" width="3" height="9.6" rx="1.5" fill="#07090d"/>
      <rect x="22.8" y="53.3" width="5.4" height="2.8" rx="1.4" fill="#1b2028"/>
      <rect x="35.8" y="53.3" width="5.4" height="2.8" rx="1.4" fill="#1b2028"/>
      ${isSelected ? `<path d="M32 3.8 L36.4 8.6 L32 7.4 L27.6 8.6 Z" fill="${roofColor}" opacity="0.9"/>` : ''}
    </g>
  </svg>`;

  return svg;
}

export function getPCarIcon(google, options = {}) {
  const svg = getPCarSVG(options);
  const size = options.isSelected ? 64 : 56;
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
