/*
  Prevent multiple *active* local rows for the same trip or the same driver.
  Cleans up existing duplicates (keeps highest workflow progress), then adds partial unique indexes.
*/

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY trip_id
      ORDER BY
        CASE lower(trim(coalesce(status, '')))
          WHEN 'picked_up' THEN 4
          WHEN 'arrived' THEN 3
          WHEN 'accepted' THEN 2
          WHEN 'pending' THEN 1
          ELSE 0
        END DESC,
        coalesce(accepted_at, assigned_at, now()) DESC
    ) AS rn
  FROM public.trip_assignments
  WHERE lower(trim(coalesce(status, ''))) IN ('pending', 'accepted', 'arrived', 'picked_up')
)
DELETE FROM public.trip_assignments ta
USING ranked r
WHERE ta.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY driver_id
      ORDER BY
        CASE lower(trim(coalesce(status, '')))
          WHEN 'picked_up' THEN 4
          WHEN 'arrived' THEN 3
          WHEN 'accepted' THEN 2
          WHEN 'pending' THEN 1
          ELSE 0
        END DESC,
        coalesce(accepted_at, assigned_at, now()) DESC
    ) AS rn
  FROM public.trip_assignments
  WHERE driver_id IS NOT NULL
    AND lower(trim(coalesce(status, ''))) IN ('pending', 'accepted', 'arrived', 'picked_up')
)
DELETE FROM public.trip_assignments ta
USING ranked r
WHERE ta.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS trip_assignments_one_active_trip_id_unique
  ON public.trip_assignments (trip_id)
  WHERE lower(trim(coalesce(status, ''))) IN ('pending', 'accepted', 'arrived', 'picked_up');

CREATE UNIQUE INDEX IF NOT EXISTS trip_assignments_one_active_driver_id_unique
  ON public.trip_assignments (driver_id)
  WHERE driver_id IS NOT NULL
    AND lower(trim(coalesce(status, ''))) IN ('pending', 'accepted', 'arrived', 'picked_up');
