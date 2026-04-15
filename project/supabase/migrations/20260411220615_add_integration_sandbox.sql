/*
  # Integration Sandbox System

  ## Overview
  Creates tables to manage third-party integration partners with sandbox
  environments, test credentials, webhook configuration, and test run history.

  ## New Tables

  1. `integration_partners`
     - Registered third-party partners (e.g. Sentry, Waycare, Routific)
     - Each has sandbox and production config, auth type, webhook URLs
     - Tracks enabled/disabled state per environment

  2. `integration_test_runs`
     - Log of every test run against a partner sandbox
     - Stores result (pass/fail), log lines, latency, HTTP status

  3. `integration_webhooks`
     - Inbound webhook endpoints per partner
     - Stores recent payloads for inspection

  ## Security
  - RLS enabled, admin-only access on all tables
*/

-- ─── Integration Partners ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_partners (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text UNIQUE NOT NULL,
  description         text DEFAULT '',
  category            text DEFAULT 'dispatch' CHECK (category IN ('dispatch','billing','mapping','analytics','communication','compliance','custom')),
  logo_initial        text DEFAULT '',
  logo_color          text DEFAULT '#c9a84c',

  sandbox_enabled     boolean DEFAULT true,
  sandbox_base_url    text DEFAULT '',
  sandbox_auth_type   text DEFAULT 'api_key' CHECK (sandbox_auth_type IN ('api_key','basic','bearer','oauth2','none')),
  sandbox_api_key     text DEFAULT '',
  sandbox_username    text DEFAULT '',
  sandbox_password    text DEFAULT '',
  sandbox_headers     jsonb DEFAULT '{}',

  prod_enabled        boolean DEFAULT false,
  prod_base_url       text DEFAULT '',
  prod_auth_type      text DEFAULT 'api_key' CHECK (prod_auth_type IN ('api_key','basic','bearer','oauth2','none')),
  prod_api_key        text DEFAULT '',
  prod_username       text DEFAULT '',
  prod_password       text DEFAULT '',
  prod_headers        jsonb DEFAULT '{}',

  webhook_secret      text DEFAULT '',
  webhook_events      jsonb DEFAULT '[]',

  health_endpoint     text DEFAULT '',
  docs_url            text DEFAULT '',
  contact_email       text DEFAULT '',

  last_test_at        timestamptz,
  last_test_status    text DEFAULT 'untested' CHECK (last_test_status IN ('untested','pass','fail','partial')),
  last_test_latency   integer DEFAULT 0,

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE integration_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read integration_partners"
  ON integration_partners FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert integration_partners"
  ON integration_partners FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can update integration_partners"
  ON integration_partners FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can delete integration_partners"
  ON integration_partners FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ─── Integration Test Runs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_test_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid REFERENCES integration_partners(id) ON DELETE CASCADE,
  environment         text DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  test_type           text DEFAULT 'health_check',
  status              text DEFAULT 'running' CHECK (status IN ('running','pass','fail','partial')),
  http_status         integer,
  latency_ms          integer DEFAULT 0,
  request_payload     jsonb DEFAULT '{}',
  response_payload    jsonb DEFAULT '{}',
  log_lines           jsonb DEFAULT '[]',
  error_message       text DEFAULT '',
  triggered_by        text DEFAULT 'manual',
  created_at          timestamptz DEFAULT now(),
  completed_at        timestamptz
);

ALTER TABLE integration_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read integration_test_runs"
  ON integration_test_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert integration_test_runs"
  ON integration_test_runs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can update integration_test_runs"
  ON integration_test_runs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ─── Integration Webhooks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_webhooks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid REFERENCES integration_partners(id) ON DELETE CASCADE,
  event_type          text NOT NULL,
  raw_payload         jsonb DEFAULT '{}',
  headers             jsonb DEFAULT '{}',
  processed           boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE integration_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read integration_webhooks"
  ON integration_webhooks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert integration_webhooks"
  ON integration_webhooks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_integration_test_runs_partner ON integration_test_runs(partner_id);
CREATE INDEX IF NOT EXISTS idx_integration_test_runs_created ON integration_test_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_partner ON integration_webhooks(partner_id);

-- ─── Seed: Sentry as first integration partner ────────────────────────────
INSERT INTO integration_partners (
  name, slug, description, category, logo_initial, logo_color,
  sandbox_enabled, sandbox_base_url, sandbox_auth_type,
  health_endpoint, docs_url,
  webhook_events
) VALUES (
  'SentryMS',
  'sentry',
  'Non-Emergency Medical Transportation (NEMT) trip management platform. Provides trip assignments, driver roster, and vehicle data via REST API.',
  'dispatch',
  'S',
  '#c9a84c',
  true,
  'https://dsp-integration.test.sentryms.com',
  'basic',
  '/health',
  'https://sentryms.com/docs',
  '["trips.created","trips.updated","drivers.updated","vehicles.updated"]'
) ON CONFLICT (slug) DO NOTHING;
