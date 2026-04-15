/*
  # Legacy compatibility tables part 2

  Additional legacy/internal tables referenced by historical RLS migrations.
  Added as a follow-up migration because the first compatibility migration may
  already be applied on the remote project.
*/

CREATE TABLE IF NOT EXISTS api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method text NOT NULL DEFAULT '',
  path text NOT NULL DEFAULT '',
  status_code integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS driver_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_earnings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS driver_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE,
  shift_date date NOT NULL DEFAULT CURRENT_DATE,
  shift_hours text NOT NULL DEFAULT '7am-5pm',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_schedules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS rescue_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rescuing_driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rescue_bonuses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  key_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  path text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS bot_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bot_actions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS bot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS bot_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT '',
  memory jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bot_memory ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pending_bot_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pending_bot_actions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS saas_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE saas_integrations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS tenant_plan_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  flag_key text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_plan_flags ENABLE ROW LEVEL SECURITY;
