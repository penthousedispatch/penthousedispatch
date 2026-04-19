CREATE OR REPLACE FUNCTION public.enforce_unique_company_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_name text := lower(btrim(coalesce(NEW.company_name, '')));
BEGIN
  IF normalized_name = '' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id <> NEW.id
      AND lower(btrim(coalesce(c.company_name, ''))) = normalized_name
  ) THEN
    RAISE EXCEPTION 'Company name is already in use';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_unique_company_name ON public.companies;

CREATE TRIGGER trg_enforce_unique_company_name
BEFORE INSERT OR UPDATE OF company_name
ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.enforce_unique_company_name();
