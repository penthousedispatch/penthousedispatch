-- Expose Sentry / broker routing metadata on marketplace rows for dispatch UI and strict checklist §17.

ALTER TABLE public.marketplace_trips
  ADD COLUMN IF NOT EXISTS assignment_type_code text NOT NULL DEFAULT '';

ALTER TABLE public.marketplace_trips
  ADD COLUMN IF NOT EXISTS external_trip_status text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.marketplace_trips.assignment_type_code IS 'Sentry assignment_type_code (or equivalent) from last inbound payload or poll.';
COMMENT ON COLUMN public.marketplace_trips.external_trip_status IS 'Raw trip_status / status string from Sentry before Penthouse deriveMarketplaceTripStatus.';
