-- Let company dispatch/admin sessions create and manage assignments for their own company drivers.
-- This is intentionally scoped by company_id and driver.company_id so it does not reopen broad assignment writes.

DROP POLICY IF EXISTS "Company owners can insert trip assignments" ON public.trip_assignments;
CREATE POLICY "Company owners can insert trip assignments"
ON public.trip_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = trip_assignments.company_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.id = trip_assignments.driver_id
      AND d.company_id = trip_assignments.company_id
  )
);

DROP POLICY IF EXISTS "Company profiles can insert trip assignments" ON public.trip_assignments;
CREATE POLICY "Company profiles can insert trip assignments"
ON public.trip_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
  AND EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.id = trip_assignments.driver_id
      AND d.company_id = trip_assignments.company_id
  )
);

DROP POLICY IF EXISTS "Platform admins can insert trip assignments" ON public.trip_assignments;
CREATE POLICY "Platform admins can insert trip assignments"
ON public.trip_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
  AND EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.id = trip_assignments.driver_id
      AND d.company_id = trip_assignments.company_id
  )
);

DROP POLICY IF EXISTS "Company profiles can update trip assignments" ON public.trip_assignments;
CREATE POLICY "Company profiles can update trip assignments"
ON public.trip_assignments
FOR UPDATE
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
)
WITH CHECK (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Platform admins can update trip assignments" ON public.trip_assignments;
CREATE POLICY "Platform admins can update trip assignments"
ON public.trip_assignments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
);
