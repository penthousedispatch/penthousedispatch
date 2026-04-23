import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const providerVersion = '2026-04-22-sentry-provider-v5';

const DEFAULT_LAT = 40.7128;
const DEFAULT_LNG = -74.006;

const cleanText = (value: unknown) => String(value ?? '').trim();
const hasText = (value: unknown) => cleanText(value).length > 0;
const asNumber = (value: unknown, fallback: number | null = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = cleanText(value);
    if (candidate) return candidate;
  }
  return '';
};

const parseShiftHours = (shiftHours: unknown, anchorIso: string) => {
  const normalized = cleanText(shiftHours).toLowerCase();
  const match = normalized.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/
  );
  if (!match) return null;

  const base = new Date(anchorIso);
  if (Number.isNaN(base.getTime())) return null;

  const to24Hour = (hourStr: string, minuteStr: string | undefined, meridiem: string) => {
    let hour = Number(hourStr) % 12;
    if (meridiem === 'pm') hour += 12;
    return { hour, minute: Number(minuteStr || '0') };
  };

  const startParts = to24Hour(match[1], match[2], match[3]);
  const endParts = to24Hour(match[4], match[5], match[6]);

  const start = new Date(base);
  start.setUTCHours(startParts.hour, startParts.minute, 0, 0);

  const end = new Date(base);
  end.setUTCHours(endParts.hour, endParts.minute, 0, 0);
  if (end.getTime() <= start.getTime()) {
    end.setUTCDate(end.getUTCDate() + 1);
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const deriveCoords = (
  lat: unknown,
  lng: unknown,
  fallbackLat: unknown = DEFAULT_LAT,
  fallbackLng: unknown = DEFAULT_LNG,
) => ({
  lat: asNumber(lat, asNumber(fallbackLat, DEFAULT_LAT)) ?? DEFAULT_LAT,
  lng: asNumber(lng, asNumber(fallbackLng, DEFAULT_LNG)) ?? DEFAULT_LNG,
});

const deriveVehicleId = (row: Record<string, unknown>) =>
  firstText(
    row.sentry_vehicle_id,
    row.vehicle_plate,
    row.tlc_number,
    row.license_number,
    row.id,
  );

const deriveDriverId = (row: Record<string, unknown>) =>
  firstText(
    row.sentry_driver_id,
    row.license_number,
    row.tlc_number,
    row.driver_number,
    row.id,
  );

const defaultVehicleLocationPayload = (licensePlateNumber = 'X777777C', driverLicenseNumber = '999999999') => ({
  license_plate_number: licensePlateNumber,
  driver_license_number: driverLicenseNumber,
  location: {
    lat: 40.7128,
    lng: -74.006,
    address: '4444 Example Blvd',
    timestamp: '2022-10-01T10:00:00-04:00',
  },
  vehicle_status_id: 1,
  expected_availability: null,
});

/** Trip assignment → Sentry-style status_id (must be module scope: used by normalizeTripSidePayload). */
const mapTripStatusId = (status: unknown) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'completed') return 6;
  if (normalized === 'no_show') return 7;
  if (normalized === 'cancelled') return 8;
  if (normalized === 'picked_up') return 5;
  if (normalized === 'arrived') return 4;
  if (normalized === 'accepted' || normalized === 'en_route') return 3;
  if (normalized === 'pending' || normalized === 'assigned') return 2;
  return 3;
};

const defaultRetrieveTripPayload = (tripId: string) => ({
  trip_id: tripId,
  status_id: 6,
  cancel_reason_id: null,
  cancel_note: null,
  pick_up_arrival_timestamp: '2022-10-01T10:00:00-04:00',
  pick_up_timestamp: '2022-10-01T10:00:00-04:00',
  drop_off_timestamp: '2022-10-01T11:00:00-04:00',
  notes_from_provider: null,
  company_ein: 2343243,
  vehicle: {
    id: 0,
    dmv_registration: {
      license_plate_number: 'X777777C',
    },
  },
  driver: {
    id: 0,
    dmv_license: {
      license_number: '999999999',
      state_code: 'NY',
    },
  },
  pick_up_location: {
    lat: 40.7128,
    lng: -74.006,
  },
  drop_off_location: {
    lat: 40.7128,
    lng: -74.006,
  },
  mta: {
    collected_fare: 1.8,
    dispatch_base_ein: 777777777,
  },
});

const normalizeTripSidePayload = (
  tripId: string,
  raw: Record<string, unknown>,
  assignment?: Record<string, unknown>,
  driverRow?: Record<string, unknown>,
  tripRow?: Record<string, unknown>,
) => {
  const fallback = defaultRetrieveTripPayload(tripId);
  const rawVehicle = (raw.vehicle as Record<string, unknown>) || {};
  const rawDriver = (raw.driver as Record<string, unknown>) || {};
  const rawVehicleReg = (rawVehicle.dmv_registration as Record<string, unknown>) || {};
  const rawDriverLicense = (rawDriver.dmv_license as Record<string, unknown>) || {};
  const rawPickUp = (raw.pick_up_location as Record<string, unknown>) || {};
  const rawDropOff = (raw.drop_off_location as Record<string, unknown>) || {};
  const rawMta = (raw.mta as Record<string, unknown>) || {};

  const collectedFromAssignment = asNumber(assignment?.collected_fare, null);
  const collectedFromMta = asNumber(rawMta.collected_fare, null);
  const collectedFareResolved =
    collectedFromAssignment != null && Number.isFinite(collectedFromAssignment)
      ? collectedFromAssignment
      : (collectedFromMta != null && Number.isFinite(collectedFromMta)
        ? collectedFromMta
        : (fallback.mta.collected_fare as number));

  const nextDayFlag = Boolean(
    assignment?.is_next_day ?? raw.next_day ?? raw.is_next_day ?? false,
  );

  return {
    trip_id: tripId,
    /** When a TP assignment row exists, lifecycle read-back follows Penthouse (not stale inbound raw.status_id). */
    status_id: assignment
      ? mapTripStatusId(assignment.status)
      : (asNumber(raw.status_id, fallback.status_id) ?? fallback.status_id),
    cancel_reason_id: raw.cancel_reason_id ?? null,
    cancel_note: raw.cancel_note ?? null,
    pick_up_arrival_timestamp: firstText(raw.pick_up_arrival_timestamp, fallback.pick_up_arrival_timestamp),
    pick_up_timestamp: firstText(
      assignment?.actual_pickup_time,
      raw.pick_up_timestamp,
      fallback.pick_up_timestamp,
    ),
    drop_off_timestamp: firstText(
      assignment?.actual_dropoff_time,
      assignment?.completed_at,
      raw.drop_off_timestamp,
      fallback.drop_off_timestamp,
    ),
    notes_from_provider: assignment?.notes ?? raw.notes_from_provider ?? null,
    company_ein: asNumber(raw.company_ein, asNumber(rawMta.dispatch_base_ein, fallback.company_ein)) ?? fallback.company_ein,
    vehicle: {
      id: asNumber(rawVehicle.id, asNumber(deriveVehicleId(driverRow || {}), fallback.vehicle.id)) ?? fallback.vehicle.id,
      dmv_registration: {
        license_plate_number: firstText(
          rawVehicleReg.license_plate_number,
          driverRow?.vehicle_plate,
          driverRow?.tlc_number,
          driverRow?.sentry_vehicle_id,
          tripRow?.vehicle_plate,
          fallback.vehicle.dmv_registration.license_plate_number,
        ),
      },
    },
    driver: {
      id: asNumber(rawDriver.id, asNumber(deriveDriverId(driverRow || {}), fallback.driver.id)) ?? fallback.driver.id,
      dmv_license: {
        license_number: firstText(
          rawDriverLicense.license_number,
          driverRow?.license_number,
          driverRow?.tlc_number,
          driverRow?.sentry_driver_id,
          fallback.driver.dmv_license.license_number,
        ),
        state_code: firstText(
          rawDriverLicense.state_code,
          driverRow?.license_state,
          fallback.driver.dmv_license.state_code,
        ),
      },
    },
    pick_up_location: deriveCoords(
      rawPickUp.lat,
      rawPickUp.lng,
      tripRow?.pu_lat,
      tripRow?.pu_lng,
    ),
    drop_off_location: deriveCoords(
      rawDropOff.lat,
      rawDropOff.lng,
      tripRow?.do_lat,
      tripRow?.do_lng,
    ),
    mta: {
      collected_fare: collectedFareResolved,
      dispatch_base_ein: asNumber(
        rawMta.dispatch_base_ein,
        fallback.mta.dispatch_base_ein,
      ),
    },
    collected_fare: collectedFareResolved,
    collected_fare_amount: collectedFareResolved,
    is_next_day: nextDayFlag,
    next_day: nextDayFlag,
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const pathname = url.pathname;
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const basicToken = authHeader.startsWith('Basic ') ? authHeader.slice(6).trim() : '';
    const secret = url.searchParams.get('secret') || '';

    const respond = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Sentry-Provider-Version': providerVersion,
        },
      });

    const cleanAuthValue = (value: unknown) => String(value || '').replace(/\u00a0/g, ' ').trim();
    const decodeBasicAuth = (token: string) => {
      if (!token) return { username: '', password: '' };
      try {
        const decoded = atob(token);
        const separatorIndex = decoded.indexOf(':');
        if (separatorIndex === -1) {
          return { username: cleanAuthValue(decoded), password: '' };
        }
        return {
          username: cleanAuthValue(decoded.slice(0, separatorIndex)),
          password: cleanAuthValue(decoded.slice(separatorIndex + 1)),
        };
      } catch {
        return { username: '', password: '' };
      }
    };

    const docError = (
      status: number,
      message: string,
    ) => respond({ error: message }, status);

    const { data: cfg } = await supabase
      .from('sentry_config')
      .select('webhook_secret, username, password_enc, api_key')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const providedSecret = cleanAuthValue(secret || bearerToken);
    const expectedSecret = cleanAuthValue(cfg?.webhook_secret);
    const expectedBearer = cleanAuthValue(cfg?.api_key);
    const expectedUsername = cleanAuthValue(cfg?.username);
    const expectedPassword = cleanAuthValue(cfg?.password_enc);
    const basicCredentials = decodeBasicAuth(basicToken);

    const hasConfiguredAuth = Boolean(expectedSecret || expectedBearer || expectedUsername);
    const secretMatched = Boolean(providedSecret && expectedSecret && providedSecret === expectedSecret);
    const bearerMatched = Boolean(bearerToken && expectedBearer && cleanAuthValue(bearerToken) === expectedBearer);
    const basicMatched = Boolean(
      basicToken &&
      expectedUsername &&
      basicCredentials.username === expectedUsername &&
      basicCredentials.password === expectedPassword
    );

    if (hasConfiguredAuth && !secretMatched && !bearerMatched && !basicMatched) {
      return docError(401, 'Unauthorized (authentication data are missing or wrong)');
    }

    const mapVehicleStatusId = (status: unknown) => {
      const normalized = String(status || '').trim().toLowerCase();
      if (normalized === 'on_trip') return 2;
      if (normalized === 'break') return 3;
      if (normalized === 'offline') return 0;
      return 1;
    };

    // GET /rest/gc/vehicle_locations.json — all online driver locations
    if (pathname.includes('vehicle_locations')) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, sentry_driver_id, sentry_vehicle_id, current_lat, current_lng, status, full_name, updated_at, license_number, vehicle_plate, tlc_number, driver_number')
        .eq('is_active', true)
        .in('status', ['online', 'on_trip']);

      const locations = (drivers || [])
        .map((d: Record<string, unknown>) => ({
          vehicle_id: deriveVehicleId(d),
          driver_id: deriveDriverId(d),
          driver_name: d.full_name,
          license_plate_number: firstText(d.vehicle_plate, d.tlc_number, d.sentry_vehicle_id),
          driver_license_number: firstText(d.license_number, d.tlc_number, d.sentry_driver_id),
          location: {
            ...deriveCoords(d.current_lat, d.current_lng),
            address: '',
            timestamp: firstText(d.updated_at, new Date().toISOString()),
          },
          vehicle_status_id: mapVehicleStatusId(d.status),
          expected_availability: null,
        }));

      return respond({
        vehicle_locations: locations,
        count: locations.length,
      });
    }

    // GET /rest/gc/vehicle_location.json?license_plate_number=X — single vehicle
    if (pathname.includes('vehicle_location')) {
      const licensePlateNumber = url.searchParams.get('license_plate_number');
      if (!licensePlateNumber) return docError(400, 'Bad Request (a URL parameter is missing)');

      const normalizedPlate = cleanText(licensePlateNumber);
      let { data: driver } = await supabase
        .from('drivers')
        .select('id, sentry_driver_id, sentry_vehicle_id, current_lat, current_lng, status, full_name, updated_at, license_number, vehicle_plate, tlc_number, driver_number')
        .eq('vehicle_plate', normalizedPlate)
        .maybeSingle();

      if (!driver) {
        const fallback = await supabase
          .from('drivers')
          .select('id, sentry_driver_id, sentry_vehicle_id, current_lat, current_lng, status, full_name, updated_at, license_number, vehicle_plate, tlc_number, driver_number')
          .or(`tlc_number.eq.${normalizedPlate},sentry_vehicle_id.eq.${normalizedPlate}`)
          .maybeSingle();
        driver = fallback.data;
      }

      if (!driver) {
        return respond(defaultVehicleLocationPayload(normalizedPlate));
      }

      return respond({
        license_plate_number: firstText(driver.vehicle_plate, driver.tlc_number, driver.sentry_vehicle_id),
        driver_license_number: firstText(driver.license_number, driver.tlc_number, driver.sentry_driver_id),
        location: {
          ...deriveCoords(driver.current_lat, driver.current_lng),
          address: '4444 Example Blvd',
          timestamp: firstText(driver.updated_at, '2022-10-01T10:00:00-04:00'),
        },
        vehicle_status_id: mapVehicleStatusId(driver.status),
        expected_availability: null,
      });
    }

    // GET /rest/gc/vehicle_waypoint_etas.json — waypoint ETAs
    if (pathname.includes('vehicle_waypoint_etas')) {
      const { data: assignments } = await supabase
        .from('trip_assignments')
        .select('*, drivers(id, sentry_driver_id, sentry_vehicle_id, current_lat, current_lng, full_name, license_number, vehicle_plate, tlc_number)')
        .in('status', ['accepted', 'pending'])
        .order('assigned_at', { ascending: false })
        .limit(50);

      const etas = (assignments || []).map((a: Record<string, unknown>) => {
        const driver = a.drivers as Record<string, unknown> | null;
        return {
          vehicle_id: driver ? deriveVehicleId(driver) : firstText(a.driver_id),
          trip_id: a.trip_id,
          driver_name: a.driver_name,
          pu_address: a.pu_address,
          pu_time: a.pu_time,
          scheduled_order: a.scheduled_order,
          travel_time_mins: a.travel_time_mins,
          status: a.status,
        };
      });

      return respond({ vehicle_waypoint_etas: etas });
    }

    // GET /rest/gc/retrieve_trips.json — TP-stored trips
    if (pathname.includes('retrieve_trips')) {
      const tripIdsParam = url.searchParams.get('trip_ids') || '';
      const dateParam = url.searchParams.get('date') || '';

      if (!tripIdsParam && !dateParam) {
        return docError(400, 'Bad Request (a URL parameter is missing)');
      }

      let query = supabase
        .from('marketplace_trips')
        .select('*')
        .order('loaded_at', { ascending: false })
        .limit(200);

      if (tripIdsParam) {
        const tripIds = tripIdsParam.split(',').map(part => part.trim()).filter(Boolean);
        query = query.in('sentry_trip_id', tripIds);
      }

      if (dateParam) {
        query = query.eq('date_val', dateParam);
      }

      const { data: trips, error: tripsError } = await query;
      if (tripsError) {
        return docError(500, 'Internal server error');
      }

      const tripIds = (trips || []).map((t: Record<string, unknown>) => String(t.sentry_trip_id || '')).filter(Boolean);
      const { data: assignments, error: assignmentsError } = tripIds.length
        ? await supabase
            .from('trip_assignments')
            .select('trip_id, status, completed_at, actual_pickup_time, actual_dropoff_time, notes, driver_id, collected_fare, is_next_day, next_day_requested_at')
            .in('trip_id', tripIds)
        : { data: [], error: null };

      if (assignmentsError) {
        console.error('retrieve_trips assignmentsError', assignmentsError);
        return docError(500, 'Internal server error');
      }

      const assignmentByTrip = new Map(
        (assignments || []).map((assignment: Record<string, unknown>) => [String(assignment.trip_id || ''), assignment])
      );

      const mapped = (trips || []).flatMap((t: Record<string, unknown>) => {
        try {
          const raw = (t.raw_payload as Record<string, unknown>) || {};
          const assignment = assignmentByTrip.get(String(t.sentry_trip_id || '')) as Record<string, unknown> | undefined;
          const tripId = firstText(raw.trip_id, t.sentry_trip_id);
          return [normalizeTripSidePayload(tripId, raw, assignment, {}, t)];
        } catch (error) {
          console.error('retrieve_trips rowError', {
            trip_id: t.sentry_trip_id,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        }
      });

      return respond(mapped);
    }

    // GET /driver_work_shifts.json — driver shift schedules
    if (pathname.includes('driver_work_shifts')) {
      const startTimestampMax = url.searchParams.get('start_timestamp_max');
      const endTimestampMin = url.searchParams.get('end_timestamp_min');
      if (!startTimestampMax || !endTimestampMin) {
        return docError(400, 'Bad Request (a URL parameter is missing)');
      }

      const { data: drivers, error: driversError } = await supabase
        .from('drivers')
        .select('id, sentry_driver_id, sentry_vehicle_id, full_name, status, current_lat, current_lng, preferred_zones, shift_hours, tlc_number, license_number, vehicle_plate')
        .eq('is_active', true);

      if (driversError) {
        return docError(500, 'Internal server error');
      }

      const shifts = (drivers || []).map((d: Record<string, unknown>) => {
        const derivedShift = parseShiftHours(d.shift_hours, startTimestampMax);
        return {
        driver: {
          id: deriveDriverId(d) || 0,
        },
        vehicle: {
          id: deriveVehicleId(d) || 0,
        },
        start_location: {
          ...deriveCoords(d.current_lat, d.current_lng),
        },
        start_timestamp: firstText(derivedShift?.start, startTimestampMax),
        end_timestamp: firstText(derivedShift?.end, endTimestampMin),
        routing_criterion: Array.isArray(d.preferred_zones) && d.preferred_zones.length
          ? d.preferred_zones.join('')
          : 'BronxManhattanQueens',
        };
      });

      return respond(shifts);
    }

    return docError(404, 'Not Found (the service endpoint is not found)');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sentry-provider error', message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Sentry-Provider-Version': providerVersion,
      },
    });
  }
});
