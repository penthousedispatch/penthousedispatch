#!/usr/bin/env node
/**
 * Phase 1 stability audit (local): verifies artifacts exist and unit tests pass.
 * Apply `supabase db push` (or CI migration) before expecting DB triggers/RPCs live.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const required = [
  ['SQL migration (monotonic lifecycle + idempotency + peek RPC)', 'supabase/migrations/20260424140000_phase1_driver_trip_lifecycle.sql'],
  ['Merge / precedence lib', 'src/lib/driverTripLifecycleMerge.js'],
  ['Idempotency RPC client', 'src/lib/claimDriverTripIdempotency.js'],
  ['Lifecycle diagnostic logger', 'src/utils/driverLifecycleDiagnostic.js'],
  ['Merge unit tests', 'src/lib/driverTripLifecycleMerge.test.js'],
  ['Vitest config', 'vitest.config.js'],
];

console.log('Phase 1 driver trip — local stability audit\n');

let ok = true;
for (const [label, rel] of required) {
  const p = path.join(root, rel);
  const pass = fs.existsSync(p);
  if (!pass) ok = false;
  console.log(pass ? `  [ok]   ${label}` : `  [FAIL] ${label} — missing ${rel}`);
}

console.log('\nItem 11 — primary client mutation surfaces (see DriverApp.jsx):');
console.log('  - poll: peek_driver_trip_offer RPC + trip_assignments fallback, Firebase notification');
console.log('  - restoreActiveTripFromDb: assignment + marketplace + cache');
console.log('  - acceptTrip / startRouteToPickup / markArrivedAtPickup / confirmPickup / completeTrip / markNoShow / rejectTrip');
console.log('  - realtime: single driver-trip-session channel → assignmentRealtimeEpoch → poll + schedule');
console.log('  - Sentry: sentryApi + sendSentryLifecycleStatus / ensureSentryAcceptedSync (unchanged for Phase 2)\n');

const t = spawnSync('npm', ['run', 'test', '--silent'], { cwd: root, stdio: 'inherit' });
if (t.status !== 0) {
  ok = false;
  console.log('[FAIL] vitest');
} else {
  console.log('[ok] vitest');
}

const b = spawnSync('npm', ['run', 'build', '--silent'], { cwd: root, stdio: 'inherit' });
if (b.status !== 0) {
  ok = false;
  console.log('[FAIL] vite build');
} else {
  console.log('[ok] vite build');
}

console.log(ok ? '\nAudit: PASS (local). Deploy migrations to staging for DB-backed checks.' : '\nAudit: FAIL');
process.exit(ok ? 0 : 1);
