/**
 * Phase 1 — single merge / precedence helpers for driver trip assignment rows.
 * Precedence (highest wins on conflict): db > realtime > polling > local (see SOURCE_RANK).
 * Sentry HTTP client remains unchanged for Phase 2 broker work.
 */

export const DRIVER_TRIP_SOURCE_RANK = {
  db: 100,
  realtime: 85,
  firebase: 70,
  polling: 60,
  local: 40,
};

/** Monotonic active-leg rank (aligns with DB trip_assignment_active_rank). */
export function tripAssignmentActiveRank(status) {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'pending':
      return 1;
    case 'assigned':
      return 2;
    case 'accepted':
      return 3;
    case 'in_progress':
      return 4;
    case 'arrived':
      return 5;
    case 'picked_up':
    case 'on_trip':
      return 6;
    default:
      return 0;
  }
}

export function isTerminalAssignmentStatus(status) {
  const s = String(status || '').toLowerCase();
  return ['completed', 'cancelled', 'no_show', 'rejected'].includes(s);
}

/**
 * @param {object} opts
 * @param {number} opts.incomingRevision
 * @param {number} opts.lastAppliedRevision
 * @param {string} opts.source
 * @param {string} [opts.lastSource]
 * @returns {{ apply: boolean, reason?: string }}
 */
export function shouldApplyAssignmentRow({
  incomingRevision,
  lastAppliedRevision,
  source,
  lastSource,
}) {
  const inc = Number(incomingRevision ?? 0);
  const prev = Number(lastAppliedRevision ?? 0);
  if (!Number.isFinite(inc) || inc < 0) {
    return { apply: true, reason: 'missing_revision_treated_as_initial' };
  }
  if (inc < prev) {
    return { apply: false, reason: 'stale_lifecycle_revision' };
  }
  if (inc === prev) {
    const rIn = DRIVER_TRIP_SOURCE_RANK[source] ?? 0;
    const rLast = DRIVER_TRIP_SOURCE_RANK[lastSource] ?? 0;
    if (rIn < rLast) {
      return { apply: false, reason: 'same_revision_lower_source_rank' };
    }
  }
  return { apply: true };
}
