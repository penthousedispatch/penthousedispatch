/*
  Exclude driver offers tied to marketplace rows where the broker explicitly
  marks acceptance_status_id=0 on the embedded Sentry snapshot (trip not TP-accepted).

  Mirrors client-side deriveLifecycleStatus logic; requires numeric fields in JSON.
*/

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

  WITH ranked_assignments AS (
    SELECT
      t.*,
      COALESCE(
        t.scheduled_pickup_time,
        CASE
          WHEN NULLIF(t.pu_time, '') ~ '^\d{4}-\d{2}-\d{2}T' THEN NULLIF(t.pu_time, '')::timestamptz
          ELSE NULL
        END
      ) AS offer_pickup_time,
      ROW_NUMBER() OVER (
        PARTITION BY t.trip_id
        ORDER BY
          COALESCE(t.lifecycle_revision, 0) DESC,
          t.assigned_at DESC NULLS LAST,
          t.created_at DESC NULLS LAST,
          t.id DESC
      ) AS trip_rank
    FROM public.trip_assignments AS t
    WHERE t.driver_id = p_driver_id
      AND LOWER(COALESCE(t.status, '')) IN ('pending', 'assigned')
  ),
  eligible_assignments AS (
    SELECT
      r.*
    FROM ranked_assignments AS r
    LEFT JOIN public.marketplace_trips AS m
      ON m.sentry_trip_id = r.trip_id
    WHERE r.trip_rank = 1
      AND (
        m.sentry_trip_id IS NULL
        OR (
          (m.taken_by IS NULL OR m.taken_by = p_driver_id)
          AND LOWER(COALESCE(m.status, '')) IN ('', 'available', 'assigned')
          AND LOWER(COALESCE(m.external_trip_status, '')) NOT IN (
            'accepted',
            'arrived',
            'picked_up',
            'in_progress',
            'in progress',
            'on_trip',
            'completed',
            'complete',
            'done',
            'closed',
            'cancelled',
            'canceled',
            'no_show',
            'rejected'
          )
          AND COALESCE(
            CASE
              WHEN NULLIF(COALESCE(
                m.raw_payload->>'acceptance_status_id',
                m.raw_payload->'trip'->>'acceptance_status_id'
              ), '') ~ '^\d+$'
                THEN COALESCE(
                  m.raw_payload->>'acceptance_status_id',
                  m.raw_payload->'trip'->>'acceptance_status_id'
                )::integer
              ELSE NULL
            END,
            -1
          ) <> 0
          AND COALESCE(
            CASE
              WHEN NULLIF(COALESCE(
                m.raw_payload->>'status_id',
                m.raw_payload->>'trip_status_id',
                m.raw_payload->>'trip_processing_status_id',
                m.raw_payload->'trip'->>'status_id',
                m.raw_payload->'trip'->>'trip_status_id',
                m.raw_payload->'trip'->>'trip_processing_status_id'
              ), '') ~ '^\d+$'
                THEN COALESCE(
                  m.raw_payload->>'status_id',
                  m.raw_payload->>'trip_status_id',
                  m.raw_payload->>'trip_processing_status_id',
                  m.raw_payload->'trip'->>'status_id',
                  m.raw_payload->'trip'->>'trip_status_id',
                  m.raw_payload->'trip'->>'trip_processing_status_id'
                )::integer
              ELSE NULL
            END,
            0
          ) <= 1
        )
      )
  )
  SELECT *
  INTO ta
  FROM eligible_assignments
  ORDER BY
    offer_pickup_time ASC NULLS LAST,
    assigned_at ASC NULLS LAST,
    id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO mt
  FROM public.marketplace_trips AS m
  WHERE m.sentry_trip_id = ta.trip_id
  LIMIT 1;
  mt_found := FOUND;

  RETURN jsonb_build_object('assignment', to_jsonb(ta))
    || CASE WHEN mt_found THEN jsonb_build_object('marketplace', to_jsonb(mt)) ELSE '{}'::jsonb END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.peek_driver_trip_offer(uuid) TO authenticated;
