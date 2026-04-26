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

function asJsonObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function extractLifecycleStatusId(raw = {}) {
  const nestedTrip = asJsonObject(raw.trip);
  const statusId = Number(
    raw.status_id ??
    raw.trip_status_id ??
    raw.trip_processing_status_id ??
    nestedTrip.status_id ??
    nestedTrip.trip_status_id ??
    nestedTrip.trip_processing_status_id
  );
  return Number.isFinite(statusId) ? statusId : null;
}

/** Maps broker/Sentry vocabulary to marketplace_trips.status */
export function deriveMarketplaceTripStatus(raw = {}) {
  const s = pickExternalTripStatus(raw).toLowerCase();
  const statusId = extractLifecycleStatusId(raw);
  if (statusId === 6 || ['completed', 'complete', 'done', 'closed'].includes(s)) return 'completed';
  if (statusId === 7 || statusId === 8) return 'cancelled';
  if (s.includes('rerout')) return 'cancelled';
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
  if (statusId === 5 || ['picked_up', 'picked-up', 'on_trip', 'passenger_picked_up'].includes(s)) return 'picked_up';
  if (statusId === 4 || ['arrived', 'arrived_at_pickup'].includes(s)) return 'arrived';
  if (statusId === 3 || statusId === 2 || ['accepted', 'assigned', 'locked', 'in_progress', 'in progress', 'en_route', 'en route'].includes(s)) {
    return 'accepted';
  }
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
