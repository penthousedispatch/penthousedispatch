ALTER TABLE public.auto_scheduler_config
  ADD COLUMN IF NOT EXISTS traffic_weight numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS zone_weight numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS preschedule_from_work_shifts boolean NOT NULL DEFAULT false;

ALTER TABLE public.trip_assignments
  ADD COLUMN IF NOT EXISTS do_time text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS scheduled_dropoff_time timestamptz;
