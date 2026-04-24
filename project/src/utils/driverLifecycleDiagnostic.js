/**
 * Staging / QA: monotonic lifecycle diagnostics for driver trip state.
 *
 * Enable verbose JSON logs:
 *   - Vite: VITE_DRIVER_LIFECYCLE_DIAG=1
 *   - Runtime (no rebuild): localStorage.setItem('pd_driver_lifecycle_diag', '1')
 *
 * Regressions (backward stage applied): always emit console.error with [PD_LIFECYCLE_REGRESSION]
 * so log drains can alert even when verbose is off.
 */

/** Aligns with resolveDriverLifecycleStatus ranking in DriverApp. */
export function lifecycleStageRank(stage) {
  const s = String(stage || '').toLowerCase();
  const rank = {
    '': 0,
    pending: 0,
    assigned: 1,
    accepted: 2,
    in_progress: 3,
    arrived: 3,
    on_trip: 4,
    picked_up: 4,
    completed: 5,
    cancelled: 5,
    canceled: 5,
    no_show: 5,
    /** Declining an offer is not an earlier “active leg” stage than assigned/pending. */
    rejected: 1,
  };
  return Object.prototype.hasOwnProperty.call(rank, s) ? rank[s] : 0;
}

export function isDriverLifecycleDiagnosticVerbose() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage?.getItem('pd_driver_lifecycle_diag') === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    return String(import.meta.env?.VITE_DRIVER_LIFECYCLE_DIAG || '') === '1';
  } catch {
    return false;
  }
}

/**
 * True when applied stage moves strictly earlier in the driver progression than fromStage.
 * Terminals (completed / cancelled / no_show) are high rank; dropping from terminal to active is backward.
 */
export function isBackwardLifecycleStageChange(fromStage, toStage) {
  if (!fromStage || !toStage) return false;
  return lifecycleStageRank(toStage) < lifecycleStageRank(fromStage);
}

function buildLifecycleLogPayload({
  timestamp,
  source,
  driverId,
  tripId,
  fromStage,
  toStage,
  proposedStage,
  revision,
  decision,
  reason,
  skipBackwardCheck,
}) {
  const backward = skipBackwardCheck
    ? false
    : isBackwardLifecycleStageChange(fromStage, toStage);
  const proposedBackward =
    !skipBackwardCheck &&
    proposedStage != null &&
    isBackwardLifecycleStageChange(fromStage, String(proposedStage || '').toLowerCase());
  return {
    tag: 'PD_DRIVER_LIFECYCLE',
    timestamp,
    source,
    driver_id: driverId,
    trip_id: tripId,
    from_stage: fromStage || '',
    to_stage: toStage || '',
    proposed_stage: proposedStage != null ? String(proposedStage) : null,
    revision: revision != null ? revision : null,
    decision,
    reason: reason || '',
    backward_transition: backward,
    proposed_was_backward: Boolean(proposedBackward),
    monotonic_ok: !backward || decision === 'rejected',
  };
}

/**
 * @param {object} opts
 * @param {string} opts.source
 * @param {string|null} opts.driverId
 * @param {string|null} opts.tripId
 * @param {string} opts.fromStage - last committed stage for this trip (or '')
 * @param {string} opts.toStage - stage being committed / applied to UI
 * @param {string|null} [opts.proposedStage] - optional raw incoming stage before guard/lock
 * @param {string|number|null} [opts.revision]
 * @param {'accepted'|'rejected'} opts.decision
 * @param {string} [opts.reason]
 * @param {boolean} [opts.skipBackwardCheck] - terminal clears / offer reject paths
 */
export function logDriverLifecycleStateWrite(opts) {
  const timestamp = new Date().toISOString();
  const payload = buildLifecycleLogPayload({
    timestamp,
    ...opts,
    skipBackwardCheck: Boolean(opts.skipBackwardCheck),
  });
  const backward = payload.backward_transition;
  const acceptedBackward = backward && opts.decision === 'accepted';

  if (acceptedBackward) {
    // eslint-disable-next-line no-console
    console.error('[PD_LIFECYCLE_REGRESSION]', JSON.stringify(payload));
    return payload;
  }

  if (opts.decision === 'rejected' && (backward || payload.proposed_was_backward)) {
    // Blocked backward pressure (e.g. lock). Staging KPI: count should trend to zero with clean sync.
    // eslint-disable-next-line no-console
    console.warn('[PD_LIFECYCLE_BACKWARD_BLOCKED]', JSON.stringify(payload));
  }

  if (isDriverLifecycleDiagnosticVerbose()) {
    // eslint-disable-next-line no-console
    console.info('[PD_LIFECYCLE]', JSON.stringify(payload));
  }

  return payload;
}
