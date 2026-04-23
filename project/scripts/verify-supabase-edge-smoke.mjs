#!/usr/bin/env node
/**
 * Quick smoke: Supabase Edge gateway + sentry-provider / sentry-receivers.
 * Loads .env then .env.local (trimmed); does not print secrets.
 * Usage: node scripts/verify-supabase-edge-smoke.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvFile(rel) {
  const out = {};
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) return out;
  for (const line of fs.readFileSync(fp, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    v = v.replace(/\r?\n/g, '').trim();
    out[k] = v;
  }
  return out;
}

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
const base = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anon = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_SUPABASE_ANON_KEY || '';

if (!base || !anon) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env / .env.local');
  process.exit(1);
}

const edge = `${base}/functions/v1`;
const gateway = {
  apikey: anon,
  Authorization: `Bearer ${anon}`,
};

async function main() {
  console.log('Supabase host:', new URL(base).host);

  const r0 = await fetch(`${edge}/sentry-provider/rest/gc/retrieve_trips.json?trip_ids=smoke`, {
    method: 'GET',
    headers: gateway,
  });
  const t0 = await r0.text();
  console.log(
    'sentry-provider retrieve_trips (no webhook secret):',
    'HTTP',
    r0.status,
    r0.headers.get('x-sentry-provider-version') || '',
    t0.slice(0, 80).replace(/\s+/g, ' '),
  );

  const r1 = await fetch(`${edge}/sentry-receivers/trips_receiver`, {
    method: 'POST',
    headers: { ...gateway, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trips: [{ trip_id: `smoke-${Date.now()}`, pickup_address: '1 Test' }] }),
  });
  const t1 = await r1.text();
  console.log('sentry-receivers trips_receiver (no webhook secret):', 'HTTP', r1.status, t1.slice(0, 120).replace(/\s+/g, ' '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
