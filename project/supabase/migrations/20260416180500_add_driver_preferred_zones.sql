alter table public.drivers
add column if not exists preferred_zones text[] not null default '{}';
