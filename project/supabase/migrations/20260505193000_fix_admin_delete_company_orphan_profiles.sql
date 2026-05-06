CREATE OR REPLACE FUNCTION public.admin_delete_company(target_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF target_company_id IS NULL THEN
    RAISE EXCEPTION 'Company id is required';
  END IF;

  IF NOT (
    requester_email IN ('frankny84@gmail.com', 'thepenthousebrandcorp@gmail.com')
    OR EXISTS (
      SELECT 1
      FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  ) THEN
    RAISE EXCEPTION 'Only platform admins can delete companies';
  END IF;

  DELETE FROM public.chat_messages
  WHERE thread_id IN (
    SELECT id
    FROM public.chat_threads
    WHERE driver_id IN (
      SELECT id FROM public.drivers WHERE company_id = target_company_id
    )
    OR trip_assignment_id IN (
      SELECT id FROM public.trip_assignments WHERE company_id = target_company_id
    )
  );

  DELETE FROM public.chat_threads
  WHERE driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  )
  OR trip_assignment_id IN (
    SELECT id FROM public.trip_assignments WHERE company_id = target_company_id
  );

  DELETE FROM public.driver_bank_accounts
  WHERE driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  );

  DELETE FROM public.driver_earnings
  WHERE driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  );

  DELETE FROM public.driver_earnings_log
  WHERE driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  );

  DELETE FROM public.driver_payouts
  WHERE driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  );

  DELETE FROM public.driver_tax_documents
  WHERE driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  );

  DELETE FROM public.driver_tax_info
  WHERE driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  );

  DELETE FROM public.driver_schedules
  WHERE driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  );

  DELETE FROM public.driver_rider_notes
  WHERE author_driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  );

  DELETE FROM public.driver_incentive_enrollments
  WHERE driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  );

  DELETE FROM public.driver_forum_posts
  WHERE author_driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  );

  DELETE FROM public.supervisor_alerts
  WHERE payload ->> 'company_id' = target_company_id::text
     OR payload ->> 'driver_id' IN (
       SELECT id::text FROM public.drivers WHERE company_id = target_company_id
     );

  DELETE FROM public.trip_assignments
  WHERE company_id = target_company_id
     OR driver_id IN (
       SELECT id FROM public.drivers WHERE company_id = target_company_id
     );

  DELETE FROM public.marketplace_trips
  WHERE company_id = target_company_id
     OR taken_by IN (
       SELECT id FROM public.drivers WHERE company_id = target_company_id
     );

  DELETE FROM public.payments
  WHERE company_id = target_company_id
     OR invoice_id IN (
       SELECT id FROM public.invoices WHERE company_id = target_company_id
     );

  DELETE FROM public.invoices
  WHERE company_id = target_company_id;

  DELETE FROM public.billing_trips
  WHERE company_id = target_company_id;

  DELETE FROM public.feature_flags
  WHERE company_id = target_company_id;

  DELETE FROM public.driver_pay_config
  WHERE company_id = target_company_id;

  DELETE FROM public.company_agreements
  WHERE company_id = target_company_id;

  DELETE FROM public.test_sandbox_sessions
  WHERE test_company_id = target_company_id;

  DELETE FROM public.vehicles
  WHERE driver_id IN (
    SELECT id FROM public.drivers WHERE company_id = target_company_id
  );

  UPDATE public.profiles
  SET
    company_id = NULL,
    role = CASE
      WHEN role = 'company' THEN 'rider'
      ELSE role
    END,
    updated_at = now()
  WHERE company_id = target_company_id
     OR id IN (
       SELECT owner_user_id
       FROM public.companies
       WHERE id = target_company_id
         AND owner_user_id IS NOT NULL
     )
     OR lower(coalesce(email, '')) IN (
       SELECT lower(coalesce(billing_contact_email, ''))
       FROM public.companies
       WHERE id = target_company_id
         AND nullif(trim(coalesce(billing_contact_email, '')), '') IS NOT NULL
     );

  DELETE FROM public.drivers
  WHERE company_id = target_company_id;

  DELETE FROM public.companies
  WHERE id = target_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_company(uuid) TO authenticated;
