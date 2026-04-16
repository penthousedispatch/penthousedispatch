-- Allow company owners to dispatch for their own business without needing org membership.

DROP POLICY IF EXISTS "Company owners can view own drivers" ON public.drivers;
CREATE POLICY "Company owners can view own drivers"
ON public.drivers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = drivers.company_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Company owners can insert own drivers" ON public.drivers;
CREATE POLICY "Company owners can insert own drivers"
ON public.drivers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Company owners can update own drivers" ON public.drivers;
CREATE POLICY "Company owners can update own drivers"
ON public.drivers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = drivers.company_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Company owners can delete own drivers" ON public.drivers;
CREATE POLICY "Company owners can delete own drivers"
ON public.drivers
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = drivers.company_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Company owners can view marketplace trips" ON public.marketplace_trips;
CREATE POLICY "Company owners can view marketplace trips"
ON public.marketplace_trips
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.owner_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Company owners can update marketplace trips" ON public.marketplace_trips;
CREATE POLICY "Company owners can update marketplace trips"
ON public.marketplace_trips
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.owner_user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.owner_user_id = (SELECT auth.uid())
  )
);
