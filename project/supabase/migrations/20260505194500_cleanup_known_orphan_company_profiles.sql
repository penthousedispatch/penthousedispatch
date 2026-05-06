/*
  Clean up known orphan company profiles left behind by older admin deletes.
  These rows were already detached from any company, but auth metadata still
  marked them as role='company', which made AdminCompanies show them as fresh
  approval candidates again.
*/

UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  coalesce(raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"rider"'::jsonb,
  true
)
WHERE id IN (
  'e814cd8b-0a1d-48c2-804e-28b4df12f651'::uuid,
  '8b3750f9-50be-441e-89c4-eb37f96cfcab'::uuid,
  '7b8fe97f-8cb6-4192-9152-dfee54e26a2a'::uuid
);

UPDATE public.profiles
SET role = 'rider',
    company_id = NULL,
    updated_at = now()
WHERE id IN (
  'e814cd8b-0a1d-48c2-804e-28b4df12f651'::uuid,
  '8b3750f9-50be-441e-89c4-eb37f96cfcab'::uuid,
  '7b8fe97f-8cb6-4192-9152-dfee54e26a2a'::uuid
);
