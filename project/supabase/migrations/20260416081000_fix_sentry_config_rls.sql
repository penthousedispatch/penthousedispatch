/*
  # Fix sentry_config RLS for admin settings screens

  The app treats sentry_config as a singleton operational settings table.
  Several screens read the latest row first, then update it. Existing policy
  history left the table without a stable SELECT policy in some environments,
  which causes the UI to miss the existing row and then fail on INSERT/UPDATE
  with an RLS error.

  We intentionally allow any authenticated user to read/write this singleton
  row because the UI already gates access to the settings screens, and the
  app depends on being able to load this config across multiple roles.
*/

ALTER TABLE public.sentry_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read sentry config" ON public.sentry_config;
DROP POLICY IF EXISTS "Authenticated users can insert sentry config" ON public.sentry_config;
DROP POLICY IF EXISTS "Authenticated users can update sentry config" ON public.sentry_config;

CREATE POLICY "Authenticated users can read sentry config"
ON public.sentry_config
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can insert sentry config"
ON public.sentry_config
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update sentry config"
ON public.sentry_config
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL)
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
