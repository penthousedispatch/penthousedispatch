/*
  # Add real company segment field to companies

  1. Changes
    - Add `company_segment` to `companies`
    - Restrict values to known transport/provider segments
    - Backfill from existing note tags when available
    - Default everything else to `transport_company`
*/

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS company_segment text;

UPDATE public.companies
SET company_segment = CASE
  WHEN lower(
    coalesce(
      nullif(
        substring(notes FROM 'COMPANY_SEGMENT:([^\n\r]+)'),
        ''
      ),
      nullif(
        substring(notes FROM 'PROVIDER_TYPE:([^\n\r]+)'),
        ''
      ),
      'transport_company'
    )
  ) IN ('transport_company', 'daycare_provider', 'program_provider', 'other_provider')
    THEN lower(
      coalesce(
        nullif(
          substring(notes FROM 'COMPANY_SEGMENT:([^\n\r]+)'),
          ''
        ),
        nullif(
          substring(notes FROM 'PROVIDER_TYPE:([^\n\r]+)'),
          ''
        ),
        'transport_company'
      )
    )
  ELSE 'transport_company'
END
WHERE company_segment IS NULL OR btrim(company_segment) = '';

UPDATE public.companies
SET company_segment = 'transport_company'
WHERE company_segment IS NULL OR btrim(company_segment) = '';

ALTER TABLE public.companies
  ALTER COLUMN company_segment SET DEFAULT 'transport_company';

ALTER TABLE public.companies
  ALTER COLUMN company_segment SET NOT NULL;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_company_segment_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_company_segment_check
  CHECK (
    company_segment = ANY (
      ARRAY[
        'transport_company'::text,
        'daycare_provider'::text,
        'program_provider'::text,
        'other_provider'::text
      ]
    )
  );

CREATE INDEX IF NOT EXISTS idx_companies_company_segment
  ON public.companies(company_segment);
