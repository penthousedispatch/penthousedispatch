-- EXAMPLE ONLY — destructive. Duplicate your DB before running anything here.
--
-- Goal: Clear in-progress driver assignment noise so riders only see work that
-- came from a fresh Sentry pull + assign (STY-* trips).
--
-- 1. Open Supabase → SQL Editor
-- 2. Replace :company_id with your companies.id (UUID) or widen the WHERE carefully
-- 3. Review row counts using SELECT-only queries first.

-- Preview rows that would be closed (drivers on your company):

-- SELECT id, trip_id, driver_id, status
-- FROM trip_assignments
-- WHERE driver_id IN (SELECT id FROM drivers WHERE company_id = :company_id)
--   AND status IN ('pending', 'assigned', 'accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip');

/*
UPDATE trip_assignments
SET
  status = 'rejected',
  trip_processing_status_id = 2,
  rejected_at = now(),
  notes = COALESCE(notes,'') || ' [bulk_reset]'
WHERE driver_id IN (SELECT id FROM drivers WHERE company_id = '00000000-0000-0000-0000-000000000000')
  AND status IN ('pending', 'assigned', 'accepted', 'arrived', 'picked_up', 'in_progress', 'on_trip');
*/
