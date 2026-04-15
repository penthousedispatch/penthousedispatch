/*
  # Fix RLS Auth Initialization Plan

  Replaces all policies that call auth.uid() or auth.jwt() directly with
  (select auth.uid()) / (select auth.jwt()) to avoid per-row re-evaluation,
  improving query performance at scale.

  Affected tables:
  - bot_actions
  - bot_config
  - pending_bot_actions
  - bot_memory
  - tenant_plan_flags
  - tenants
  - saas_integrations
  - api_keys
  - api_request_logs
*/

-- ============================================================
-- bot_actions
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert bot actions" ON public.bot_actions;
DROP POLICY IF EXISTS "Admins can read bot actions" ON public.bot_actions;

CREATE POLICY "Admins can insert bot actions"
  ON public.bot_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can read bot actions"
  ON public.bot_actions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ============================================================
-- bot_config
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert bot config" ON public.bot_config;
DROP POLICY IF EXISTS "Admins can read bot config" ON public.bot_config;
DROP POLICY IF EXISTS "Admins can update bot config" ON public.bot_config;

CREATE POLICY "Admins can insert bot config"
  ON public.bot_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can read bot config"
  ON public.bot_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update bot config"
  ON public.bot_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ============================================================
-- pending_bot_actions
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert pending bot actions" ON public.pending_bot_actions;
DROP POLICY IF EXISTS "Admins can read pending bot actions" ON public.pending_bot_actions;
DROP POLICY IF EXISTS "Admins can update pending bot actions" ON public.pending_bot_actions;

CREATE POLICY "Admins can insert pending bot actions"
  ON public.pending_bot_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can read pending bot actions"
  ON public.pending_bot_actions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update pending bot actions"
  ON public.pending_bot_actions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ============================================================
-- bot_memory
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert bot memory" ON public.bot_memory;
DROP POLICY IF EXISTS "Admins can read bot memory" ON public.bot_memory;
DROP POLICY IF EXISTS "Admins can update bot memory" ON public.bot_memory;

CREATE POLICY "Admins can insert bot memory"
  ON public.bot_memory FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can read bot memory"
  ON public.bot_memory FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update bot memory"
  ON public.bot_memory FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ============================================================
-- tenant_plan_flags
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert tenant plan flags" ON public.tenant_plan_flags;
DROP POLICY IF EXISTS "Admins can read tenant plan flags" ON public.tenant_plan_flags;
DROP POLICY IF EXISTS "Admins can update tenant plan flags" ON public.tenant_plan_flags;

CREATE POLICY "Admins can insert tenant plan flags"
  ON public.tenant_plan_flags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can read tenant plan flags"
  ON public.tenant_plan_flags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update tenant plan flags"
  ON public.tenant_plan_flags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ============================================================
-- tenants - drop ALL existing policies and replace with optimized ones
-- (also fixes multiple permissive policies issue)
-- ============================================================
DROP POLICY IF EXISTS "Admins can read all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Superadmins can read all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Superadmins can insert tenants" ON public.tenants;
DROP POLICY IF EXISTS "Superadmins can update all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenant owners can read their tenant" ON public.tenants;
DROP POLICY IF EXISTS "Tenant owners can update their tenant" ON public.tenants;

-- Single consolidated SELECT: admins/superadmins see all, owners see their own
CREATE POLICY "Admins and owners can read tenants"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- INSERT: superadmins only
CREATE POLICY "Superadmins can insert tenants"
  ON public.tenants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'superadmin'
    )
  );

-- Single consolidated UPDATE: superadmins or owners
CREATE POLICY "Superadmins and owners can update tenants"
  ON public.tenants FOR UPDATE
  TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'superadmin'
    )
  )
  WITH CHECK (
    owner_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'superadmin'
    )
  );

-- ============================================================
-- saas_integrations
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete saas integrations" ON public.saas_integrations;
DROP POLICY IF EXISTS "Admins can insert saas integrations" ON public.saas_integrations;
DROP POLICY IF EXISTS "Admins can read saas integrations" ON public.saas_integrations;
DROP POLICY IF EXISTS "Admins can update saas integrations" ON public.saas_integrations;

CREATE POLICY "Admins can read saas integrations"
  ON public.saas_integrations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert saas integrations"
  ON public.saas_integrations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update saas integrations"
  ON public.saas_integrations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can delete saas integrations"
  ON public.saas_integrations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ============================================================
-- api_keys
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert api keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins can read api keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins can update api keys" ON public.api_keys;

CREATE POLICY "Admins can read api keys"
  ON public.api_keys FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert api keys"
  ON public.api_keys FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update api keys"
  ON public.api_keys FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ============================================================
-- api_request_logs
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert request logs" ON public.api_request_logs;
DROP POLICY IF EXISTS "Admins can read request logs" ON public.api_request_logs;

CREATE POLICY "Admins can read request logs"
  ON public.api_request_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert request logs"
  ON public.api_request_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    )
  );
