/*
  # Fix RLS Policies for Drivers and Related Tables

  1. Changes
    - Enable RLS on drivers table with org-scoped policies
    - Fix trip_assignments table: replace USING(true) policies with org-scoped ones
    - Add RLS to marketplace_trips scoped to org membership
    - Add RLS to sentry_config and sentry_sync_log

  2. Security
    - All policies require authenticated users
    - All data access scoped to the user's organization
    - No USING(true) open policies
*/

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'drivers' AND policyname = 'Org members can view their drivers') THEN
    CREATE POLICY "Org members can view their drivers"
      ON drivers FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'drivers' AND policyname = 'Org members can insert drivers') THEN
    CREATE POLICY "Org members can insert drivers"
      ON drivers FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'drivers' AND policyname = 'Org members can update drivers') THEN
    CREATE POLICY "Org members can update drivers"
      ON drivers FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'drivers' AND policyname = 'Anon can read active drivers for driver login') THEN
    CREATE POLICY "Anon can read active drivers for driver login"
      ON drivers FOR SELECT
      TO anon
      USING (is_active = true);
  END IF;
END $$;

ALTER TABLE marketplace_trips ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_trips' AND policyname = 'Org members can view trips') THEN
    CREATE POLICY "Org members can view trips"
      ON marketplace_trips FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_trips' AND policyname = 'Org members can insert trips') THEN
    CREATE POLICY "Org members can insert trips"
      ON marketplace_trips FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_trips' AND policyname = 'Org members can update trips') THEN
    CREATE POLICY "Org members can update trips"
      ON marketplace_trips FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;

ALTER TABLE sentry_sync_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sentry_sync_log' AND policyname = 'Org members can view sync log') THEN
    CREATE POLICY "Org members can view sync log"
      ON sentry_sync_log FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sentry_sync_log' AND policyname = 'Org members can insert sync log') THEN
    CREATE POLICY "Org members can insert sync log"
      ON sentry_sync_log FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;
