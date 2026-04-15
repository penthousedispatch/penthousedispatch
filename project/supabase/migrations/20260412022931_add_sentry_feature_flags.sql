/*
  # Add Sentry feature flags to sentry_config

  ## Summary
  Extends the sentry_config table with per-feature enable/disable toggles so
  each integration capability (assigned trips polling, marketplace trips,
  trip accept/reject, trip status updates, driver sync, vehicle sync, vehicle
  location push, waypoint ETAs, driver work shifts, and TP-side trip retrieval)
  can be independently configured without touching code.

  ## New columns
  - feat_assigned_trips     — poll /trips.json for assigned trips
  - feat_marketplace_trips  — poll /marketplace_trips.json
  - feat_trip_accept_reject — enable accept/reject calls
  - feat_trip_status_update — enable trip status update calls (incl. completion)
  - feat_drivers            — enable driver create/update/sync
  - feat_vehicles           — enable vehicle create/update/sync
  - feat_vehicle_locations  — enable GPS location push to Sentry
  - feat_waypoint_etas      — enable vehicle waypoint ETA updates
  - feat_driver_work_shifts — enable driver work shift polling
  - feat_retrieve_trips     — enable /gc/retrieve_trips.json endpoint

  All default to TRUE so existing behaviour is preserved.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentry_config' AND column_name = 'feat_assigned_trips') THEN
    ALTER TABLE sentry_config ADD COLUMN feat_assigned_trips boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentry_config' AND column_name = 'feat_marketplace_trips') THEN
    ALTER TABLE sentry_config ADD COLUMN feat_marketplace_trips boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentry_config' AND column_name = 'feat_trip_accept_reject') THEN
    ALTER TABLE sentry_config ADD COLUMN feat_trip_accept_reject boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentry_config' AND column_name = 'feat_trip_status_update') THEN
    ALTER TABLE sentry_config ADD COLUMN feat_trip_status_update boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentry_config' AND column_name = 'feat_drivers') THEN
    ALTER TABLE sentry_config ADD COLUMN feat_drivers boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentry_config' AND column_name = 'feat_vehicles') THEN
    ALTER TABLE sentry_config ADD COLUMN feat_vehicles boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentry_config' AND column_name = 'feat_vehicle_locations') THEN
    ALTER TABLE sentry_config ADD COLUMN feat_vehicle_locations boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentry_config' AND column_name = 'feat_waypoint_etas') THEN
    ALTER TABLE sentry_config ADD COLUMN feat_waypoint_etas boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentry_config' AND column_name = 'feat_driver_work_shifts') THEN
    ALTER TABLE sentry_config ADD COLUMN feat_driver_work_shifts boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sentry_config' AND column_name = 'feat_retrieve_trips') THEN
    ALTER TABLE sentry_config ADD COLUMN feat_retrieve_trips boolean DEFAULT true;
  END IF;
END $$;
