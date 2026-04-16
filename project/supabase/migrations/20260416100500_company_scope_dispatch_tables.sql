ALTER TABLE public.marketplace_trips
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.trip_assignments
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.trip_assignments ta
SET company_id = d.company_id
FROM public.drivers d
WHERE ta.driver_id = d.id
  AND ta.company_id IS NULL
  AND d.company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_trips_company_id
ON public.marketplace_trips(company_id);

CREATE INDEX IF NOT EXISTS idx_trip_assignments_company_id
ON public.trip_assignments(company_id);
