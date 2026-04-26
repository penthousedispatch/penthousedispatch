ALTER TABLE public.sentry_config
ADD COLUMN IF NOT EXISTS pause_sandbox_outbound boolean NOT NULL DEFAULT false;
