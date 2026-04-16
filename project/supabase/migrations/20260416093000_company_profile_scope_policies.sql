-- Normalize subscriber-company access around profiles.company_id so
-- companies, drivers, invoices, and pay settings stay scoped even when
-- owner_user_id is blank or later reassigned.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS company_id uuid;

UPDATE public.profiles p
SET company_id = c.id
FROM public.companies c
WHERE c.owner_user_id = p.id
  AND p.company_id IS NULL;

DROP POLICY IF EXISTS "Company profile can read scoped company" ON public.companies;
CREATE POLICY "Company profile can read scoped company"
ON public.companies
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Company profile can update scoped company" ON public.companies;
CREATE POLICY "Company profile can update scoped company"
ON public.companies
FOR UPDATE
TO authenticated
USING (
  id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
)
WITH CHECK (
  id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Company profile can view scoped drivers" ON public.drivers;
CREATE POLICY "Company profile can view scoped drivers"
ON public.drivers
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Company profile can insert scoped drivers" ON public.drivers;
CREATE POLICY "Company profile can insert scoped drivers"
ON public.drivers
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Company profile can update scoped drivers" ON public.drivers;
CREATE POLICY "Company profile can update scoped drivers"
ON public.drivers
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

DROP POLICY IF EXISTS "Company profile can delete scoped drivers" ON public.drivers;
CREATE POLICY "Company profile can delete scoped drivers"
ON public.drivers
FOR DELETE
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Company profile can view billing trips" ON public.billing_trips;
CREATE POLICY "Company profile can view billing trips"
ON public.billing_trips
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Company profile can read invoices" ON public.invoices;
CREATE POLICY "Company profile can read invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Company profile can read payments" ON public.payments;
CREATE POLICY "Company profile can read payments"
ON public.payments
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Company profile can read pay config" ON public.driver_pay_config;
CREATE POLICY "Company profile can read pay config"
ON public.driver_pay_config
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Company profile can insert pay config" ON public.driver_pay_config;
CREATE POLICY "Company profile can insert pay config"
ON public.driver_pay_config
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Company profile can update pay config" ON public.driver_pay_config;
CREATE POLICY "Company profile can update pay config"
ON public.driver_pay_config
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
