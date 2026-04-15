/*
  # Drop Unused Indexes and Fix webhook_logs Multiple Permissive Policies

  1. Drops all indexes flagged as unused to reduce write overhead and storage bloat.
  2. Consolidates the two permissive SELECT policies on webhook_logs into one.

  Unused indexes dropped:
  - idx_webhook_logs_received
  - idx_webhook_logs_endpoint
  - idx_bot_config_org_bot
  - idx_bot_actions_org_bot
  - idx_bot_actions_created
  - idx_pending_bot_actions_org_status
  - idx_bot_memory_org_bot
  - idx_saas_integrations_org
  - idx_saas_integrations_provider
  - idx_api_keys_org
  - idx_api_keys_prefix
  - idx_api_request_logs_org
  - idx_api_request_logs_created
  - idx_tenants_slug
  - idx_tenant_plan_flags_tenant
*/

DROP INDEX IF EXISTS public.idx_webhook_logs_received;
DROP INDEX IF EXISTS public.idx_webhook_logs_endpoint;
DROP INDEX IF EXISTS public.idx_bot_config_org_bot;
DROP INDEX IF EXISTS public.idx_bot_actions_org_bot;
DROP INDEX IF EXISTS public.idx_bot_actions_created;
DROP INDEX IF EXISTS public.idx_pending_bot_actions_org_status;
DROP INDEX IF EXISTS public.idx_bot_memory_org_bot;
DROP INDEX IF EXISTS public.idx_saas_integrations_org;
DROP INDEX IF EXISTS public.idx_saas_integrations_provider;
DROP INDEX IF EXISTS public.idx_api_keys_org;
DROP INDEX IF EXISTS public.idx_api_keys_prefix;
DROP INDEX IF EXISTS public.idx_api_request_logs_org;
DROP INDEX IF EXISTS public.idx_api_request_logs_created;
DROP INDEX IF EXISTS public.idx_tenants_slug;
DROP INDEX IF EXISTS public.idx_tenant_plan_flags_tenant;

-- ============================================================
-- Fix multiple permissive SELECT policies on webhook_logs
-- Consolidate into one policy
-- ============================================================
DROP POLICY IF EXISTS "Admins can read webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Authenticated users can view webhook logs" ON public.webhook_logs;

CREATE POLICY "Admins can read webhook logs"
  ON public.webhook_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );
