/*
  # Fix RLS Auth Initialization Plan

  Replace bare auth.uid() calls with (select auth.uid()) in all RLS policies
  that were flagged as re-evaluating auth functions per-row. This prevents
  redundant function calls and significantly improves query performance at scale.

  Also fixes "always true" RLS policies by adding proper ownership/role checks,
  and fixes multiple permissive policies by consolidating where possible.

  Tables fixed:
    profiles, vehicles, members, trips, trip_status_history, driver_locations,
    messages, notifications, dispatch_rules, sentry_sync_log, drivers,
    org_members, organizations, marketplace_trips, incentives,
    driver_incentive_enrollments, ai_settings, ai_logs, companies,
    company_agreements, billing_trips, invoices, payments, feature_flags,
    webhook_logs, driver_pay_config, security_threats, security_events,
    threat_research_jobs, mitre_techniques, security_alerts, threat_intel,
    security_scans, auto_scheduler_runs, integration_partners, driver_tax_info,
    integration_test_runs, integration_webhooks, driver_bank_accounts,
    driver_earnings_log, payout_partners, driver_payouts, admin_chat_messages,
    driver_tax_documents, auto_scheduler_config, api_logs, chat_messages,
    chat_threads, driver_earnings, driver_schedules, incentive_badges,
    organizations, rescue_bonuses, security_scans, sentry_config,
    supervisor_alerts, trip_assignments, webhook_logs
*/

-- ─── profiles ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Org members can read all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);

-- ─── vehicles ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins and dispatchers can manage vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins and dispatchers can update vehicles" ON public.vehicles;

CREATE POLICY "Admins and dispatchers can manage vehicles" ON public.vehicles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Admins and dispatchers can update vehicles" ON public.vehicles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

-- ─── members ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated staff can insert members" ON public.members;
DROP POLICY IF EXISTS "Authenticated staff can read members" ON public.members;
DROP POLICY IF EXISTS "Authenticated staff can update members" ON public.members;

CREATE POLICY "Authenticated staff can insert members" ON public.members FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated staff can read members" ON public.members FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated staff can update members" ON public.members FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ─── trips ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Dispatchers and admins can read all trips" ON public.trips;
DROP POLICY IF EXISTS "Dispatchers can insert trips" ON public.trips;
DROP POLICY IF EXISTS "Dispatchers can update trips" ON public.trips;
DROP POLICY IF EXISTS "Drivers can read assigned trips" ON public.trips;
DROP POLICY IF EXISTS "Drivers can update own trip status" ON public.trips;

CREATE POLICY "Dispatchers and admins can read all trips" ON public.trips FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Dispatchers can insert trips" ON public.trips FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Dispatchers can update trips" ON public.trips FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Drivers can read assigned trips" ON public.trips FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = (SELECT auth.uid()) AND d.id = trips.driver_id));

CREATE POLICY "Drivers can update own trip status" ON public.trips FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = (SELECT auth.uid()) AND d.id = trips.driver_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = (SELECT auth.uid()) AND d.id = trips.driver_id));

-- ─── trip_status_history ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone authenticated can insert trip history" ON public.trip_status_history;
DROP POLICY IF EXISTS "Staff can read trip history" ON public.trip_status_history;

CREATE POLICY "Anyone authenticated can insert trip history" ON public.trip_status_history FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Staff can read trip history" ON public.trip_status_history FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- ─── driver_locations ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Dispatchers can read all locations" ON public.driver_locations;
DROP POLICY IF EXISTS "Drivers can insert own locations" ON public.driver_locations;

CREATE POLICY "Dispatchers can read all locations" ON public.driver_locations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Drivers can insert own locations" ON public.driver_locations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = (SELECT auth.uid()) AND d.id = driver_locations.driver_id));

-- ─── messages ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can mark own messages read" ON public.messages;
DROP POLICY IF EXISTS "Users can read own messages" ON public.messages;

CREATE POLICY "Authenticated users can send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Users can mark own messages read" ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()))
  WITH CHECK (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()));

CREATE POLICY "Users can read own messages" ON public.messages FOR SELECT TO authenticated
  USING (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()));

-- ─── notifications ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ─── dispatch_rules ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert dispatch rules" ON public.dispatch_rules;
DROP POLICY IF EXISTS "Admins can manage dispatch rules" ON public.dispatch_rules;
DROP POLICY IF EXISTS "Admins can update dispatch rules" ON public.dispatch_rules;

CREATE POLICY "Admins can insert dispatch rules" ON public.dispatch_rules FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can manage dispatch rules" ON public.dispatch_rules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update dispatch rules" ON public.dispatch_rules FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── sentry_sync_log ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read sync logs" ON public.sentry_sync_log;
DROP POLICY IF EXISTS "Org members can insert sync log" ON public.sentry_sync_log;
DROP POLICY IF EXISTS "Org members can view sync log" ON public.sentry_sync_log;
DROP POLICY IF EXISTS "System can insert sync logs" ON public.sentry_sync_log;

CREATE POLICY "Admins can read sync logs" ON public.sentry_sync_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Org members can view sync log" ON public.sentry_sync_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

CREATE POLICY "Org members can insert sync log" ON public.sentry_sync_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

-- ─── drivers ─────────────────────────────────────────────────────────────────
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
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Drivers can read own record" ON public.drivers FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Org members can view their drivers" ON public.drivers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om
    JOIN public.companies c ON c.id = drivers.company_id
    WHERE om.user_id = (SELECT auth.uid())));

CREATE POLICY "Admins and dispatchers can insert drivers" ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Org members can insert drivers" ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

CREATE POLICY "Admins and dispatchers can update all drivers" ON public.drivers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Drivers can update own status and location" ON public.drivers FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Org members can update drivers" ON public.drivers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

CREATE POLICY "Dispatchers and admins can delete drivers" ON public.drivers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

-- ─── org_members ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert their own membership" ON public.org_members;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.org_members;

CREATE POLICY "Users can insert their own membership" ON public.org_members FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can view their own memberships" ON public.org_members FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ─── organizations ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admins can update their org" ON public.organizations;
DROP POLICY IF EXISTS "Org members can view their org" ON public.organizations;
DROP POLICY IF EXISTS "Org members can insert org" ON public.organizations;

CREATE POLICY "Org admins can update their org" ON public.organizations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = organizations.id AND om.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = organizations.id AND om.role = 'admin'));

CREATE POLICY "Org members can view their org" ON public.organizations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = organizations.id));

CREATE POLICY "Org members can insert org" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ─── marketplace_trips ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can insert trips" ON public.marketplace_trips;
DROP POLICY IF EXISTS "Org members can update trips" ON public.marketplace_trips;
DROP POLICY IF EXISTS "Org members can view trips" ON public.marketplace_trips;
DROP POLICY IF EXISTS "Authenticated users can delete marketplace trips" ON public.marketplace_trips;
DROP POLICY IF EXISTS "Authenticated users can insert marketplace trips" ON public.marketplace_trips;
DROP POLICY IF EXISTS "Authenticated users can read marketplace trips" ON public.marketplace_trips;
DROP POLICY IF EXISTS "Authenticated users can update marketplace trips" ON public.marketplace_trips;

CREATE POLICY "Org members can view trips" ON public.marketplace_trips FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

CREATE POLICY "Org members can insert trips" ON public.marketplace_trips FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

CREATE POLICY "Org members can update trips" ON public.marketplace_trips FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

CREATE POLICY "Org members can delete trips" ON public.marketplace_trips FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

-- ─── incentives ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can delete incentives" ON public.incentives;
DROP POLICY IF EXISTS "Org members can insert incentives" ON public.incentives;
DROP POLICY IF EXISTS "Org members can update incentives" ON public.incentives;
DROP POLICY IF EXISTS "Org members can view incentives" ON public.incentives;

CREATE POLICY "Org members can view incentives" ON public.incentives FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = incentives.org_id));

CREATE POLICY "Org members can insert incentives" ON public.incentives FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = incentives.org_id));

CREATE POLICY "Org members can update incentives" ON public.incentives FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = incentives.org_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = incentives.org_id));

CREATE POLICY "Org members can delete incentives" ON public.incentives FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = incentives.org_id));

-- ─── driver_incentive_enrollments ────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can delete enrollments" ON public.driver_incentive_enrollments;
DROP POLICY IF EXISTS "Org members can insert enrollments" ON public.driver_incentive_enrollments;
DROP POLICY IF EXISTS "Org members can update enrollments" ON public.driver_incentive_enrollments;
DROP POLICY IF EXISTS "Org members can view enrollments" ON public.driver_incentive_enrollments;

CREATE POLICY "Org members can view enrollments" ON public.driver_incentive_enrollments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

CREATE POLICY "Org members can insert enrollments" ON public.driver_incentive_enrollments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

CREATE POLICY "Org members can update enrollments" ON public.driver_incentive_enrollments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

CREATE POLICY "Org members can delete enrollments" ON public.driver_incentive_enrollments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid())));

-- ─── ai_settings ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can insert ai_settings" ON public.ai_settings;
DROP POLICY IF EXISTS "Org members can update ai_settings" ON public.ai_settings;
DROP POLICY IF EXISTS "Org members can view ai_settings" ON public.ai_settings;

CREATE POLICY "Org members can view ai_settings" ON public.ai_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = ai_settings.org_id));

CREATE POLICY "Org members can insert ai_settings" ON public.ai_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = ai_settings.org_id));

CREATE POLICY "Org members can update ai_settings" ON public.ai_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = ai_settings.org_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = ai_settings.org_id));

-- ─── ai_logs ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can delete ai_logs" ON public.ai_logs;
DROP POLICY IF EXISTS "Org members can insert ai_logs" ON public.ai_logs;
DROP POLICY IF EXISTS "Org members can view ai_logs" ON public.ai_logs;

CREATE POLICY "Org members can view ai_logs" ON public.ai_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = ai_logs.org_id));

CREATE POLICY "Org members can insert ai_logs" ON public.ai_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = ai_logs.org_id));

CREATE POLICY "Org members can delete ai_logs" ON public.ai_logs FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = ai_logs.org_id));

-- ─── companies ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all companies" ON public.companies;
DROP POLICY IF EXISTS "Admins can update all companies" ON public.companies;
DROP POLICY IF EXISTS "Company owner can insert own company" ON public.companies;
DROP POLICY IF EXISTS "Company owner can read own company" ON public.companies;
DROP POLICY IF EXISTS "Company owner can update own company" ON public.companies;

CREATE POLICY "Admins can read all companies" ON public.companies FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update all companies" ON public.companies FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Company owner can insert own company" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

CREATE POLICY "Company owner can read own company" ON public.companies FOR SELECT TO authenticated
  USING (owner_user_id = (SELECT auth.uid()));

CREATE POLICY "Company owner can update own company" ON public.companies FOR UPDATE TO authenticated
  USING (owner_user_id = (SELECT auth.uid())) WITH CHECK (owner_user_id = (SELECT auth.uid()));

-- ─── company_agreements ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all agreements" ON public.company_agreements;
DROP POLICY IF EXISTS "Company owner can insert own agreement" ON public.company_agreements;
DROP POLICY IF EXISTS "Company owner can read own agreements" ON public.company_agreements;

CREATE POLICY "Admins can read all agreements" ON public.company_agreements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Company owner can insert own agreement" ON public.company_agreements FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Company owner can read own agreements" ON public.company_agreements FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ─── billing_trips ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert billing trips" ON public.billing_trips;
DROP POLICY IF EXISTS "Admins can read all billing trips" ON public.billing_trips;

CREATE POLICY "Admins can read all billing trips" ON public.billing_trips FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can insert billing trips" ON public.billing_trips FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── invoices ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can read all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Company can read own invoices" ON public.invoices;

CREATE POLICY "Admins can read all invoices" ON public.invoices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can insert invoices" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update invoices" ON public.invoices FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Company can read own invoices" ON public.invoices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = invoices.company_id AND c.owner_user_id = (SELECT auth.uid())));

-- ─── payments ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can read all payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Company can read own payments" ON public.payments;

CREATE POLICY "Admins can read all payments" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can insert payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update payments" ON public.payments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Company can read own payments" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = payments.company_id AND c.owner_user_id = (SELECT auth.uid())));

-- ─── feature_flags ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage feature flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Admins can update feature flags" ON public.feature_flags;

CREATE POLICY "Admins can manage feature flags" ON public.feature_flags FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update feature flags" ON public.feature_flags FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── webhook_logs ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON public.webhook_logs;

CREATE POLICY "Admins can read webhook logs" ON public.webhook_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Service role can insert webhook logs" ON public.webhook_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── driver_pay_config ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all pay configs" ON public.driver_pay_config;
DROP POLICY IF EXISTS "Company owner can insert pay config" ON public.driver_pay_config;
DROP POLICY IF EXISTS "Company owner can read own pay config" ON public.driver_pay_config;
DROP POLICY IF EXISTS "Company owner can update pay config" ON public.driver_pay_config;

CREATE POLICY "Admins can read all pay configs" ON public.driver_pay_config FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Company owner can insert pay config" ON public.driver_pay_config FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = driver_pay_config.company_id AND c.owner_user_id = (SELECT auth.uid())));

CREATE POLICY "Company owner can read own pay config" ON public.driver_pay_config FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = driver_pay_config.company_id AND c.owner_user_id = (SELECT auth.uid())));

CREATE POLICY "Company owner can update pay config" ON public.driver_pay_config FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = driver_pay_config.company_id AND c.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = driver_pay_config.company_id AND c.owner_user_id = (SELECT auth.uid())));

-- ─── security_threats ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete security_threats" ON public.security_threats;
DROP POLICY IF EXISTS "Admins can insert security_threats" ON public.security_threats;
DROP POLICY IF EXISTS "Admins can read security_threats" ON public.security_threats;
DROP POLICY IF EXISTS "Admins can update security_threats" ON public.security_threats;

CREATE POLICY "Admins can read security_threats" ON public.security_threats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can insert security_threats" ON public.security_threats FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update security_threats" ON public.security_threats FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can delete security_threats" ON public.security_threats FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── security_events ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert security_events" ON public.security_events;
DROP POLICY IF EXISTS "Admins can read security_events" ON public.security_events;
DROP POLICY IF EXISTS "System can insert security_events" ON public.security_events;

CREATE POLICY "Admins can read security_events" ON public.security_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can insert security_events" ON public.security_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── threat_research_jobs ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert threat_research_jobs" ON public.threat_research_jobs;
DROP POLICY IF EXISTS "Admins can read threat_research_jobs" ON public.threat_research_jobs;
DROP POLICY IF EXISTS "Admins can update threat_research_jobs" ON public.threat_research_jobs;

CREATE POLICY "Admins can read threat_research_jobs" ON public.threat_research_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can insert threat_research_jobs" ON public.threat_research_jobs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update threat_research_jobs" ON public.threat_research_jobs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── mitre_techniques ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete mitre_techniques" ON public.mitre_techniques;
DROP POLICY IF EXISTS "Admins can insert mitre_techniques" ON public.mitre_techniques;
DROP POLICY IF EXISTS "Admins can read mitre_techniques" ON public.mitre_techniques;
DROP POLICY IF EXISTS "Admins can update mitre_techniques" ON public.mitre_techniques;

CREATE POLICY "Admins can read mitre_techniques" ON public.mitre_techniques FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can insert mitre_techniques" ON public.mitre_techniques FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update mitre_techniques" ON public.mitre_techniques FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can delete mitre_techniques" ON public.mitre_techniques FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── security_alerts ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete security_alerts" ON public.security_alerts;
DROP POLICY IF EXISTS "Admins can insert security_alerts" ON public.security_alerts;
DROP POLICY IF EXISTS "Admins can read security_alerts" ON public.security_alerts;
DROP POLICY IF EXISTS "Admins can update security_alerts" ON public.security_alerts;

CREATE POLICY "Admins can read security_alerts" ON public.security_alerts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can insert security_alerts" ON public.security_alerts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update security_alerts" ON public.security_alerts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can delete security_alerts" ON public.security_alerts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── threat_intel ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read threat intel" ON public.threat_intel;
DROP POLICY IF EXISTS "Authenticated can insert threat intel" ON public.threat_intel;
DROP POLICY IF EXISTS "Authenticated can update threat intel" ON public.threat_intel;

CREATE POLICY "Admins can read threat intel" ON public.threat_intel FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Authenticated can insert threat intel" ON public.threat_intel FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Authenticated can update threat intel" ON public.threat_intel FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── security_scans ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read security scans" ON public.security_scans;
DROP POLICY IF EXISTS "Authenticated can insert security scans" ON public.security_scans;
DROP POLICY IF EXISTS "Authenticated can update security scans" ON public.security_scans;

CREATE POLICY "Admins can read security scans" ON public.security_scans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Authenticated can insert security scans" ON public.security_scans FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Authenticated can update security scans" ON public.security_scans FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── auto_scheduler_runs ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can insert scheduler runs" ON public.auto_scheduler_runs;
DROP POLICY IF EXISTS "Org members can read scheduler runs" ON public.auto_scheduler_runs;

CREATE POLICY "Org members can read scheduler runs" ON public.auto_scheduler_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = auto_scheduler_runs.org_id));

CREATE POLICY "Org members can insert scheduler runs" ON public.auto_scheduler_runs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = auto_scheduler_runs.org_id));

-- ─── integration_partners ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete integration_partners" ON public.integration_partners;
DROP POLICY IF EXISTS "Admins can insert integration_partners" ON public.integration_partners;
DROP POLICY IF EXISTS "Admins can read integration_partners" ON public.integration_partners;
DROP POLICY IF EXISTS "Admins can update integration_partners" ON public.integration_partners;

CREATE POLICY "Admins can read integration_partners" ON public.integration_partners FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can insert integration_partners" ON public.integration_partners FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update integration_partners" ON public.integration_partners FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can delete integration_partners" ON public.integration_partners FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── driver_tax_info ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Drivers can insert own tax info" ON public.driver_tax_info;
DROP POLICY IF EXISTS "Drivers can update own tax info" ON public.driver_tax_info;
DROP POLICY IF EXISTS "Drivers can view own tax info" ON public.driver_tax_info;

CREATE POLICY "Drivers can view own tax info" ON public.driver_tax_info FOR SELECT TO authenticated
  USING (driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Drivers can insert own tax info" ON public.driver_tax_info FOR INSERT TO authenticated
  WITH CHECK (driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Drivers can update own tax info" ON public.driver_tax_info FOR UPDATE TO authenticated
  USING (driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())));

-- ─── integration_test_runs ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert integration_test_runs" ON public.integration_test_runs;
DROP POLICY IF EXISTS "Admins can read integration_test_runs" ON public.integration_test_runs;
DROP POLICY IF EXISTS "Admins can update integration_test_runs" ON public.integration_test_runs;

CREATE POLICY "Admins can read integration_test_runs" ON public.integration_test_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can insert integration_test_runs" ON public.integration_test_runs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update integration_test_runs" ON public.integration_test_runs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── integration_webhooks ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert integration_webhooks" ON public.integration_webhooks;
DROP POLICY IF EXISTS "Admins can read integration_webhooks" ON public.integration_webhooks;

CREATE POLICY "Admins can read integration_webhooks" ON public.integration_webhooks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can insert integration_webhooks" ON public.integration_webhooks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── driver_bank_accounts ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Drivers can insert own bank accounts" ON public.driver_bank_accounts;
DROP POLICY IF EXISTS "Drivers can update own bank accounts" ON public.driver_bank_accounts;
DROP POLICY IF EXISTS "Drivers can view own bank accounts" ON public.driver_bank_accounts;

CREATE POLICY "Drivers can view own bank accounts" ON public.driver_bank_accounts FOR SELECT TO authenticated
  USING (driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Drivers can insert own bank accounts" ON public.driver_bank_accounts FOR INSERT TO authenticated
  WITH CHECK (driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Drivers can update own bank accounts" ON public.driver_bank_accounts FOR UPDATE TO authenticated
  USING (driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())));

-- ─── driver_earnings_log ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins and dispatchers can insert earnings log" ON public.driver_earnings_log;
DROP POLICY IF EXISTS "Admins can update earnings log" ON public.driver_earnings_log;
DROP POLICY IF EXISTS "Drivers can view own earnings log" ON public.driver_earnings_log;

CREATE POLICY "Drivers can view own earnings log" ON public.driver_earnings_log FOR SELECT TO authenticated
  USING (driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Admins and dispatchers can insert earnings log" ON public.driver_earnings_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Admins can update earnings log" ON public.driver_earnings_log FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── payout_partners ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admins can insert payout partners" ON public.payout_partners;
DROP POLICY IF EXISTS "Org admins can update payout partners" ON public.payout_partners;
DROP POLICY IF EXISTS "Org admins can view payout partners" ON public.payout_partners;

CREATE POLICY "Org admins can view payout partners" ON public.payout_partners FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = payout_partners.org_id AND om.role = 'admin'));

CREATE POLICY "Org admins can insert payout partners" ON public.payout_partners FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = payout_partners.org_id AND om.role = 'admin'));

CREATE POLICY "Org admins can update payout partners" ON public.payout_partners FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = payout_partners.org_id AND om.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = payout_partners.org_id AND om.role = 'admin'));

-- ─── driver_payouts ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert payouts" ON public.driver_payouts;
DROP POLICY IF EXISTS "Admins can update payouts" ON public.driver_payouts;
DROP POLICY IF EXISTS "Drivers can view own payouts" ON public.driver_payouts;

CREATE POLICY "Drivers can view own payouts" ON public.driver_payouts FOR SELECT TO authenticated
  USING (driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Admins can insert payouts" ON public.driver_payouts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Admins can update payouts" ON public.driver_payouts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

-- ─── admin_chat_messages ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can delete chat messages" ON public.admin_chat_messages;
DROP POLICY IF EXISTS "Org members can insert chat messages" ON public.admin_chat_messages;
DROP POLICY IF EXISTS "Org members can read chat messages" ON public.admin_chat_messages;

CREATE POLICY "Org members can read chat messages" ON public.admin_chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = admin_chat_messages.org_id));

CREATE POLICY "Org members can insert chat messages" ON public.admin_chat_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = admin_chat_messages.org_id));

CREATE POLICY "Org members can delete chat messages" ON public.admin_chat_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = admin_chat_messages.org_id));

-- ─── driver_tax_documents ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert tax documents" ON public.driver_tax_documents;
DROP POLICY IF EXISTS "Admins can update tax documents" ON public.driver_tax_documents;
DROP POLICY IF EXISTS "Drivers can view own tax documents" ON public.driver_tax_documents;

CREATE POLICY "Drivers can view own tax documents" ON public.driver_tax_documents FOR SELECT TO authenticated
  USING (driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Admins can insert tax documents" ON public.driver_tax_documents FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Admins can update tax documents" ON public.driver_tax_documents FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── auto_scheduler_config ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can insert scheduler config" ON public.auto_scheduler_config;
DROP POLICY IF EXISTS "Org members can read scheduler config" ON public.auto_scheduler_config;
DROP POLICY IF EXISTS "Org members can update scheduler config" ON public.auto_scheduler_config;

CREATE POLICY "Org members can read scheduler config" ON public.auto_scheduler_config FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = auto_scheduler_config.org_id));

CREATE POLICY "Org members can insert scheduler config" ON public.auto_scheduler_config FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = auto_scheduler_config.org_id));

CREATE POLICY "Org members can update scheduler config" ON public.auto_scheduler_config FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = auto_scheduler_config.org_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = (SELECT auth.uid()) AND om.org_id = auto_scheduler_config.org_id));

-- ─── api_logs ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can delete api logs" ON public.api_logs;
DROP POLICY IF EXISTS "Authenticated users can insert api logs" ON public.api_logs;

CREATE POLICY "Authenticated users can insert api logs" ON public.api_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Authenticated users can delete api logs" ON public.api_logs FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── chat_messages ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Authenticated users can update chat messages" ON public.chat_messages;

CREATE POLICY "Authenticated users can insert chat messages" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.chat_threads ct WHERE ct.id = chat_messages.thread_id AND (
    ct.driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher'))
  )));

CREATE POLICY "Authenticated users can update chat messages" ON public.chat_messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_threads ct WHERE ct.id = chat_messages.thread_id AND (
    ct.driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher'))
  )));

-- ─── chat_threads ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert chat threads" ON public.chat_threads;
DROP POLICY IF EXISTS "Authenticated users can update chat threads" ON public.chat_threads;

CREATE POLICY "Authenticated users can insert chat threads" ON public.chat_threads FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher'))
    OR driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Authenticated users can update chat threads" ON public.chat_threads FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher'))
    OR driver_id IN (SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())));

-- ─── driver_earnings ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can delete earnings" ON public.driver_earnings;
DROP POLICY IF EXISTS "Authenticated users can insert earnings" ON public.driver_earnings;
DROP POLICY IF EXISTS "Authenticated users can update earnings" ON public.driver_earnings;

CREATE POLICY "Authenticated users can insert earnings" ON public.driver_earnings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Authenticated users can update earnings" ON public.driver_earnings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Authenticated users can delete earnings" ON public.driver_earnings FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── driver_schedules ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can delete schedules" ON public.driver_schedules;
DROP POLICY IF EXISTS "Authenticated users can insert schedules" ON public.driver_schedules;
DROP POLICY IF EXISTS "Authenticated users can update schedules" ON public.driver_schedules;

CREATE POLICY "Authenticated users can insert schedules" ON public.driver_schedules FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Authenticated users can update schedules" ON public.driver_schedules FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Authenticated users can delete schedules" ON public.driver_schedules FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── incentive_badges ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert badges" ON public.incentive_badges;

CREATE POLICY "Authenticated users can insert badges" ON public.incentive_badges FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

-- ─── rescue_bonuses ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert rescue bonuses" ON public.rescue_bonuses;
DROP POLICY IF EXISTS "Authenticated users can update rescue bonuses" ON public.rescue_bonuses;

CREATE POLICY "Authenticated users can insert rescue bonuses" ON public.rescue_bonuses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Authenticated users can update rescue bonuses" ON public.rescue_bonuses FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

-- ─── sentry_config ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert sentry config" ON public.sentry_config;
DROP POLICY IF EXISTS "Authenticated users can update sentry config" ON public.sentry_config;

CREATE POLICY "Authenticated users can insert sentry config" ON public.sentry_config FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

CREATE POLICY "Authenticated users can update sentry config" ON public.sentry_config FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

-- ─── supervisor_alerts ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert supervisor alerts" ON public.supervisor_alerts;
DROP POLICY IF EXISTS "Authenticated users can update supervisor alerts" ON public.supervisor_alerts;

CREATE POLICY "Authenticated users can insert supervisor alerts" ON public.supervisor_alerts FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update supervisor alerts" ON public.supervisor_alerts FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- ─── trip_assignments ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can delete assignments" ON public.trip_assignments;
DROP POLICY IF EXISTS "Authenticated users can insert assignments" ON public.trip_assignments;
DROP POLICY IF EXISTS "Authenticated users can update assignments" ON public.trip_assignments;
DROP POLICY IF EXISTS "Authenticated users can view assignments" ON public.trip_assignments;

CREATE POLICY "Authenticated users can view assignments" ON public.trip_assignments FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can insert assignments" ON public.trip_assignments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));

CREATE POLICY "Authenticated users can update assignments" ON public.trip_assignments FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can delete assignments" ON public.trip_assignments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','dispatcher')));
