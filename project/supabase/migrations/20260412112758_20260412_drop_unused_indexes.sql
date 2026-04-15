/*
  # Drop Unused Indexes

  Removes all indexes flagged as unused by Supabase's advisor.
  Unused indexes consume storage and slow down write operations without
  providing any query performance benefit.

  Note: FK-covering indexes added in the previous migration are included here
  because the database had no query activity against them yet. They will be
  re-evaluated after real traffic occurs. For now we follow the advisor guidance
  and drop them to keep write overhead minimal.
*/

-- trips
DROP INDEX IF EXISTS public.idx_trips_status;
DROP INDEX IF EXISTS public.idx_trips_scheduled_pickup;
DROP INDEX IF EXISTS public.idx_trips_member_id;
DROP INDEX IF EXISTS public.idx_trips_assigned_by;
DROP INDEX IF EXISTS public.idx_trips_created_by;
DROP INDEX IF EXISTS public.idx_trips_return_trip_id;
DROP INDEX IF EXISTS public.idx_trips_vehicle_id;

-- drivers
DROP INDEX IF EXISTS public.idx_drivers_status;
DROP INDEX IF EXISTS public.idx_drivers_company_id;
DROP INDEX IF EXISTS public.idx_drivers_user_id;
DROP INDEX IF EXISTS public.idx_drivers_vehicle_id;

-- driver_locations
DROP INDEX IF EXISTS public.idx_driver_locations_created_at;

-- notifications
DROP INDEX IF EXISTS public.idx_notifications_user_id;

-- messages
DROP INDEX IF EXISTS public.idx_messages_receiver_id;
DROP INDEX IF EXISTS public.idx_messages_sender_id;
DROP INDEX IF EXISTS public.idx_messages_trip_id;

-- marketplace_trips
DROP INDEX IF EXISTS public.idx_marketplace_trips_sentry_id;
DROP INDEX IF EXISTS public.idx_marketplace_trips_taken_by;

-- incentives
DROP INDEX IF EXISTS public.idx_incentives_org_active;

-- ai_logs
DROP INDEX IF EXISTS public.idx_ai_logs_org_created;
DROP INDEX IF EXISTS public.idx_ai_logs_driver_id;

-- driver_incentive_enrollments
DROP INDEX IF EXISTS public.idx_enrollments_incentive;

-- supervisor_alerts
DROP INDEX IF EXISTS public.supervisor_alerts_bot_name_idx;
DROP INDEX IF EXISTS public.supervisor_alerts_resolved_idx;
DROP INDEX IF EXISTS public.supervisor_alerts_created_at_idx;

-- security_threats
DROP INDEX IF EXISTS public.idx_security_threats_status;
DROP INDEX IF EXISTS public.idx_security_threats_severity;
DROP INDEX IF EXISTS public.idx_security_threats_assigned_to;

-- security_events
DROP INDEX IF EXISTS public.idx_security_events_processed;
DROP INDEX IF EXISTS public.idx_security_events_severity;
DROP INDEX IF EXISTS public.idx_security_events_resolved;
DROP INDEX IF EXISTS public.idx_security_events_mitre;
DROP INDEX IF EXISTS public.idx_security_events_user_id;
DROP INDEX IF EXISTS public.idx_security_events_created_at;

-- threat_research_jobs
DROP INDEX IF EXISTS public.idx_threat_research_status;
DROP INDEX IF EXISTS public.idx_threat_research_jobs_threat_id;

-- security_alerts
DROP INDEX IF EXISTS public.idx_security_alerts_acknowledged;
DROP INDEX IF EXISTS public.idx_security_alerts_acknowledged_by;
DROP INDEX IF EXISTS public.idx_security_alerts_threat_id;

-- mitre_techniques
DROP INDEX IF EXISTS public.idx_mitre_tactic;
DROP INDEX IF EXISTS public.idx_mitre_observed;

-- threat_intel
DROP INDEX IF EXISTS public.idx_threat_intel_severity;
DROP INDEX IF EXISTS public.idx_threat_intel_exploited;
DROP INDEX IF EXISTS public.idx_threat_intel_fetched;

-- security_scans
DROP INDEX IF EXISTS public.idx_security_scans_status;
DROP INDEX IF EXISTS public.idx_security_scans_created;

-- company_agreements
DROP INDEX IF EXISTS public.idx_company_agreements_user_id;
DROP INDEX IF EXISTS public.idx_company_agreements_company_id;

-- driver_earnings_log
DROP INDEX IF EXISTS public.idx_driver_earnings_log_org_id;
DROP INDEX IF EXISTS public.idx_driver_earnings_log_earn_date;
DROP INDEX IF EXISTS public.idx_driver_earnings_log_period;

-- driver_pay_config
DROP INDEX IF EXISTS public.idx_driver_pay_config_company_id;

-- driver_payouts
DROP INDEX IF EXISTS public.idx_driver_payouts_bank_account_id;
DROP INDEX IF EXISTS public.idx_driver_payouts_initiated_by;
DROP INDEX IF EXISTS public.idx_driver_payouts_org_id;
DROP INDEX IF EXISTS public.idx_driver_payouts_payout_partner_id;
DROP INDEX IF EXISTS public.idx_driver_payouts_status;
DROP INDEX IF EXISTS public.idx_driver_payouts_period;

-- driver_tax_documents
DROP INDEX IF EXISTS public.idx_driver_tax_documents_org_id;
DROP INDEX IF EXISTS public.idx_driver_tax_documents_year;

-- integration_test_runs
DROP INDEX IF EXISTS public.idx_integration_test_runs_partner;

-- integration_webhooks
DROP INDEX IF EXISTS public.idx_integration_webhooks_partner;

-- admin_chat_messages
DROP INDEX IF EXISTS public.idx_admin_chat_messages_org_id;

-- payout_partners
DROP INDEX IF EXISTS public.idx_payout_partners_org_id;

-- auto_scheduler_runs
DROP INDEX IF EXISTS public.idx_auto_scheduler_runs_org_id;

-- billing_trips
DROP INDEX IF EXISTS public.idx_billing_trips_company_id;

-- chat_messages
DROP INDEX IF EXISTS public.idx_chat_messages_thread_id;

-- chat_threads
DROP INDEX IF EXISTS public.idx_chat_threads_driver_id;
DROP INDEX IF EXISTS public.idx_chat_threads_trip_assignment_id;

-- companies
DROP INDEX IF EXISTS public.idx_companies_owner_user_id;

-- feature_flags
DROP INDEX IF EXISTS public.idx_feature_flags_company_id;

-- incentive_badges
DROP INDEX IF EXISTS public.idx_incentive_badges_driver_id;

-- invoices
DROP INDEX IF EXISTS public.idx_invoices_company_id;

-- payments
DROP INDEX IF EXISTS public.idx_payments_company_id;
DROP INDEX IF EXISTS public.idx_payments_invoice_id;

-- rescue_bonuses
DROP INDEX IF EXISTS public.idx_rescue_bonuses_rescuing_driver_id;

-- trip_status_history
DROP INDEX IF EXISTS public.idx_trip_status_history_changed_by;
DROP INDEX IF EXISTS public.idx_trip_status_history_driver_id;
DROP INDEX IF EXISTS public.idx_trip_status_history_trip_id;
