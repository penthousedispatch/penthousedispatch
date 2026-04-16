ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS driver_wait_mins integer NOT NULL DEFAULT 5;
