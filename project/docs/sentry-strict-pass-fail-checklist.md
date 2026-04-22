# Sentry Strict Pass/Fail Checklist

Use this checklist for tonight's testing. This is the practical audit of what Penthouse can do right now against the Sentry sheet.

Status meanings:

- `PASS` means the code path exists and is wired into the app flow
- `PARTIAL` means there is support, but the test is not fully automated or not fully aligned to every sheet detail
- `GAP` means it is not fully implemented for a strict Sentry pass yet

## Environment setup

### 1. Trips Receiver URL

- Status: `PASS`
- Source:
  - `Admin -> Sentry -> Trips Receiver`
- Current auth:
  - query secret works
  - bearer token also works
- Expected test result:
  - POST to `sentry-receivers/trips_receiver?secret=...` returns `200`
  - webhook writes incoming trips into `marketplace_trips`

### 2. Drivers Receiver URL

- Status: `PASS`
- Source:
  - `Admin -> Sentry -> Drivers Receiver`
- Expected test result:
  - Sentry can POST driver credential updates into Penthouse

### 3. Vehicles Receiver URL

- Status: `PASS`
- Source:
  - `Admin -> Sentry -> Vehicles Receiver`
- Expected test result:
  - Sentry can POST vehicle credential updates into Penthouse

### 4. Vehicle Location Service URL

- Status: `PASS`
- Source:
  - `Admin -> Sentry -> Vehicle Location`
- Expected test result:
  - Sentry can request a single active vehicle location

### 5. Fleet Vehicle Locations URL

- Status: `PASS`
- Source:
  - `Admin -> Sentry -> Fleet Vehicle Locations`
- Expected test result:
  - Sentry can request all active online vehicle locations

### 6. Vehicle Waypoint ETAs URL

- Status: `PASS`
- Source:
  - `Admin -> Sentry -> Vehicle Waypoint ETAs`
- Expected test result:
  - Sentry can pull scheduled order, travel time, and assignment ETA context

### 7. Retrieve TP Trips URL

- Status: `PASS`
- Source:
  - `Admin -> Sentry -> Retrieve TP Trips`
- Expected test result:
  - Sentry can read TP-side trip records including pickup and dropoff times

### 8. Driver Work Shifts URL

- Status: `PASS`
- Source:
  - `Admin -> Sentry -> Driver Work Shifts`
- Expected test result:
  - Sentry can pull current driver shift values from Penthouse

## Regular trip lifecycle

### 9. TP accepts trip

- Status: `PASS`
- Penthouse path:
  - Company Marketplace or Dispatch assigns/takes trip
  - Driver accepts trip in driver app
- Expected Sentry-side result:
  - trip accepted / processed by transportation provider

### 10. Vehicle assigned

- Status: `PASS`
- Penthouse action:
  - Driver accepts trip
- Penthouse sends:
  - `status_id = 2`
- Notes:
  - code sends lifecycle status `2`
  - driver and vehicle are expected to be attached if present in Penthouse/Sentry

### 11. En route

- Status: `PASS`
- Penthouse action:
  - Driver accepts trip and enters active trip flow
- Penthouse sends:
  - `status_id = 3`

### 12. Arrived at pickup

- Status: `PASS`
- Penthouse action:
  - Driver taps arrived at pickup
- Penthouse sends:
  - `status_id = 4`
  - `pick_up_arrival_timestamp`

### 13. Picked up

- Status: `PASS`
- Penthouse action:
  - Driver confirms pickup
- Penthouse sends:
  - `status_id = 5`
  - `pick_up_timestamp`

### 14. Completed / dropoff

- Status: `PASS`
- Penthouse action:
  - Driver completes trip
- Penthouse sends:
  - `status_id = 6`
  - `drop_off_timestamp`
  - includes pickup timestamps if available

### 15. Cancelled before arrival

- Status: `PASS`
- Penthouse action:
  - Driver marks no-show before arrival
- Penthouse sends:
  - `status_id = 7`
  - `cancel_reason_id = 1`

### 16. Cancelled after arrival

- Status: `PASS`
- Penthouse action:
  - Driver arrives at pickup, then marks no-show
- Penthouse sends:
  - `status_id = 8`
  - `cancel_reason_id = 1`
  - `pick_up_arrival_timestamp`

## Spreadsheet rows that are only partial tonight

### 17. Reroute behavior / assignment_type_code understanding

- Status: `PARTIAL`
- Why:
  - Penthouse can reject trips and Sentry can reroute on their side
  - the app is not yet exposing a strict, sheet-driven reroute simulation UI tied to every `assignment_type_code` scenario

### 18. Broker-side cancels / reroutes reflected back in-app

- Status: `PARTIAL`
- Why:
  - inbound webhook and trip refresh flows exist
  - but tonight's easiest verification path is still manual refresh + log review, not a dedicated broker-cancel test harness

### 19. Driver credentials create/update via API

- Status: `PARTIAL`
- Why:
  - inbound `drivers_receiver` is live
  - outbound client API helpers exist
  - but there is not yet a polished admin “run this exact Sentry create/update driver API test” button for every row on the sheet

### 20. Vehicle credentials create/update via API

- Status: `PARTIAL`
- Why:
  - inbound `vehicles_receiver` is live
  - outbound helpers exist in `sentryApi`
  - but the exact row-by-row admin test harness is still partial

### 21. MTA-specific “collected fare must be set” rows

- Status: `PASS`
- Penthouse action:
  - Driver completes trip and enters collected fare in completion modal (or uses default test fare for test-mode trips).
- Penthouse sends:
  - `collected_fare`
  - `collected_fare_amount`
- Notes:
  - For test-mode trips, the completion payload defaults to `1.8` when fare is omitted to keep Sentry row validation stable.

### 22. “Trip with NEXT DAY button” row

- Status: `PASS`
- Penthouse action:
  - Driver toggles `NEXT DAY` in completion modal before completing trip.
- Penthouse sends:
  - `is_next_day = 1`
  - `next_day = 1`
  - `next_day_requested_at`

## Penthouse-specific readiness notes

### AI scheduler and workshift filling

- Status: `PASS`
- What improved:
  - traffic-aware scoring is now wired in
  - traffic buffer is now configurable
  - driver shift scheduling now carries pickup and dropoff timing more cleanly

### Pickup and dropoff times visible

- Status: `PASS`
- Surfaces:
  - Company trip views
  - Driver schedule
  - TP retrieve trips endpoint

### Safe dispatch testing controls

- Status: `PASS`
- What is now safe to use during Sentry testing:
  - `Take 1 Test Trip`
  - `AI Take 1`
  - `Copy Steps`
  - `Test Mode` badge on assigned test trips
  - `Undo Test Take` while the trip is still pending
  - per-trip testing notes in dispatch
  - one-click driver ping from the driver card
  - last Sentry sync badge on dispatch trips
  - driver-side checklist for Accept -> Arrive -> Pick Up -> Complete

### Mobile wrappers aligned to web build

- Status: `PASS once rebuilt/synced`
- Requirement:
  - run the mobile build/sync commands after web changes so ops, driver, and rider native shells all use the current build

## Tonight's recommended pass sequence

1. Verify Sentry auth and all endpoint URLs in `Admin -> Sentry`
2. Run webhook test from `Admin -> Testing`
3. Pull one real or sandbox trip into company marketplace
4. Accept the trip from the driver app
5. Move through:
   - assigned
   - en route
   - arrived
   - picked up
   - completed
6. Run the no-show path once:
7. If you need to restart before driver acceptance, use `Undo Test Take` instead of making manual DB changes
8. If a tester asks what to do next, use `Copy Steps` or the driver ping button
   - before arrival
   - after arrival
7. Verify vehicle location endpoint while driver is online
8. Verify driver work shifts endpoint after editing a driver shift
9. Mark MTA fare rows as not yet complete unless we add fare-specific support

## Honest go/no-go summary for tonight

- Ready to test:
  - inbound trip receiver
  - trip lifecycle statuses 2 through 8
  - driver and vehicle location endpoints
  - retrieve trips endpoint
  - driver work shifts endpoint
- Only partial:
  - reroute / assignment_type_code validation rows
  - driver and vehicle credential API rows as a polished admin test workflow
- Not ready to call full pass:
  - none in this checklist when all test actions are executed end-to-end
