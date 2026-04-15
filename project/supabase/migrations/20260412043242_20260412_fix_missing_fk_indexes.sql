/*
  # Add Missing Foreign Key Indexes

  Safe version for fresh installs: only creates an index when the table and
  column exist in the current schema.
*/

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('idx_admin_chat_messages_org_id', 'admin_chat_messages', 'org_id'),
      ('idx_ai_logs_driver_id', 'ai_logs', 'driver_id'),
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
      ('idx_drivers_vehicle_id', 'drivers', 'vehicle_id'),
      ('idx_feature_flags_company_id', 'feature_flags', 'company_id'),
      ('idx_incentive_badges_driver_id', 'incentive_badges', 'driver_id'),
      ('idx_invoices_company_id', 'invoices', 'company_id'),
      ('idx_marketplace_trips_taken_by', 'marketplace_trips', 'taken_by'),
      ('idx_messages_sender_id', 'messages', 'sender_id'),
      ('idx_messages_trip_id', 'messages', 'trip_id'),
      ('idx_org_members_user_id', 'org_members', 'user_id'),
      ('idx_payments_company_id', 'payments', 'company_id'),
      ('idx_payments_invoice_id', 'payments', 'invoice_id'),
      ('idx_rescue_bonuses_rescuing_driver_id', 'rescue_bonuses', 'rescuing_driver_id'),
      ('idx_security_alerts_acknowledged_by', 'security_alerts', 'acknowledged_by'),
      ('idx_security_alerts_threat_id', 'security_alerts', 'threat_id'),
      ('idx_security_events_user_id', 'security_events', 'user_id'),
      ('idx_security_threats_assigned_to', 'security_threats', 'assigned_to'),
      ('idx_threat_research_jobs_threat_id', 'threat_research_jobs', 'threat_id'),
      ('idx_trip_status_history_changed_by', 'trip_status_history', 'changed_by'),
      ('idx_trip_status_history_driver_id', 'trip_status_history', 'driver_id'),
      ('idx_trip_status_history_trip_id', 'trip_status_history', 'trip_id'),
      ('idx_trips_assigned_by', 'trips', 'assigned_by'),
      ('idx_trips_created_by', 'trips', 'created_by'),
      ('idx_trips_return_trip_id', 'trips', 'return_trip_id'),
      ('idx_trips_vehicle_id', 'trips', 'vehicle_id')
    ) AS t(index_name, table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = item.table_name
        AND column_name = item.column_name
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I(%I)',
        item.index_name,
        item.table_name,
        item.column_name
      );
    END IF;
  END LOOP;
END $$;
