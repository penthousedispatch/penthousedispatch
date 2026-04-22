-- Draft only.
-- This file is intentionally staged outside active Supabase migrations.
-- Convert the relevant sections into real migrations during rollout.

create table if not exists public.provider_admin_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  program_name text not null default '',
  admin_user_id uuid references public.profiles(id) on delete set null,
  admin_status text not null default 'pending',
  onboarding_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parent_pre_enrollments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  program_id uuid references public.company_programs(id) on delete set null,
  child_id uuid references public.program_children(id) on delete set null,
  parent_name text not null default '',
  parent_email text not null default '',
  parent_phone text not null default '',
  enrollment_status text not null default 'pre_enrolled',
  needs_service_now boolean not null default false,
  intended_future_use text[] not null default '{}'::text[],
  dispatch_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parent_subscription_programs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  program_id uuid references public.company_programs(id) on delete set null,
  incentive_name text not null default '',
  signup_credit numeric not null default 0,
  referral_credit numeric not null default 0,
  retention_months integer not null default 1,
  monthly_price numeric not null default 0,
  annual_price numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.future_ride_intake_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  program_id uuid references public.company_programs(id) on delete set null,
  child_id uuid references public.program_children(id) on delete set null,
  request_source text not null default 'parent',
  ride_reason text not null default '',
  requested_window text not null default '',
  status text not null default 'draft',
  readiness_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_procurement_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_admin_profile_id uuid references public.provider_admin_profiles(id) on delete set null,
  procurement_status text not null default 'draft',
  contract_status text not null default 'draft',
  insurance_status text not null default 'pending',
  background_check_status text not null default 'pending',
  training_attestation_status text not null default 'pending',
  policy_ack_status text not null default 'pending',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_compliance_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_type text not null default 'utilization',
  audience text not null default 'internal',
  cadence text not null default 'monthly',
  report_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.provider_incident_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  program_id uuid references public.company_programs(id) on delete set null,
  child_id uuid references public.program_children(id) on delete set null,
  event_type text not null default 'incident',
  severity text not null default 'medium',
  release_exception boolean not null default false,
  incident_summary text not null default '',
  escalation_status text not null default 'open',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.provider_safety_controls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  control_name text not null default '',
  control_status text not null default 'required',
  severity text not null default 'high',
  blocks_dispatch boolean not null default false,
  owner_role text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daycare_site_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  program_id uuid references public.company_programs(id) on delete set null,
  site_name text not null default '',
  dismissal_window text not null default '',
  classroom_handoff text not null default '',
  release_policy text not null default '',
  future_ride_intake_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daycare_family_packets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  program_id uuid references public.company_programs(id) on delete set null,
  child_id uuid references public.program_children(id) on delete set null,
  packet_status text not null default 'draft',
  future_ride_permission boolean not null default false,
  sports_transport_interest text not null default '',
  special_event_transport_interest text not null default '',
  authorized_pickup_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Recommended rollout notes:
-- 1. tie RLS to profiles.company_id
-- 2. allow admin and superadmin override
-- 3. do not connect these tables to live dispatch until the readiness and safety checks are enforced
-- 4. add procurement and reporting views only after buyer requirements are finalized
-- 5. finalize daycare packet and site workflow before enabling live site routing
