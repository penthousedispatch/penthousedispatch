/*
  # Keep profile roles aligned with auth metadata

  1. Changes
    - Add a trigger that rewrites profiles.role from auth.users metadata when available

  2. Why
    - Rider accounts were being flipped back to admin by a client write path
    - Auth metadata is the safer source of truth for self-service account roles
*/

CREATE OR REPLACE FUNCTION public.sync_profile_role_from_auth_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role text;
BEGIN
  SELECT lower(
    coalesce(
      u.raw_user_meta_data->>'role',
      u.raw_app_meta_data->>'role',
      ''
    )
  )
  INTO requested_role
  FROM auth.users u
  WHERE u.id = NEW.id;

  IF requested_role IN ('admin', 'dispatcher', 'driver', 'company', 'rider') THEN
    NEW.role := requested_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_role_from_auth_metadata ON public.profiles;
CREATE TRIGGER sync_profile_role_from_auth_metadata
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_role_from_auth_metadata();

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
