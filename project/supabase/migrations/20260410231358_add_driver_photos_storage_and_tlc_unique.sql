/*
  # Driver Photos Storage and TLC Unique Constraint

  1. Changes
    - Add dedicated columns: tlc_number, license_class, license_number, license_state, gender, dob
    - Add unique index on tlc_number to prevent duplicate imports
    - Create Supabase Storage bucket for driver photos with public access
    - Add storage RLS policies for reading and uploading photos

  2. Notes
    - photo_data column already exists (text) and will hold the Supabase Storage public URL
    - tlc_number extracted from notes column; new column enables idempotent CSV re-imports
*/

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS tlc_number text DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_class text DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_number text DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_state text DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS gender text DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS dob text DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'drivers' AND indexname = 'drivers_tlc_number_key'
  ) THEN
    CREATE UNIQUE INDEX drivers_tlc_number_key ON drivers (tlc_number) WHERE tlc_number != '';
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-photos', 'driver-photos', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read driver photos'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Public read driver photos"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'driver-photos')
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated upload driver photos'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated upload driver photos"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (bucket_id = 'driver-photos')
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated update driver photos'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated update driver photos"
        ON storage.objects FOR UPDATE
        TO authenticated
        USING (bucket_id = 'driver-photos')
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated delete driver photos'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated delete driver photos"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (bucket_id = 'driver-photos')
    $policy$;
  END IF;
END $$;
