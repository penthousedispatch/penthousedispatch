import { logFailure } from './errorHandler';

export const DEFAULT_BILLING_RATE_PER_MILE = 0.13;

export async function syncCompletedTripBilling({
  supabase,
  role,
  daysBack = 45,
  ratePerMile = DEFAULT_BILLING_RATE_PER_MILE,
}) {
  if (!supabase || !['admin', 'dispatcher'].includes(role)) {
    return { inserted: 0, skipped: 0 };
  }

  const since = new Date(Date.now() - (daysBack * 86400000)).toISOString();
  const safeRate = Number(ratePerMile) > 0 ? Number(ratePerMile) : DEFAULT_BILLING_RATE_PER_MILE;

  const { data: completedAssignments, error: assignmentsError } = await supabase
    .from('trip_assignments')
    .select('trip_id, mileage, updated_at, drivers(company_id)')
    .eq('status', 'completed')
    .gte('updated_at', since)
    .not('trip_id', 'is', null);

  if (assignmentsError) {
    logFailure('syncCompletedTripBilling:assignments', assignmentsError);
    return { inserted: 0, skipped: 0, error: assignmentsError.message };
  }

  if (!completedAssignments?.length) {
    return { inserted: 0, skipped: 0 };
  }

  const tripIds = completedAssignments
    .map(assignment => assignment.trip_id)
    .filter(Boolean);

  const { data: existingRows, error: existingError } = await supabase
    .from('billing_trips')
    .select('trip_id')
    .in('trip_id', tripIds);

  if (existingError) {
    logFailure('syncCompletedTripBilling:existingRows', existingError);
    return { inserted: 0, skipped: completedAssignments.length, error: existingError.message };
  }

  const existingTripIds = new Set((existingRows || []).map(row => row.trip_id));
  const rowsToInsert = completedAssignments
    .filter(assignment => {
      const companyId = assignment.drivers?.company_id;
      return assignment.trip_id && companyId && !existingTripIds.has(assignment.trip_id);
    })
    .map(assignment => {
      const miles = Math.max(0, Number(assignment.mileage) || 0);
      return {
        trip_id: assignment.trip_id,
        company_id: assignment.drivers.company_id,
        miles,
        rate: safeRate,
        platform_fee: Number((miles * safeRate).toFixed(2)),
        billing_status: 'pending',
        calculated_at: assignment.updated_at || new Date().toISOString(),
      };
    });

  if (!rowsToInsert.length) {
    return { inserted: 0, skipped: completedAssignments.length };
  }

  const { error: insertError } = await supabase
    .from('billing_trips')
    .insert(rowsToInsert);

  if (insertError) {
    logFailure('syncCompletedTripBilling:insert', insertError);
    return { inserted: 0, skipped: completedAssignments.length - rowsToInsert.length, error: insertError.message };
  }

  return {
    inserted: rowsToInsert.length,
    skipped: completedAssignments.length - rowsToInsert.length,
  };
}
