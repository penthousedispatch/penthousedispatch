ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS login_username text,
ADD COLUMN IF NOT EXISTS login_password text;
