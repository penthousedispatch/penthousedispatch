/*
  # Add AI Chatbot and Auto-Scheduler Support

  ## New Tables

  ### `admin_chat_messages`
  Stores the admin AI chatbot conversation history per org.
  - `id` (uuid, pk)
  - `org_id` (uuid, fk organizations)
  - `role` (text) — 'user' | 'assistant' | 'system'
  - `content` (text) — message text
  - `metadata` (jsonb) — optional extra data (assigned trips, driver refs, etc.)
  - `created_at` (timestamptz)

  ### `auto_scheduler_config`
  Stores per-org configuration for the auto-scheduling bot.
  - `id` (uuid, pk)
  - `org_id` (uuid, unique fk)
  - `enabled` (bool) — master on/off
  - `revenue_target_per_hour` (numeric) — default 60
  - `driver_pay_per_hour` (numeric) — default 35
  - `max_trip_distance_miles` (numeric) — default 25
  - `proximity_weight` (numeric 0-10) — how much to weight driver proximity
  - `mileage_weight` (numeric 0-10) — how much to weight trip mileage
  - `price_weight` (numeric 0-10) — how much to weight trip price
  - `buffer_mins` (int) — minutes between trips
  - `auto_assign` (bool) — whether to actually push assignments or just suggest
  - `shift_hours` (text) — default shift string e.g. "7am-5pm"
  - `last_run_at` (timestamptz)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `auto_scheduler_runs`
  Log of each scheduler run with results.
  - `id` (uuid, pk)
  - `org_id` (uuid, fk)
  - `run_at` (timestamptz)
  - `drivers_processed` (int)
  - `trips_assigned` (int)
  - `total_revenue` (numeric)
  - `avg_revenue_per_hour` (numeric)
  - `issues` (jsonb)
  - `assignments` (jsonb) — summary of what was assigned to whom

  ## Security
  - RLS enabled on all tables
  - Only authenticated users belonging to the org can access records
*/

CREATE TABLE IF NOT EXISTS admin_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL DEFAULT '',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read chat messages"
  ON admin_chat_messages FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can insert chat messages"
  ON admin_chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete chat messages"
  ON admin_chat_messages FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS auto_scheduler_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  revenue_target_per_hour numeric NOT NULL DEFAULT 60,
  driver_pay_per_hour numeric NOT NULL DEFAULT 35,
  max_trip_distance_miles numeric NOT NULL DEFAULT 25,
  proximity_weight numeric NOT NULL DEFAULT 7,
  mileage_weight numeric NOT NULL DEFAULT 5,
  price_weight numeric NOT NULL DEFAULT 8,
  buffer_mins integer NOT NULL DEFAULT 15,
  auto_assign boolean NOT NULL DEFAULT false,
  shift_hours text NOT NULL DEFAULT '7am-5pm',
  last_run_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE auto_scheduler_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read scheduler config"
  ON auto_scheduler_config FOR SELECT
  TO authenticated
  USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org members can insert scheduler config"
  ON auto_scheduler_config FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org members can update scheduler config"
  ON auto_scheduler_config FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS auto_scheduler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_at timestamptz DEFAULT now(),
  drivers_processed integer NOT NULL DEFAULT 0,
  trips_assigned integer NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  avg_revenue_per_hour numeric NOT NULL DEFAULT 0,
  issues jsonb DEFAULT '[]',
  assignments jsonb DEFAULT '[]'
);

ALTER TABLE auto_scheduler_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read scheduler runs"
  ON auto_scheduler_runs FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members can insert scheduler runs"
  ON auto_scheduler_runs FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
