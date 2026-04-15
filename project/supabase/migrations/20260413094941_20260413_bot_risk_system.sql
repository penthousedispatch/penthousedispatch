/*
  # Bot Risk Threshold System

  ## Overview
  Creates tables to support configurable per-bot risk thresholds, action logging,
  escalation queues, and bot memory/state persistence.

  ## New Tables

  ### bot_config
  Stores per-bot configuration: autonomy level, risk threshold, allowed action types,
  payout protection flag (always true - payouts always require admin approval).

  ### bot_actions
  Immutable audit log of every decision made by a bot: what triggered it, what action
  was attempted, risk level assessed, and outcome (executed / escalated / blocked).

  ### pending_bot_actions
  Escalation queue for actions above the configured threshold. Admin must approve or
  reject each pending action before it executes.

  ### bot_memory
  Persistent state store for bots so they retain context across runs: last known state,
  known anomalies, counters.

  ## Security
  - RLS enabled on all tables
  - Only authenticated users in admin role can read/write bot config
  - Bot actions are insert-only for service role, read-only for admin users
*/

CREATE TABLE IF NOT EXISTS bot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  bot_id text NOT NULL,
  bot_name text NOT NULL,
  autonomy_level text NOT NULL DEFAULT 'observe' CHECK (autonomy_level IN ('observe', 'suggest', 'act')),
  risk_threshold text NOT NULL DEFAULT 'low' CHECK (risk_threshold IN ('low', 'medium', 'high')),
  allowed_actions text[] NOT NULL DEFAULT '{}',
  blocked_actions text[] NOT NULL DEFAULT '{"initiate_payout","approve_payout","process_payment"}',
  payout_protection boolean NOT NULL DEFAULT true,
  kill_switch boolean NOT NULL DEFAULT false,
  custom_notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, bot_id)
);

ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read bot config"
  ON bot_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert bot config"
  ON bot_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update bot config"
  ON bot_config FOR UPDATE
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

CREATE TABLE IF NOT EXISTS bot_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  bot_id text NOT NULL,
  bot_name text NOT NULL,
  trigger_reason text NOT NULL,
  action_type text NOT NULL,
  action_payload jsonb DEFAULT '{}',
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  outcome text NOT NULL DEFAULT 'executed' CHECK (outcome IN ('executed', 'escalated', 'blocked', 'failed')),
  outcome_detail text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bot_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read bot actions"
  ON bot_actions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert bot actions"
  ON bot_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE TABLE IF NOT EXISTS pending_bot_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  bot_id text NOT NULL,
  bot_name text NOT NULL,
  trigger_reason text NOT NULL,
  action_type text NOT NULL,
  action_payload jsonb DEFAULT '{}',
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  review_note text DEFAULT '',
  expires_at timestamptz DEFAULT (now() + interval '24 hours'),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pending_bot_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read pending bot actions"
  ON pending_bot_actions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert pending bot actions"
  ON pending_bot_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update pending bot actions"
  ON pending_bot_actions FOR UPDATE
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

CREATE TABLE IF NOT EXISTS bot_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  bot_id text NOT NULL,
  memory_key text NOT NULL,
  memory_value jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, bot_id, memory_key)
);

ALTER TABLE bot_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read bot memory"
  ON bot_memory FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can insert bot memory"
  ON bot_memory FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Admins can update bot memory"
  ON bot_memory FOR UPDATE
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

CREATE INDEX IF NOT EXISTS idx_bot_config_org_bot ON bot_config(org_id, bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_actions_org_bot ON bot_actions(org_id, bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_actions_created ON bot_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_bot_actions_org_status ON pending_bot_actions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_memory_org_bot ON bot_memory(org_id, bot_id);
