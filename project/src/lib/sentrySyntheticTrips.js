export function looksLikeSyntheticMarketplaceTripId(value = '') {
  const id = String(value || '').trim().toUpperCase();
  return (
    id.startsWith('LOCAL-TEST-') ||
    id.startsWith('TEST-TRIP-') ||
    id.startsWith('AUDIT-TRIP-') ||
    id.startsWith('AUDIT-OFFER-') ||
    id.startsWith('AUDIT-QUEUE-') ||
    id.startsWith('TST-MKT-')
  );
}

export function isSyntheticMarketplaceTrip(trip = {}, options = {}) {
  const raw = trip?.raw_payload && typeof trip.raw_payload === 'object' ? trip.raw_payload : {};
  const assignmentTypeCode = String(
    trip?.assignment_type_code ||
    raw?.assignment_type_code ||
    ''
  ).trim().toUpperCase();
  const source = String(raw?.source || '').trim();
  const sourceLc = source.toLowerCase();
  const externalStatus = String(trip?.external_trip_status || '').trim().toLowerCase();
  const penthouseHarnessSource =
    sourceLc.startsWith('penthouse_local') || sourceLc.startsWith('penthouse_test');

  return Boolean(
    options?.isTestTrip ||
    options?.localOnlyTestTrip ||
    trip?.localOnlyTestTrip ||
    looksLikeSyntheticMarketplaceTripId(trip?.sentry_trip_id) ||
    assignmentTypeCode === 'TEST' ||
    assignmentTypeCode === 'LOCAL_TEST' ||
    sourceLc.includes('local_test') ||
    sourceLc.includes('test_mode') ||
    penthouseHarnessSource ||
    externalStatus === 'local_test'
  );
}
