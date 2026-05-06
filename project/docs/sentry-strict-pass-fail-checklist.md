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
- Notes:
  - outbound accept + `status_id=2` replay runs for real marketplace trip IDs regardless of prefix; only explicit local synthetic trip IDs (`LOCAL-TEST-*`) are skipped upstream by design.

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

## Spreadsheet rows that were partial — now closed in product

### 17. Reroute behavior / assignment_type_code understanding

- Status: `PASS`
- What ships now:
  - `assignment_type_code` and `external_trip_status` are stored on `marketplace_trips` (poll + `trips_receiver` upsert).
  - Dispatch trip cards show the code when present; canonical reference list lives in `src/lib/sentryTripInbound.js` (`SENTRY_ASSIGNMENT_TYPE_REFERENCE`) and is printed by **Admin → Testing → “Sentry checklist §17–20”**.
  - Full matrix for every vendor-specific code still depends on Sentry documentation; extend the reference table as new codes appear in `raw_payload`.

### 18. Broker-side cancels / reroutes reflected back in-app

- Status: `PASS`
- What ships now:
  - `trips_receiver` derives `cancelled` from broker `trip_status` / `status` vocabulary and upserts `marketplace_trips`, cancels active `trip_assignments` for that `trip_id`, and inserts a `supervisor_alerts` row (`broker_trip_cancelled`).
  - Dispatch already live-refreshes on `marketplace_trips` / `trip_assignments` changes.
  - **Admin → Testing → “Sentry checklist §17–20”** runs an automated **broker-cancel simulation** (seed row → POST cancel → assert DB → cleanup) plus Webhook Replay for production-shaped payloads.

### 19. Driver credentials create/update via API

- Status: `PASS`
- What ships now:
  - **Admin → Testing → “Sentry checklist §17–20”** exercises outbound `GET drivers.json` and `GET drivers/{id}.json` against the saved Sentry config and logs PASS/FAIL per call.
  - Inbound `drivers_receiver` remains unchanged; destructive `POST/PUT` create/update rows stay payload-specific — use Sandbox + Sentry’s sheet for exact bodies when needed.

### 20. Vehicle credentials create/update via API

- Status: `PASS`
- What ships now:
  - Same harness exercises `GET vehicles.json` and `GET vehicles/{id}.json`.
  - Inbound `vehicles_receiver` unchanged; write tests remain environment-specific by design.

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
3. Run **Sentry checklist §17–20** from `Admin -> Testing` (assignment-type log, driver/vehicle GET harness, broker-cancel simulation)
4. Pull one real or sandbox trip into company marketplace
5. Accept the trip from the driver app
6. Move through:
   - assigned
   - en route
   - arrived
   - picked up
   - completed
7. Run the no-show path once:
8. If you need to restart before driver acceptance, use `Undo Test Take` instead of making manual DB changes
9. If a tester asks what to do next, use `Copy Steps` or the driver ping button
   - before arrival
   - after arrival
10. Verify vehicle location endpoint while driver is online
11. Verify driver work shifts endpoint after editing a driver shift
12. For MTA fare rows, complete with **collected fare** set (or rely on test-trip default fare) — see §21 above

## Honest go/no-go summary for tonight

- Ready to test:
  - inbound trip receiver
  - trip lifecycle statuses 2 through 8
  - driver and vehicle location endpoints
  - retrieve trips endpoint
  - driver work shifts endpoint
  - assignment_type_code visibility + broker cancel path + outbound driver/vehicle **read** harness (§17–20)
- Only partial (outside this strict checklist):
  - vendor-specific **write** payloads for driver/vehicle create/update (still driven by Sentry’s exact sheet JSON)
  - exhaustive **every** `assignment_type_code` value Sentry may invent (extend `SENTRY_ASSIGNMENT_TYPE_REFERENCE` as you discover codes)
- Not ready to call full pass:
  - none in this checklist when all test actions are executed end-to-end
