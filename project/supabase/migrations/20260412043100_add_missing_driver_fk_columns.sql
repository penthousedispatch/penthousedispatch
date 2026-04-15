/*
  # Backfill missing driver foreign key columns for fresh installs

  Some later index migrations expect drivers.user_id and drivers.vehicle_id to
  exist. Legacy Bolt-created projects already had them, but clean Supabase
  projects created from this repo do not. Add them here before the FK index
  migrations run.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.drivers
      ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'vehicle_id'
  ) THEN
    ALTER TABLE public.drivers
      ADD COLUMN vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;
  END IF;
END $$;
