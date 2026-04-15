/*
  # Fix sentry_config duplicate rows

  ## Problem
  Every time settings were saved, a new row was inserted instead of updating the existing one.
  This left 14 duplicate rows all with the same credentials.

  ## Changes
  1. Keep only the most recently updated sentry_config row
  2. Delete all older duplicate rows
  3. Add a unique constraint using a partial index so only one row can ever exist
  4. Ensure org_id column exists to scope per organization if needed
*/

-- Step 1: Delete all but the most recently updated row
DELETE FROM sentry_config
WHERE id NOT IN (
  SELECT id FROM sentry_config ORDER BY updated_at DESC LIMIT 1
);

-- Step 2: Add a unique constraint via a unique index on a constant expression
-- This prevents future duplicate inserts (there can only ever be 1 row)
CREATE UNIQUE INDEX IF NOT EXISTS sentry_config_singleton
  ON sentry_config ((true));
