# PCO Architecture

## Modules

- Identity & Compliance
- Vehicle Compliance
- Company Records
- Shifts & Attendance
- Complaints & QA
- Billing & Reconciliation
- Driver Pay
- Audit & Alerts

## What stays in Penthouse Dispatch

- live dispatch board
- maps
- trip assignment
- rider tracking
- driver chat
- marketplace intake
- company AI routing controls

## What moves into PCO

- driver credential files
- vehicle documents and expirations
- W-9 and company insurance
- complaint workflows
- reconciliation and pay batches
- audit logs

## Integration approach later

- shared auth
- shared company and driver ids
- event-based sync between Dispatch and PCO
- separate deployment and separate UI shell

## Principle

Do not copy Sentry screen-for-screen. Keep the boring data, but make it operationally useful.
