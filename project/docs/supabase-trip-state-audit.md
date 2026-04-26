# Supabase trip state audit (post-accept DB compare)

## Problem you might hit

`supabase db …` / `psql` against the hosted project sometimes fails intermittently because:

1. **CLI auth** uses short-lived tokens; refresh or SSO can break mid-session.
2. **Pooler (port 6543)** is meant for app traffic; some clients or `psql` settings hit **connection limits** or **Supavisor breaker** behavior on bursty CLI use.
3. **RLS** hides rows when using the **anon** key in ad-hoc queries.

Live browser and Admin UI checks can still pass while CLI-only audits flake.

## Recommended: REST audit script (no CLI DB login)

From `project/`:

```bash
node scripts/audit-trip-db-compare.mjs --trip=<SENTRY_TRIP_ID>
```

Or:

```bash
npm run audit:trip -- --trip=<SENTRY_TRIP_ID>
```

Set in `project/.env.local` (never commit secrets):

- `VITE_SUPABASE_URL` — project URL  
- `SUPABASE_SERVICE_ROLE_KEY` — **service role** (Dashboard → Settings → API). Required for a reliable row read across policies.

The script:

- Calls PostgREST (`/rest/v1/...`) with retries on `429`, `502`, `503`, `504`, and transient network errors.
- Prints `trip_assignments` and `marketplace_trips` for the trip plus a short field compare (`status`, `external_trip_status`, `raw_payload.status_id` vs assignment `status` / timestamps).

Optional flags: `--retries=5`, `--delay=400`.

## If you still want raw SQL

Use the Dashboard **SQL Editor** (session runs inside Supabase, no local CLI auth).

For local `psql`, prefer the **direct** connection string (host `db.<ref>.supabase.co`, **port 5432**, `sslmode=require`) from **Settings → Database**, not the transaction pooler URL, when running short admin queries.

## Driver app note

Driver polling and restore order trips by **`assigned_at`** (not `created_at`) so the newest assignment offer is the one surfaced. When auditing, compare `trip_assignments.assigned_at` / `accepted_at` with `marketplace_trips` status and `raw_payload.status_id` after accept.
