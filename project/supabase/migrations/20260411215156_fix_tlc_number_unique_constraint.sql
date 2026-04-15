/*
  # Fix tlc_number uniqueness for CSV import upsert

  ## Problem
  The CSV import uses `upsert({ onConflict: 'tlc_number' })` which requires a unique
  constraint. However there are 68 rows with empty or null tlc_number values that
  prevent a simple UNIQUE constraint from being added.

  ## Solution
  1. Normalise all empty-string tlc_number values to NULL (so they are excluded
     from uniqueness checks by Postgres).
  2. Add a partial unique index on tlc_number WHERE tlc_number IS NOT NULL AND
     tlc_number != '' — this satisfies the upsert while allowing multiple null rows.

  ## Changes
  - Updates empty tlc_number strings → NULL
  - Creates partial unique index `drivers_tlc_number_unique`
*/

UPDATE drivers SET tlc_number = NULL WHERE tlc_number = '';

CREATE UNIQUE INDEX IF NOT EXISTS drivers_tlc_number_unique
  ON drivers (tlc_number)
  WHERE tlc_number IS NOT NULL AND tlc_number != '';
