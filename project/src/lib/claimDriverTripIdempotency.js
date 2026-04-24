/**
 * Phase 1 — server-side idempotency claim for driver trip actions (Supabase RPC).
 */

export async function claimDriverTripIdempotency(supabase, { driverId, tripId, action, idempotencyKey }) {
  if (!supabase?.rpc || !driverId || !tripId || !action || !idempotencyKey) {
    return { ok: false, firstClaim: false, error: new Error('missing_params') };
  }
  const { data, error } = await supabase.rpc('claim_driver_trip_idempotency', {
    p_driver_id: driverId,
    p_trip_id: String(tripId),
    p_action: String(action),
    p_key: idempotencyKey,
  });
  if (error) {
    return { ok: false, firstClaim: false, error };
  }
  return { ok: true, firstClaim: data === true, error: null };
}
