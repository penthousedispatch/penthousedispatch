export function normalizeAppRole(role) {
  if (typeof role !== 'string') return null;

  const normalized = role.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'dispatcher') return 'company';
  if (['admin', 'company', 'driver', 'rider'].includes(normalized)) return normalized;
  return null;
}
