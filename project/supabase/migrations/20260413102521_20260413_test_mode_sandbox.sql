/*
  # Test Mode Sandbox

  ## Purpose
  Creates isolated test data infrastructure that mirrors production tables
  but is completely separate. No production data is ever touched.

  ## New Tables
  1. `test_sandbox_sessions` - Tracks active test mode sessions per user
     - `id`, `user_id`, `created_at`, `reset_at`, `is_active`

  ## Notes
  - All test data uses driver/trip rows tagged with org_id = test sentinel value
  - Test data is soft-isolated by marking with test_mode = true on existing tables
  - No new shadow tables needed — we use existing tables with test org/company
  - A dedicated "Test Mode" org and company are seeded on first activation
  - The test_sandbox_sessions table just tracks whether the current user
    has test mode enabled and the last reset timestamp
*/

CREATE TABLE IF NOT EXISTS test_sandbox_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean DEFAULT false,
  test_org_id uuid,
  test_company_id uuid,
  created_at timestamptz DEFAULT now(),
  reset_at timestamptz DEFAULT now()
);

ALTER TABLE test_sandbox_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own test session"
  ON test_sandbox_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own test session"
  ON test_sandbox_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own test session"
  ON test_sandbox_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
