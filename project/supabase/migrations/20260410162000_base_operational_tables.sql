/*
  # Base operational tables for fresh Supabase projects

  This repo's later migrations assume Bolt already created a handful of core
  tables. On a brand new Supabase project those tables do not exist yet, so
  the migration chain fails early. This migration creates the missing base
  tables in the correct order so the rest of the historical migrations can
  apply normally.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'dispatcher'
    CHECK (role = ANY (ARRAY['admin'::text, 'dispatcher'::text, 'driver'::text])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  driver_number text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  shift_hours text NOT NULL DEFAULT '7am-5pm',
  home_address text NOT NULL DEFAULT '',
  photo_data text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'offline',
  is_active boolean NOT NULL DEFAULT true,
  working_today boolean NOT NULL DEFAULT true,
  current_lat numeric,
  current_lng numeric,
  last_location_update timestamptz,
  vehicle_id uuid,
  sentry_vehicle_id text NOT NULL DEFAULT '',
  vehicle_plate text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  make text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  year integer,
  license_plate text NOT NULL DEFAULT '',
  sentry_vehicle_id text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'vehicle_id'
  ) THEN
    ALTER TABLE drivers
      ADD COLUMN vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS marketplace_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  sentry_trip_id text NOT NULL UNIQUE,
  sentry_last_modified_at text NOT NULL DEFAULT '',
  date_val text NOT NULL DEFAULT '',
  los text NOT NULL DEFAULT '',
  passengers text NOT NULL DEFAULT '1',
  mileage text NOT NULL DEFAULT '',
  pu_address text NOT NULL DEFAULT '',
  pu_city text NOT NULL DEFAULT '',
  pu_zip text NOT NULL DEFAULT '',
  pu_time text NOT NULL DEFAULT '',
  do_address text NOT NULL DEFAULT '',
  do_city text NOT NULL DEFAULT '',
  do_zip text NOT NULL DEFAULT '',
  do_time text NOT NULL DEFAULT '',
  delivery_price text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'available',
  taken_by uuid REFERENCES drivers(id) ON DELETE SET NULL,
  pu_lat numeric,
  pu_lng numeric,
  do_lat numeric,
  do_lng numeric,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_trips ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sentry_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  base_url text NOT NULL DEFAULT 'https://dsp-integration.test.sentryms.com',
  username text NOT NULL DEFAULT '',
  password_enc text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  auth_type text NOT NULL DEFAULT 'basic',
  sandbox boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  max_trips_per_pull integer NOT NULL DEFAULT 150,
  pull_interval_mins integer NOT NULL DEFAULT 5,
  webhook_secret text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sentry_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sentry_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT '',
  record_type text NOT NULL DEFAULT '',
  external_id text NOT NULL DEFAULT '',
  internal_id uuid,
  status text NOT NULL DEFAULT 'pending',
  error_message text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sentry_sync_log ENABLE ROW LEVEL SECURITY;
