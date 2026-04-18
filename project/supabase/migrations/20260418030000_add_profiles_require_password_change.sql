ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS require_password_change boolean NOT NULL DEFAULT false;
