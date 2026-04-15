/*
  # Add SentryMS External ID Columns

  ## Summary
  Adds the external ID and integration columns needed to fully link local records
  with SentryMS records for bidirectional sync.

  ## Changes

  ### drivers table
  - `sentry_driver_id` (text) - The driver ID returned by SentryMS after creation/sync.
    Used for update, deactivate, and credential push calls.

  ### vehicles table
  - `sentry_vehicle_id` (text) - The vehicle ID returned by SentryMS after creation/sync.
    Used for update, deactivate, and GPS location push calls.

  ### marketplace_trips table
  - `sentry_last_modified_at` (text) - The last_modified_at timestamp sent by SentryMS.
    Required parameter when calling the trip reject endpoint.

  ### trip_assignments table
  - `trip_processing_status_id` (integer) - Tracks SentryMS acceptance workflow state.
    0 = processed/pending, 1 = accepted, 2 = rejected

  ### sentry_config table
  - `last_gps_push_at` (timestamptz) - Timestamp of last GPS location push to SentryMS.
    Used by SUPERVISOR GAMMA to determine recency without re-querying logs.

  ## Security
  No RLS changes required; columns inherit existing table policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'sentry_driver_id'
  ) THEN
    ALTER TABLE drivers ADD COLUMN sentry_driver_id text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'sentry_vehicle_id'
  ) THEN
    ALTER TABLE vehicles ADD COLUMN sentry_vehicle_id text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketplace_trips' AND column_name = 'sentry_last_modified_at'
  ) THEN
    ALTER TABLE marketplace_trips ADD COLUMN sentry_last_modified_at text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trip_assignments' AND column_name = 'trip_processing_status_id'
  ) THEN
    ALTER TABLE trip_assignments ADD COLUMN trip_processing_status_id integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sentry_config' AND column_name = 'last_gps_push_at'
  ) THEN
    ALTER TABLE sentry_config ADD COLUMN last_gps_push_at timestamptz;
  END IF;
END $$;
