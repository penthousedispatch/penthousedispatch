-- Company owners can move their own dispatch assignments through local statuses.
-- Insert was added in the previous migration; this covers follow-up updates like accept/reject/complete.

DROP POLICY IF EXISTS "Company owners can update trip assignments" ON public.trip_assignments;
CREATE POLICY "Company owners can update trip assignments"
ON public.trip_assignments
FOR UPDATE
TO authenticated
USING (
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = trip_assignments.company_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = trip_assignments.company_id
      AND c.owner_user_id = (SELECT auth.uid())
  )
);
