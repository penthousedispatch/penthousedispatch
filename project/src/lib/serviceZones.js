export const SERVICE_ZONES = [
  {
    key: 'manhattan',
    label: 'Manhattan',
    color: '#c9a84c',
    keywords: ['manhattan', 'new york, ny', ' ny 10', 'midtown', 'harlem', 'upper east', 'upper west', 'lower east', 'tribeca', 'soho', 'chelsea', 'greenwich', 'battery'],
  },
  {
    key: 'brooklyn',
    label: 'Brooklyn',
    color: '#0ea5e9',
    keywords: ['brooklyn', 'bk', ' ny 112', 'bedford', 'williamsburg', 'bushwick', 'park slope', 'crown heights', 'flatbush', 'bay ridge', 'bensonhurst', 'coney island'],
  },
  {
    key: 'queens',
    label: 'Queens',
    color: '#00e5a0',
    keywords: ['queens', 'flushing', 'astoria', 'jackson heights', 'jamaica', 'long island city', 'lic', 'forest hills', 'bayside', 'ozone park', 'richmond hill', 'woodside'],
  },
  {
    key: 'bronx',
    label: 'Bronx',
    color: '#f59e0b',
    keywords: ['bronx', ' ny 104', 'riverdale', 'fordham', 'pelham', 'hunts point', 'morrisania', 'co-op city'],
  },
  {
    key: 'staten island',
    label: 'Staten Island',
    color: '#a78bfa',
    keywords: ['staten island', 'si ', ' ny 103'],
  },
  {
    key: 'long island',
    label: 'Long Island',
    color: '#f472b6',
    keywords: ['long island', 'nassau', 'suffolk', 'hempstead', 'garden city', 'great neck', 'jericho', 'mineola', 'valley stream', 'hicksville', 'plainview', 'syosset', 'huntington', 'islip', 'babylon'],
  },
];

export function normalizeZoneKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizePreferredZones(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map(normalizeZoneKey).filter(Boolean))];
}

export function detectServiceZone(address) {
  const lower = String(address || '').toLowerCase();
  if (!lower) return 'default';

  for (const zone of SERVICE_ZONES) {
    if (zone.keywords.some(keyword => lower.includes(keyword))) {
      return zone.key;
    }
  }

  return 'default';
}

export function getServiceZoneMeta(zoneKey) {
  const normalized = normalizeZoneKey(zoneKey);
  return SERVICE_ZONES.find(zone => zone.key === normalized) || {
    key: 'default',
    label: 'Unknown',
    color: 'rgba(255,255,255,0.5)',
  };
}

export function formatServiceZone(zoneKey) {
  return getServiceZoneMeta(zoneKey).label;
}

export function getZonePreferenceBonus(zoneKey, preferredZones, bonus = 12) {
  const zone = normalizeZoneKey(zoneKey);
  const prefs = normalizePreferredZones(preferredZones);
  if (!zone || zone === 'default' || prefs.length === 0) return 0;
  return prefs.includes(zone) ? bonus : 0;
}
