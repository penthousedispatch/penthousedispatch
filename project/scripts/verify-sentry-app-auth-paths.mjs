#!/usr/bin/env node
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
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value.replace(/\r?\n/g, '').trim();
  }
  return out;
}

async function httpJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function summarizePayloadShape(payload) {
  if (Array.isArray(payload)) {
    const first = payload[0];
    return {
      type: 'array',
      count: payload.length,
      first_keys: first && typeof first === 'object' ? Object.keys(first).slice(0, 10) : [],
    };
  }
  if (payload && typeof payload === 'object') {
    return {
      type: 'object',
      keys: Object.keys(payload).slice(0, 12),
    };
  }
  return {
    type: typeof payload,
    value: payload,
  };
}

const env = {
  ...loadEnvFile('.env'),
  ...loadEnvFile('.env.local'),
};

const supabaseUrl = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_SUPABASE_ANON_KEY || '';
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY || '';
const webhookSecret =
  env.SENTRY_WEBHOOK_SECRET ||
  env.VITE_SENTRY_WEBHOOK_SECRET ||
  env.EDGE_SENTRY_WEBHOOK_SECRET ||
  '';

if (!supabaseUrl || !anonKey || !serviceRole) {
  console.error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const edgeBase = `${supabaseUrl}/functions/v1`;
const serviceHeaders = {
  apikey: serviceRole,
  Authorization: `Bearer ${serviceRole}`,
  'Content-Type': 'application/json',
};

async function getSentryConfig() {
  const res = await httpJson(
    `${supabaseUrl}/rest/v1/sentry_config?select=enabled,feat_marketplace_trips,feat_trip_accept_reject,feat_trip_status_update,feat_vehicle_locations,feat_driver_work_shifts,feat_retrieve_trips,webhook_auth_mode,webhook_secret&order=updated_at.desc&limit=1`,
    { headers: serviceHeaders }
  );
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row?.enabled) {
    throw new Error('No enabled sentry_config row found');
  }
  return row;
}

async function findProviderVisibleVehiclePlate(authMode, effectiveSecret) {
  const locationsRes = await providerGet('rest/gc/vehicle_locations.json', authMode, effectiveSecret);
  const rows = Array.isArray(locationsRes.data?.vehicle_locations) ? locationsRes.data.vehicle_locations : [];
  for (const row of rows) {
    const plate = String(row?.license_plate_number || '').trim();
    if (plate) return plate;
  }
  return '';
}

async function edgeOutbound(method, sentryPath, body = null) {
  return httpJson(`${edgeBase}/sentry-outbound/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      method,
      path: sentryPath,
      body,
    }),
  });
}

async function providerGet(pathWithQuery, authMode, effectiveSecret) {
  const querySecret =
    authMode === 'query' && effectiveSecret
      ? `${pathWithQuery.includes('?') ? '&' : '?'}secret=${encodeURIComponent(effectiveSecret)}`
      : '';
  const authHeaders = {
    apikey: anonKey,
    Authorization:
      authMode === 'bearer' && effectiveSecret
        ? `Bearer ${effectiveSecret}`
        : `Bearer ${anonKey}`,
  };
  return httpJson(`${edgeBase}/sentry-provider/${pathWithQuery}${querySecret}`, {
    method: 'GET',
    headers: authHeaders,
  });
}

const cfg = await getSentryConfig();
const authMode = String(cfg.webhook_auth_mode || 'bearer');
const effectiveSecret = String(cfg.webhook_secret || webhookSecret || '');
const now = new Date();
const plusOneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const plusTwoDays = new Date(now.getTime() + 48 * 60 * 60 * 1000);
const dateMin = now.toISOString().slice(0, 10);
const dateMax = plusTwoDays.toISOString().slice(0, 10);

const checks = [];

async function runCheck(name, fn) {
  try {
    const result = await fn();
    checks.push({
      name,
      status: result.ok ? 'pass' : 'fail',
      http_status: result.status,
      shape: summarizePayloadShape(result.data),
    });
  } catch (error) {
    checks.push({
      name,
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

await runCheck('marketplace_trips_list_via_app_path', () =>
  edgeOutbound(
    'GET',
    `/rest/transportation_provider_facade/v4.0/marketplace_trips.json?date_min=${encodeURIComponent(dateMin)}&date_max=${encodeURIComponent(dateMax)}`
  )
);

await runCheck('assigned_trips_list_via_app_path', () =>
  edgeOutbound(
    'GET',
    `/rest/transportation_provider_facade/v4.0/trips.json?date_min=${encodeURIComponent(dateMin)}&date_max=${encodeURIComponent(dateMax)}`
  )
);

await runCheck('provider_retrieve_trips_via_app_path', () =>
  providerGet(`rest/gc/retrieve_trips.json?date=${encodeURIComponent(dateMin)}`, authMode, effectiveSecret)
);

await runCheck('provider_vehicle_locations_via_app_path', () =>
  providerGet('rest/gc/vehicle_locations.json', authMode, effectiveSecret)
);

const vehiclePlate = await findProviderVisibleVehiclePlate(authMode, effectiveSecret);
if (vehiclePlate) {
  await runCheck('provider_vehicle_location_single_via_app_path', () =>
    providerGet(`rest/gc/vehicle_location.json?license_plate_number=${encodeURIComponent(vehiclePlate)}`, authMode, effectiveSecret)
  );
}

await runCheck('provider_driver_work_shifts_via_app_path', () =>
  edgeOutbound(
    'GET',
    `/rest/transportation_provider_facade/v4.0/driver_work_shifts.json?start_timestamp_max=${encodeURIComponent(plusTwoDays.toISOString())}&end_timestamp_min=${encodeURIComponent(now.toISOString())}`
  )
);

console.log(JSON.stringify({
  ran_at: new Date().toISOString(),
  auth_mode: authMode,
  checks,
  summary: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: checks.filter(check => check.status === 'fail').length,
  },
}, null, 2));
