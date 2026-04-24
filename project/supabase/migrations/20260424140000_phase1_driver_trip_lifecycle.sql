-- Phase 1: monotonic trip_assignments lifecycle, revision bump, idempotency, server offer peek.
-- Sentry edge functions and existing sentry_* tables are unchanged for Phase 2.

-- ---------------------------------------------------------------------------
-- 1) lifecycle_revision (strictly increases on every UPDATE row)
-- ---------------------------------------------------------------------------
ALTER TABLE public.trip_assignments
  ADD COLUMN IF NOT EXISTS lifecycle_revision bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.trip_assignments.lifecycle_revision IS
  'Increments on each UPDATE; clients drop stale payloads when incoming < local.';

-- Rank for active-leg progression (terminals handled separately).
CREATE OR REPLACE FUNCTION public.trip_assignment_active_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_status, ''))
    WHEN 'pending' THEN 1
    WHEN 'assigned' THEN 2
    WHEN 'accepted' THEN 3
    WHEN 'in_progress' THEN 4
    WHEN 'arrived' THEN 5
    WHEN 'picked_up' THEN 6
    WHEN 'on_trip' THEN 6
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.trip_assignments_lifecycle_guard_and_bump()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_r integer;
  new_r integer;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Always bump revision on UPDATE (any column).
  NEW.lifecycle_revision := coalesce(OLD.lifecycle_revision, 0) + 1;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Explicit terminals: always allowed from non-terminal; block reopening completed flows.
  IF lower(coalesce(NEW.status, '')) IN ('completed', 'cancelled', 'no_show') THEN
    IF lower(coalesce(OLD.status, '')) IN ('completed', 'cancelled', 'no_show')
       AND lower(OLD.status) IS DISTINCT FROM lower(NEW.status) THEN
      RAISE EXCEPTION 'trip_assignments: cannot change between terminal statuses (was %, new %)',
        OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Driver / dispatch can reject offers or cancel pre-terminal rows.
  IF lower(coalesce(NEW.status, '')) = 'rejected' THEN
    IF lower(coalesce(OLD.status, '')) IN ('completed', 'cancelled', 'no_show') THEN
      RAISE EXCEPTION 'trip_assignments: cannot reject terminal assignment (was %)', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF lower(coalesce(OLD.status, '')) IN ('completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'trip_assignments: cannot reopen terminal assignment (was %, new %)',
      OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;

  old_r := public.trip_assignment_active_rank(OLD.status);
  new_r := public.trip_assignment_active_rank(NEW.status);

  IF new_r > 0 AND old_r > 0 AND new_r < old_r THEN
    RAISE EXCEPTION 'trip_assignments: lifecycle monotonic violation % -> %',
      OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_assignments_lifecycle_guard_and_bump ON public.trip_assignments;
CREATE TRIGGER trip_assignments_lifecycle_guard_and_bump
  BEFORE UPDATE ON public.trip_assignments
  FOR EACH ROW
  EXECUTE PROCEDURE public.trip_assignments_lifecycle_guard_and_bump();

-- ---------------------------------------------------------------------------
-- 2) Idempotency ledger (driver actions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_trip_action_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  trip_id text NOT NULL,
  action text NOT NULL,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, trip_id, action, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_driver_trip_action_idempotency_driver
  ON public.driver_trip_action_idempotency(driver_id, created_at DESC);

ALTER TABLE public.driver_trip_action_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage driver trip idempotency"
  ON public.driver_trip_action_idempotency;
CREATE POLICY "Authenticated users can manage driver trip idempotency"
  ON public.driver_trip_action_idempotency
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Returns true if this is the first claim for the key; false if duplicate (safe retry).
CREATE OR REPLACE FUNCTION public.claim_driver_trip_idempotency(
  p_driver_id uuid,
  p_trip_id text,
  p_action text,
  p_key uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.driver_trip_action_idempotency (driver_id, trip_id, action, idempotency_key)
  VALUES (p_driver_id, p_trip_id, lower(trim(coalesce(p_action, ''))), p_key);
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_driver_trip_idempotency(uuid, text, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Server-side offer peek (single JSON payload; client still renders same UI)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.peek_driver_trip_offer(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ta public.trip_assignments;
  mt public.marketplace_trips;
  mt_found boolean := false;
BEGIN
  IF p_driver_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO ta
  FROM public.trip_assignments t
  WHERE t.driver_id = p_driver_id
    AND lower(coalesce(t.status, '')) IN ('pending', 'assigned')
  ORDER BY t.assigned_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO mt
  FROM public.marketplace_trips m
  WHERE m.sentry_trip_id = ta.trip_id
  LIMIT 1;
  mt_found := FOUND;

  RETURN jsonb_build_object('assignment', to_jsonb(ta))
    || CASE WHEN mt_found THEN jsonb_build_object('marketplace', to_jsonb(mt)) ELSE '{}'::jsonb END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.peek_driver_trip_offer(uuid) TO authenticated;
