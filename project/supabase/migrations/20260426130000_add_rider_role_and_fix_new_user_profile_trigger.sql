/*
  # Add rider role support to profiles and stop auto-promoting new users to admin

  1. Changes
    - Allow `rider` in the profiles.role constraint
    - Update the auth user trigger to honor supported metadata roles
    - Backfill existing profile rows from auth metadata when the saved role is wrong

  2. Why
    - Rider signups were being created as admin users
    - The profiles table rejected `rider`, so the app could not persist the correct role
*/

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'admin'::text,
    'dispatcher'::text,
    'driver'::text,
    'company'::text,
    'rider'::text
  ]));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  requested_role text;
BEGIN
  requested_role := lower(
    coalesce(
      NEW.raw_user_meta_data->>'role',
      NEW.raw_app_meta_data->>'role',
      ''
    )
  );

  IF requested_role NOT IN ('admin', 'dispatcher', 'driver', 'company', 'rider') THEN
    requested_role := 'dispatcher';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    requested_role
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        role = EXCLUDED.role,
        updated_at = now();

  RETURN NEW;
END;
$$;

UPDATE public.profiles AS p
SET role = source.requested_role,
    updated_at = now()
FROM (
  SELECT
    id,
    lower(
      coalesce(
        raw_user_meta_data->>'role',
        raw_app_meta_data->>'role',
        ''
      )
    ) AS requested_role
  FROM auth.users
) AS source
WHERE p.id = source.id
  AND source.requested_role IN ('admin', 'dispatcher', 'driver', 'company', 'rider')
  AND p.role IS DISTINCT FROM source.requested_role;
