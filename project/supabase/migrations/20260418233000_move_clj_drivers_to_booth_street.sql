DO $$
DECLARE
  booth_company_id uuid;
BEGIN
  SELECT id
  INTO booth_company_id
  FROM public.companies
  WHERE lower(company_name) IN (
    'booth street transport',
    'booth street transport llc',
    'booth street'
  )
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF booth_company_id IS NULL THEN
    RAISE NOTICE 'Booth Street Transport company not found; skipping driver reassignment.';
    RETURN;
  END IF;

  UPDATE public.drivers
  SET
    company_id = booth_company_id,
    updated_at = NOW()
  WHERE company_id IN (
    SELECT id
    FROM public.companies
    WHERE lower(company_name) LIKE 'cljexpress%'
       OR lower(company_name) LIKE 'clj express%'
  );
END $$;
