CREATE TABLE IF NOT EXISTS public.company_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  program_name text NOT NULL DEFAULT '',
  program_type text NOT NULL DEFAULT 'daycare',
  status text NOT NULL DEFAULT 'active',
  contact_name text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  service_days text[] NOT NULL DEFAULT '{}'::text[],
  pickup_window text NOT NULL DEFAULT '',
  requires_guardian_release boolean NOT NULL DEFAULT false,
  wheelchair_support boolean NOT NULL DEFAULT false,
  monitor_required boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.program_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.company_programs(id) ON DELETE CASCADE,
  child_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  guardian_name text NOT NULL DEFAULT '',
  guardian_phone text NOT NULL DEFAULT '',
  pickup_address text NOT NULL DEFAULT '',
  dropoff_address text NOT NULL DEFAULT '',
  pickup_days text[] NOT NULL DEFAULT '{}'::text[],
  mobility_notes text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_programs_company_id
ON public.company_programs(company_id);

CREATE INDEX IF NOT EXISTS idx_company_programs_status
ON public.company_programs(status);

CREATE INDEX IF NOT EXISTS idx_program_children_company_id
ON public.program_children(company_id);

CREATE INDEX IF NOT EXISTS idx_program_children_program_id
ON public.program_children(program_id);

ALTER TABLE public.company_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_children ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company profile can read programs" ON public.company_programs;
CREATE POLICY "Company profile can read programs"
ON public.company_programs
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

DROP POLICY IF EXISTS "Company profile can insert programs" ON public.company_programs;
CREATE POLICY "Company profile can insert programs"
ON public.company_programs
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

DROP POLICY IF EXISTS "Company profile can update programs" ON public.company_programs;
CREATE POLICY "Company profile can update programs"
ON public.company_programs
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

DROP POLICY IF EXISTS "Company profile can delete programs" ON public.company_programs;
CREATE POLICY "Company profile can delete programs"
ON public.company_programs
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

DROP POLICY IF EXISTS "Company profile can read program children" ON public.program_children;
CREATE POLICY "Company profile can read program children"
ON public.program_children
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

DROP POLICY IF EXISTS "Company profile can insert program children" ON public.program_children;
CREATE POLICY "Company profile can insert program children"
ON public.program_children
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

DROP POLICY IF EXISTS "Company profile can update program children" ON public.program_children;
CREATE POLICY "Company profile can update program children"
ON public.program_children
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

DROP POLICY IF EXISTS "Company profile can delete program children" ON public.program_children;
CREATE POLICY "Company profile can delete program children"
ON public.program_children
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
