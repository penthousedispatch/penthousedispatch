/*
  # Fix recursive admin update policy on profiles

  The previous admin update policy queried public.profiles from inside the
  public.profiles policy itself, which causes Postgres to raise:
    infinite recursion detected in policy for relation "profiles"

  This replacement uses:
  - org_members role membership for admin / superadmin
  - platform owner email claims from the JWT
*/

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;

CREATE POLICY "Admins can update profiles" ON public.profiles
FOR UPDATE TO authenticated
USING (
  lower(coalesce((auth.jwt() ->> 'email'), '')) = ANY (
    ARRAY[
      'frankny84@gmail.com',
      'thepenthousebrandcorp@gmail.com'
    ]
  )
  OR EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = (select auth.uid())
      AND om.role = ANY (ARRAY['admin', 'superadmin'])
  )
)
WITH CHECK (
  lower(coalesce((auth.jwt() ->> 'email'), '')) = ANY (
    ARRAY[
      'frankny84@gmail.com',
      'thepenthousebrandcorp@gmail.com'
    ]
  )
  OR EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = (select auth.uid())
      AND om.role = ANY (ARRAY['admin', 'superadmin'])
  )
);
