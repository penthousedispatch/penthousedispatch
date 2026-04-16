create table if not exists public.driver_forum_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  author_driver_id uuid references public.drivers(id) on delete cascade,
  author_name text not null default '',
  title text not null default '',
  body text not null default '',
  category text not null default 'tip',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_rider_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  author_driver_id uuid references public.drivers(id) on delete cascade,
  author_name text not null default '',
  trip_id text not null default '',
  rider_name text not null default '',
  pickup_address text not null default '',
  dropoff_address text not null default '',
  note_type text not null default 'tip',
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.driver_forum_posts enable row level security;
alter table public.driver_rider_notes enable row level security;

drop policy if exists "Driver forum readable by app" on public.driver_forum_posts;
create policy "Driver forum readable by app"
on public.driver_forum_posts
for select
to anon, authenticated
using (true);

drop policy if exists "Driver forum writable by app" on public.driver_forum_posts;
create policy "Driver forum writable by app"
on public.driver_forum_posts
for insert
to anon, authenticated
with check (true);

drop policy if exists "Driver forum updatable by app" on public.driver_forum_posts;
create policy "Driver forum updatable by app"
on public.driver_forum_posts
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Driver rider notes readable by app" on public.driver_rider_notes;
create policy "Driver rider notes readable by app"
on public.driver_rider_notes
for select
to anon, authenticated
using (true);

drop policy if exists "Driver rider notes writable by app" on public.driver_rider_notes;
create policy "Driver rider notes writable by app"
on public.driver_rider_notes
for insert
to anon, authenticated
with check (true);

create index if not exists idx_driver_forum_posts_org_created on public.driver_forum_posts(org_id, created_at desc);
create index if not exists idx_driver_rider_notes_org_created on public.driver_rider_notes(org_id, created_at desc);
create index if not exists idx_driver_rider_notes_trip_id on public.driver_rider_notes(trip_id);
