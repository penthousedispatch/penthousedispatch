/*
  # Fix Duplicate Index and Mutable Search Path

  1. Remove duplicate index on security_events table.
     Both idx_security_events_created and idx_security_events_created_at cover
     the same column. We keep idx_security_events_created_at and drop the duplicate.

  2. Fix increment_mitre_observed function to use a fixed search_path,
     preventing search_path injection attacks.
*/

DROP INDEX IF EXISTS public.idx_security_events_created;

CREATE OR REPLACE FUNCTION public.increment_mitre_observed(technique_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.mitre_techniques
  SET observed_count = COALESCE(observed_count, 0) + 1,
      last_observed_at = now()
  WHERE id = technique_id;
END;
$$;
