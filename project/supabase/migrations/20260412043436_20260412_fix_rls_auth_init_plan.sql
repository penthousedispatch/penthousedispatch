/*
  # Fix RLS Auth Initialization Plan

  ## Summary
  Replaces all bare `auth.uid()` calls in RLS policies with `(select auth.uid())`
  so Postgres can evaluate them once per query instead of once per row.
  This significantly improves query performance at scale.

  ## Tables affected
  profiles, vehicles, members, trips, trip_status_history, driver_locations,
  messages, notifications, dispatch_rules, sentry_sync_log, drivers, org_members,
  organizations, marketplace_trips, incentives, driver_incentive_enrollments,
  ai_settings, ai_logs, companies, company_agreements, billing_trips, invoices,
  payments, feature_flags, webhook_logs, driver_pay_config, security_threats,
  security_events, threat_research_jobs, mitre_techniques, security_alerts,
  threat_intel, security_scans, auto_scheduler_runs, integration_partners,
  driver_tax_info, integration_test_runs, integration_webhooks, driver_bank_accounts,
  driver_earnings_log, payout_partners, driver_payouts, admin_chat_messages,
  driver_tax_documents, auto_scheduler_config
*/

-- ── profiles ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Org members can read all profiles" ON public.profiles;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Org members can read all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (
    ((select auth.uid()) = id)
    OR (EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.user_id = (select auth.uid())
        AND om.org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = om.id)
    ))
  );

-- ── vehicles ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins and dispatchers can manage vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins and dispatchers can update vehicles" ON public.vehicles;

CREATE POLICY "Admins and dispatchers can manage vehicles" ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

CREATE POLICY "Admins and dispatchers can update vehicles" ON public.vehicles FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

-- ── members ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated staff can read members" ON public.members;
DROP POLICY IF EXISTS "Authenticated staff can insert members" ON public.members;
DROP POLICY IF EXISTS "Authenticated staff can update members" ON public.members;

CREATE POLICY "Authenticated staff can read members" ON public.members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

CREATE POLICY "Authenticated staff can insert members" ON public.members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

CREATE POLICY "Authenticated staff can update members" ON public.members FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

-- ── trips ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Dispatchers and admins can read all trips" ON public.trips;
DROP POLICY IF EXISTS "Dispatchers can insert trips" ON public.trips;
DROP POLICY IF EXISTS "Dispatchers can update trips" ON public.trips;
DROP POLICY IF EXISTS "Drivers can read assigned trips" ON public.trips;
DROP POLICY IF EXISTS "Drivers can update own trip status" ON public.trips;

CREATE POLICY "Dispatchers and admins can read all trips" ON public.trips FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

CREATE POLICY "Dispatchers can insert trips" ON public.trips FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

CREATE POLICY "Dispatchers can update trips" ON public.trips FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

CREATE POLICY "Drivers can read assigned trips" ON public.trips FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM drivers d
    WHERE d.user_id = (select auth.uid()) AND d.id = trips.driver_id
  ));

CREATE POLICY "Drivers can update own trip status" ON public.trips FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM drivers d
    WHERE d.user_id = (select auth.uid()) AND d.id = trips.driver_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM drivers d
    WHERE d.user_id = (select auth.uid()) AND d.id = trips.driver_id
  ));

-- ── trip_status_history ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone authenticated can insert trip history" ON public.trip_status_history;
DROP POLICY IF EXISTS "Staff can read trip history" ON public.trip_status_history;

CREATE POLICY "Anyone authenticated can insert trip history" ON public.trip_status_history FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Staff can read trip history" ON public.trip_status_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

-- ── driver_locations ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Dispatchers can read all locations" ON public.driver_locations;
DROP POLICY IF EXISTS "Drivers can insert own locations" ON public.driver_locations;

CREATE POLICY "Dispatchers can read all locations" ON public.driver_locations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

CREATE POLICY "Drivers can insert own locations" ON public.driver_locations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM drivers
    WHERE drivers.user_id = (select auth.uid()) AND drivers.id = driver_locations.driver_id
  ));

-- ── messages ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can mark own messages read" ON public.messages;
DROP POLICY IF EXISTS "Users can read own messages" ON public.messages;

CREATE POLICY "Authenticated users can send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = (select auth.uid()));

CREATE POLICY "Users can mark own messages read" ON public.messages FOR UPDATE TO authenticated
  USING (receiver_id = (select auth.uid()))
  WITH CHECK (receiver_id = (select auth.uid()));

CREATE POLICY "Users can read own messages" ON public.messages FOR SELECT TO authenticated
  USING ((sender_id = (select auth.uid())) OR (receiver_id = (select auth.uid())));

-- ── notifications ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ── dispatch_rules ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert dispatch rules" ON public.dispatch_rules;
DROP POLICY IF EXISTS "Admins can manage dispatch rules" ON public.dispatch_rules;
DROP POLICY IF EXISTS "Admins can update dispatch rules" ON public.dispatch_rules;

CREATE POLICY "Admins can insert dispatch rules" ON public.dispatch_rules FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can manage dispatch rules" ON public.dispatch_rules FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

CREATE POLICY "Admins can update dispatch rules" ON public.dispatch_rules FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

-- ── sentry_sync_log ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read sync logs" ON public.sentry_sync_log;
DROP POLICY IF EXISTS "Org members can view sync log" ON public.sentry_sync_log;
DROP POLICY IF EXISTS "Org members can insert sync log" ON public.sentry_sync_log;
DROP POLICY IF EXISTS "System can insert sync logs" ON public.sentry_sync_log;

CREATE POLICY "Admins can read sync logs" ON public.sentry_sync_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Org members can view sync log" ON public.sentry_sync_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
  ));

CREATE POLICY "Org members can insert sync log" ON public.sentry_sync_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
  ));

CREATE POLICY "System can insert sync logs" ON public.sentry_sync_log FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── drivers ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins and dispatchers can insert drivers" ON public.drivers;
DROP POLICY IF EXISTS "Admins and dispatchers can update all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Dispatchers and admins can delete drivers" ON public.drivers;
DROP POLICY IF EXISTS "Dispatchers and admins can read all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can read own record" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can update own status and location" ON public.drivers;
DROP POLICY IF EXISTS "Org members can insert drivers" ON public.drivers;
DROP POLICY IF EXISTS "Org members can update drivers" ON public.drivers;
DROP POLICY IF EXISTS "Org members can view their drivers" ON public.drivers;

CREATE POLICY "Dispatchers and admins can read all drivers" ON public.drivers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

CREATE POLICY "Admins and dispatchers can insert drivers" ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

CREATE POLICY "Admins and dispatchers can update all drivers" ON public.drivers FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = ANY (ARRAY['admin','dispatcher'])
  ));

CREATE POLICY "Dispatchers and admins can delete drivers" ON public.drivers FOR DELETE TO authenticated
  USING (
    (select auth.uid()) IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','dispatcher']))
    OR (select auth.uid()) IN (SELECT org_members.user_id FROM org_members)
  );

CREATE POLICY "Drivers can read own record" ON public.drivers FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Drivers can update own status and location" ON public.drivers FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Org members can insert drivers" ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
  ));

CREATE POLICY "Org members can update drivers" ON public.drivers FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
  ));

CREATE POLICY "Org members can view their drivers" ON public.drivers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
  ));

-- ── org_members ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert their own membership" ON public.org_members;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.org_members;

CREATE POLICY "Users can insert their own membership" ON public.org_members FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can view their own memberships" ON public.org_members FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- ── organizations ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admins can update their org" ON public.organizations;
DROP POLICY IF EXISTS "Org members can view their org" ON public.organizations;

CREATE POLICY "Org admins can update their org" ON public.organizations FOR UPDATE TO authenticated
  USING (id IN (
    SELECT org_members.org_id FROM org_members
    WHERE org_members.user_id = (select auth.uid()) AND org_members.role = 'admin'
  ))
  WITH CHECK (id IN (
    SELECT org_members.org_id FROM org_members
    WHERE org_members.user_id = (select auth.uid()) AND org_members.role = 'admin'
  ));

CREATE POLICY "Org members can view their org" ON public.organizations FOR SELECT TO authenticated
  USING (id IN (
    SELECT org_members.org_id FROM org_members
    WHERE org_members.user_id = (select auth.uid())
  ));

-- ── marketplace_trips ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can insert trips" ON public.marketplace_trips;
DROP POLICY IF EXISTS "Org members can update trips" ON public.marketplace_trips;
DROP POLICY IF EXISTS "Org members can view trips" ON public.marketplace_trips;

CREATE POLICY "Org members can insert trips" ON public.marketplace_trips FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
  ));

CREATE POLICY "Org members can update trips" ON public.marketplace_trips FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
  ));

CREATE POLICY "Org members can view trips" ON public.marketplace_trips FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
  ));

-- ── incentives ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can view incentives" ON public.incentives;
DROP POLICY IF EXISTS "Org members can insert incentives" ON public.incentives;
DROP POLICY IF EXISTS "Org members can update incentives" ON public.incentives;
DROP POLICY IF EXISTS "Org members can delete incentives" ON public.incentives;

CREATE POLICY "Org members can view incentives" ON public.incentives FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())));

CREATE POLICY "Org members can insert incentives" ON public.incentives FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())));

CREATE POLICY "Org members can update incentives" ON public.incentives FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())));

CREATE POLICY "Org members can delete incentives" ON public.incentives FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())));

-- ── driver_incentive_enrollments ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can view enrollments" ON public.driver_incentive_enrollments;
DROP POLICY IF EXISTS "Org members can insert enrollments" ON public.driver_incentive_enrollments;
DROP POLICY IF EXISTS "Org members can update enrollments" ON public.driver_incentive_enrollments;
DROP POLICY IF EXISTS "Org members can delete enrollments" ON public.driver_incentive_enrollments;

CREATE POLICY "Org members can view enrollments" ON public.driver_incentive_enrollments FOR SELECT TO authenticated
  USING (incentive_id IN (
    SELECT i.id FROM incentives i
    JOIN org_members om ON om.org_id = i.org_id
    WHERE om.user_id = (select auth.uid())
  ));

CREATE POLICY "Org members can insert enrollments" ON public.driver_incentive_enrollments FOR INSERT TO authenticated
  WITH CHECK (incentive_id IN (
    SELECT i.id FROM incentives i
    JOIN org_members om ON om.org_id = i.org_id
    WHERE om.user_id = (select auth.uid())
  ));

CREATE POLICY "Org members can update enrollments" ON public.driver_incentive_enrollments FOR UPDATE TO authenticated
  USING (incentive_id IN (
    SELECT i.id FROM incentives i
    JOIN org_members om ON om.org_id = i.org_id
    WHERE om.user_id = (select auth.uid())
  ))
  WITH CHECK (incentive_id IN (
    SELECT i.id FROM incentives i
    JOIN org_members om ON om.org_id = i.org_id
    WHERE om.user_id = (select auth.uid())
  ));

CREATE POLICY "Org members can delete enrollments" ON public.driver_incentive_enrollments FOR DELETE TO authenticated
  USING (incentive_id IN (
    SELECT i.id FROM incentives i
    JOIN org_members om ON om.org_id = i.org_id
    WHERE om.user_id = (select auth.uid())
  ));

-- ── ai_settings ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can view ai_settings" ON public.ai_settings;
DROP POLICY IF EXISTS "Org members can insert ai_settings" ON public.ai_settings;
DROP POLICY IF EXISTS "Org members can update ai_settings" ON public.ai_settings;

CREATE POLICY "Org members can view ai_settings" ON public.ai_settings FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())));

CREATE POLICY "Org members can insert ai_settings" ON public.ai_settings FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())));

CREATE POLICY "Org members can update ai_settings" ON public.ai_settings FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())));

-- ── ai_logs ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can view ai_logs" ON public.ai_logs;
DROP POLICY IF EXISTS "Org members can insert ai_logs" ON public.ai_logs;
DROP POLICY IF EXISTS "Org members can delete ai_logs" ON public.ai_logs;

CREATE POLICY "Org members can view ai_logs" ON public.ai_logs FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())));

CREATE POLICY "Org members can insert ai_logs" ON public.ai_logs FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())));

CREATE POLICY "Org members can delete ai_logs" ON public.ai_logs FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_members.org_id FROM org_members WHERE org_members.user_id = (select auth.uid())));

-- ── companies ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all companies" ON public.companies;
DROP POLICY IF EXISTS "Admins can update all companies" ON public.companies;
DROP POLICY IF EXISTS "Company owner can insert own company" ON public.companies;
DROP POLICY IF EXISTS "Company owner can read own company" ON public.companies;
DROP POLICY IF EXISTS "Company owner can update own company" ON public.companies;

CREATE POLICY "Admins can read all companies" ON public.companies FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can update all companies" ON public.companies FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Company owner can insert own company" ON public.companies FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_user_id);

CREATE POLICY "Company owner can read own company" ON public.companies FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_user_id);

CREATE POLICY "Company owner can update own company" ON public.companies FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_user_id)
  WITH CHECK ((select auth.uid()) = owner_user_id);

-- ── company_agreements ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all agreements" ON public.company_agreements;
DROP POLICY IF EXISTS "Company owner can insert own agreement" ON public.company_agreements;
DROP POLICY IF EXISTS "Company owner can read own agreements" ON public.company_agreements;

CREATE POLICY "Admins can read all agreements" ON public.company_agreements FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Company owner can insert own agreement" ON public.company_agreements FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Company owner can read own agreements" ON public.company_agreements FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- ── billing_trips ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert billing trips" ON public.billing_trips;
DROP POLICY IF EXISTS "Admins can read all billing trips" ON public.billing_trips;

CREATE POLICY "Admins can insert billing trips" ON public.billing_trips FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read all billing trips" ON public.billing_trips FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

-- ── invoices ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can read all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Company can read own invoices" ON public.invoices;

CREATE POLICY "Admins can insert invoices" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read all invoices" ON public.invoices FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can update invoices" ON public.invoices FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Company can read own invoices" ON public.invoices FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT companies.id FROM companies
    WHERE companies.owner_user_id = (select auth.uid())
  ));

-- ── payments ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can read all payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Company can read own payments" ON public.payments;

CREATE POLICY "Admins can insert payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read all payments" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can update payments" ON public.payments FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Company can read own payments" ON public.payments FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT companies.id FROM companies
    WHERE companies.owner_user_id = (select auth.uid())
  ));

-- ── feature_flags ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage feature flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Admins can update feature flags" ON public.feature_flags;

CREATE POLICY "Admins can manage feature flags" ON public.feature_flags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can update feature flags" ON public.feature_flags FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

-- ── webhook_logs ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read webhook logs" ON public.webhook_logs;

CREATE POLICY "Admins can read webhook logs" ON public.webhook_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

-- ── driver_pay_config ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all pay configs" ON public.driver_pay_config;
DROP POLICY IF EXISTS "Company owner can insert pay config" ON public.driver_pay_config;
DROP POLICY IF EXISTS "Company owner can read own pay config" ON public.driver_pay_config;
DROP POLICY IF EXISTS "Company owner can update pay config" ON public.driver_pay_config;

CREATE POLICY "Admins can read all pay configs" ON public.driver_pay_config FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Company owner can insert pay config" ON public.driver_pay_config FOR INSERT TO authenticated
  WITH CHECK (company_id IN (
    SELECT companies.id FROM companies WHERE companies.owner_user_id = (select auth.uid())
  ));

CREATE POLICY "Company owner can read own pay config" ON public.driver_pay_config FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT companies.id FROM companies WHERE companies.owner_user_id = (select auth.uid())
  ));

CREATE POLICY "Company owner can update pay config" ON public.driver_pay_config FOR UPDATE TO authenticated
  USING (company_id IN (
    SELECT companies.id FROM companies WHERE companies.owner_user_id = (select auth.uid())
  ))
  WITH CHECK (company_id IN (
    SELECT companies.id FROM companies WHERE companies.owner_user_id = (select auth.uid())
  ));

-- ── security_threats ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read security_threats" ON public.security_threats;
DROP POLICY IF EXISTS "Admins can insert security_threats" ON public.security_threats;
DROP POLICY IF EXISTS "Admins can update security_threats" ON public.security_threats;
DROP POLICY IF EXISTS "Admins can delete security_threats" ON public.security_threats;

CREATE POLICY "Admins can read security_threats" ON public.security_threats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert security_threats" ON public.security_threats FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can update security_threats" ON public.security_threats FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can delete security_threats" ON public.security_threats FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- ── security_events ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read security_events" ON public.security_events;
DROP POLICY IF EXISTS "Admins can insert security_events" ON public.security_events;
DROP POLICY IF EXISTS "System can insert security_events" ON public.security_events;

CREATE POLICY "Admins can read security_events" ON public.security_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert security_events" ON public.security_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- ── threat_research_jobs ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read threat_research_jobs" ON public.threat_research_jobs;
DROP POLICY IF EXISTS "Admins can insert threat_research_jobs" ON public.threat_research_jobs;
DROP POLICY IF EXISTS "Admins can update threat_research_jobs" ON public.threat_research_jobs;

CREATE POLICY "Admins can read threat_research_jobs" ON public.threat_research_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert threat_research_jobs" ON public.threat_research_jobs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can update threat_research_jobs" ON public.threat_research_jobs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- ── mitre_techniques ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read mitre_techniques" ON public.mitre_techniques;
DROP POLICY IF EXISTS "Admins can insert mitre_techniques" ON public.mitre_techniques;
DROP POLICY IF EXISTS "Admins can update mitre_techniques" ON public.mitre_techniques;
DROP POLICY IF EXISTS "Admins can delete mitre_techniques" ON public.mitre_techniques;

CREATE POLICY "Admins can read mitre_techniques" ON public.mitre_techniques FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert mitre_techniques" ON public.mitre_techniques FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can update mitre_techniques" ON public.mitre_techniques FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can delete mitre_techniques" ON public.mitre_techniques FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- ── security_alerts ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read security_alerts" ON public.security_alerts;
DROP POLICY IF EXISTS "Admins can insert security_alerts" ON public.security_alerts;
DROP POLICY IF EXISTS "Admins can update security_alerts" ON public.security_alerts;
DROP POLICY IF EXISTS "Admins can delete security_alerts" ON public.security_alerts;

CREATE POLICY "Admins can read security_alerts" ON public.security_alerts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert security_alerts" ON public.security_alerts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can update security_alerts" ON public.security_alerts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can delete security_alerts" ON public.security_alerts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- ── threat_intel ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read threat intel" ON public.threat_intel;

CREATE POLICY "Admins can read threat intel" ON public.threat_intel FOR SELECT TO authenticated
  USING ((select auth.uid()) IN (SELECT profiles.id FROM profiles WHERE profiles.role = 'admin'));

-- ── security_scans ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read security scans" ON public.security_scans;

CREATE POLICY "Admins can read security scans" ON public.security_scans FOR SELECT TO authenticated
  USING ((select auth.uid()) IN (SELECT profiles.id FROM profiles WHERE profiles.role = 'admin'));

-- ── auto_scheduler_runs ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can read scheduler runs" ON public.auto_scheduler_runs;
DROP POLICY IF EXISTS "Org members can insert scheduler runs" ON public.auto_scheduler_runs;

CREATE POLICY "Org members can read scheduler runs" ON public.auto_scheduler_runs FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT auto_scheduler_runs.org_id FROM profiles WHERE profiles.id = (select auth.uid())
  ));

CREATE POLICY "Org members can insert scheduler runs" ON public.auto_scheduler_runs FOR INSERT TO authenticated
  WITH CHECK (org_id IN (
    SELECT auto_scheduler_runs.org_id FROM profiles WHERE profiles.id = (select auth.uid())
  ));

-- ── integration_partners ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read integration_partners" ON public.integration_partners;
DROP POLICY IF EXISTS "Admins can insert integration_partners" ON public.integration_partners;
DROP POLICY IF EXISTS "Admins can update integration_partners" ON public.integration_partners;
DROP POLICY IF EXISTS "Admins can delete integration_partners" ON public.integration_partners;

CREATE POLICY "Admins can read integration_partners" ON public.integration_partners FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert integration_partners" ON public.integration_partners FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can update integration_partners" ON public.integration_partners FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can delete integration_partners" ON public.integration_partners FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- ── driver_tax_info ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Drivers can view own tax info" ON public.driver_tax_info;
DROP POLICY IF EXISTS "Drivers can insert own tax info" ON public.driver_tax_info;
DROP POLICY IF EXISTS "Drivers can update own tax info" ON public.driver_tax_info;

CREATE POLICY "Drivers can view own tax info" ON public.driver_tax_info FOR SELECT TO authenticated
  USING (
    (driver_id IN (SELECT drivers.id FROM drivers WHERE drivers.id = driver_tax_info.driver_id AND (auth.uid())::text = (drivers.id)::text))
    OR (EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])))
  );

CREATE POLICY "Drivers can insert own tax info" ON public.driver_tax_info FOR INSERT TO authenticated
  WITH CHECK (
    (driver_id IN (SELECT drivers.id FROM drivers WHERE drivers.id = driver_tax_info.driver_id AND (auth.uid())::text = (drivers.id)::text))
    OR (EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])))
  );

CREATE POLICY "Drivers can update own tax info" ON public.driver_tax_info FOR UPDATE TO authenticated
  USING (
    (driver_id IN (SELECT drivers.id FROM drivers WHERE drivers.id = driver_tax_info.driver_id AND (auth.uid())::text = (drivers.id)::text))
    OR (EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])))
  )
  WITH CHECK (
    (driver_id IN (SELECT drivers.id FROM drivers WHERE drivers.id = driver_tax_info.driver_id AND (auth.uid())::text = (drivers.id)::text))
    OR (EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])))
  );

-- ── integration_test_runs ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read integration_test_runs" ON public.integration_test_runs;
DROP POLICY IF EXISTS "Admins can insert integration_test_runs" ON public.integration_test_runs;
DROP POLICY IF EXISTS "Admins can update integration_test_runs" ON public.integration_test_runs;

CREATE POLICY "Admins can read integration_test_runs" ON public.integration_test_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert integration_test_runs" ON public.integration_test_runs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can update integration_test_runs" ON public.integration_test_runs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- ── integration_webhooks ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read integration_webhooks" ON public.integration_webhooks;
DROP POLICY IF EXISTS "Admins can insert integration_webhooks" ON public.integration_webhooks;

CREATE POLICY "Admins can read integration_webhooks" ON public.integration_webhooks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert integration_webhooks" ON public.integration_webhooks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- ── driver_bank_accounts ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Drivers can view own bank accounts" ON public.driver_bank_accounts;
DROP POLICY IF EXISTS "Drivers can insert own bank accounts" ON public.driver_bank_accounts;
DROP POLICY IF EXISTS "Drivers can update own bank accounts" ON public.driver_bank_accounts;

CREATE POLICY "Drivers can view own bank accounts" ON public.driver_bank_accounts FOR SELECT TO authenticated
  USING (
    (driver_id IN (SELECT drivers.id FROM drivers WHERE drivers.id = driver_bank_accounts.driver_id AND ((select auth.uid())::text = (drivers.id)::text)))
    OR (EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','dispatcher','superadmin'])))
  );

CREATE POLICY "Drivers can insert own bank accounts" ON public.driver_bank_accounts FOR INSERT TO authenticated
  WITH CHECK (
    (driver_id IN (SELECT drivers.id FROM drivers WHERE drivers.id = driver_bank_accounts.driver_id AND ((select auth.uid())::text = (drivers.id)::text)))
    OR (EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])))
  );

CREATE POLICY "Drivers can update own bank accounts" ON public.driver_bank_accounts FOR UPDATE TO authenticated
  USING (
    (driver_id IN (SELECT drivers.id FROM drivers WHERE drivers.id = driver_bank_accounts.driver_id AND ((select auth.uid())::text = (drivers.id)::text)))
    OR (EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])))
  )
  WITH CHECK (
    (driver_id IN (SELECT drivers.id FROM drivers WHERE drivers.id = driver_bank_accounts.driver_id AND ((select auth.uid())::text = (drivers.id)::text)))
    OR (EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])))
  );

-- ── driver_earnings_log ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Drivers can view own earnings log" ON public.driver_earnings_log;
DROP POLICY IF EXISTS "Admins and dispatchers can insert earnings log" ON public.driver_earnings_log;
DROP POLICY IF EXISTS "Admins can update earnings log" ON public.driver_earnings_log;

CREATE POLICY "Drivers can view own earnings log" ON public.driver_earnings_log FOR SELECT TO authenticated
  USING (
    (driver_id IN (SELECT drivers.id FROM drivers WHERE drivers.id = driver_earnings_log.driver_id AND ((select auth.uid())::text = (drivers.id)::text)))
    OR (EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','dispatcher','superadmin'])))
  );

CREATE POLICY "Admins and dispatchers can insert earnings log" ON public.driver_earnings_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
      AND org_members.role = ANY (ARRAY['admin','dispatcher','superadmin'])
  ));

CREATE POLICY "Admins can update earnings log" ON public.driver_earnings_log FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ));

-- ── payout_partners ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admins can view payout partners" ON public.payout_partners;
DROP POLICY IF EXISTS "Org admins can insert payout partners" ON public.payout_partners;
DROP POLICY IF EXISTS "Org admins can update payout partners" ON public.payout_partners;

CREATE POLICY "Org admins can view payout partners" ON public.payout_partners FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
      AND org_members.org_id = payout_partners.org_id
      AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ));

CREATE POLICY "Org admins can insert payout partners" ON public.payout_partners FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
      AND org_members.org_id = payout_partners.org_id
      AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ));

CREATE POLICY "Org admins can update payout partners" ON public.payout_partners FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
      AND org_members.org_id = payout_partners.org_id
      AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid())
      AND org_members.org_id = payout_partners.org_id
      AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ));

-- ── driver_payouts ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Drivers can view own payouts" ON public.driver_payouts;
DROP POLICY IF EXISTS "Admins can insert payouts" ON public.driver_payouts;
DROP POLICY IF EXISTS "Admins can update payouts" ON public.driver_payouts;

CREATE POLICY "Drivers can view own payouts" ON public.driver_payouts FOR SELECT TO authenticated
  USING (
    (driver_id IN (SELECT drivers.id FROM drivers WHERE drivers.id = driver_payouts.driver_id AND ((select auth.uid())::text = (drivers.id)::text)))
    OR (EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','dispatcher','superadmin'])))
  );

CREATE POLICY "Admins can insert payouts" ON public.driver_payouts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ));

CREATE POLICY "Admins can update payouts" ON public.driver_payouts FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ));

-- ── admin_chat_messages ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can read chat messages" ON public.admin_chat_messages;
DROP POLICY IF EXISTS "Org members can insert chat messages" ON public.admin_chat_messages;
DROP POLICY IF EXISTS "Org members can delete chat messages" ON public.admin_chat_messages;

CREATE POLICY "Org members can read chat messages" ON public.admin_chat_messages FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT admin_chat_messages.org_id FROM profiles WHERE profiles.id = (select auth.uid())
  ));

CREATE POLICY "Org members can insert chat messages" ON public.admin_chat_messages FOR INSERT TO authenticated
  WITH CHECK (org_id IN (
    SELECT admin_chat_messages.org_id FROM profiles WHERE profiles.id = (select auth.uid())
  ));

CREATE POLICY "Org members can delete chat messages" ON public.admin_chat_messages FOR DELETE TO authenticated
  USING (org_id IN (
    SELECT admin_chat_messages.org_id FROM profiles WHERE profiles.id = (select auth.uid())
  ));

-- ── driver_tax_documents ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Drivers can view own tax documents" ON public.driver_tax_documents;
DROP POLICY IF EXISTS "Admins can insert tax documents" ON public.driver_tax_documents;
DROP POLICY IF EXISTS "Admins can update tax documents" ON public.driver_tax_documents;

CREATE POLICY "Drivers can view own tax documents" ON public.driver_tax_documents FOR SELECT TO authenticated
  USING (
    (driver_id IN (SELECT drivers.id FROM drivers WHERE drivers.id = driver_tax_documents.driver_id AND ((select auth.uid())::text = (drivers.id)::text)))
    OR (EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])))
  );

CREATE POLICY "Admins can insert tax documents" ON public.driver_tax_documents FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ));

CREATE POLICY "Admins can update tax documents" ON public.driver_tax_documents FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = (select auth.uid()) AND org_members.role = ANY (ARRAY['admin','superadmin'])
  ));

-- ── auto_scheduler_config ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can read scheduler config" ON public.auto_scheduler_config;
DROP POLICY IF EXISTS "Org members can insert scheduler config" ON public.auto_scheduler_config;
DROP POLICY IF EXISTS "Org members can update scheduler config" ON public.auto_scheduler_config;

CREATE POLICY "Org members can read scheduler config" ON public.auto_scheduler_config FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT auto_scheduler_config.org_id FROM profiles WHERE profiles.id = (select auth.uid())
  ));

CREATE POLICY "Org members can insert scheduler config" ON public.auto_scheduler_config FOR INSERT TO authenticated
  WITH CHECK (org_id IN (
    SELECT auto_scheduler_config.org_id FROM profiles WHERE profiles.id = (select auth.uid())
  ));

CREATE POLICY "Org members can update scheduler config" ON public.auto_scheduler_config FOR UPDATE TO authenticated
  USING (org_id IN (
    SELECT auto_scheduler_config.org_id FROM profiles WHERE profiles.id = (select auth.uid())
  ))
  WITH CHECK (org_id IN (
    SELECT auto_scheduler_config.org_id FROM profiles WHERE profiles.id = (select auth.uid())
  ));
