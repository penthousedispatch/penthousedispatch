/*
  # Incentives, Pay Rates, AI Settings & Logs

  1. New Tables
    - `incentives` - Dispatcher-managed bonus goals for drivers
      - id, name, description, goal_type (trips/revenue/hours), goal_value, bonus_amount, start_date, end_date, is_active, org_id
    - `driver_incentive_enrollments` - Which drivers are enrolled in which incentive + progress
      - id, incentive_id, driver_id, current_progress, earned, enrolled_at
    - `ai_settings` - Per-org AI provider configuration
      - id, org_id, provider (openai/gemini/disabled), api_key, model, temperature, max_tokens, motivation_enabled, scheduling_enabled
    - `ai_logs` - Audit trail of every AI call made
      - id, org_id, driver_id (nullable), context_type, prompt, response, model_used, tokens_used, created_at

  2. Column Additions
    - `drivers.pay_rate` - Numeric rate (per hour or per trip)
    - `drivers.pay_rate_type` - 'hourly' or 'per_trip'

  3. Security
    - RLS enabled on all new tables
    - Authenticated org members can read/write their org data
*/

-- Add pay rate columns to drivers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'pay_rate'
  ) THEN
    ALTER TABLE drivers ADD COLUMN pay_rate numeric DEFAULT 18;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'pay_rate_type'
  ) THEN
    ALTER TABLE drivers ADD COLUMN pay_rate_type text DEFAULT 'hourly';
  END IF;
END $$;

-- Incentives table
CREATE TABLE IF NOT EXISTS incentives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  goal_type text NOT NULL DEFAULT 'trips',
  goal_value numeric NOT NULL DEFAULT 10,
  bonus_amount numeric NOT NULL DEFAULT 50,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL DEFAULT (CURRENT_DATE + interval '7 days'),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE incentives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view incentives"
  ON incentives FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can insert incentives"
  ON incentives FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update incentives"
  ON incentives FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete incentives"
  ON incentives FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Driver incentive enrollments / progress
CREATE TABLE IF NOT EXISTS driver_incentive_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incentive_id uuid REFERENCES incentives(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE,
  current_progress numeric DEFAULT 0,
  earned boolean DEFAULT false,
  enrolled_at timestamptz DEFAULT now(),
  UNIQUE(incentive_id, driver_id)
);

ALTER TABLE driver_incentive_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view enrollments"
  ON driver_incentive_enrollments FOR SELECT
  TO authenticated
  USING (
    incentive_id IN (
      SELECT i.id FROM incentives i
      JOIN org_members om ON om.org_id = i.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can insert enrollments"
  ON driver_incentive_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    incentive_id IN (
      SELECT i.id FROM incentives i
      JOIN org_members om ON om.org_id = i.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update enrollments"
  ON driver_incentive_enrollments FOR UPDATE
  TO authenticated
  USING (
    incentive_id IN (
      SELECT i.id FROM incentives i
      JOIN org_members om ON om.org_id = i.org_id
      WHERE om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    incentive_id IN (
      SELECT i.id FROM incentives i
      JOIN org_members om ON om.org_id = i.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete enrollments"
  ON driver_incentive_enrollments FOR DELETE
  TO authenticated
  USING (
    incentive_id IN (
      SELECT i.id FROM incentives i
      JOIN org_members om ON om.org_id = i.org_id
      WHERE om.user_id = auth.uid()
    )
  );

-- AI Settings table
CREATE TABLE IF NOT EXISTS ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  provider text DEFAULT 'disabled',
  api_key text DEFAULT '',
  model text DEFAULT 'gpt-4o-mini',
  temperature numeric DEFAULT 0.7,
  max_tokens integer DEFAULT 300,
  motivation_enabled boolean DEFAULT true,
  scheduling_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view ai_settings"
  ON ai_settings FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can insert ai_settings"
  ON ai_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update ai_settings"
  ON ai_settings FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- AI Logs table
CREATE TABLE IF NOT EXISTS ai_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name text DEFAULT '',
  context_type text DEFAULT 'motivation',
  prompt text DEFAULT '',
  response text DEFAULT '',
  model_used text DEFAULT '',
  tokens_used integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view ai_logs"
  ON ai_logs FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can insert ai_logs"
  ON ai_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete ai_logs"
  ON ai_logs FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_incentives_org_active ON incentives(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ai_logs_org_created ON ai_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrollments_incentive ON driver_incentive_enrollments(incentive_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_driver ON driver_incentive_enrollments(driver_id);
