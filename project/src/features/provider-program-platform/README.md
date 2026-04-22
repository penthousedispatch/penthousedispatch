# Provider Program Platform

This folder is a staged feature package for later integration.

It is intentionally **not wired into the live site**.

## What is included

- `ProviderAdminModule.jsx`
  Provider/daycare/program operator signs up as a company admin first.
- `ProgramOperationsModule.jsx`
  Program profile, child roster, and guardian/release setup.
- `ParentEnrollmentModule.jsx`
  Parents enroll children now, even when rides are only needed later.
- `ParentSubscriptionIncentivesModule.jsx`
  Subscription plans, signup credits, referral rewards, and retention framing.
- `FutureRideRequestsModule.jsx`
  Future dispatch demand such as appointments, programs, football games, and bus backup.
- `DispatchReadinessModule.jsx`
  Final readiness gate before feeding records into live dispatch.
- `ProcurementReadinessModule.jsx`
  Procurement, insurance, contract, and qualification staging for institutional or government-facing rollout.
- `ComplianceReportingModule.jsx`
  Audit, utilization, compliance, and buyer-facing reporting staging.
- `SafetyControlsModule.jsx`
  Guardian release, incident escalation, training, and dispatch-blocking control staging.
- `DaycareOperationsModule.jsx`
  Daycare-specific dismissal windows, site handoff, release flow, and future ride intake.
- `DaycareFamilyPacketsModule.jsx`
  Daycare family packets, authorized pickup lists, future ride permission, and sports/event readiness.
- `moduleRegistry.js`
  Registry for later route or dashboard integration.
- `useProviderProgramPlatformData.js`
  Staged sample data shape for UI development and integration planning.
- `sql/provider_program_platform_draft.sql`
  Draft database design that is **not** part of the active migrations.
- `templates/`
  Daycare-facing packet and policy templates for later rollout.

## Integration intent

Do not import these modules into `App.jsx`, `CompanyDashboard.jsx`, or any active route until rollout time.

At rollout time:

1. Review and finalize the SQL draft.
2. Convert the draft SQL into real Supabase migrations.
3. Replace sample data with live Supabase hooks.
4. Register selected modules into a later dashboard or admin preview surface.
