# Provider Program Platform Integration Plan

This is the staged plan for a later rollout. It is intentionally not connected to the live product yet.

## Goal

Support the full provider-to-parent-to-dispatch flow in separate modules:

1. provider signs up as company admin
2. provider creates program and roster
3. parent enrolls child now, even without current rides
4. parent subscribes and can receive signup/referral incentives
5. future rides can be requested later for appointments, programs, football games, and other non-bus cases
6. dispatch can rely on readiness data instead of scrambling at the last minute
7. procurement, reporting, and safety controls are staged before any institutional rollout
8. daycare site operations and family packet intake are staged before live daycare rollout

## Staged files

Source folder:

- `project/src/features/provider-program-platform/`

Draft SQL:

- `project/src/features/provider-program-platform/sql/provider_program_platform_draft.sql`

## Integration order

1. Finalize data model and move draft SQL into real migrations.
2. Build live Supabase hooks for provider admin, parent enrollment, and future ride intake.
3. Add a feature flag or hidden route for internal preview only.
4. Only after validation, register selected modules in the main dashboard.

## Staged compliance layers

- procurement readiness
- compliance and reporting
- safety controls

## Daycare-specific staged layers

- daycare site operations
- daycare family packets
- authorized pickup and release workflow
- future-use ride permission for parents

## Why this is not wired yet

The live site already has active dispatch, company, and admin flows. This package is staged so rollout can happen later without pushing unfinished behavior into production now.
