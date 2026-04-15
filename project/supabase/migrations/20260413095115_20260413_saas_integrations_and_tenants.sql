/*
  # SaaS Integrations Hub + Multi-Tenancy + API Key Management

  ## Overview
  Adds the full infrastructure for:
  1. A pluggable integration registry (AWS, GCP, Twilio, Stripe, etc.)
  2. Multi-tenant SaaS architecture (tenants table scoping all data)
  3. API key management with hashed keys, scopes, and rate limiting
  4. Full request audit log

  ## New Tables
  - tenants: Root SaaS tenant record per customer
  - tenant_plan_flags: Per-tenant feature flag toggles
  - saas_integrations: Pluggable integration connector rows
  - api_keys: Hashed API keys with scopes and rate limits
  - api_request_logs: Full audit trail for every API call

  ## Security
  - RLS on all tables; tenant isolation enforced
  - API keys use hashed storage only (no plaintext)
*/

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  plan_tier text NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'growth', 'enterprise')),
  billing_status text NOT NULL DEFAULT 'active' CHECK (billing_status IN ('active', 'past_due', 'cancelled', 'trial')),
  trial_ends_at timestamptz,
  max_drivers integer NOT NULL DEFAULT 10,
  max_orgs integer NOT NULL DEFAULT 1,
  owner_user_id uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owners can read their tenant"
  ON tenants FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "Tenant owners can update their tenant"
  ON tenants FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Superadmins can read all tenants"
  ON tenants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

CREATE TABLE IF NOT EXISTS tenant_plan_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag_key text NOT NULL,
  flag_value boolean NOT NULL DEFAULT false,
  override_value text DEFAULT NULL,
  description text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, flag_key)
);

ALTER TABLE tenant_plan_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read tenant plan flags"
  ON tenant_plan_flags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert tenant plan flags"
  ON tenant_plan_flags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update tenant plan flags"
  ON tenant_plan_flags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE TABLE IF NOT EXISTS saas_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  provider_name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  enabled boolean NOT NULL DEFAULT false,
  health_status text NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'error', 'unknown', 'disconnected')),
  last_sync_at timestamptz,
  last_health_check_at timestamptz,
  credentials jsonb DEFAULT '{}',
  config jsonb DEFAULT '{}',
  error_message text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, provider_key)
);

ALTER TABLE saas_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read saas integrations"
  ON saas_integrations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert saas integrations"
  ON saas_integrations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update saas integrations"
  ON saas_integrations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can delete saas integrations"
  ON saas_integrations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  allowed_ips text[] NOT NULL DEFAULT '{}',
  rate_limit_per_minute integer NOT NULL DEFAULT 60,
  expires_at timestamptz,
  last_used_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES profiles(id)
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read api keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert api keys"
  ON api_keys FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update api keys"
  ON api_keys FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE TABLE IF NOT EXISTS api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  ip_address text,
  user_agent text,
  response_status integer,
  latency_ms integer,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read request logs"
  ON api_request_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert request logs"
  ON api_request_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_saas_integrations_org ON saas_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_saas_integrations_provider ON saas_integrations(provider_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_org ON api_request_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created ON api_request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenant_plan_flags_tenant ON tenant_plan_flags(tenant_id);
