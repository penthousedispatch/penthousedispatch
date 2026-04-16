alter table if exists public.incentives
  add column if not exists celebration_style text not null default 'confetti',
  add column if not exists celebration_message text default '';
