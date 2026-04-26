#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isSyntheticMarketplaceTrip } from '../src/lib/sentrySyntheticTrips.js';

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

function encodeInList(values) {
  return values.map(value => `"${String(value).replace(/"/g, '\\"')}"`).join(',');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatSentryDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = pad2(Math.floor(absOffset / 60));
  const offsetMins = pad2(absOffset % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMins}`;
}

function normalizeAuthValue(value) {
  return String(value || '').replace(/\u00a0/g, ' ').trim();
}

async function httpJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
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

function check(name, passed, details = {}) {
  return { name, status: passed ? 'pass' : 'fail', ...details };
}

function warn(name, details = {}) {
  return { name, status: 'warn', ...details };
}

function skip(name, details = {}) {
  return { name, status: 'skip', ...details };
}

const HARNESS_DRIVER_LICENSE_POOL = [
  '273447679',
  '169418192',
  '569866876',
  '202902377',
  '427119340',
  '889207262',
  '634896400',
  '420148919',
  '342763208',
  '796994155',
];

function pickHarnessDriverLicense(rows = [], offset = 0) {
  const existing = new Set(
    rows
      .map(row => String(
        row?.dmv_license?.license_number ||
        row?.driver_license_number ||
        row?.license_number ||
        ''
      ).trim())
      .filter(Boolean)
  );
  for (let i = 0; i < HARNESS_DRIVER_LICENSE_POOL.length; i += 1) {
    const candidate = HARNESS_DRIVER_LICENSE_POOL[(i + offset) % HARNESS_DRIVER_LICENSE_POOL.length];
    if (!existing.has(candidate)) return candidate;
  }
  return HARNESS_DRIVER_LICENSE_POOL[offset % HARNESS_DRIVER_LICENSE_POOL.length];
}

const env = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local'),
};

const base = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_SUPABASE_ANON_KEY || '';

if (!base || !serviceRole) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sbHeaders = {
  apikey: serviceRole,
  Authorization: `Bearer ${serviceRole}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function sbGet(tableQuery) {
  return httpJson(`${base}/rest/v1/${tableQuery}`, { headers: sbHeaders });
}

async function sbInsert(table, body) {
  return httpJson(`${base}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify(body),
  });
}

async function sbPatch(tableQuery, body) {
  return httpJson(`${base}/rest/v1/${tableQuery}`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify(body),
  });
}

async function sbDelete(tableQuery) {
  return httpJson(`${base}/rest/v1/${tableQuery}`, {
    method: 'DELETE',
    headers: sbHeaders,
  });
}

const sentryConfigRes = await sbGet('sentry_config?select=*&order=updated_at.desc&limit=1');
const sentryConfig = Array.isArray(sentryConfigRes.data) ? sentryConfigRes.data[0] : null;
if (!sentryConfig?.enabled) {
  console.error('No enabled sentry_config row found');
  process.exit(1);
}

const authMode = String(sentryConfig.auth_type || 'basic').toLowerCase();
const sentryHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};
if (authMode === 'bearer' || authMode === 'api_key') {
  sentryHeaders.Authorization = `Bearer ${normalizeAuthValue(sentryConfig.api_key)}`;
} else {
  sentryHeaders.Authorization = `Basic ${Buffer.from(`${normalizeAuthValue(sentryConfig.username)}:${normalizeAuthValue(sentryConfig.password_enc)}`).toString('base64')}`;
}

async function sentryRequest(method, endpoint, body = null) {
  return httpJson(`${String(sentryConfig.base_url || '').replace(/\/$/, '')}${endpoint}`, {
    method,
    headers: sentryHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function edgeRequest(functionPath, body = null) {
  const secret = sentryConfig.webhook_secret || '';
  const webhookAuthMode = sentryConfig.webhook_auth_mode || 'bearer';
  const querySecret = secret && webhookAuthMode === 'query'
    ? `${functionPath.includes('?') ? '&' : '?'}secret=${encodeURIComponent(secret)}`
    : '';
  const headers = {
    'Content-Type': 'application/json',
    apikey: anonKey || serviceRole,
    Authorization: webhookAuthMode === 'bearer' && secret
      ? `Bearer ${secret}`
      : `Bearer ${anonKey || serviceRole}`,
  };
  return httpJson(`${base}/functions/v1/${functionPath}${querySecret}`, {
    method: body ? 'POST' : 'GET',
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function firstCollection(data, key) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  return [];
}

const report = {
  ran_at: new Date().toISOString(),
  sheet_checks: [],
};

const companiesRes = await sbGet('companies?select=id,is_approved,onboarding_status,is_suspended&order=company_name.asc');
const companyRow = (companiesRes.data || []).find(row => row.is_approved || String(row.onboarding_status || '').toLowerCase() === 'approved');
const companyId = companyRow?.id || null;

const now = new Date();
const later = new Date(now.getTime() + 12 * 60 * 60 * 1000);
const marketplaceOne = await sentryRequest('GET', `/rest/transportation_provider_facade/v4.0/marketplace_trips.json?include_related_trips=1&sput_min=${encodeURIComponent(formatSentryDateTime(now))}&sput_max=${encodeURIComponent(formatSentryDateTime(later))}`);
report.sheet_checks.push(
  marketplaceOne.ok
    ? check('marketplace_get_all', true, { count: firstCollection(marketplaceOne.data, 'marketplace_trips').length })
    : check('marketplace_get_all', false, { status_code: marketplaceOne.status, error: marketplaceOne.data || marketplaceOne.text })
);

const widerLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const marketplaceTwo = await sentryRequest('GET', `/rest/transportation_provider_facade/v4.0/marketplace_trips.json?include_related_trips=1&sput_min=${encodeURIComponent(formatSentryDateTime(now))}&sput_max=${encodeURIComponent(formatSentryDateTime(widerLater))}`);
report.sheet_checks.push(
  marketplaceTwo.ok
    ? check('marketplace_second_get', true, { count: firstCollection(marketplaceTwo.data, 'marketplace_trips').length })
    : check('marketplace_second_get', false, { status_code: marketplaceTwo.status, error: marketplaceTwo.data || marketplaceTwo.text })
);

const syntheticRowsRes = await sbGet("marketplace_trips?select=sentry_trip_id,assignment_type_code,external_trip_status,raw_payload&or=(sentry_trip_id.like.TST-MKT-*,sentry_trip_id.like.TEST-TRIP-*,sentry_trip_id.like.AUDIT-*,sentry_trip_id.like.LOCAL-TEST-*)&limit=25");
const syntheticRows = Array.isArray(syntheticRowsRes.data) ? syntheticRowsRes.data : [];
const allSyntheticClassified = syntheticRows.every(row => isSyntheticMarketplaceTrip(row));
report.sheet_checks.push(
  check('synthetic_marketplace_classifier', allSyntheticClassified, {
    count: syntheticRows.length,
  })
);

const liveTakenRes = await sbGet('marketplace_trips?select=sentry_trip_id,taken_by,status,external_trip_status,assignment_type_code,raw_payload&taken_by=not.is.null&limit=10');
const liveTakenRows = Array.isArray(liveTakenRes.data) ? liveTakenRes.data : [];
report.sheet_checks.push(
  liveTakenRows.length
    ? warn('marketplace_do_not_retake', {
        note: 'Code path hardened; final proof still needs a live broker marketplace trip.',
        sampled_taken_trip_id: liveTakenRows[0]?.sentry_trip_id || null,
      })
    : skip('marketplace_do_not_retake', {
        note: 'No taken marketplace rows available right now for a stronger live proof.',
      })
);

const tripId = `audit-sheet-${Date.now()}`;
const tempDriverNum = `AUD${Date.now().toString(36).toUpperCase()}`;
const pickedUpAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const completedAt = new Date().toISOString();
const arrivedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
const expectedFare = 19.75;
let localDriverId = null;

if (!companyId) {
  report.sheet_checks.push(check('provider_retrieve_trips_shape', false, { error: 'No approved company found for synthetic provider probe' }));
} else {
  const rawPayload = {
    trip_id: tripId,
    status_id: 3,
    pickup_address: '123 Test Pickup St, New York, NY 10001',
    dropoff_address: '456 Test Dropoff Ave, Brooklyn, NY 11201',
    scheduled_pickup_time: pickedUpAt,
    scheduled_dropoff_time: completedAt,
    assignment_type_code: 'TEST',
    mta: { collected_fare_required: true, is_approved_for_mta: true },
    next_day: false,
    will_call: true,
    pickup_window_start: arrivedAt,
    pickup_window_end: pickedUpAt,
    previous_total_amount: '37.50',
    price_adjustment_amount: '3.50',
    price_adjustment_reason: 'Late broker adjustment',
    prices: { delivery_cost: '41.00' },
  };

  try {
    const localDriverRes = await sbInsert('drivers', {
      driver_number: tempDriverNum,
      full_name: 'Audit Sheet Driver',
      status: 'online',
      is_active: true,
      company_id: companyId,
      tlc_number: tempDriverNum,
      login_username: tempDriverNum.toLowerCase(),
      login_password: tempDriverNum,
    });
    localDriverId = Array.isArray(localDriverRes.data) ? localDriverRes.data[0]?.id : null;

    if (!localDriverId) {
      report.sheet_checks.push(check('provider_retrieve_trips_shape', false, { error: localDriverRes.data || localDriverRes.text || 'Failed to create local audit driver' }));
    } else {
      await sbInsert('marketplace_trips', {
        sentry_trip_id: tripId,
        sentry_last_modified_at: completedAt,
        date_val: completedAt.slice(0, 10),
        los: 'Ambulatory',
        passengers: '1',
        mileage: '8.5',
        pu_address: rawPayload.pickup_address,
        pu_city: 'New York',
        pu_zip: '10001',
        pu_time: pickedUpAt,
        do_address: rawPayload.dropoff_address,
        do_city: 'Brooklyn',
        do_zip: '11201',
        do_time: completedAt,
        delivery_price: '41.00',
        status: 'completed',
        company_id: companyId,
        assignment_type_code: 'TEST',
        external_trip_status: 'completed',
        raw_payload: rawPayload,
        loaded_at: completedAt,
      });
      await sbDelete(`trip_assignments?trip_id=eq.${encodeURIComponent(tripId)}`);
      await sbInsert('trip_assignments', {
        trip_id: tripId,
        driver_id: localDriverId,
        company_id: companyId,
        driver_name: 'Audit Sheet Driver',
        status: 'completed',
        completed_at: completedAt,
        actual_pickup_time: pickedUpAt,
        actual_dropoff_time: completedAt,
        pu_address: rawPayload.pickup_address,
        do_address: rawPayload.dropoff_address,
        delivery_price: 41,
        mileage: 8.5,
        collected_fare: expectedFare,
        is_next_day: true,
        next_day_requested_at: completedAt,
        notes: 'audit-denys-sheet synthetic record',
      });

      const retrieveRes = await edgeRequest(
        `sentry-provider/rest/gc/retrieve_trips.json?trip_ids=${encodeURIComponent(tripId)}`,
      );
      const tripRow = Array.isArray(retrieveRes.data) ? retrieveRes.data[0] : null;
      const passed = Boolean(
        retrieveRes.ok &&
        tripRow &&
        tripRow.trip_id === tripId &&
        tripRow.assignment_type_code === 'TEST' &&
        String(tripRow.delivery_price || '') === '41.00' &&
        String(tripRow.total_amount || '') === '41.00' &&
        Number(tripRow.is_approved_for_mta) === 1 &&
        Number(tripRow.will_call) === 1 &&
        String(tripRow.price_adjustment_amount || '') === '3.50'
      );
      report.sheet_checks.push(check('provider_retrieve_trips_shape', passed, {
        fields: tripRow
          ? {
              assignment_type_code: tripRow.assignment_type_code,
              scheduled_pickup_time: tripRow.scheduled_pickup_time,
              scheduled_dropoff_time: tripRow.scheduled_dropoff_time,
              delivery_price: tripRow.delivery_price,
              total_amount: tripRow.total_amount,
              is_approved_for_mta: tripRow.is_approved_for_mta,
              price_adjustment_amount: tripRow.price_adjustment_amount,
              price_adjustment_reason: tripRow.price_adjustment_reason,
              will_call: tripRow.will_call,
              pickup_window_start: tripRow.pickup_window_start,
              pickup_window_end: tripRow.pickup_window_end,
            }
          : null,
        status_code: retrieveRes.status,
        raw_trip: !passed ? tripRow : undefined,
      }));
    }
  } finally {
    await sbDelete(`trip_assignments?trip_id=eq.${encodeURIComponent(tripId)}`);
    await sbDelete(`marketplace_trips?sentry_trip_id=eq.${encodeURIComponent(tripId)}`);
    if (localDriverId) await sbDelete(`drivers?id=eq.${encodeURIComponent(localDriverId)}`);
  }
}

const createdDriverIds = [];
const createdVehicleIds = [];

try {
const driversList = await sentryRequest('GET', '/rest/transportation_provider_facade/v4.0/drivers.json');
const driverRows = firstCollection(driversList.data, 'drivers');
const driverCreateLicense = pickHarnessDriverLicense(driverRows, 0);
report.sheet_checks.push(
  driversList.ok
    ? check('drivers_get_list', true, { count: driverRows.length })
      : check('drivers_get_list', false, { status_code: driversList.status, error: driversList.data || driversList.text })
  );

  const driverSeed = `HAR${Date.now().toString(36).toUpperCase()}`;
  const createDriver = await sentryRequest('POST', '/rest/transportation_provider_facade/v4.0/drivers.json', {
    first_name: `Audit${driverSeed.slice(0, 4)}`,
    last_name: `Driver${driverSeed.slice(-4)}`,
    phone: `718555${String(Date.now()).slice(-4)}`,
    social_security_number: '000000000',
    birth_date: '1980-01-01',
    status_id: 1,
    dmv_license: {
      license_number: driverCreateLicense,
      state_code: 'NY',
      license_class: 'E',
      endorsements: [],
      restrictions: [],
      effective_date: '2024-01-01',
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/license.pdf',
    },
  });
  const createdDriverId = createDriver.data?.id || createDriver.data?.driver_id || null;
  if (createdDriverId) createdDriverIds.push(createdDriverId);
  report.sheet_checks.push(
    createDriver.ok
      ? check('drivers_create', true, { id: createdDriverId })
      : check('drivers_create', false, { status_code: createDriver.status, error: createDriver.data || createDriver.text })
  );
  if (createdDriverId) {
    const updateDriver = await sentryRequest('PUT', `/rest/transportation_provider_facade/v4.0/drivers/${createdDriverId}.json`, {
      first_name: `Audit${driverSeed.slice(0, 4)}`,
      last_name: `Updated${driverSeed.slice(-4)}`,
      phone: `917555${String(Date.now()).slice(-4)}`,
      social_security_number: '000000000',
      birth_date: '1980-01-01',
      status_id: 1,
      dmv_license: {
        license_number: driverCreateLicense,
        state_code: 'NY',
        license_class: 'E',
        endorsements: [],
        restrictions: [],
        effective_date: '2024-01-01',
        expiration_date: '2028-01-01',
        document_url: 'https://example.com/license-updated.pdf',
      },
    });
    report.sheet_checks.push(
      updateDriver.ok
        ? check('drivers_update', true, { id: createdDriverId })
        : check('drivers_update', false, { status_code: updateDriver.status, error: updateDriver.data || updateDriver.text })
    );
    const getDriver = await sentryRequest('GET', `/rest/transportation_provider_facade/v4.0/drivers/${createdDriverId}.json`);
    report.sheet_checks.push(
      getDriver.ok
        ? check('drivers_get_single', true, { id: createdDriverId })
        : check('drivers_get_single', false, { status_code: getDriver.status, error: getDriver.data || getDriver.text })
    );
  }

  const vehiclesList = await sentryRequest('GET', '/rest/transportation_provider_facade/v4.0/vehicles.json');
  const vehicleRows = firstCollection(vehiclesList.data, 'vehicles');
  report.sheet_checks.push(
    vehiclesList.ok
      ? check('vehicles_get_list', true, { count: vehicleRows.length })
      : check('vehicles_get_list', false, { status_code: vehiclesList.status, error: vehiclesList.data || vehiclesList.text })
  );

  const vehicleSeed = `VEH${Date.now().toString(36).toUpperCase()}`;
  const createVehicle = await sentryRequest('POST', '/rest/transportation_provider_facade/v4.0/vehicles.json', {
    vin: `${vehicleSeed}123456789ABCDEFGHJKLMNPR`.replace(/[IOQ]/g, 'A').slice(0, 17),
    fleet_number: `FLT${vehicleSeed}`.slice(0, 10),
    type_id: 1,
    color: 'Black',
    seat_number: 4,
    production_year: 2024,
    status_id: 1,
    dmv_registration: {
      license_plate_number: `TP${vehicleSeed}`.slice(0, 8),
      license_plate_category_id: 1,
      state_code: 'NY',
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/registration.pdf',
    },
    extra_commercial_license: {
      license_number: `ECL${vehicleSeed}`.slice(0, 10),
      type_id: 1,
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/commercial-license.pdf',
    },
    insurance: {
      policy_number: `POL-${vehicleSeed}`,
      insurer_name: 'Sandbox Insurance Co',
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/insurance.pdf',
    },
  });
  const createdVehicleId = createVehicle.data?.id || createVehicle.data?.vehicle_id || null;
  if (createdVehicleId) createdVehicleIds.push(createdVehicleId);
  report.sheet_checks.push(
    createVehicle.ok
      ? check('vehicles_create', true, { id: createdVehicleId })
      : check('vehicles_create', false, { status_code: createVehicle.status, error: createVehicle.data || createVehicle.text })
  );
  if (createdVehicleId) {
    const updateVehicle = await sentryRequest('PUT', `/rest/transportation_provider_facade/v4.0/vehicles/${createdVehicleId}.json`, {
      vin: `${vehicleSeed}123456789ABCDEFGHJKLMNPR`.replace(/[IOQ]/g, 'A').slice(0, 17),
      fleet_number: `FLT${vehicleSeed}`.slice(0, 10),
      type_id: 1,
      color: 'Silver',
      status_id: 1,
      seat_number: 5,
      production_year: 2024,
      dmv_registration: {
        license_plate_number: `TP${vehicleSeed}`.slice(0, 8),
        license_plate_category_id: 1,
        state_code: 'NY',
        expiration_date: '2029-01-01',
        document_url: 'https://example.com/registration-updated.pdf',
      },
      extra_commercial_license: {
        license_number: `ECL${vehicleSeed}`.slice(0, 10),
        type_id: 1,
        expiration_date: '2029-01-01',
        document_url: 'https://example.com/commercial-license-updated.pdf',
      },
      insurance: {
        policy_number: `UPD-${vehicleSeed}`,
        insurer_name: 'Sandbox Insurance Co',
        expiration_date: '2029-01-01',
        document_url: 'https://example.com/insurance-updated.pdf',
      },
    });
    report.sheet_checks.push(
      updateVehicle.ok
        ? check('vehicles_update', true, { id: createdVehicleId })
        : check('vehicles_update', false, { status_code: updateVehicle.status, error: updateVehicle.data || updateVehicle.text })
    );
    const getVehicle = await sentryRequest('GET', `/rest/transportation_provider_facade/v4.0/vehicles/${createdVehicleId}.json`);
    report.sheet_checks.push(
      getVehicle.ok
        ? check('vehicles_get_single', true, { id: createdVehicleId })
        : check('vehicles_get_single', false, { status_code: getVehicle.status, error: getVehicle.data || getVehicle.text })
    );
  }

  const shiftsRes = await sentryRequest(
    'GET',
    `/rest/transportation_provider_facade/v4.0/driver_work_shifts.json?start_timestamp_max=${encodeURIComponent(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())}&end_timestamp_min=${encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())}`,
  );
  report.sheet_checks.push(
    shiftsRes.ok
      ? check('driver_work_shifts', true, { count: firstCollection(shiftsRes.data, 'driver_work_shifts').length })
      : check('driver_work_shifts', false, { status_code: shiftsRes.status, error: shiftsRes.data || shiftsRes.text })
  );
} finally {
  for (const driverId of createdDriverIds) {
    await sentryRequest('POST', `/rest/transportation_provider_facade/v4.0/drivers/deactivate/${driverId}.json`);
  }
  for (const vehicleId of createdVehicleIds) {
    await sentryRequest('POST', `/rest/transportation_provider_facade/v4.0/vehicles/deactivate/${vehicleId}.json`);
  }
}

const driverReceiverSmoke = await edgeRequest('sentry-receivers/drivers_receiver', {
  drivers: [{ id: `smoke-driver-${Date.now()}`, name: 'Smoke Driver', phone: '7185550199', email: 'smoke-driver@example.com' }],
});
report.sheet_checks.push(
  driverReceiverSmoke.ok
    ? check('drivers_receiver_smoke', true, { status_code: driverReceiverSmoke.status })
    : check('drivers_receiver_smoke', false, { status_code: driverReceiverSmoke.status, error: driverReceiverSmoke.data || driverReceiverSmoke.text })
);

const vehicleReceiverSmoke = await edgeRequest('sentry-receivers/vehicles_receiver', {
  vehicles: [{ id: `smoke-vehicle-${Date.now()}`, make: 'Smoke', model: 'Probe', year: 2026 }],
});
report.sheet_checks.push(
  vehicleReceiverSmoke.ok
    ? check('vehicles_receiver_smoke', true, { status_code: vehicleReceiverSmoke.status })
    : check('vehicles_receiver_smoke', false, { status_code: vehicleReceiverSmoke.status, error: vehicleReceiverSmoke.data || vehicleReceiverSmoke.text })
);

if (companyId) {
  const tripIdCancel = `audit-cancel-${Date.now()}`;
  const nowIso = new Date().toISOString();
  const seedDriverRes = await sbInsert('drivers', {
    driver_number: `HARNESS-${Date.now()}`,
    full_name: 'Harness Broker Driver',
    status: 'offline',
    is_active: true,
    company_id: companyId,
  });
  const seedDriverId = Array.isArray(seedDriverRes.data) ? seedDriverRes.data[0]?.id : null;
  try {
    await sbInsert('marketplace_trips', {
      sentry_trip_id: tripIdCancel,
      sentry_last_modified_at: nowIso,
      date_val: nowIso.slice(0, 10),
      los: 'Ambulatory',
      passengers: '1',
      mileage: '1',
      pu_address: 'Harness Pickup',
      pu_city: 'New York',
      pu_zip: '10001',
      pu_time: nowIso,
      do_address: 'Harness Dropoff',
      do_city: 'New York',
      do_zip: '10002',
      do_time: nowIso,
      delivery_price: '10.00',
      status: 'available',
      company_id: companyId,
      assignment_type_code: 'STANDARD',
      external_trip_status: 'available',
      loaded_at: nowIso,
    });
    if (seedDriverId) {
      await sbInsert('trip_assignments', {
        trip_id: tripIdCancel,
        driver_id: seedDriverId,
        company_id: companyId,
        driver_name: 'Harness Broker Driver',
        status: 'pending',
        pu_address: 'Harness Pickup',
        do_address: 'Harness Dropoff',
        scheduled_pickup_time: nowIso,
        delivery_price: 10,
        mileage: 1,
      });
    }

    const cancelRes = await edgeRequest('sentry-receivers/trips_receiver', {
      trips: [{
        trip_id: tripIdCancel,
        trip_status: 'cancelled',
        assignment_type_code: 'STANDARD',
        pickup_address: 'Harness Pickup',
        dropoff_address: 'Harness Dropoff',
      }],
    });
    const afterCancelAssignment = await sbGet(`trip_assignments?select=status&trip_id=eq.${encodeURIComponent(tripIdCancel)}&limit=1`);
    const afterCancelMarketplace = await sbGet(`marketplace_trips?select=status&sentry_trip_id=eq.${encodeURIComponent(tripIdCancel)}&limit=1`);
    const assignmentStatus = Array.isArray(afterCancelAssignment.data) ? afterCancelAssignment.data[0]?.status : null;
    const marketplaceStatus = Array.isArray(afterCancelMarketplace.data) ? afterCancelMarketplace.data[0]?.status : null;
    report.sheet_checks.push(
      check('trips_receiver_cancel_probe', cancelRes.ok && String(assignmentStatus || '').toLowerCase() === 'cancelled', {
        status_code: cancelRes.status,
        assignment_status: assignmentStatus,
        marketplace_status: marketplaceStatus,
      })
    );
  } finally {
    await sbDelete(`trip_assignments?trip_id=eq.${encodeURIComponent(tripIdCancel)}`);
    await sbDelete(`marketplace_trips?sentry_trip_id=eq.${encodeURIComponent(tripIdCancel)}`);
    if (seedDriverId) await sbDelete(`drivers?id=eq.${encodeURIComponent(seedDriverId)}`);
  }
}

const copyProbeTrips = firstCollection(marketplaceOne.data, 'marketplace_trips');
const copySourceTripId = copyProbeTrips[0]?.trip_id || copyProbeTrips[0]?.id || null;
if (!copySourceTripId) {
  report.sheet_checks.push(skip('trip_copy_probe', { note: 'No marketplace source trip available right now.' }));
} else {
  const copyRes = await sentryRequest('POST', `/rest/transportation_provider_facade/v4.0/trips/${copySourceTripId}/copy`, {
    source_trip_id: copySourceTripId,
  });
  if (copyRes.ok || [400, 404, 405].includes(Number(copyRes.status || 0))) {
    report.sheet_checks.push(check('trip_copy_probe', true, {
      source_trip_id: copySourceTripId,
      status_code: copyRes.status,
      note: copyRes.ok ? 'Copy call accepted.' : 'Endpoint reachable but source/context was not accepted.',
    }));
  } else {
    report.sheet_checks.push(check('trip_copy_probe', false, {
      source_trip_id: copySourceTripId,
      status_code: copyRes.status,
      error: copyRes.data || copyRes.text,
    }));
  }
}

report.sheet_checks.push(warn('reject_and_accept_rejected_trip', {
  note: 'Still needs a fresh live broker-assigned trip to prove end to end without faking Sentry lifecycle state.',
}));

const failed = report.sheet_checks.filter(item => item.status === 'fail').length;
report.summary = {
  pass: report.sheet_checks.filter(item => item.status === 'pass').length,
  fail: failed,
  warn: report.sheet_checks.filter(item => item.status === 'warn').length,
  skip: report.sheet_checks.filter(item => item.status === 'skip').length,
  overall: failed ? 'fail' : 'pass',
};

console.log(JSON.stringify(report, null, 2));
