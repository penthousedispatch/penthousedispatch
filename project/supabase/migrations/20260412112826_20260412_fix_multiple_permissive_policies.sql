/*
  # Fix Multiple Permissive Policies

  Consolidates tables that have multiple permissive policies for the same
  role/action combination into a single policy each. Multiple permissive
  policies OR their conditions together which is functionally correct but
  triggers a Supabase security advisor warning and adds unnecessary overhead.

  Tables fixed:
    - companies (SELECT, UPDATE)
    - company_agreements (SELECT)
    - driver_pay_config (SELECT)
    - drivers (SELECT, INSERT, UPDATE)
    - feature_flags (SELECT)
    - invoices (SELECT)
    - payments (SELECT)
    - profiles (SELECT)
    - sentry_sync_log (SELECT)
    - trips (SELECT, UPDATE)
    - vehicles (SELECT)
*/

-- ─── companies ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all companies" ON public.companies;
DROP POLICY IF EXISTS "Company owner can read own company" ON public.companies;
DROP POLICY IF EXISTS "Admins can update all companies" ON public.companies;
DROP POLICY IF EXISTS "Company owner can update own company" ON public.companies;

CREATE POLICY "Authorized users can read companies" ON public.companies FOR SELECT TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin')
  );

CREATE POLICY "Authorized users can update companies" ON public.companies FOR UPDATE TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin')
  )
  WITH CHECK (
    owner_user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin')
  );

-- ─── company_agreements ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all agreements" ON public.company_agreements;
DROP POLICY IF EXISTS "Company owner can read own agreements" ON public.company_agreements;

CREATE POLICY "Authorized users can read agreements" ON public.company_agreements FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin')
  );

-- ─── driver_pay_config ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all pay configs" ON public.driver_pay_config;
DROP POLICY IF EXISTS "Company owner can read own pay config" ON public.driver_pay_config;

CREATE POLICY "Authorized users can read pay configs" ON public.driver_pay_config FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = driver_pay_config.company_id AND c.owner_user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin')
  );

-- ─── drivers ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Dispatchers and admins can read all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can read own record" ON public.drivers;
DROP POLICY IF EXISTS "Org members can view their drivers" ON public.drivers;
DROP POLICY IF EXISTS "Admins and dispatchers can insert drivers" ON public.drivers;
DROP POLICY IF EXISTS "Org members can insert drivers" ON public.drivers;
DROP POLICY IF EXISTS "Admins and dispatchers can update all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can update own status and location" ON public.drivers;
DROP POLICY IF EXISTS "Org members can update drivers" ON public.drivers;

CREATE POLICY "Authorized users can read drivers" ON public.drivers FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher'))
    OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Authorized users can insert drivers" ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher'))
    OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Authorized users can update drivers" ON public.drivers FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher'))
    OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher'))
    OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()))
  );

-- ─── feature_flags ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage feature flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Authenticated users can read feature flags" ON public.feature_flags;

CREATE POLICY "Authorized users can read feature flags" ON public.feature_flags FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- ─── invoices ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Company can read own invoices" ON public.invoices;

CREATE POLICY "Authorized users can read invoices" ON public.invoices FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = invoices.company_id AND c.owner_user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin')
  );

-- ─── payments ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all payments" ON public.payments;
DROP POLICY IF EXISTS "Company can read own payments" ON public.payments;

CREATE POLICY "Authorized users can read payments" ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = payments.company_id AND c.owner_user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin')
  );

-- ─── profiles ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;

CREATE POLICY "Authorized users can read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()))
  );

-- ─── sentry_sync_log ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read sync logs" ON public.sentry_sync_log;
DROP POLICY IF EXISTS "Org members can view sync log" ON public.sentry_sync_log;

CREATE POLICY "Authorized users can view sync log" ON public.sentry_sync_log FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin')
  );

-- ─── trips ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Dispatchers and admins can read all trips" ON public.trips;
DROP POLICY IF EXISTS "Drivers can read assigned trips" ON public.trips;
DROP POLICY IF EXISTS "Dispatchers can update trips" ON public.trips;
DROP POLICY IF EXISTS "Drivers can update own trip status" ON public.trips;

CREATE POLICY "Authorized users can read trips" ON public.trips FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher'))
    OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = (SELECT auth.uid()) AND d.id = trips.driver_id)
  );

CREATE POLICY "Authorized users can update trips" ON public.trips FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher'))
    OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = (SELECT auth.uid()) AND d.id = trips.driver_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher'))
    OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = (SELECT auth.uid()) AND d.id = trips.driver_id)
  );

-- ─── vehicles ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins and dispatchers can manage vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can read vehicles" ON public.vehicles;

CREATE POLICY "Authorized users can read vehicles" ON public.vehicles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
