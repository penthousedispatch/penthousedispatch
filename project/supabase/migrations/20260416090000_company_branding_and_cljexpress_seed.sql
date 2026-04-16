ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS white_label_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS app_display_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS brand_primary text NOT NULL DEFAULT '#c9a84c',
  ADD COLUMN IF NOT EXISTS brand_accent text NOT NULL DEFAULT '#00e5a0',
  ADD COLUMN IF NOT EXISTS ai_routing_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_auto_assign_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_driver_nudges_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payout_bank_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payout_bank_last4 text NOT NULL DEFAULT '';

INSERT INTO public.companies (
  id,
  owner_user_id,
  company_name,
  legal_entity,
  billing_contact_name,
  billing_contact_email,
  phone,
  address,
  tax_id,
  baseline_fleet_size,
  is_approved,
  onboarding_status,
  notes,
  app_display_name,
  white_label_enabled
)
VALUES (
  'c1a7e55c-1a7e-4c1a-b001-000000000001',
  NULL,
  'CLJExpress LLC',
  '',
  '',
  '',
  '',
  '',
  '',
  11,
  true,
  'approved',
  'Seeded subscriber company for CLJExpress driver import. Finish company profile later in company settings.',
  'CLJExpress Dispatch',
  false
)
ON CONFLICT (id) DO UPDATE
SET
  company_name = EXCLUDED.company_name,
  baseline_fleet_size = EXCLUDED.baseline_fleet_size,
  is_approved = EXCLUDED.is_approved,
  onboarding_status = EXCLUDED.onboarding_status,
  app_display_name = EXCLUDED.app_display_name;

INSERT INTO public.drivers (full_name, phone, tlc_number, company_id, status, is_active, login_username, login_password, driver_number)
SELECT 'BARTHELEMY ADJAVEHOUEDE', '6312029396', '5596965', 'c1a7e55c-1a7e-4c1a-b001-000000000001', 'offline', true, 'barthelemy.adjavehouede', '5596965', 'CLJ-001'
WHERE NOT EXISTS (SELECT 1 FROM public.drivers WHERE tlc_number = '5596965');

INSERT INTO public.drivers (full_name, phone, tlc_number, company_id, status, is_active, login_username, login_password, driver_number)
SELECT 'RAKESH DUBEY', '9178485148', '5991134', 'c1a7e55c-1a7e-4c1a-b001-000000000001', 'offline', true, 'rakesh.dubey', '5991134', 'CLJ-002'
WHERE NOT EXISTS (SELECT 1 FROM public.drivers WHERE tlc_number = '5991134');

INSERT INTO public.drivers (full_name, phone, tlc_number, company_id, status, is_active, login_username, login_password, driver_number)
SELECT 'Ingrid Patrone', '6462200186', '5446004', 'c1a7e55c-1a7e-4c1a-b001-000000000001', 'offline', true, 'ingrid.patrone', '5446004', 'CLJ-003'
WHERE NOT EXISTS (SELECT 1 FROM public.drivers WHERE tlc_number = '5446004');

INSERT INTO public.drivers (full_name, phone, tlc_number, company_id, status, is_active, login_username, login_password, driver_number)
SELECT 'JEAN SEIDE', '5165895716', '6080497', 'c1a7e55c-1a7e-4c1a-b001-000000000001', 'offline', true, 'jean.seide', '6080497', 'CLJ-004'
WHERE NOT EXISTS (SELECT 1 FROM public.drivers WHERE tlc_number = '6080497');

INSERT INTO public.drivers (full_name, phone, tlc_number, company_id, status, is_active, login_username, login_password, driver_number)
SELECT 'MD NIZAR HOSSAIN', '3475828646', '5780344', 'c1a7e55c-1a7e-4c1a-b001-000000000001', 'offline', true, 'md.nizar.hossain', '5780344', 'CLJ-005'
WHERE NOT EXISTS (SELECT 1 FROM public.drivers WHERE tlc_number = '5780344');

INSERT INTO public.drivers (full_name, phone, tlc_number, company_id, status, is_active, login_username, login_password, driver_number)
SELECT 'MAJID HASSAN', '6318192003', '6069561', 'c1a7e55c-1a7e-4c1a-b001-000000000001', 'offline', true, 'majid.hassan', '6069561', 'CLJ-006'
WHERE NOT EXISTS (SELECT 1 FROM public.drivers WHERE tlc_number = '6069561');

INSERT INTO public.drivers (full_name, phone, tlc_number, company_id, status, is_active, login_username, login_password, driver_number)
SELECT 'TIMOTHY TARRY', '9142235783', '6105180', 'c1a7e55c-1a7e-4c1a-b001-000000000001', 'offline', true, 'timothy.tarry', '6105180', 'CLJ-007'
WHERE NOT EXISTS (SELECT 1 FROM public.drivers WHERE tlc_number = '6105180');

INSERT INTO public.drivers (full_name, phone, tlc_number, company_id, status, is_active, login_username, login_password, driver_number)
SELECT 'ADNAN ALI FOTIH', '7187048719', '5534909', 'c1a7e55c-1a7e-4c1a-b001-000000000001', 'offline', true, 'adnan.ali.fotih', '5534909', 'CLJ-008'
WHERE NOT EXISTS (SELECT 1 FROM public.drivers WHERE tlc_number = '5534909');

INSERT INTO public.drivers (full_name, phone, tlc_number, company_id, status, is_active, login_username, login_password, driver_number)
SELECT 'JULIO SANCHEZ', '', '6044417', 'c1a7e55c-1a7e-4c1a-b001-000000000001', 'offline', true, 'julio.sanchez', '6044417', 'CLJ-009'
WHERE NOT EXISTS (SELECT 1 FROM public.drivers WHERE tlc_number = '6044417');

INSERT INTO public.drivers (full_name, phone, tlc_number, company_id, status, is_active, login_username, login_password, driver_number)
SELECT 'Sandeep Singh', '5593948519', '6074041', 'c1a7e55c-1a7e-4c1a-b001-000000000001', 'offline', true, 'sandeep.singh', '6074041', 'CLJ-010'
WHERE NOT EXISTS (SELECT 1 FROM public.drivers WHERE tlc_number = '6074041');

INSERT INTO public.drivers (full_name, phone, tlc_number, company_id, status, is_active, login_username, login_password, driver_number)
SELECT 'nazim yetim', '5168849112', '5608052', 'c1a7e55c-1a7e-4c1a-b001-000000000001', 'offline', true, 'nazim.yetim', '5608052', 'CLJ-011'
WHERE NOT EXISTS (SELECT 1 FROM public.drivers WHERE tlc_number = '5608052');
