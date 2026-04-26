/*
  # Stop the admin profile / auth-metadata role bounce

  1. Problem
    - 20260426134500_guard_profile_role_from_auth_metadata installed a BEFORE INSERT/UPDATE
      trigger on public.profiles that overwrites profiles.role from auth.users metadata.
    - Platform-owner accounts (and other legitimate admins) typically still carry the legacy
      "dispatcher" default in auth.users.raw_user_meta_data because the original handle_new_user
      trigger always wrote that value.
    - The client (AppContext.loadUserData) detects "I'm a platform owner / admin org member but
      profile.role isn't 'admin'" and upserts role='admin'. The DB trigger immediately reverts
      to 'dispatcher'. Realtime fires, the client refetches and upserts again, the trigger
      reverts again, ad infinitum.
    - Symptoms: admin dashboard pages (and the embedded rider preview iframe inside the admin
      dashboard) appear to "keep reloading repeatedly" because every loop iteration recreates
      the AppContext value and re-renders subtrees.

  2. Fix
    - Teach the trigger to preserve role='admin' when the profile being written is for a user
      with confirmed admin/superadmin membership in org_members, OR for the known
      platform-owner emails.
    - Backfill auth.users.raw_user_meta_data.role := 'admin' for those same users so the
      trigger no longer fights the client even on subsequent updates.
    - Re-promote profiles.role to 'admin' for those users if they were demoted by the previous
      backfill.
*/

CREATE OR REPLACE FUNCTION public.sync_profile_role_from_auth_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role text;
  user_email text;
  has_admin_membership boolean;
  is_platform_owner_email boolean;
BEGIN
  SELECT
    lower(coalesce(u.raw_user_meta_data->>'role', u.raw_app_meta_data->>'role', '')),
    lower(coalesce(u.email, ''))
  INTO requested_role, user_email
  FROM auth.users u
  WHERE u.id = NEW.id;

  is_platform_owner_email := user_email IN (
    'frankny84@gmail.com',
    'thepenthousebrandcorp@gmail.com'
  );

  IF NEW.role = 'admin' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.org_members om
      WHERE om.user_id = NEW.id
        AND om.role IN ('admin', 'superadmin')
    ) INTO has_admin_membership;

    -- Preserve admin profile for legitimate admins so the client and the trigger
    -- can't ping-pong the role on every realtime echo.
    IF has_admin_membership OR is_platform_owner_email THEN
      RETURN NEW;
    END IF;
  END IF;

  IF requested_role IN ('admin', 'dispatcher', 'driver', 'company', 'rider') THEN
    NEW.role := requested_role;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill auth metadata for platform owners so future trigger runs see role='admin'.
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  coalesce(raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'::jsonb,
  true
)
WHERE lower(coalesce(email, '')) IN (
  'frankny84@gmail.com',
  'thepenthousebrandcorp@gmail.com'
)
AND lower(coalesce(raw_user_meta_data->>'role', '')) IS DISTINCT FROM 'admin';

-- Backfill auth metadata for any user with confirmed admin org membership.
UPDATE auth.users u
SET raw_user_meta_data = jsonb_set(
  coalesce(u.raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'::jsonb,
  true
)
WHERE EXISTS (
  SELECT 1
  FROM public.org_members om
  WHERE om.user_id = u.id
    AND om.role IN ('admin', 'superadmin')
)
AND lower(coalesce(u.raw_user_meta_data->>'role', '')) IS DISTINCT FROM 'admin';

-- Re-promote profiles to admin for those same users if they were demoted by the
-- previous backfill in 20260426130000 / 20260426134500.
UPDATE public.profiles p
SET role = 'admin',
    updated_at = now()
WHERE p.role IS DISTINCT FROM 'admin'
  AND (
    lower(coalesce(
      (SELECT u.email FROM auth.users u WHERE u.id = p.id),
      ''
    )) IN ('frankny84@gmail.com', 'thepenthousebrandcorp@gmail.com')
    OR EXISTS (
      SELECT 1
      FROM public.org_members om
      WHERE om.user_id = p.id
        AND om.role IN ('admin', 'superadmin')
    )
  );
