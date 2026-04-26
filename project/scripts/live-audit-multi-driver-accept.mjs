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
  if (!condition) {
    throw new Error(message);
  }
}

function loadEnv() {
  return {
    ...readEnvFile('.env'),
    ...readEnvFile('.env.local'),
  };
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

async function restPatch(table, query, payload) {
  return requestJson(`${base}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
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

async function rpc(name, payload) {
  return requestJson(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: restHeaders,
    body: JSON.stringify(payload),
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
  must(picked?.id, 'No approved company found for live audit');
  return picked;
}

async function createDriver(companyId, index) {
  const token = `${Date.now().toString(36)}${index}`;
  const driverNumber = `AUDIT-${token}`.toUpperCase();
  const inserted = await restInsert('drivers', {
    driver_number: driverNumber,
    full_name: `Audit Accept Driver ${index + 1}`,
    status: 'online',
    is_active: true,
    company_id: companyId,
    tlc_number: driverNumber,
    login_username: driverNumber.toLowerCase(),
    login_password: driverNumber,
  });
  must(inserted.ok && Array.isArray(inserted.data) && inserted.data[0]?.id, `Driver creation failed (${inserted.status})`);
  cleanup.driverIds.push(inserted.data[0].id);
  return inserted.data[0];
}

async function createTrip(companyId, driver, index) {
  const tripId = `AUDIT-TRIP-${Date.now().toString(36).toUpperCase()}-${index + 1}`;
  const assignedAt = new Date().toISOString();
  const pickupAt = new Date(Date.now() + (index + 1) * 10 * 60 * 1000).toISOString();

  const marketplace = await restInsert('marketplace_trips', {
    sentry_trip_id: tripId,
    sentry_last_modified_at: assignedAt,
    date_val: pickupAt.slice(0, 10),
    los: 'Ambulatory',
    passengers: '1',
    mileage: `${4.5 + index}`,
    pu_address: `${100 + index} Audit Pickup St, New York NY`,
    pu_city: 'New York',
    pu_zip: '10001',
    pu_time: pickupAt,
    do_address: `${500 + index} Audit Dropoff Ave, New York NY`,
    do_city: 'New York',
    do_zip: '10002',
    do_time: '',
    delivery_price: `${25 + index}`,
    status: 'available',
    taken_by: null,
    company_id: companyId,
    assignment_type_code: 'TEST',
    external_trip_status: 'available',
    raw_payload: {
      trip_id: tripId,
      trip_status: 'available',
      assignment_type_code: 'TEST',
      scheduled_pickup_time: pickupAt,
      pickup_address: `${100 + index} Audit Pickup St, New York NY`,
      dropoff_address: `${500 + index} Audit Dropoff Ave, New York NY`,
      mileage: 4.5 + index,
      total_amount: 25 + index,
    },
    loaded_at: assignedAt,
  });
  must(marketplace.ok, `Marketplace trip seed failed (${marketplace.status})`);

  const assignment = await restInsert('trip_assignments', {
    trip_id: tripId,
    driver_id: driver.id,
    company_id: companyId,
    driver_name: driver.full_name,
    status: 'pending',
    pu_address: `${100 + index} Audit Pickup St, New York NY`,
    do_address: `${500 + index} Audit Dropoff Ave, New York NY`,
    pu_time: pickupAt,
    delivery_price: 25 + index,
    mileage: 4.5 + index,
    assigned_at: assignedAt,
    notes: '[TEST_TRIP] Live multi-driver accept audit',
  });
  must(assignment.ok && Array.isArray(assignment.data) && assignment.data[0]?.id, `Assignment seed failed (${assignment.status})`);
  cleanup.tripIds.push(tripId);
  return {
    tripId,
    assignmentId: assignment.data[0].id,
    assignedAt,
  };
}

async function peekOffer(driverId) {
  return rpc('peek_driver_trip_offer', { p_driver_id: driverId });
}

async function fetchAssignment(tripId, driverId) {
  const query = `select=id,trip_id,driver_id,status,trip_processing_status_id,accepted_at,completed_at,rejected_at&trip_id=eq.${encodeURIComponent(tripId)}&driver_id=eq.${encodeURIComponent(driverId)}&limit=1`;
  return restSelect('trip_assignments', query);
}

async function fetchMarketplace(tripId) {
  const query = `select=sentry_trip_id,status,external_trip_status,taken_by,raw_payload&'sentry_trip_id'=eq.${encodeURIComponent(tripId)}`.replace(/'sentry_trip_id'/g, 'sentry_trip_id');
  return restSelect('marketplace_trips', query);
}

async function completeTrip(tripId, assignmentId, driverId) {
  const completedAt = new Date().toISOString();
  await restPatch(
    'trip_assignments',
    `id=eq.${encodeURIComponent(assignmentId)}`,
    {
      status: 'completed',
      completed_at: completedAt,
      actual_dropoff_time: completedAt,
    }
  );
  await restPatch(
    'marketplace_trips',
    `sentry_trip_id=eq.${encodeURIComponent(tripId)}`,
    {
      status: 'completed',
      external_trip_status: 'completed',
      taken_by: driverId,
    }
  );
}

async function main() {
  const company = await chooseCompanyId();
  const audit = {
    company: { id: company.id, company_name: company.company_name },
    cases: [],
  };

  try {
    for (let index = 0; index < 3; index += 1) {
      const driver = await createDriver(company.id, index);
      const trip = await createTrip(company.id, driver, index);

      const beforePeek = await peekOffer(driver.id);
      must(beforePeek.ok, `peek_driver_trip_offer failed before accept for driver ${driver.id}`);
      const beforeAssignment = beforePeek.data?.assignment || null;
      const beforeTripId = beforeAssignment?.trip_id || beforeAssignment?.tripId || null;
      must(beforeTripId === trip.tripId, `Expected pending offer ${trip.tripId} before accept, got ${beforeTripId || 'none'}`);

      const acceptedAt = new Date().toISOString();
      const acceptAssignment = await restPatch(
        'trip_assignments',
        `id=eq.${encodeURIComponent(trip.assignmentId)}`,
        {
          status: 'accepted',
          trip_processing_status_id: 2,
          accepted_at: acceptedAt,
        }
      );
      must(acceptAssignment.ok, `Assignment accept patch failed (${acceptAssignment.status})`);

      const acceptMarketplace = await restPatch(
        'marketplace_trips',
        `sentry_trip_id=eq.${encodeURIComponent(trip.tripId)}`,
        {
          status: 'accepted',
          external_trip_status: 'accepted',
          taken_by: driver.id,
        }
      );
      must(acceptMarketplace.ok, `Marketplace accept patch failed (${acceptMarketplace.status})`);

      const afterPeek = await peekOffer(driver.id);
      must(afterPeek.ok, `peek_driver_trip_offer failed after accept for driver ${driver.id}`);
      const afterAssignment = afterPeek.data?.assignment || null;
      const afterOfferTripId = afterAssignment?.trip_id || afterAssignment?.tripId || null;
      must(!afterOfferTripId, `Trip ${trip.tripId} resurfaced as a pending offer after accept for driver ${driver.id}`);

      const acceptedAssignment = await fetchAssignment(trip.tripId, driver.id);
      const acceptedMarketplace = await fetchMarketplace(trip.tripId);
      const assignmentRow = acceptedAssignment.data?.[0] || null;
      const marketplaceRow = acceptedMarketplace.data?.[0] || null;

      must(assignmentRow?.status === 'accepted', `Trip ${trip.tripId} assignment did not stay accepted`);
      must(String(assignmentRow?.trip_processing_status_id || '') === '2', `Trip ${trip.tripId} assignment status id is not 2`);
      must(marketplaceRow?.status === 'accepted', `Trip ${trip.tripId} marketplace row did not stay accepted`);
      must(marketplaceRow?.external_trip_status === 'accepted', `Trip ${trip.tripId} external status did not stay accepted`);
      must(String(marketplaceRow?.taken_by || '') === String(driver.id), `Trip ${trip.tripId} marketplace taken_by drifted`);

      await completeTrip(trip.tripId, trip.assignmentId, driver.id);
      const afterCompletePeek = await peekOffer(driver.id);
      must(afterCompletePeek.ok, `peek_driver_trip_offer failed after complete for driver ${driver.id}`);
      const completeOffer = afterCompletePeek.data?.assignment || null;
      const completeOfferTripId = completeOffer?.trip_id || completeOffer?.tripId || null;
      must(!completeOfferTripId, `Completed trip ${trip.tripId} resurfaced as an offer for driver ${driver.id}`);

      audit.cases.push({
        driver_id: driver.id,
        driver_name: driver.full_name,
        trip_id: trip.tripId,
        before_accept_offer: beforeTripId,
        after_accept_offer: afterOfferTripId,
        after_complete_offer: completeOfferTripId,
        assignment_status: assignmentRow?.status || null,
        trip_processing_status_id: assignmentRow?.trip_processing_status_id || null,
        marketplace_status: marketplaceRow?.status || null,
        external_trip_status: marketplaceRow?.external_trip_status || null,
        taken_by: marketplaceRow?.taken_by || null,
      });
    }

    console.log(JSON.stringify({ ok: true, audit }, null, 2));
  } finally {
    for (const tripId of cleanup.tripIds) {
      await restDelete('trip_assignments', `trip_id=eq.${encodeURIComponent(tripId)}`);
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
