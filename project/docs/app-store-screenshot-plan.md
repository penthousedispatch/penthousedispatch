# Penthouse Dispatch Screenshot Plan

Use this file to capture screenshots in a consistent order for Apple App Store Connect and Google Play Console.

## General rules

- Use the new domain when possible:
  - `https://www.penthousedps.com`
- Prefer realistic, clean demo data
- Avoid exposing test secrets, bearer tokens, or internal error messages
- Keep the same visual order across iPhone and Android when possible
- Use light mode only if the screens are fully readable and stable
- If dark mode looks stronger and more consistent, use dark mode for the store set

## Recommended primary screenshot set

### 1. Admin Ops Center

Show:
- platform health cards
- clean top navigation
- polished admin shell

Suggested route:
- `/admin/ops`

### 2. Company Dispatch Dashboard

Show:
- live map
- driver fleet column
- trip queue column

Suggested route:
- company dashboard map view

### 3. Company Drivers

Show:
- the redesigned CLJExpress driver roster
- stats cards
- edit/delete actions

Suggested route:
- company `Drivers`

### 4. Driver App Active Shift

Show:
- driver map
- active status
- trip preference controls

Suggested route:
- `/driver`

### 5. Rider Tracking

Show:
- accepted trip
- vehicle on map
- driver identity
- tracking link/share controls

Suggested route:
- rider preview / rider trip screen

### 6. AI Settings

Show:
- route planning
- auto-assignment
- company scheduling priorities

Suggested route:
- company `AI Settings`

## Optional extra screenshots

### 7. Marketplace

Show:
- marketplace queue
- refresh/pull workflow if stable

### 8. Driver Pay

Show:
- pay controls
- payout or rate settings

### 9. Company Guides

Show:
- audio guide support
- onboarding/help cards

## Apple sizes to prepare

At minimum, plan for:
- 6.7-inch iPhone
- 6.5-inch iPhone

If you support iPad and want iPad listing coverage:
- 12.9-inch iPad

## Google Play sizes to prepare

At minimum:
- phone screenshots

Optional:
- 7-inch tablet
- 10-inch tablet

## Capture order

1. Admin Ops Center
2. Company Dispatch Dashboard
3. Company Drivers
4. Driver App
5. Rider Tracking
6. AI Settings

## Before final export

- close any toasts
- hide browser chrome if using simulator/device captures
- hide debug overlays
- hide test or error logs
- confirm the map has loaded fully

## Notes

- If one screen is unstable, skip it and use a stronger one.
- The goal is to show confidence, clarity, and operational polish.
