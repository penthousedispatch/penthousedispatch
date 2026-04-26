#!/usr/bin/env node
/**
 * Compare trip_assignments vs marketplace_trips for one Sentry trip id using PostgREST.
 * Avoids `supabase db` / psql OAuth and pooler "connection breaker" flakes on short-lived CLI sessions.
 *
 * Env (load order: .env then .env.local from project root):
 *   VITE_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (recommended — anon often cannot read peer rows under RLS)
 *
 * Usage:
 *   cd project && node scripts/audit-trip-db-compare.mjs --trip=<sentry_trip_id>
 *
 * Optional:
 *   --retries=5   (default 5)
 *   --delay=400   ms between retries (default 400)
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
    out[k] = v.replace(/\r?\n/g, '').trim();
  }
  return out;
}

function parseArgs(argv) {
  const out = { trip: '', retries: 5, delay: 400 };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--trip=')) out.trip = a.slice('--trip='.length).trim();
    else if (a.startsWith('--retries=')) out.retries = Math.max(1, parseInt(a.slice('--retries='.length), 10) || 5);
    else if (a.startsWith('--delay=')) out.delay = Math.max(50, parseInt(a.slice('--delay='.length), 10) || 400);
  }
  return out;
}

function asJsonObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function restFetch(url, headers, { retries, delay }) {
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { _parseError: true, body: text.slice(0, 500) };
      }
      if (res.ok) return { ok: true, status: res.status, json };
      const retriable = [502, 503, 504, 429].includes(res.status) || res.status === 0;
      lastErr = new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
      if (!retriable || attempt === retries) return { ok: false, status: res.status, json, error: lastErr };
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      const retriable = /fetch|ECONNRESET|ETIMEDOUT|socket|network|TLS/i.test(msg);
      if (!retriable || attempt === retries) return { ok: false, status: 0, json: null, error: e };
    }
    await sleep(delay * attempt);
  }
  return { ok: false, status: 0, json: null, error: lastErr };
}

function summarizeRawPayload(raw) {
  const o = asJsonObject(raw);
  return {
    status_id: o.status_id ?? o.trip_status_id ?? o.trip_processing_status_id ?? null,
    keys: Object.keys(o).slice(0, 12),
  };
}

function main() {
  const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
  const args = parseArgs(process.argv);
  const tripId = args.trip;
  if (!tripId) {
    console.error('Usage: node scripts/audit-trip-db-compare.mjs --trip=<sentry_trip_id>');
    process.exit(1);
  }

  const base = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_SUPABASE_ANON_KEY || '';
  const key = serviceKey || anonKey;

  if (!base || !key) {
    console.error('Missing VITE_SUPABASE_URL (or SUPABASE_URL) and a key (SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY).');
    process.exit(1);
  }
  if (!serviceKey) {
    console.warn('Warning: using anon key — RLS may hide rows. Set SUPABASE_SERVICE_ROLE_KEY in .env.local for a full audit.\n');
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };

  const taSelect =
    'trip_id,driver_id,status,assigned_at,accepted_at,actual_pickup_time,trip_processing_status_id,company_id,driver_name,pu_address,do_address';
  const mtSelect =
    'sentry_trip_id,status,taken_by,company_id,external_trip_status,raw_payload,sentry_last_modified_at,loaded_at';

  const taUrl = `${base}/rest/v1/trip_assignments?trip_id=eq.${encodeURIComponent(tripId)}&select=${taSelect}`;
  const mtUrl = `${base}/rest/v1/marketplace_trips?sentry_trip_id=eq.${encodeURIComponent(tripId)}&select=${mtSelect}`;

  const opts = { retries: args.retries, delay: args.delay };

  const run = async () => {
    console.log('Supabase REST audit for trip_id / sentry_trip_id:', tripId);
    console.log('Host:', new URL(base).host);
    console.log('Retries:', opts.retries, 'base delay ms:', opts.delay);
    console.log('');

    const [taRes, mtRes] = await Promise.all([
      restFetch(taUrl, headers, opts),
      restFetch(mtUrl, headers, opts),
    ]);

    if (!taRes.ok) {
      console.error('trip_assignments fetch failed:', taRes.error?.message || taRes.status, taRes.json);
      process.exit(1);
    }
    if (!mtRes.ok) {
      console.error('marketplace_trips fetch failed:', mtRes.error?.message || mtRes.status, mtRes.json);
      process.exit(1);
    }

    const assignments = Array.isArray(taRes.json) ? taRes.json : [];
    const marketplace = Array.isArray(mtRes.json) ? mtRes.json : [];

    console.log('--- trip_assignments (', assignments.length, 'row(s)) ---');
    for (const row of assignments) {
      console.log(JSON.stringify(row, null, 2));
    }
    if (!assignments.length) {
      console.log('(none — check RLS or wrong trip id)');
    }

    console.log('\n--- marketplace_trips (', marketplace.length, 'row(s)) ---');
    for (const row of marketplace) {
      const slim = {
        ...row,
        raw_payload_summary: summarizeRawPayload(row?.raw_payload),
      };
      if (slim.raw_payload && typeof slim.raw_payload === 'object') {
        slim.raw_payload = `(object, ${Object.keys(slim.raw_payload).length} keys — see raw_payload_summary.status_id)`;
      }
      console.log(JSON.stringify(slim, null, 2));
    }
    if (!marketplace.length) {
      console.log('(none — check RLS or trip not in marketplace_trips)');
    }

    const mt0 = marketplace[0] || {};
    const raw = asJsonObject(mt0.raw_payload);
    const statusId = raw.status_id ?? raw.trip_status_id ?? raw.trip_processing_status_id ?? null;

    console.log('\n--- quick compare ---');
    console.log('marketplace_trips.status:', mt0.status ?? '(n/a)');
    console.log('marketplace_trips.external_trip_status:', mt0.external_trip_status ?? '(n/a)');
    console.log('raw_payload.status_id (numeric lifecycle):', statusId ?? '(n/a)');
    for (const a of assignments) {
      console.log(`trip_assignments[driver=${a.driver_id}] status:`, a.status, '| assigned_at:', a.assigned_at, '| accepted_at:', a.accepted_at);
    }
    console.log('\nDone.');
  };

  run().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

main();
