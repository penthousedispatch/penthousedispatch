CREATE TABLE IF NOT EXISTS public.parent_subscription_incentives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.company_programs(id) ON DELETE SET NULL,
  incentive_name text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  reward_type text NOT NULL DEFAULT 'account_credit',
  reward_amount numeric NOT NULL DEFAULT 0,
  eligibility_rule text NOT NULL DEFAULT '',
  minimum_months integer NOT NULL DEFAULT 1,
  referral_bonus_enabled boolean NOT NULL DEFAULT true,
  referral_bonus_amount numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parent_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.company_programs(id) ON DELETE SET NULL,
  child_id uuid REFERENCES public.program_children(id) ON DELETE SET NULL,
  incentive_id uuid REFERENCES public.parent_subscription_incentives(id) ON DELETE SET NULL,
  parent_name text NOT NULL DEFAULT '',
  parent_email text NOT NULL DEFAULT '',
  parent_phone text NOT NULL DEFAULT '',
  plan_type text NOT NULL DEFAULT 'monthly',
  plan_status text NOT NULL DEFAULT 'trial',
  monthly_price numeric NOT NULL DEFAULT 0,
  autopay_enabled boolean NOT NULL DEFAULT false,
  incentive_applied boolean NOT NULL DEFAULT false,
  incentive_credit numeric NOT NULL DEFAULT 0,
  referral_code text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_subscription_incentives_company_id
ON public.parent_subscription_incentives(company_id);

CREATE INDEX IF NOT EXISTS idx_parent_subscriptions_company_id
ON public.parent_subscriptions(company_id);

CREATE INDEX IF NOT EXISTS idx_parent_subscriptions_program_id
ON public.parent_subscriptions(program_id);

CREATE INDEX IF NOT EXISTS idx_parent_subscriptions_child_id
ON public.parent_subscriptions(child_id);

ALTER TABLE public.parent_subscription_incentives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company profile can read parent incentives" ON public.parent_subscription_incentives;
CREATE POLICY "Company profile can read parent incentives"
ON public.parent_subscription_incentives
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS "Company profile can insert parent incentives" ON public.parent_subscription_incentives;
CREATE POLICY "Company profile can insert parent incentives"
ON public.parent_subscription_incentives
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS "Company profile can update parent incentives" ON public.parent_subscription_incentives;
CREATE POLICY "Company profile can update parent incentives"
ON public.parent_subscription_incentives
FOR UPDATE
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS "Company profile can delete parent incentives" ON public.parent_subscription_incentives;
CREATE POLICY "Company profile can delete parent incentives"
ON public.parent_subscription_incentives
FOR DELETE
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS "Company profile can read parent subscriptions" ON public.parent_subscriptions;
CREATE POLICY "Company profile can read parent subscriptions"
ON public.parent_subscriptions
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS "Company profile can insert parent subscriptions" ON public.parent_subscriptions;
CREATE POLICY "Company profile can insert parent subscriptions"
ON public.parent_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS "Company profile can update parent subscriptions" ON public.parent_subscriptions;
CREATE POLICY "Company profile can update parent subscriptions"
ON public.parent_subscriptions
FOR UPDATE
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS "Company profile can delete parent subscriptions" ON public.parent_subscriptions;
CREATE POLICY "Company profile can delete parent subscriptions"
ON public.parent_subscriptions
FOR DELETE
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'superadmin')
  )
);
