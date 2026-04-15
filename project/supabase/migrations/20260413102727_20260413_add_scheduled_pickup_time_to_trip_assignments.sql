/*
  # Add scheduled_pickup_time to trip_assignments

  ## Changes
  - Adds `scheduled_pickup_time` timestamptz column to trip_assignments
    for proper time-based querying and driver route views
  - Adds `actual_pickup_time` and `actual_dropoff_time` for tracking real times
  - These columns are nullable to not break existing records
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trip_assignments' AND column_name = 'scheduled_pickup_time'
  ) THEN
    ALTER TABLE trip_assignments ADD COLUMN scheduled_pickup_time timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trip_assignments' AND column_name = 'actual_pickup_time'
  ) THEN
    ALTER TABLE trip_assignments ADD COLUMN actual_pickup_time timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trip_assignments' AND column_name = 'actual_dropoff_time'
  ) THEN
    ALTER TABLE trip_assignments ADD COLUMN actual_dropoff_time timestamptz;
  END IF;
END $$;
