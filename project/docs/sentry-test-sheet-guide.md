# Sentry Test Sheet Guide

Use this checklist when Sentry asks you to verify Penthouse Dispatch against their CLJExpress test sheet.

## Before You Start

1. Open `Admin -> Sentry`.
2. Confirm the Sentry connection saves and tests successfully.
3. Make sure CLJExpress has at least:
   - one driver
   - one active vehicle
   - one trip you can use for testing
4. Keep a second tab open on `Admin -> Testing` or `Admin -> Audit Logs` so you can watch results.
5. In `Dispatch`, pick the driver you want to test with before taking a trip.
6. If you want, type a short testing note in the `Optional testing note for the next test trip` box.

## Fill In These Sentry Sheet Fields

Copy these values from `Admin -> Sentry`:

- `Vehicle Location Service URL`
  - use `Vehicle Location` or `Fleet Vehicle Locations` depending on what Sentry asked for
- `Trips Receiver Service URL`
  - use `Trips Receiver`
- `Fleet Locations URL`
  - use `Fleet Vehicle Locations`
- `Send Driver Credentials`
  - use `Drivers Receiver`
- `Send Vehicle Credentials`
  - use `Vehicles Receiver`
- `Driver Work shifts`
  - use `Driver Work Shifts`

If Sentry requested tokenized webhook URLs, send the token URL version shown in the same screen.

## Test 1: TP Accepts Trip

1. Open CLJExpress.
2. Go to `Dispatch`.
3. Refresh trips from Sentry if needed.
4. Pick a driver in the left panel.
5. Click `Take 1 Test Trip`.
6. Confirm the test take.

Expected:
- Penthouse accepts the trip.
- Sentry shows the trip accepted by your transportation provider.
- The trip shows `Test Mode` in Dispatch.
- If you made a mistake and the driver has not accepted yet, use `Undo Test Take`.

## Test 2: Vehicle Assigned

1. Open the driver app.
2. Have the driver accept the trip.
3. If dispatch sent a ping, the driver will see a blue `Dispatch note` banner.

Expected:
- Penthouse sends trip status `2`.
- Sentry should see:
  - `status_id = 2`
  - driver attached
  - vehicle attached
- The driver app checklist should move from `Accept trip` to done.

## Test 3: En Route

1. Move the trip into the en route state in the driver app.

Expected:
- Penthouse sends trip status `3`.
- Sentry should see:
  - `status_id = 3`
- Dispatch should keep showing the latest sync badge on that trip.

## Test 4: Arrived At Pickup

1. Tap the arrival action at pickup in the driver app.

Expected:
- Penthouse sends trip status `4`.
- Sentry should see:
  - `status_id = 4`
  - `pick_up_arrival_timestamp`
- The driver app checklist should mark `Arrive at pickup` done.

## Test 5: Picked Up

1. Confirm pickup in the driver app.

Expected:
- Penthouse sends trip status `5`.
- Sentry should see:
  - `status_id = 5`
  - `pick_up_timestamp`
- The driver app checklist should mark `Pick up rider` done.

## Test 6: Completed

1. Complete the trip in the driver app.

Expected:
- Penthouse sends trip status `6`.
- Sentry should see the trip completed.
- The driver app checklist should finish.

## Test 7: Vehicle Locations

1. Keep the driver online with location sharing enabled.
2. Run a trip or move the driver in test conditions.

Expected:
- Sentry can pull or receive the vehicle location feed from the service URL you supplied.

## Test 8: Driver Credentials

1. Update a driver record in Penthouse or have Sentry send a driver credential change to your `Drivers Receiver` URL.

Expected:
- Penthouse receives or exposes the driver credential update correctly.

## Test 9: Vehicle Credentials

1. Update a vehicle record in Penthouse or have Sentry send a vehicle credential change to your `Vehicles Receiver` URL.

Expected:
- Penthouse receives or exposes the vehicle credential update correctly.

## Test 10: Driver Work Shifts

1. Open the CLJExpress `Drivers` tab.
2. Click the pencil edit button for a driver.
3. Set `Work Shift Hours`, for example `7am-5pm`.
4. Save the driver.
5. Use the `Driver Work Shifts` URL from `Admin -> Sentry`.

Expected:
- Sentry can pull the saved driver shift.
- Penthouse returns the driver shift window fields used by the provider endpoint.

## Where To Watch Results In Penthouse

- `Admin -> Sentry`
  - endpoint URLs and feature toggles
- `Admin -> Testing`
  - quick integration and webhook checks
- `Admin -> Audit Logs`
  - sync and webhook records
- `Dispatch`
  - `Test Mode` badge
  - `Sync OK` or `Sync Failed`
  - `Undo Test Take`
  - `Save Note`
  - `Copy Steps`
- `Driver App`
  - real trip lifecycle changes
  - dispatch note banner
  - test trip checklist

## If Sentry Says Nothing Changed

Check these in order:

1. The trip actually moved through the matching state in the driver app.
2. The Sentry feature is enabled in `Admin -> Sentry`.
3. The saved base URL and credentials are correct.
4. The trip belongs to the connected company and environment.
5. The driver and vehicle are both present and usable.
6. Look at the trip's last sync badge in Dispatch. If it says `Sync Failed`, open `Admin -> Audit Logs`.

## Best Order To Run The Sheet

1. Save and verify Sentry credentials
2. Copy all URLs into the spreadsheet
3. Run webhook tests
4. Pick a driver and run `Take 1 Test Trip`
5. Move through one full trip lifecycle in the driver app
6. Verify driver work shifts
7. Verify driver and vehicle credential flows
