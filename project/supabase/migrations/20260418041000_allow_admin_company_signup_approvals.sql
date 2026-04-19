/*
  # Allow admin approval workflows for company signups and role changes

  Admin-facing tools need to:
  - insert a company row on behalf of a pending company signup
  - update another user's profile role/company linkage

  Existing RLS only allowed:
  - company owners to insert their own company row
  - users to update only their own profile
*/

DROP POLICY IF EXISTS "Admins can insert companies" ON public.companies;
CREATE POLICY "Admins can insert companies" ON public.companies
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (select auth.uid())
      AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (select auth.uid())
      AND p.role = 'admin'
  )
);
