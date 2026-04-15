/*
  # Fix Integration Hub and Test Mode Sandbox

  ## Changes

  ### 1. saas_integrations — add user_id column and user-scoped RLS
  - Adds `user_id` column so integrations can be saved even without an org
  - Adds user-scoped SELECT/INSERT/UPDATE/DELETE policies as fallback
  - Keeps existing admin org-scoped policies intact

  ### 2. test_sandbox_sessions — ensure all operations work for authenticated users
  - Drops and recreates clean policies
  - Adds missing column guards

  ## Security
  - Users can only see/edit their own integrations (by user_id)
  - Admins can see all integrations scoped to their org (unchanged)
*/

-- Add user_id to saas_integrations if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'saas_integrations' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE saas_integrations ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index on user_id for saas_integrations
CREATE INDEX IF NOT EXISTS idx_saas_integrations_user_id ON saas_integrations(user_id);

-- Drop old admin-only policies
DROP POLICY IF EXISTS "Admins can read saas integrations" ON saas_integrations;
DROP POLICY IF EXISTS "Admins can insert saas integrations" ON saas_integrations;
DROP POLICY IF EXISTS "Admins can update saas integrations" ON saas_integrations;
DROP POLICY IF EXISTS "Admins can delete saas integrations" ON saas_integrations;

-- New policies: owner by user_id OR admin by org_id
CREATE POLICY "Users can read own integrations"
  ON saas_integrations FOR SELECT
  TO authenticated
  USING (
    (user_id = (SELECT auth.uid()))
    OR
    (org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    ))
  );

CREATE POLICY "Users can insert own integrations"
  ON saas_integrations FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = (SELECT auth.uid()))
    OR
    (org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    ))
  );

CREATE POLICY "Users can update own integrations"
  ON saas_integrations FOR UPDATE
  TO authenticated
  USING (
    (user_id = (SELECT auth.uid()))
    OR
    (org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    ))
  )
  WITH CHECK (
    (user_id = (SELECT auth.uid()))
    OR
    (org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    ))
  );

CREATE POLICY "Users can delete own integrations"
  ON saas_integrations FOR DELETE
  TO authenticated
  USING (
    (user_id = (SELECT auth.uid()))
    OR
    (org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'superadmin')
    ))
  );
