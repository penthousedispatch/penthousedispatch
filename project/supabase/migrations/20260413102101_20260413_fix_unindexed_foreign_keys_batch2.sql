/*
  # Add Missing Foreign Key Indexes - Batch 2

  Safe variant for fresh installs. Skips optional/legacy tables.
*/

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('idx_feature_flags_company_id', 'feature_flags', 'company_id'),
      ('idx_incentive_badges_driver_id', 'incentive_badges', 'driver_id'),
      ('idx_incentives_org_id', 'incentives', 'org_id'),
      ('idx_integration_test_runs_partner_id', 'integration_test_runs', 'partner_id'),
      ('idx_integration_webhooks_partner_id', 'integration_webhooks', 'partner_id'),
      ('idx_invoices_company_id', 'invoices', 'company_id'),
      ('idx_marketplace_trips_taken_by', 'marketplace_trips', 'taken_by'),
      ('idx_messages_receiver_id', 'messages', 'receiver_id'),
      ('idx_messages_sender_id', 'messages', 'sender_id'),
      ('idx_messages_trip_id', 'messages', 'trip_id'),
      ('idx_notifications_user_id', 'notifications', 'user_id'),
      ('idx_payments_company_id', 'payments', 'company_id'),
      ('idx_payments_invoice_id', 'payments', 'invoice_id'),
      ('idx_payout_partners_org_id', 'payout_partners', 'org_id'),
      ('idx_pending_bot_actions_reviewed_by', 'pending_bot_actions', 'reviewed_by'),
      ('idx_rescue_bonuses_rescuing_driver_id', 'rescue_bonuses', 'rescuing_driver_id'),
      ('idx_security_alerts_acknowledged_by', 'security_alerts', 'acknowledged_by'),
      ('idx_security_alerts_threat_id', 'security_alerts', 'threat_id'),
      ('idx_security_events_user_id', 'security_events', 'user_id'),
      ('idx_security_threats_assigned_to', 'security_threats', 'assigned_to'),
      ('idx_tenants_owner_user_id', 'tenants', 'owner_user_id'),
      ('idx_threat_research_jobs_threat_id', 'threat_research_jobs', 'threat_id'),
      ('idx_trip_status_history_changed_by', 'trip_status_history', 'changed_by'),
      ('idx_trip_status_history_driver_id', 'trip_status_history', 'driver_id'),
      ('idx_trip_status_history_trip_id', 'trip_status_history', 'trip_id'),
      ('idx_trips_assigned_by', 'trips', 'assigned_by'),
      ('idx_trips_created_by', 'trips', 'created_by'),
      ('idx_trips_member_id', 'trips', 'member_id'),
      ('idx_trips_return_trip_id', 'trips', 'return_trip_id'),
      ('idx_trips_vehicle_id', 'trips', 'vehicle_id')
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
