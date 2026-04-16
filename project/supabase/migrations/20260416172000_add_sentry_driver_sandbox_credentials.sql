ALTER TABLE public.sentry_config
ADD COLUMN IF NOT EXISTS driver_sandbox_username text,
ADD COLUMN IF NOT EXISTS driver_sandbox_password text;
