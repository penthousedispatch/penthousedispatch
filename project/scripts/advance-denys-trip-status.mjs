#!/usr/bin/env node
/**
 * Advance a live Sentry/MTA-style trip through broker status 3–6 (in_progress → arrived → picked_up → completed),
 * then mirror state into Supabase trip_assignments + marketplace_trips.
 *
 * Usage:
 *   node scripts/advance-denys-trip-status.mjs --trip=<SENTRY_TRIP_ID> --status=3|4|5|6
 *   node scripts/advance-denys-trip-status.mjs --trip=<SENTRY_TRIP_ID> --step=5   # alias for --status
 *
 * Legacy wrappers (same behavior): advance-denys-status3.mjs … status6.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const ALLOWED = new Set([3, 4, 5, 6]);

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
  const out = { trip: '', status: 0 };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--trip=')) out.trip = a.slice('--trip='.length).trim();
    else if (a.startsWith('--status=')) out.status = Number(a.slice('--status='.length).trim());
    else if (a.startsWith('--step=')) out.status = Number(a.slice('--step='.length).trim());
  }
  return out;
}

function fail(...parts) {
  console.error(...parts);
  process.exit(1);
}

async function httpJson(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, data: json };
}

function fmtOffsetIso(date = new Date()) {
  const d = new Date(date);
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(tz) / 60)).padStart(2, '0');
  const mm = String(Math.abs(tz) % 60).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mon}-${day}T${h}:${m}:${s}${sign}${hh}:${mm}`;
}

function normalizeStateCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'NY';
  if (raw === 'NEW YORK') return 'NY';
  return raw.slice(0, 2);
}

function requireSentryDriverVehicle(driver) {
  if (!driver?.sentry_driver_id || !driver?.sentry_vehicle_id) {
    fail('Driver is missing Sentry driver/vehicle ids', driver);
  }
}

function collectedFareFrom(assignment, marketplaceTrip) {
  const rawPayload =
    marketplaceTrip?.raw_payload && typeof marketplaceTrip.raw_payload === 'object'
      ? marketplaceTrip.raw_payload
      : {};
  const rawPrices = rawPayload?.prices && typeof rawPayload.prices === 'object' ? rawPayload.prices : {};
  return (
    assignment.collected_fare ??
    rawPayload.collected_fare ??
    rawPayload.collected_fare_amount ??
    rawPayload?.mta?.collected_fare ??
    rawPrices.fare ??
    0
  );
}

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
const args = parseArgs(process.argv);

if (!args.trip) {
  fail(
    'Usage: node scripts/advance-denys-trip-status.mjs --trip=<SENTRY_TRIP_ID> --status=3|4|5|6\n' +
      '  (--step= is an alias for --status=)  See script header for broker stage meanings.'
  );
}
if (!ALLOWED.has(args.status)) {
  fail(`--status/--step must be one of ${[...ALLOWED].join(', ')} (got ${args.status})`);
}

const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!supabaseUrl || !serviceRole) fail('Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');

const sbHeaders = {
  apikey: serviceRole,
  Authorization: `Bearer ${serviceRole}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const sentryConfigUrl = `${supabaseUrl}/rest/v1/sentry_config?select=base_url,username,password_enc,enabled,created_at&enabled=eq.true&order=created_at.desc&limit=1`;
const sentryConfigRes = await httpJson(sentryConfigUrl, { headers: sbHeaders });
if (!sentryConfigRes.ok || !Array.isArray(sentryConfigRes.data) || !sentryConfigRes.data[0]) {
  fail('Could not load sentry_config', sentryConfigRes.status, sentryConfigRes.data);
}
const sentryConfig = sentryConfigRes.data[0];

const assignmentUrl =
  `${supabaseUrl}/rest/v1/trip_assignments` +
  `?trip_id=eq.${encodeURIComponent(args.trip)}` +
  `&select=id,trip_id,driver_id,driver_name,status,accepted_at,assigned_at,actual_pickup_time,collected_fare,is_next_day,next_day_requested_at,company_id,drivers!inner(id,full_name,current_lat,current_lng,license_number,license_state,vehicle_plate,sentry_driver_id,sentry_vehicle_id,vehicle_id)` +
  `&order=accepted_at.desc.nullslast,assigned_at.desc.nullslast` +
  `&limit=1`;

const assignmentRes = await httpJson(assignmentUrl, { headers: sbHeaders });
if (!assignmentRes.ok || !Array.isArray(assignmentRes.data) || !assignmentRes.data[0]) {
  fail('Could not load trip assignment', assignmentRes.status, assignmentRes.data);
}
const assignment = assignmentRes.data[0];
const driver = Array.isArray(assignment.drivers) ? assignment.drivers[0] : assignment.drivers;
if (!driver?.id) fail('Assignment has no joined driver', assignment);

let vehicleRow = null;
if (driver.vehicle_id) {
  const vehicleUrl =
    `${supabaseUrl}/rest/v1/vehicles` +
    `?select=id,make,model,year,license_plate,sentry_vehicle_id` +
    `&id=eq.${encodeURIComponent(driver.vehicle_id)}` +
    `&limit=1`;
  const vehicleRes = await httpJson(vehicleUrl, { headers: sbHeaders });
  if (vehicleRes.ok && Array.isArray(vehicleRes.data) && vehicleRes.data[0]) vehicleRow = vehicleRes.data[0];
}

const marketplaceUrl =
  `${supabaseUrl}/rest/v1/marketplace_trips` +
  `?sentry_trip_id=eq.${encodeURIComponent(args.trip)}` +
  `&select=sentry_trip_id,pu_address,do_address,status,company_id,taken_by,sentry_last_modified_at,external_trip_status,raw_payload`;

const marketplaceRes = await httpJson(marketplaceUrl, { headers: sbHeaders });
if (!marketplaceRes.ok || !Array.isArray(marketplaceRes.data) || !marketplaceRes.data[0]) {
  fail('Could not load marketplace trip', marketplaceRes.status, marketplaceRes.data);
}
const marketplaceTrip = marketplaceRes.data[0];

const sentryHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Basic ${Buffer.from(`${sentryConfig.username}:${sentryConfig.password_enc}`).toString('base64')}`,
};
const sentryBase = sentryConfig.base_url.replace(/\/$/, '');

async function sentry(method, pathName, body) {
  return httpJson(`${sentryBase}${pathName}`, {
    method,
    headers: sentryHeaders,
    body,
  });
}

async function sentryGetTripVersion(tripId) {
  const today = new Date();
  const dateMin = today.toISOString().slice(0, 10);
  const dateMax = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const res = await sentry('GET', `/rest/transportation_provider_facade/v4.0/trips.json?date_min=${dateMin}&date_max=${dateMax}`);
  if (!res.ok || !Array.isArray(res.data)) return null;
  return res.data.find((trip) => String(trip?.trip_id || '') === String(tripId)) || null;
}

const brokerTrip = await sentryGetTripVersion(args.trip);
if (!brokerTrip) fail(`Could not find broker trip version before status ${args.status}`);

const tripId = args.trip;
const updateStatusPath = `/rest/transportation_provider_facade/v4.0/trips/${encodeURIComponent(tripId)}/update_status`;

async function patchAssignment(body) {
  const assignmentPatchRes = await httpJson(
    `${supabaseUrl}/rest/v1/trip_assignments?id=eq.${encodeURIComponent(assignment.id)}`,
    { method: 'PATCH', headers: sbHeaders, body }
  );
  if (!assignmentPatchRes.ok) {
    fail('Could not patch trip_assignment', assignmentPatchRes.status, assignmentPatchRes.data);
  }
}

async function patchMarketplaceTrip(body) {
  const marketplacePatchRes = await httpJson(
    `${supabaseUrl}/rest/v1/marketplace_trips?sentry_trip_id=eq.${encodeURIComponent(tripId)}`,
    { method: 'PATCH', headers: sbHeaders, body }
  );
  if (!marketplacePatchRes.ok) {
    fail('Could not patch marketplace_trips', marketplacePatchRes.status, marketplacePatchRes.data);
  }
}

/** @param {number} status */
async function runStatus(status) {
  const nowIso = fmtOffsetIso(new Date());
  const pickupAddress = String(marketplaceTrip.pu_address || '').trim();

  if (status === 3) {
    requireSentryDriverVehicle(driver);
    const payload = {
      status_id: 3,
      last_modified_at:
        String(brokerTrip.last_modified_at || marketplaceTrip.sentry_last_modified_at || '').trim() || nowIso,
      driver: {
        id: Number(driver.sentry_driver_id),
        dmv_license: {
          license_number: String(driver.license_number || '').trim(),
          state_code: normalizeStateCode(driver.license_state),
        },
      },
      vehicle: {
        id: Number(driver.sentry_vehicle_id),
        dmv_registration: {
          license_plate_number: String(driver.vehicle_plate || vehicleRow?.license_plate || '').trim(),
        },
        location: Object.fromEntries(
          Object.entries({
            lat: driver.current_lat,
            lng: driver.current_lng,
            address: pickupAddress || undefined,
            timestamp: nowIso,
          }).filter(([, value]) => value !== null && value !== undefined && value !== '')
        ),
      },
    };
    const statusRes = await sentry('POST', updateStatusPath, payload);
    if (!statusRes.ok) fail('Sentry status 3 failed', statusRes.status, statusRes.data);
    await patchAssignment({
      status: 'in_progress',
      trip_processing_status_id: 3,
      accepted_at: assignment.accepted_at || assignment.assigned_at || nowIso,
    });
    await patchMarketplaceTrip({
      status: 'in_progress',
      external_trip_status: 'in_progress',
      sentry_last_modified_at:
        String(statusRes.data?.last_modified_at || payload.last_modified_at || '').trim() || payload.last_modified_at,
    });
    return {
      statusRes,
      payload,
      extra: {
        status3_status: statusRes.status,
        status3_payload: payload,
        status3_response: statusRes.data,
      },
    };
  }

  if (status === 4) {
    requireSentryDriverVehicle(driver);
    const arrivedAt = fmtOffsetIso(new Date());
    const payload = {
      status_id: 4,
      last_modified_at:
        String(brokerTrip.last_modified_at || marketplaceTrip.sentry_last_modified_at || '').trim() || arrivedAt,
      pick_up_arrival_timestamp: arrivedAt,
      driver: {
        id: Number(driver.sentry_driver_id),
        dmv_license: {
          license_number: String(driver.license_number || '').trim(),
          state_code: normalizeStateCode(driver.license_state),
        },
      },
      vehicle: {
        id: Number(driver.sentry_vehicle_id),
        dmv_registration: {
          license_plate_number: String(driver.vehicle_plate || vehicleRow?.license_plate || '').trim(),
        },
      },
    };
    const statusRes = await sentry('POST', updateStatusPath, payload);
    if (!statusRes.ok) fail('Sentry status 4 failed', statusRes.status, statusRes.data);
    await patchAssignment({
      status: 'arrived',
      trip_processing_status_id: 4,
    });
    await patchMarketplaceTrip({
      status: 'arrived',
      external_trip_status: 'arrived',
      sentry_last_modified_at:
        String(statusRes.data?.last_modified_at || payload.last_modified_at || '').trim() || payload.last_modified_at,
    });
    return {
      statusRes,
      payload,
      extra: {
        arrived_at: arrivedAt,
        status4_status: statusRes.status,
        status4_payload: payload,
        status4_response: statusRes.data,
      },
    };
  }

  if (status === 5) {
    requireSentryDriverVehicle(driver);
    const collectedFare = collectedFareFrom(assignment, marketplaceTrip);
    const pickedUpAt = fmtOffsetIso(new Date());
    const arrivedAt =
      String(brokerTrip.pick_up_arrival_timestamp || '').trim() ||
      String(assignment.actual_pickup_time || '').trim() ||
      fmtOffsetIso(new Date(Date.now() - 5 * 60 * 1000));

    const payload = {
      status_id: 5,
      last_modified_at:
        String(brokerTrip.last_modified_at || marketplaceTrip.sentry_last_modified_at || '').trim() || pickedUpAt,
      pick_up_timestamp: pickedUpAt,
      pick_up_arrival_timestamp: arrivedAt,
      mta: {
        collected_fare: Number(collectedFare),
      },
      driver: {
        id: Number(driver.sentry_driver_id),
        dmv_license: {
          license_number: String(driver.license_number || '').trim(),
          state_code: normalizeStateCode(driver.license_state),
        },
      },
      vehicle: {
        id: Number(driver.sentry_vehicle_id),
        dmv_registration: {
          license_plate_number: String(driver.vehicle_plate || vehicleRow?.license_plate || '').trim(),
        },
      },
    };
    const statusRes = await sentry('POST', updateStatusPath, payload);
    if (!statusRes.ok) fail('Sentry status 5 failed', statusRes.status, statusRes.data);
    await patchAssignment({
      status: 'picked_up',
      trip_processing_status_id: 5,
      actual_pickup_time: pickedUpAt,
      collected_fare: Number(collectedFare),
    });
    await patchMarketplaceTrip({
      status: 'picked_up',
      external_trip_status: 'picked_up',
      sentry_last_modified_at:
        String(statusRes.data?.last_modified_at || payload.last_modified_at || '').trim() || payload.last_modified_at,
    });
    return {
      statusRes,
      payload,
      extra: {
        arrived_at: arrivedAt,
        picked_up_at: pickedUpAt,
        collected_fare: Number(collectedFare),
        status5_status: statusRes.status,
        status5_payload: payload,
        status5_response: statusRes.data,
      },
    };
  }

  if (status === 6) {
    requireSentryDriverVehicle(driver);
    const collectedFare = collectedFareFrom(assignment, marketplaceTrip);
    const completedAt = fmtOffsetIso(new Date());
    const pickUpTimestamp = String(brokerTrip.pick_up_timestamp || assignment.actual_pickup_time || '').trim();
    if (!pickUpTimestamp) fail('Trip is missing pick_up_timestamp for status 6');
    const arrivedAt =
      String(brokerTrip.pick_up_arrival_timestamp || '').trim() ||
      fmtOffsetIso(new Date(Date.now() - 5 * 60 * 1000));

    const payload = {
      status_id: 6,
      last_modified_at:
        String(brokerTrip.last_modified_at || marketplaceTrip.sentry_last_modified_at || '').trim() || completedAt,
      drop_off_timestamp: completedAt,
      pick_up_timestamp: pickUpTimestamp,
      pick_up_arrival_timestamp: arrivedAt,
      mta: {
        collected_fare: Number(collectedFare),
      },
      driver: {
        id: Number(driver.sentry_driver_id),
        dmv_license: {
          license_number: String(driver.license_number || '').trim(),
          state_code: normalizeStateCode(driver.license_state),
        },
      },
      vehicle: {
        id: Number(driver.sentry_vehicle_id),
        dmv_registration: {
          license_plate_number: String(driver.vehicle_plate || vehicleRow?.license_plate || '').trim(),
        },
      },
    };
    const statusRes = await sentry('POST', updateStatusPath, payload);
    if (!statusRes.ok) fail('Sentry status 6 failed', statusRes.status, statusRes.data);
    await patchAssignment({
      status: 'completed',
      trip_processing_status_id: 6,
      completed_at: completedAt,
      actual_dropoff_time: completedAt,
      collected_fare: Number(collectedFare),
      is_next_day: Boolean(assignment.is_next_day),
      next_day_requested_at: assignment.next_day_requested_at || null,
    });
    await patchMarketplaceTrip({
      status: 'completed',
      external_trip_status: 'completed',
      sentry_last_modified_at:
        String(statusRes.data?.last_modified_at || payload.last_modified_at || '').trim() || payload.last_modified_at,
    });
    return {
      statusRes,
      payload,
      extra: {
        picked_up_at: pickUpTimestamp,
        arrived_at: arrivedAt,
        completed_at: completedAt,
        collected_fare: Number(collectedFare),
        status6_status: statusRes.status,
        status6_payload: payload,
        status6_response: statusRes.data,
      },
    };
  }

  fail('Unreachable');
}

const result = await runStatus(args.status);

console.log(
  JSON.stringify(
    {
      ok: true,
      trip: args.trip,
      status: args.status,
      local_driver: {
        id: driver.id,
        full_name: driver.full_name,
      },
      sentry_driver_id: driver.sentry_driver_id,
      sentry_vehicle_id: driver.sentry_vehicle_id,
      ...result.extra,
    },
    null,
    2
  )
);
