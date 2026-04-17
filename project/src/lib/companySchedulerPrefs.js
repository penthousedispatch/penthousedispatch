const PREFS_MARKER = 'AI_ROUTING_PREFS:';

export const DEFAULT_COMPANY_SCHEDULER_PREFS = {
  price_weight: 8,
  proximity_weight: 7,
  zone_weight: 10,
  shared_rides_enabled: true,
};

export function readCompanySchedulerPrefs(company) {
  const notes = company?.notes || '';
  const line = notes
    .split('\n')
    .find(entry => entry.trim().startsWith(PREFS_MARKER));

  if (!line) return { ...DEFAULT_COMPANY_SCHEDULER_PREFS };

  try {
    const parsed = JSON.parse(line.trim().slice(PREFS_MARKER.length));
    return {
      ...DEFAULT_COMPANY_SCHEDULER_PREFS,
      ...(parsed || {}),
    };
  } catch {
    return { ...DEFAULT_COMPANY_SCHEDULER_PREFS };
  }
}

export function writeCompanySchedulerPrefs(notes, prefs) {
  const normalized = {
    ...DEFAULT_COMPANY_SCHEDULER_PREFS,
    ...(prefs || {}),
  };
  const encoded = `${PREFS_MARKER}${JSON.stringify(normalized)}`;
  const lines = String(notes || '')
    .split('\n')
    .filter(Boolean)
    .filter(line => !line.trim().startsWith(PREFS_MARKER));

  lines.push(encoded);
  return lines.join('\n');
}
