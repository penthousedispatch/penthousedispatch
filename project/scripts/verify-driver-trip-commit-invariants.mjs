#!/usr/bin/env node
/**
 * Guardrail: keep driver trip UI mutations behind commitDriverTrip + metadata.
 * Prevents accidental reintroduction of setCurrentTrip or untagged commits (stability regressions).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const driverApp = path.join(root, 'src/pages/driver/DriverApp.jsx');

let ok = true;
const text = fs.readFileSync(driverApp, 'utf8');

if (/\bsetCurrentTrip\b/.test(text)) {
  console.error('[FAIL] DriverApp.jsx must not use setCurrentTrip — use commitDriverTrip(update, { source, reason }).');
  ok = false;
}

const needle = 'commitDriverTrip(';
let from = 0;
let index = 0;
while ((index = text.indexOf(needle, from)) !== -1) {
  const tail = text.slice(index + needle.length, index + needle.length + 4000);
  if (!/\bsource:\s*['"]/.test(tail)) {
    const line = text.slice(0, index).split('\n').length;
    console.error(`[FAIL] commitDriverTrip at line ~${line} missing { source: '...' } metadata within next 4k chars.`);
    ok = false;
  }
  from = index + needle.length;
}

if (ok) {
  console.log('[ok] driver trip commit invariants (DriverApp.jsx)');
}
process.exit(ok ? 0 : 1);
