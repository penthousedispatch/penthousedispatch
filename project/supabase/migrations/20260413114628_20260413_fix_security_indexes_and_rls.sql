/*
  # Fix Security Issues: Missing Indexes, RLS Auth Init Plan, and Unused Indexes

  ## Changes

  ### 1. Add Missing Foreign Key Indexes
  - api_keys.org_id
  - api_request_logs.org_id
  - bot_actions.org_id
  - pending_bot_actions.org_id
  - test_sandbox_sessions.user_id

  ### 2. Fix RLS Auth Initialization Plan on test_sandbox_sessions
  - Replace direct auth.uid() calls with (SELECT auth.uid()) subqueries
  - Prevents per-row re-evaluation at scale

  ### 3. Drop Unused Indexes
  - Removes all confirmed unused indexes to reduce write overhead and storage
*/

-- ============================================================
-- 1. Add missing FK indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON public.api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_org_id ON public.api_request_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_bot_actions_org_id ON public.bot_actions(org_id);
CREATE INDEX IF NOT EXISTS idx_pending_bot_actions_org_id ON public.pending_bot_actions(org_id);
CREATE INDEX IF NOT EXISTS idx_test_sandbox_sessions_user_id ON public.test_sandbox_sessions(user_id);

-- ============================================================
-- 2. Fix test_sandbox_sessions RLS policies (auth init plan)
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own test session" ON public.test_sandbox_sessions;
DROP POLICY IF EXISTS "Users can read own test session" ON public.test_sandbox_sessions;
DROP POLICY IF EXISTS "Users can update own test session" ON public.test_sandbox_sessions;
DROP POLICY IF EXISTS "Users can delete own test session" ON public.test_sandbox_sessions;

CREATE POLICY "Users can read own test session"
  ON public.test_sandbox_sessions FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own test session"
  ON public.test_sandbox_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own test session"
  ON public.test_sandbox_sessions FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own test session"
  ON public.test_sandbox_sessions FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- 3. Drop unused indexes
-- ============================================================
DROP INDEX IF EXISTS public.idx_admin_chat_messages_org_id;
DROP INDEX IF EXISTS public.idx_ai_logs_driver_id;
DROP INDEX IF EXISTS public.idx_ai_logs_org_id;
DROP INDEX IF EXISTS public.idx_api_keys_created_by;
DROP INDEX IF EXISTS public.idx_api_keys_revoked_by;
DROP INDEX IF EXISTS public.idx_api_request_logs_api_key_id;
DROP INDEX IF EXISTS public.idx_auto_scheduler_runs_org_id;
DROP INDEX IF EXISTS public.idx_billing_trips_company_id;
DROP INDEX IF EXISTS public.idx_chat_messages_thread_id;
DROP INDEX IF EXISTS public.idx_chat_threads_driver_id;
DROP INDEX IF EXISTS public.idx_chat_threads_trip_assignment_id;
DROP INDEX IF EXISTS public.idx_companies_owner_user_id;
DROP INDEX IF EXISTS public.idx_company_agreements_company_id;
DROP INDEX IF EXISTS public.idx_company_agreements_user_id;
DROP INDEX IF EXISTS public.idx_driver_earnings_log_org_id;
DROP INDEX IF EXISTS public.idx_driver_pay_config_company_id;
DROP INDEX IF EXISTS public.idx_driver_payouts_bank_account_id;
DROP INDEX IF EXISTS public.idx_driver_payouts_initiated_by;
DROP INDEX IF EXISTS public.idx_driver_payouts_org_id;
DROP INDEX IF EXISTS public.idx_driver_payouts_payout_partner_id;
DROP INDEX IF EXISTS public.idx_driver_tax_documents_org_id;
DROP INDEX IF EXISTS public.idx_drivers_company_id;
DROP INDEX IF EXISTS public.idx_drivers_user_id;
DROP INDEX IF EXISTS public.idx_drivers_vehicle_id;
DROP INDEX IF EXISTS public.idx_feature_flags_company_id;
DROP INDEX IF EXISTS public.idx_incentive_badges_driver_id;
DROP INDEX IF EXISTS public.idx_incentives_org_id;
DROP INDEX IF EXISTS public.idx_integration_test_runs_partner_id;
DROP INDEX IF EXISTS public.idx_integration_webhooks_partner_id;
DROP INDEX IF EXISTS public.idx_invoices_company_id;
DROP INDEX IF EXISTS public.idx_marketplace_trips_taken_by;
DROP INDEX IF EXISTS public.idx_messages_receiver_id;
DROP INDEX IF EXISTS public.idx_messages_sender_id;
DROP INDEX IF EXISTS public.idx_messages_trip_id;
DROP INDEX IF EXISTS public.idx_notifications_user_id;
DROP INDEX IF EXISTS public.idx_payments_company_id;
DROP INDEX IF EXISTS public.idx_payments_invoice_id;
DROP INDEX IF EXISTS public.idx_payout_partners_org_id;
DROP INDEX IF EXISTS public.idx_pending_bot_actions_reviewed_by;
DROP INDEX IF EXISTS public.idx_rescue_bonuses_rescuing_driver_id;
DROP INDEX IF EXISTS public.idx_security_alerts_acknowledged_by;
DROP INDEX IF EXISTS public.idx_security_alerts_threat_id;
DROP INDEX IF EXISTS public.idx_security_events_user_id;
DROP INDEX IF EXISTS public.idx_security_threats_assigned_to;
DROP INDEX IF EXISTS public.idx_tenants_owner_user_id;
DROP INDEX IF EXISTS public.idx_threat_research_jobs_threat_id;
DROP INDEX IF EXISTS public.idx_trip_status_history_changed_by;
DROP INDEX IF EXISTS public.idx_trip_status_history_driver_id;
DROP INDEX IF EXISTS public.idx_trip_status_history_trip_id;
DROP INDEX IF EXISTS public.idx_trips_assigned_by;
DROP INDEX IF EXISTS public.idx_trips_created_by;
DROP INDEX IF EXISTS public.idx_trips_member_id;
DROP INDEX IF EXISTS public.idx_trips_return_trip_id;
DROP INDEX IF EXISTS public.idx_trips_vehicle_id;
DROP INDEX IF EXISTS public.idx_saas_integrations_user_id;
