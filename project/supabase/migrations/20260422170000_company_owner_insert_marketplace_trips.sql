-- Company owners could SELECT/UPDATE marketplace trips but had no INSERT policy,
-- so upserts from the dispatch app failed for users who are not org_members.

DROP POLICY IF EXISTS "Company owners can insert marketplace trips" ON public.marketplace_trips;

CREATE POLICY "Company owners can insert marketplace trips"
ON public.marketplace_trips
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = marketplace_trips.company_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Company profile can insert marketplace trips" ON public.marketplace_trips;

CREATE POLICY "Company profile can insert marketplace trips"
ON public.marketplace_trips
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'company'
      AND p.company_id IS NOT NULL
      AND p.company_id = marketplace_trips.company_id
  )
);
