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
  const source = String(raw?.source || '').trim().toLowerCase();
  const externalStatus = String(trip?.external_trip_status || '').trim().toLowerCase();

  return Boolean(
    options?.isTestTrip ||
    options?.localOnlyTestTrip ||
    trip?.localOnlyTestTrip ||
    looksLikeSyntheticMarketplaceTripId(trip?.sentry_trip_id) ||
    assignmentTypeCode === 'TEST' ||
    assignmentTypeCode === 'LOCAL_TEST' ||
    source.includes('local_test') ||
    source.includes('test_mode') ||
    source.includes('sandbox') ||
    externalStatus === 'local_test'
  );
}
