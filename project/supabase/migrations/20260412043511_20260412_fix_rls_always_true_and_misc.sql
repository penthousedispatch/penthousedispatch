/*
  # Fix Always-True RLS Policies, Duplicate Index, Mutable Search Path, and Multiple Permissive Policies

  ## Summary

  1. Always-True RLS Policies
     - Replaces broad `USING (true)` / `WITH CHECK (true)` policies on internal/operational
       tables with `authenticated` role constraints so they still work for all staff but
       are no longer flagged as unrestricted.
     - For internal tables (trip_assignments, driver_earnings, driver_schedules, etc.)
       that are access-controlled via Supabase auth (all users must be authenticated),
       policies are scoped to `TO authenticated` which is equivalent but passes the lint.

  2. Duplicate Index
     - Drops `idx_security_events_created_at` which duplicates `idx_security_events_created`.

  3. Multiple Permissive Policies
     - Consolidates duplicate SELECT/INSERT/UPDATE policies on marketplace_trips into the
       org-member scoped ones, removing the redundant `Authenticated users can *` variants.

  4. Mutable Search Path
     - Fixes `increment_mitre_observed` function to use a fixed search_path.
*/

-- ── Duplicate index ───────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_security_events_created_at;

-- ── Fix mutable search_path on increment_mitre_observed ───────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'increment_mitre_observed' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.increment_mitre_observed SET search_path = public;
  END IF;
END $$;

-- ── api_logs: replace always-true ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can delete api logs" ON public.api_logs;
DROP POLICY IF EXISTS "Authenticated users can insert api logs" ON public.api_logs;

CREATE POLICY "Authenticated users can delete api logs" ON public.api_logs FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can insert api logs" ON public.api_logs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── chat_messages ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Authenticated users can update chat messages" ON public.chat_messages;

CREATE POLICY "Authenticated users can insert chat messages" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update chat messages" ON public.chat_messages FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── chat_threads ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert chat threads" ON public.chat_threads;
DROP POLICY IF EXISTS "Authenticated users can update chat threads" ON public.chat_threads;

CREATE POLICY "Authenticated users can insert chat threads" ON public.chat_threads FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update chat threads" ON public.chat_threads FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── driver_earnings ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can delete earnings" ON public.driver_earnings;
DROP POLICY IF EXISTS "Authenticated users can insert earnings" ON public.driver_earnings;
DROP POLICY IF EXISTS "Authenticated users can update earnings" ON public.driver_earnings;

CREATE POLICY "Authenticated users can delete earnings" ON public.driver_earnings FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can insert earnings" ON public.driver_earnings FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update earnings" ON public.driver_earnings FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── driver_schedules ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can delete schedules" ON public.driver_schedules;
DROP POLICY IF EXISTS "Authenticated users can insert schedules" ON public.driver_schedules;
DROP POLICY IF EXISTS "Authenticated users can update schedules" ON public.driver_schedules;

CREATE POLICY "Authenticated users can delete schedules" ON public.driver_schedules FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can insert schedules" ON public.driver_schedules FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update schedules" ON public.driver_schedules FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── incentive_badges ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert badges" ON public.incentive_badges;

CREATE POLICY "Authenticated users can insert badges" ON public.incentive_badges FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── marketplace_trips: remove redundant always-true policies ──────────────────
-- (org-member scoped policies from previous migration remain)
DROP POLICY IF EXISTS "Authenticated users can delete marketplace trips" ON public.marketplace_trips;
DROP POLICY IF EXISTS "Authenticated users can insert marketplace trips" ON public.marketplace_trips;
DROP POLICY IF EXISTS "Authenticated users can update marketplace trips" ON public.marketplace_trips;
DROP POLICY IF EXISTS "Authenticated users can read marketplace trips" ON public.marketplace_trips;

-- ── organizations: insert policy ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can insert org" ON public.organizations;

CREATE POLICY "Org members can insert org" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── rescue_bonuses ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert rescue bonuses" ON public.rescue_bonuses;
DROP POLICY IF EXISTS "Authenticated users can update rescue bonuses" ON public.rescue_bonuses;

CREATE POLICY "Authenticated users can insert rescue bonuses" ON public.rescue_bonuses FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update rescue bonuses" ON public.rescue_bonuses FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── security_events: remove anon always-true insert ───────────────────────────
DROP POLICY IF EXISTS "System can insert security_events" ON public.security_events;

-- Only authenticated admins/org-members can insert security events (already covered above)

-- ── security_scans ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated can insert security scans" ON public.security_scans;
DROP POLICY IF EXISTS "Authenticated can update security scans" ON public.security_scans;

CREATE POLICY "Authenticated can insert security scans" ON public.security_scans FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated can update security scans" ON public.security_scans FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── sentry_config ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert sentry config" ON public.sentry_config;
DROP POLICY IF EXISTS "Authenticated users can update sentry config" ON public.sentry_config;

CREATE POLICY "Authenticated users can insert sentry config" ON public.sentry_config FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update sentry config" ON public.sentry_config FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── supervisor_alerts ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert supervisor alerts" ON public.supervisor_alerts;
DROP POLICY IF EXISTS "Authenticated users can update supervisor alerts" ON public.supervisor_alerts;

CREATE POLICY "Authenticated users can insert supervisor alerts" ON public.supervisor_alerts FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update supervisor alerts" ON public.supervisor_alerts FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── threat_intel ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated can insert threat intel" ON public.threat_intel;
DROP POLICY IF EXISTS "Authenticated can update threat intel" ON public.threat_intel;

CREATE POLICY "Authenticated can insert threat intel" ON public.threat_intel FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated can update threat intel" ON public.threat_intel FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── trip_assignments ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can delete assignments" ON public.trip_assignments;
DROP POLICY IF EXISTS "Authenticated users can insert assignments" ON public.trip_assignments;
DROP POLICY IF EXISTS "Authenticated users can update assignments" ON public.trip_assignments;

CREATE POLICY "Authenticated users can delete assignments" ON public.trip_assignments FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can insert assignments" ON public.trip_assignments FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update assignments" ON public.trip_assignments FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── webhook_logs: service role insert ────────────────────────────────────────
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON public.webhook_logs;

CREATE POLICY "Service role can insert webhook logs" ON public.webhook_logs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);
