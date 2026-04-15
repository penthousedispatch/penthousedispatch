ALTER TABLE public.auto_scheduler_config
  ADD COLUMN IF NOT EXISTS short_trip_max_miles numeric NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS short_trip_bonus_weight numeric NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS chaining_weight numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS shared_ride_bonus_weight numeric NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS traffic_buffer_pct integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS shared_rides_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS billing_rate_per_mile numeric NOT NULL DEFAULT 0.13;

ALTER TABLE public.trip_assignments
  ADD COLUMN IF NOT EXISTS scheduled_order integer,
  ADD COLUMN IF NOT EXISTS travel_time_mins integer,
  ADD COLUMN IF NOT EXISTS pickup_distance_miles numeric;

ALTER TABLE public.billing_trips
  ALTER COLUMN rate SET DEFAULT 0.13;

DROP POLICY IF EXISTS "Admins can insert billing trips" ON public.billing_trips;
DROP POLICY IF EXISTS "Admins can read all billing trips" ON public.billing_trips;
DROP POLICY IF EXISTS "Ops can insert billing trips" ON public.billing_trips;
DROP POLICY IF EXISTS "Ops can read billing trips" ON public.billing_trips;
DROP POLICY IF EXISTS "Company can read own billing trips" ON public.billing_trips;

CREATE POLICY "Ops can insert billing trips" ON public.billing_trips FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::text, 'dispatcher'::text])
  ));

CREATE POLICY "Ops can read billing trips" ON public.billing_trips FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::text, 'dispatcher'::text])
  ));

CREATE POLICY "Company can read own billing trips" ON public.billing_trips FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.companies
    WHERE companies.owner_user_id = (SELECT auth.uid())
      AND companies.id = billing_trips.company_id
  ));
