/*
  # Add Missing Foreign Key Indexes - Batch 1

  Safe variant for fresh installs. Skips indexes for optional/legacy tables.
*/

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('idx_admin_chat_messages_org_id', 'admin_chat_messages', 'org_id'),
      ('idx_ai_logs_driver_id', 'ai_logs', 'driver_id'),
      ('idx_ai_logs_org_id', 'ai_logs', 'org_id'),
      ('idx_api_keys_created_by', 'api_keys', 'created_by'),
      ('idx_api_keys_revoked_by', 'api_keys', 'revoked_by'),
      ('idx_api_request_logs_api_key_id', 'api_request_logs', 'api_key_id'),
      ('idx_auto_scheduler_runs_org_id', 'auto_scheduler_runs', 'org_id'),
      ('idx_billing_trips_company_id', 'billing_trips', 'company_id'),
      ('idx_chat_messages_thread_id', 'chat_messages', 'thread_id'),
      ('idx_chat_threads_driver_id', 'chat_threads', 'driver_id'),
      ('idx_chat_threads_trip_assignment_id', 'chat_threads', 'trip_assignment_id'),
      ('idx_companies_owner_user_id', 'companies', 'owner_user_id'),
      ('idx_company_agreements_company_id', 'company_agreements', 'company_id'),
      ('idx_company_agreements_user_id', 'company_agreements', 'user_id'),
      ('idx_driver_earnings_log_org_id', 'driver_earnings_log', 'org_id'),
      ('idx_driver_pay_config_company_id', 'driver_pay_config', 'company_id'),
      ('idx_driver_payouts_bank_account_id', 'driver_payouts', 'bank_account_id'),
      ('idx_driver_payouts_initiated_by', 'driver_payouts', 'initiated_by'),
      ('idx_driver_payouts_org_id', 'driver_payouts', 'org_id'),
      ('idx_driver_payouts_payout_partner_id', 'driver_payouts', 'payout_partner_id'),
      ('idx_driver_tax_documents_org_id', 'driver_tax_documents', 'org_id'),
      ('idx_drivers_company_id', 'drivers', 'company_id'),
      ('idx_drivers_user_id', 'drivers', 'user_id'),
      ('idx_drivers_vehicle_id', 'drivers', 'vehicle_id')
    ) AS t(index_name, table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = item.table_name
        AND column_name = item.column_name
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
        item.index_name,
        item.table_name,
        item.column_name
      );
    END IF;
  END LOOP;
END $$;
