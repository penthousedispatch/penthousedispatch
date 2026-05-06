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
  const out = {
    trip: '',
    driverName: 'JEAN SEIDE',
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--trip=')) out.trip = a.slice('--trip='.length).trim();
    else if (a.startsWith('--driver=')) out.driverName = a.slice('--driver='.length).trim();
  }
  return out;
}

function fail(...parts) {
  console.error(...parts);
  process.exit(1);
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

function slugifyPlate(text) {
  return String(text || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'DENYS001';
}

function makeSafeVin(seed) {
  const cleaned = String(seed || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/[IOQ]/g, '7');
  return (cleaned + '123456789ABCDEFG').slice(0, 17);
}

function normalizeStateCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'NY';
  if (raw === 'NEW YORK') return 'NY';
  return raw.slice(0, 2);
}

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
const args = parseArgs(process.argv);
if (!args.trip) fail('Usage: node scripts/finish-denys-status2.mjs --trip=<SENTRY_TRIP_ID> [--driver="JEAN SEIDE"]');

const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!supabaseUrl || !serviceRole) fail('Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');

const sbHeaders = {
  apikey: serviceRole,
  Authorization: `Bearer ${serviceRole}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const sentryConfigUrl = `${supabaseUrl}/rest/v1/sentry_config?select=base_url,username,password_enc,api_key,enabled,sandbox,auth_type,created_at&enabled=eq.true&order=created_at.desc&limit=1`;
const sentryConfigRes = await httpJson(sentryConfigUrl, { headers: sbHeaders });
if (!sentryConfigRes.ok || !Array.isArray(sentryConfigRes.data) || !sentryConfigRes.data[0]) {
  fail('Could not load sentry_config', sentryConfigRes.status, sentryConfigRes.data);
}
const sentryConfig = sentryConfigRes.data[0];
if (!sentryConfig.base_url || !sentryConfig.username || !sentryConfig.password_enc) {
  fail('Sentry config missing base_url, username, or password_enc', sentryConfig);
}

const driverUrl =
  `${supabaseUrl}/rest/v1/drivers` +
  `?select=id,company_id,full_name,phone,status,current_lat,current_lng,license_number,license_state,vehicle_plate,tlc_number,driver_number,sentry_driver_id,sentry_vehicle_id,vehicle_id` +
  `&full_name=eq.${encodeURIComponent(args.driverName)}` +
  `&limit=1`;
const driverRes = await httpJson(driverUrl, { headers: sbHeaders });
if (!driverRes.ok || !Array.isArray(driverRes.data) || !driverRes.data[0]) {
  fail('Could not load local driver', driverRes.status, driverRes.data);
}
const driver = driverRes.data[0];
if (!driver.license_number) fail('Chosen local driver has no license_number', driver);

if (String(driver.status || '').toLowerCase() !== 'online') {
  const driverOnlineRes = await httpJson(
    `${supabaseUrl}/rest/v1/drivers?id=eq.${encodeURIComponent(driver.id)}`,
    {
      method: 'PATCH',
      headers: sbHeaders,
      body: {
        status: 'online',
        updated_at: new Date().toISOString(),
      },
    }
  );
  if (!driverOnlineRes.ok) fail('Could not mark chosen local driver online', driverOnlineRes.status, driverOnlineRes.data);
  driver.status = 'online';
}

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

async function sentryGetById(kind, id) {
  if (!id) return null;
  const res = await sentry('GET', `/rest/transportation_provider_facade/v4.0/${kind}/${encodeURIComponent(id)}.json`);
  return res.ok ? res.data : null;
}

async function sentryGetTripVersion(tripId) {
  const today = new Date();
  const dateMin = today.toISOString().slice(0, 10);
  const dateMax = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const res = await sentry('GET', `/rest/transportation_provider_facade/v4.0/trips.json?date_min=${dateMin}&date_max=${dateMax}`);
  if (!res.ok || !Array.isArray(res.data)) return null;
  return res.data.find((trip) => String(trip?.trip_id || '') === String(tripId)) || null;
}

const currentDrivers = await sentry('GET', '/rest/transportation_provider_facade/v4.0/drivers.json');
if (!currentDrivers.ok) fail('Could not read Sentry drivers', currentDrivers.status, currentDrivers.data);
let sentryDriver = Array.isArray(currentDrivers.data)
  ? currentDrivers.data.find((d) => String(d?.id || '') === String(driver.sentry_driver_id || ''))
  : null;

if (!sentryDriver) {
  const newDriverPayload = {
    first_name: String(driver.full_name || '').trim().split(/\s+/)[0] || 'Test',
    last_name: String(driver.full_name || '').trim().split(/\s+/).slice(1).join(' ') || 'Driver',
    phone: String(driver.phone || '7185550100').replace(/\D/g, '').slice(0, 10) || '7185550100',
    social_security_number: '000000000',
    birth_date: '1980-01-01',
    status_id: 1,
    dmv_license: {
      license_number: String(driver.license_number).trim(),
      state_code: normalizeStateCode(driver.license_state),
      license_class: 'E',
      endorsements: [],
      restrictions: [],
      effective_date: '2024-01-01',
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/license.pdf',
    },
  };
  const createDriverRes = await sentry('POST', '/rest/transportation_provider_facade/v4.0/drivers.json', newDriverPayload);
  if (createDriverRes.ok) {
    sentryDriver = createDriverRes.data;
  } else {
    sentryDriver =
      (await sentryGetById('drivers', driver.sentry_driver_id)) ||
      (String(driver.license_number || '').trim() === '730776864' ? await sentryGetById('drivers', 41345) : null);
    if (!sentryDriver) fail('Could not create or recover Sentry driver', createDriverRes.status, createDriverRes.data);
  }
}

const currentVehicles = await sentry('GET', '/rest/transportation_provider_facade/v4.0/vehicles.json');
if (!currentVehicles.ok) fail('Could not read Sentry vehicles', currentVehicles.status, currentVehicles.data);
let sentryVehicle = Array.isArray(currentVehicles.data)
  ? currentVehicles.data.find((v) => String(v?.id || '') === String(driver.sentry_vehicle_id || ''))
  : null;

if (!sentryVehicle) {
  const plate = slugifyPlate(vehicleRow?.license_plate || driver.vehicle_plate || driver.tlc_number || `${driver.driver_number || 'DRV'}1`);
  const newVehiclePayload = {
    vin: makeSafeVin(`TST${plate}`),
    fleet_number: plate,
    type_id: 1,
    color: 'Black',
    seat_number: 4,
    production_year: vehicleRow?.year || 2020,
    status_id: 1,
    dmv_registration: {
      license_plate_number: plate,
      license_plate_category_id: 1,
      state_code: 'NY',
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/registration.pdf',
    },
    extra_commercial_license: {
      license_number: `ECL${plate}`.slice(0, 10),
      type_id: 1,
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/commercial-license.pdf',
    },
    insurance: {
      policy_number: `POL-${plate}`,
      insurer_name: 'Sandbox Insurance Co',
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/insurance.pdf',
    },
  };
  const createVehicleRes = await sentry('POST', '/rest/transportation_provider_facade/v4.0/vehicles.json', newVehiclePayload);
  if (!createVehicleRes.ok) fail('Could not create Sentry vehicle', createVehicleRes.status, createVehicleRes.data);
  sentryVehicle = createVehicleRes.data;
}

const patchDriverBody = {
  sentry_driver_id: String(sentryDriver.id),
  sentry_vehicle_id: String(sentryVehicle.id),
  vehicle_plate:
    driver.vehicle_plate ||
    vehicleRow?.license_plate ||
    sentryVehicle?.dmv_registration?.license_plate_number ||
    '',
  updated_at: new Date().toISOString(),
};
const patchDriverUrl = `${supabaseUrl}/rest/v1/drivers?id=eq.${encodeURIComponent(driver.id)}`;
const patchDriverRes = await httpJson(patchDriverUrl, {
  method: 'PATCH',
  headers: sbHeaders,
  body: patchDriverBody,
});
if (!patchDriverRes.ok) fail('Could not update local driver Sentry ids', patchDriverRes.status, patchDriverRes.data);

const tripMarketplaceUrl =
  `${supabaseUrl}/rest/v1/marketplace_trips` +
  `?sentry_trip_id=eq.${encodeURIComponent(args.trip)}` +
  `&select=sentry_trip_id,pu_address,do_address,status,company_id,external_trip_status,raw_payload`;
const tripMarketplaceRes = await httpJson(tripMarketplaceUrl, { headers: sbHeaders });
if (!tripMarketplaceRes.ok || !Array.isArray(tripMarketplaceRes.data) || !tripMarketplaceRes.data[0]) {
  fail('Could not load marketplace trip', tripMarketplaceRes.status, tripMarketplaceRes.data);
}
const marketplaceTrip = tripMarketplaceRes.data[0];

const acceptedAt = fmtOffsetIso(new Date());
const assignmentPayload = {
  trip_id: args.trip,
  driver_id: driver.id,
  company_id: driver.company_id || marketplaceTrip.company_id || null,
  driver_name: driver.full_name,
  pu_address: marketplaceTrip.pu_address || '',
  do_address: marketplaceTrip.do_address || '',
  status: 'accepted',
  trip_processing_status_id: 2,
  assigned_at: acceptedAt,
  accepted_at: acceptedAt,
};

const existingAssignmentUrl = `${supabaseUrl}/rest/v1/trip_assignments?trip_id=eq.${encodeURIComponent(args.trip)}&driver_id=eq.${encodeURIComponent(driver.id)}&select=trip_id,driver_id`;
const existingAssignmentRes = await httpJson(existingAssignmentUrl, { headers: sbHeaders });
if (!existingAssignmentRes.ok) fail('Could not query existing assignment', existingAssignmentRes.status, existingAssignmentRes.data);
let assignmentWriteRes;
if (Array.isArray(existingAssignmentRes.data) && existingAssignmentRes.data[0]) {
  assignmentWriteRes = await httpJson(`${supabaseUrl}/rest/v1/trip_assignments?trip_id=eq.${encodeURIComponent(args.trip)}&driver_id=eq.${encodeURIComponent(driver.id)}`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: assignmentPayload,
  });
} else {
  assignmentWriteRes = await httpJson(`${supabaseUrl}/rest/v1/trip_assignments`, {
    method: 'POST',
    headers: sbHeaders,
    body: assignmentPayload,
  });
}
if (!assignmentWriteRes.ok) fail('Could not write trip assignment', assignmentWriteRes.status, assignmentWriteRes.data);

const marketplacePatchRes = await httpJson(`${supabaseUrl}/rest/v1/marketplace_trips?sentry_trip_id=eq.${encodeURIComponent(args.trip)}`, {
  method: 'PATCH',
  headers: sbHeaders,
  body: {
    taken_by: driver.id,
    company_id: driver.company_id || marketplaceTrip.company_id || null,
    status: 'accepted',
    external_trip_status: 'accepted',
    sentry_last_modified_at: acceptedAt,
    updated_at: new Date().toISOString(),
  },
});
if (!marketplacePatchRes.ok) fail('Could not patch marketplace trip', marketplacePatchRes.status, marketplacePatchRes.data);

const acceptRes = await sentry('POST', '/rest/transportation_provider_facade/v4.0/trips/accept', [{
  trip_id: args.trip,
  last_modified_at: acceptedAt,
}]);
if (!acceptRes.ok) fail('Sentry accept failed', acceptRes.status, acceptRes.data);

const sentryTripVersion = await sentryGetTripVersion(args.trip);
const versionLastModifiedAt =
  String(sentryTripVersion?.last_modified_at || marketplaceTrip.sentry_last_modified_at || '').trim() || acceptedAt;

const status2Payload = {
  status_id: 2,
  last_modified_at: versionLastModifiedAt,
  driver: {
    id: Number(sentryDriver.id),
      dmv_license: {
        license_number: String(driver.license_number).trim(),
      state_code: normalizeStateCode(driver.license_state),
      },
  },
  vehicle: {
    id: Number(sentryVehicle.id),
    dmv_registration: {
      license_plate_number:
        driver.vehicle_plate ||
        vehicleRow?.license_plate ||
        sentryVehicle?.dmv_registration?.license_plate_number ||
        slugifyPlate(driver.tlc_number),
    },
  },
};
const status2Res = await sentry('POST', `/rest/transportation_provider_facade/v4.0/trips/${encodeURIComponent(args.trip)}/update_status`, status2Payload);
if (!status2Res.ok) fail('Sentry status 2 failed', status2Res.status, status2Res.data);

console.log(JSON.stringify({
  ok: true,
  trip: args.trip,
  local_driver: {
    id: driver.id,
    full_name: driver.full_name,
  },
  sentry_driver_id: sentryDriver.id,
  sentry_vehicle_id: sentryVehicle.id,
  accepted_at: acceptedAt,
  version_last_modified_at: versionLastModifiedAt,
  accept_status: acceptRes.status,
  status2_status: status2Res.status,
  status2_payload: status2Payload,
  status2_response: status2Res.data,
}, null, 2));
