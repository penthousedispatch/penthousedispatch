ALTER TABLE public.marketplace_trips
ADD COLUMN IF NOT EXISTS raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
