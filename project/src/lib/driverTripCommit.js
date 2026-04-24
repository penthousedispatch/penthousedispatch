/**
 * Phase 1 — single choke-point for resolving the next driver `currentTrip` value.
 * All UI mutations in DriverApp should go through commitDriverTrip (see DriverApp.jsx).
 */

/**
 * @param {object|null|undefined} prev
 * @param {object|null|undefined|function} update — next value or (prev) => next
 * @returns {object|null|undefined}
 */
export function resolveNextDriverTrip(prev, update) {
  if (typeof update === 'function') {
    return update(prev);
  }
  return update;
}

/**
 * @param {object|null|undefined} prev
 * @param {object|null|undefined} next
 * @param {{ source?: string, reason?: string }} [meta]
 */
export function describeDriverTripCommit(prev, next, meta = {}) {
  return {
    source: meta.source || 'unknown',
    reason: meta.reason || '',
    prev_trip_id: prev?.tripId != null ? String(prev.tripId) : null,
    next_trip_id: next?.tripId != null ? String(next.tripId) : null,
    cleared: !next?.tripId && Boolean(prev?.tripId),
  };
}
