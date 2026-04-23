/**
 * Normalize inbound Sentry / broker trip payloads (webhooks + marketplace poll)
 * for marketplace_trips.status and assignment_type_code display.
 */

export function pickAssignmentTypeCode(raw = {}) {
  return String(
    raw.assignment_type_code ||
      raw.assignment_type ||
      raw.assignmentTypeCode ||
      raw.assignment_code ||
      ''
  ).trim();
}

export function pickExternalTripStatus(raw = {}) {
  return String(
    raw.trip_status ||
      raw.status ||
      raw.marketplace_status ||
      raw.lifecycle_status ||
      ''
  ).trim();
}

/** Maps broker/Sentry vocabulary to marketplace_trips.status */
export function deriveMarketplaceTripStatus(raw = {}) {
  const s = pickExternalTripStatus(raw).toLowerCase();
  if (!s) return 'available';
  if (
    [
      'cancelled',
      'canceled',
      'void',
      'deleted',
      'broker_cancelled',
      'canceled_by_broker',
      'no_longer_available',
      'removed',
    ].includes(s) ||
    s.includes('cancel')
  ) {
    return 'cancelled';
  }
  if (['completed', 'complete', 'done', 'closed'].includes(s)) return 'completed';
  if (['assigned', 'accepted', 'locked', 'in_progress', 'in progress'].includes(s)) return 'assigned';
  return 'available';
}

/** Short reference for dispatch / testing (not exhaustive — extend as Sentry documents codes). */
export const SENTRY_ASSIGNMENT_TYPE_REFERENCE = [
  { code: 'STANDARD', meaning: 'Default single-leg assignment' },
  { code: 'SHARED', meaning: 'Shared-ride / multi-rider routing context' },
  { code: 'WILL_CALL', meaning: 'Will-call style pickup window' },
  { code: 'RETURN', meaning: 'Return leg / round-trip segment' },
  { code: 'MTA', meaning: 'MTA-style fare / compliance fields may apply' },
  { code: 'UNKNOWN', meaning: 'Log raw_payload.assignment_type_code and extend this table' },
];
