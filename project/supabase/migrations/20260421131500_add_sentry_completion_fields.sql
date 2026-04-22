ALTER TABLE public.trip_assignments
  ADD COLUMN IF NOT EXISTS collected_fare numeric,
  ADD COLUMN IF NOT EXISTS is_next_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_day_requested_at timestamptz;
