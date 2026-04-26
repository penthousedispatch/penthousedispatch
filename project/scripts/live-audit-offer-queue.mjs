#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readEnvFile(relPath) {
  const out = {};
  const filePath = path.join(root, relPath);
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
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
    out[key] = value;
  }
  return out;
}

function loadEnv() {
  return {
    ...readEnvFile('.env'),
    ...readEnvFile('.env.local'),
  };
}

async function requestJson(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    data,
    text,
  };
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function asJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function extractTripLifecycleStatusId(trip = {}) {
  const raw = asJsonObject(trip.raw_payload);
  const nestedTrip = asJsonObject(raw.trip);
  const value = Number(
    trip.status_id ??
    trip.trip_status_id ??
    trip.trip_processing_status_id ??
    raw.status_id ??
    raw.trip_status_id ??
    raw.trip_processing_status_id ??
    nestedTrip.status_id ??
    nestedTrip.trip_status_id ??
    nestedTrip.trip_processing_status_id
  );
  return Number.isFinite(value) ? value : null;
}

function deriveMarketplaceLifecycleStatus(trip = {}) {
  const status = String(trip.status || '').toLowerCase().trim();
  const external = String(trip.external_trip_status || '').toLowerCase().trim();
  const statusId = extractTripLifecycleStatusId(trip);

  if (statusId === 6 || ['completed', 'complete', 'done', 'closed'].includes(status) || ['completed', 'complete', 'done', 'closed'].includes(external)) {
    return 'completed';
  }
  if (
    statusId === 7 ||
    statusId === 8 ||
    ['cancelled', 'canceled', 'no_show', 'rejected'].includes(status) ||
    ['cancelled', 'canceled', 'no_show', 'rejected'].includes(external)
  ) {
    return 'cancelled';
  }
  if (statusId === 5 || ['picked_up', 'picked-up', 'on_trip'].includes(status) || ['picked_up', 'picked-up', 'on_trip'].includes(external)) {
    return 'picked_up';
  }
  if (statusId === 4 || ['arrived', 'arrived_at_pickup'].includes(status) || ['arrived', 'arrived_at_pickup'].includes(external)) {
    return 'arrived';
  }
  if (
    statusId === 3 ||
    statusId === 2 ||
    ['accepted', 'assigned', 'locked', 'in_progress', 'in progress', 'en_route', 'en route'].includes(status) ||
    ['accepted', 'assigned', 'locked', 'in_progress', 'in progress', 'en_route', 'en route'].includes(external)
  ) {
    return 'accepted';
  }
  return 'available';
}

function isOfferableMarketplaceTrip(trip = {}) {
  const takenBy = trip.taken_by;
  return (takenBy == null || takenBy === '') && deriveMarketplaceLifecycleStatus(trip) === 'available';
}

function compareTripsByPickupTime(a, b) {
  const parseComparableTime = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return Number.POSITIVE_INFINITY;
    const parsed = new Date(raw).getTime();
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
  };
  const timeDiff = parseComparableTime(a?.pu_time) - parseComparableTime(b?.pu_time);
  if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff;
  return new Date(a?.loaded_at || 0).getTime() - new Date(b?.loaded_at || 0).getTime();
}

const env = loadEnv();
const base = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY || '';

must(base, 'Missing VITE_SUPABASE_URL');
must(serviceRole, 'Missing SUPABASE_SERVICE_ROLE_KEY');

const restHeaders = {
  apikey: serviceRole,
  Authorization: `Bearer ${serviceRole}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const cleanup = {
  driverIds: [],
  tripIds: [],
};

async function restSelect(table, query) {
  return requestJson(`${base}/rest/v1/${table}?${query}`, {
    headers: restHeaders,
  });
}

async function restInsert(table, payload) {
  return requestJson(`${base}/rest/v1/${table}`, {
    method: 'POST',
    headers: restHeaders,
    body: JSON.stringify(payload),
  });
}

async function restDelete(table, query) {
  return requestJson(`${base}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: restHeaders,
  });
}

async function chooseCompanyId() {
  const companies = await restSelect(
    'companies',
    'select=id,company_name,is_approved,onboarding_status,is_suspended&order=company_name.asc&limit=50'
  );
  must(companies.ok && Array.isArray(companies.data), `Could not load companies (${companies.status})`);
  const picked = companies.data.find(
    row => !row.is_suspended && (row.is_approved || String(row.onboarding_status || '').toLowerCase() === 'approved')
  );
  must(picked?.id, 'No approved company found for live offer queue audit');
  return picked;
}

async function createDriver(companyId, label) {
  const token = `${label}-${Date.now().toString(36)}`.toUpperCase();
  const inserted = await restInsert('drivers', {
    driver_number: token,
    full_name: `Audit Queue ${label}`,
    status: 'online',
    is_active: true,
    current_lat: 40.6782,
    current_lng: -73.9442,
    company_id: companyId,
    tlc_number: token,
    login_username: token.toLowerCase(),
    login_password: token,
  });
  must(inserted.ok && Array.isArray(inserted.data) && inserted.data[0]?.id, `Driver creation failed for ${label}`);
  cleanup.driverIds.push(inserted.data[0].id);
  return inserted.data[0];
}

async function seedMarketplaceTrip(companyId, suffix, pickupAt, loadedAt, { takenBy = null, status = 'available', externalStatus = 'available', rawStatusId = 1 } = {}) {
  const tripId = `AUDIT-OFFER-${suffix}-${Date.now().toString(36).toUpperCase()}`;
  const inserted = await restInsert('marketplace_trips', {
    sentry_trip_id: tripId,
    sentry_last_modified_at: loadedAt,
    date_val: pickupAt.slice(0, 10),
    los: 'Ambulatory',
    passengers: '1',
    mileage: '5.5',
    pu_address: `${suffix} Audit Pickup, New York NY`,
    pu_city: 'New York',
    pu_zip: '10001',
    pu_time: pickupAt,
    do_address: `${suffix} Audit Dropoff, New York NY`,
    do_city: 'New York',
    do_zip: '10002',
    do_time: '',
    delivery_price: '30',
    status,
    taken_by: takenBy,
    company_id: companyId,
    assignment_type_code: 'TEST',
    external_trip_status: externalStatus,
    raw_payload: {
      trip_id: tripId,
      trip_status: externalStatus,
      status_id: rawStatusId,
      scheduled_pickup_time: pickupAt,
    },
    loaded_at: loadedAt,
    pu_lat: 40.6782,
    pu_lng: -73.9442,
    do_lat: 40.7128,
    do_lng: -74.0060,
  });
  must(inserted.ok, `Marketplace seed failed for ${tripId}`);
  cleanup.tripIds.push(tripId);
  return tripId;
}

async function main() {
  const company = await chooseCompanyId();
  const otherDriver = await createDriver(company.id, 'Other Driver');

  const now = Date.now();
  const shadowAcceptedTripId = await seedMarketplaceTrip(
    company.id,
    'SHADOW',
    new Date(now + 5 * 60 * 1000).toISOString(),
    new Date(now - 5 * 60 * 1000).toISOString(),
    {
      takenBy: null,
      status: 'available',
      externalStatus: 'accepted',
      rawStatusId: 2,
    }
  );

  const takenByOtherTripId = await seedMarketplaceTrip(
    company.id,
    'TAKEN',
    new Date(now + 10 * 60 * 1000).toISOString(),
    new Date(now - 4 * 60 * 1000).toISOString(),
    {
      takenBy: otherDriver.id,
      status: 'available',
      externalStatus: 'available',
      rawStatusId: 1,
    }
  );

  const expectedFirstTripId = await seedMarketplaceTrip(
    company.id,
    'FIRST',
    new Date(now + 20 * 60 * 1000).toISOString(),
    new Date(now - 3 * 60 * 1000).toISOString()
  );

  const laterTripId = await seedMarketplaceTrip(
    company.id,
    'LATER',
    new Date(now + 45 * 60 * 1000).toISOString(),
    new Date(now - 2 * 60 * 1000).toISOString()
  );

  try {
    const rawRowsRes = await restSelect(
      'marketplace_trips',
      [
        'select=sentry_trip_id,status,external_trip_status,taken_by,raw_payload,pu_time,loaded_at',
        'status=eq.available',
        'company_id=eq.' + encodeURIComponent(company.id),
        'order=pu_time.asc,loaded_at.asc',
        'limit=20',
      ].join('&')
    );
    must(rawRowsRes.ok && Array.isArray(rawRowsRes.data), `Marketplace query failed (${rawRowsRes.status})`);

    const filtered = rawRowsRes.data
      .filter(row => [shadowAcceptedTripId, takenByOtherTripId, expectedFirstTripId, laterTripId].includes(row.sentry_trip_id))
      .filter(isOfferableMarketplaceTrip)
      .sort(compareTripsByPickupTime);

    const firstTripId = filtered[0]?.sentry_trip_id || null;
    const filteredTripIds = filtered.map(row => row.sentry_trip_id);

    must(!filteredTripIds.includes(shadowAcceptedTripId), 'Shadow accepted trip was still treated as offerable');
    must(!filteredTripIds.includes(takenByOtherTripId), 'Trip taken by another driver was still treated as offerable');
    must(firstTripId === expectedFirstTripId, `Expected first valid trip ${expectedFirstTripId}, got ${firstTripId || 'none'}`);
    must(filteredTripIds[1] === laterTripId, `Expected second valid trip ${laterTripId}, got ${filteredTripIds[1] || 'none'}`);

    console.log(JSON.stringify({
      ok: true,
      company: { id: company.id, company_name: company.company_name },
      checks: {
        shadow_accepted_trip_skipped: shadowAcceptedTripId,
        taken_by_other_trip_skipped: takenByOtherTripId,
        first_valid_trip_selected: {
          expected: expectedFirstTripId,
          actual: firstTripId,
        },
        second_valid_trip_selected: {
          expected: laterTripId,
          actual: filteredTripIds[1] || null,
        },
      },
      filtered_trip_ids: filteredTripIds,
    }, null, 2));
  } finally {
    for (const tripId of cleanup.tripIds) {
      await restDelete('marketplace_trips', `sentry_trip_id=eq.${encodeURIComponent(tripId)}`);
    }
    for (const driverId of cleanup.driverIds) {
      await restDelete('drivers', `id=eq.${encodeURIComponent(driverId)}`);
    }
  }
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
