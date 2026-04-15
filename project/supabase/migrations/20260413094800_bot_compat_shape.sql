/*
  # Bot compatibility shape fix

  The legacy compatibility migration created placeholder bot tables so older RLS
  migrations could run on a fresh project. The real bot risk migration later in
  the chain expects a fuller schema, so this migration backfills the missing
  columns before that migration executes.
*/

ALTER TABLE public.bot_config
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bot_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bot_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS autonomy_level text NOT NULL DEFAULT 'observe',
  ADD COLUMN IF NOT EXISTS risk_threshold text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS allowed_actions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_actions text[] NOT NULL DEFAULT '{"initiate_payout","approve_payout","process_payment"}',
  ADD COLUMN IF NOT EXISTS payout_protection boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kill_switch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.bot_actions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bot_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bot_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trigger_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'executed',
  ADD COLUMN IF NOT EXISTS outcome_detail text NOT NULL DEFAULT '';

ALTER TABLE public.pending_bot_actions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bot_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bot_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trigger_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours');

ALTER TABLE public.bot_memory
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bot_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS memory_key text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS memory_value jsonb NOT NULL DEFAULT '{}'::jsonb;
