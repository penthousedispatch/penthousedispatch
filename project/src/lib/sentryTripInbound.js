/**
 * Normalize inbound Sentry / broker trip payloads (webhooks + marketplace poll)
 * for marketplace_trips.status and assignment_type_code display.
 */

import { isSyntheticMarketplaceTrip } from './sentrySyntheticTrips';

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

function extractAcceptanceStatusId(raw = {}) {
  const nestedTrip = asJsonObject(raw.trip);
  const id = Number(
    raw.acceptance_status_id ?? nestedTrip.acceptance_status_id
  );
  return Number.isFinite(id) ? id : null;
}

/** Maps broker/Sentry vocabulary to marketplace_trips.status */
export function deriveMarketplaceTripStatus(raw = {}) {
  const s = pickExternalTripStatus(raw).toLowerCase();
  const statusId = extractLifecycleStatusId(raw);
  const acceptanceId = extractAcceptanceStatusId(raw);
  /** Broker: lifecycle status_id may remain 2/3 while TP acceptance is unset — acceptance_status_id=0. */
  const tpNotAccepted = acceptanceId === 0;
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
  if (
    !tpNotAccepted &&
    (statusId === 3 ||
      statusId === 2 ||
      ['accepted', 'assigned', 'locked', 'in_progress', 'in progress', 'en_route', 'en route'].includes(s))
  ) {
    return 'accepted';
  }
  return 'available';
}

/**
 * `deriveMarketplaceTripStatus` for a persisted `marketplace_trips` row (columns + raw_payload snapshot).
 */
export function deriveMarketplaceTripStatusFromStoredRow(row = {}) {
  const raw = asJsonObject(row.raw_payload);
  const nestedTrip = asJsonObject(raw.trip);
  const merged = {
    ...raw,
    trip_status: String(row.external_trip_status ?? raw.trip_status ?? ''),
    status: String(row.status ?? raw.status ?? ''),
    marketplace_status: String(row.marketplace_status ?? raw.marketplace_status ?? ''),
    status_id: row.status_id ?? raw.status_id ?? nestedTrip.status_id,
    trip_status_id: row.trip_status_id ?? raw.trip_status_id ?? nestedTrip.trip_status_id,
    trip_processing_status_id:
      row.trip_processing_status_id ??
      raw.trip_processing_status_id ??
      nestedTrip.trip_processing_status_id,
    acceptance_status_id:
      row.acceptance_status_id ??
      raw.acceptance_status_id ??
      nestedTrip.acceptance_status_id,
  };
  return deriveMarketplaceTripStatus(merged);
}

/**
 * Persisted marketplace_trips column + embedded Sentry snapshot.
 * When brokers send acceptance_status_id=0 ("not yours"), the row must not look like claimable marketplace work.
 */
export function isBrokerNonAcceptedMarketplaceRow(row = {}) {
  const raw = asJsonObject(row.raw_payload);
  const nestedTrip = asJsonObject(raw.trip);
  const id = Number(
    row.acceptance_status_id ??
    raw.acceptance_status_id ??
    nestedTrip.acceptance_status_id
  );
  return Number.isFinite(id) && id === 0;
}

/**
 * True when `raw_payload` carries the same trip id as `sentry_trip_id` (top-level or nested `trip`).
 * Rows missing a matching snapshot (manual QA rows, truncated payloads) should not appear in dispatch.
 */
export function tripPayloadMirrorId(payload = {}) {
  const nested = asJsonObject(payload.trip);
  const cand = payload.trip_id ?? payload.id ?? nested.trip_id ?? nested.id;
  if (cand == null) return '';
  return String(cand).trim();
}

export function isMarketplaceTripSentryBackedRow(row = {}) {
  const sid = String(row.sentry_trip_id || '').trim();
  if (!sid) return false;
  const raw = asJsonObject(row.raw_payload);
  return tripPayloadMirrorId(raw) === sid;
}

/** Dispatch / scheduler: synthetic, broker-non-accepted, or non-Sentry-backed rows excluded. */
export function isDispatchQueueMarketplaceTrip(row = {}) {
  if (isSyntheticMarketplaceTrip(row)) return false;
  if (isBrokerNonAcceptedMarketplaceRow(row)) return false;
  return isMarketplaceTripSentryBackedRow(row);
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
