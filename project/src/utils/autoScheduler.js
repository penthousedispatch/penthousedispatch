import { supabase } from '../lib/supabase';
import { geocodeAddress } from '../lib/geocode';
import { AI_SCHED, haversine } from './ai_scheduler';
import { logFailure } from './errorHandler';

async function enrichTripCoordinates(trip) {
  const pickupCoords = trip.coords || (
    trip.pu_lat && trip.pu_lng
      ? { lat: parseFloat(trip.pu_lat), lng: parseFloat(trip.pu_lng) }
      : await geocodeAddress([
          trip.pu_address,
          trip.pu_city,
          trip.pu_zip,
        ].filter(Boolean).join(', '))
  );

  const dropoffCoords = trip.do_coords || (
    trip.do_lat && trip.do_lng
      ? { lat: parseFloat(trip.do_lat), lng: parseFloat(trip.do_lng) }
      : await geocodeAddress([
          trip.do_address,
          trip.do_city,
          trip.do_zip,
        ].filter(Boolean).join(', '))
  );

  return {
    ...trip,
    coords: pickupCoords || null,
    do_coords: dropoffCoords || null,
  };
}

async function enrichTripsWithCoords(trips) {
  return Promise.all((trips || []).map(enrichTripCoordinates));
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
    const isoDate = new Date(raw);
    if (!Number.isNaN(isoDate.getTime()) && (raw.includes('T') || raw.includes('-'))) {
      return isoDate.getTime();
    }
    return parseTimeMin(raw);
  };
  const aStart = parseComparableTime(a?.pu_time || a?.scheduled_pickup_time || '');
  const bStart = parseComparableTime(b?.pu_time || b?.scheduled_pickup_time || '');
  if (aStart !== bStart) return aStart - bStart;
  const aLoaded = new Date(a?.loaded_at || a?.assigned_at || 0).getTime();
  const bLoaded = new Date(b?.loaded_at || b?.assigned_at || 0).getTime();
  return aLoaded - bLoaded;
}

function parseShiftHours(shiftStr) {
  if (!shiftStr) return 10;
  const clean = shiftStr.toLowerCase().replace(/\s/g, '');
  const parts = clean.split(/[-to]+/);
  if (parts.length < 2) return 10;
  const start = parseTimeMin(parts[0]);
  const end = parseTimeMin(parts[1]);
  return Math.max(1, (end - start) / 60);
}

function parseTimeMin(s) {
  s = s.trim().toLowerCase();
  const ampm = s.includes('pm') ? 'pm' : 'am';
  s = s.replace(/[apm]/g, '');
  const parts = s.split(':');
  let h = parseInt(parts[0]) || 0;
  const m = parseInt(parts[1]) || 0;
  if (ampm === 'pm' && h !== 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

function buildDriverResult(driver, scheduleResult, config) {
  const shiftHours = parseShiftHours(config.shift_hours || '7am-5pm');
  const denseTrips = scheduleResult.schedule.filter(trip => (parseFloat(trip.mileage) || 0) <= (config.short_trip_max_miles ?? 4)).length;

  return {
    driver,
    trips: scheduleResult.schedule.map((trip, index) => ({
      ...trip.raw,
      scheduled_order: index + 1,
      scheduled_pickup_time: trip.raw?.scheduled_pickup_time || trip.raw?.pu_time || trip.puTime || null,
      scheduled_dropoff_time: trip.raw?.scheduled_dropoff_time || trip.raw?.do_time || trip.doTime || trip.scheduledDropoffTime || null,
      _meta: {
        driveTimeFromPrev: trip.driveTimeFromPrev,
        bufferMins: trip.bufferMins,
        tightBuffer: trip.tightBuffer,
        shortTripBonus: trip.shortTripBonus,
        nearbyFutureTrips: trip.nearbyFutureTrips,
        sharedRideBonus: trip.sharedRideBonus,
      },
    })),
    projectedRevenue: Number(scheduleResult.totalRevenue || 0),
    projectedRPH: shiftHours > 0
      ? Number(scheduleResult.totalRevenue || 0) / shiftHours
      : 0,
    shortTripAssigned: denseTrips,
    sharedRideOpportunities: scheduleResult.sharedCandidates?.length || 0,
    issues: scheduleResult.issues || [],
  };
}

export async function runAutoScheduler({ drivers, trips, assignments, config, orgId, dryRun = false }) {
  const revenueTarget = Number(config.revenue_target_per_hour ?? 60);
  const assignedTripIds = new Set(
    (assignments || [])
      .filter(assignment => !['completed', 'cancelled', 'rejected'].includes(assignment.status))
      .map(assignment => assignment.trip_id)
  );

  const onlineDrivers = (drivers || []).filter(driver =>
    driver.status === 'online' || driver.status === 'on_trip'
  );

  const availableTrips = (trips || [])
    .filter(trip => isOfferableMarketplaceTrip(trip) && !assignedTripIds.has(trip.sentry_trip_id))
    .sort(compareTripsByPickupTime);

  const enrichedTrips = await enrichTripsWithCoords(availableTrips);
  const schedulePlans = AI_SCHED.buildAllDriversSchedules(onlineDrivers, enrichedTrips, config || {});
  const results = schedulePlans
    .filter(plan => plan.schedule?.length)
    .map(plan => buildDriverResult(plan.driver, plan, config));

  let totalAssigned = 0;
  let totalRevenue = 0;
  let sharedRideOpportunities = 0;
  let shortTripAssigned = 0;

  for (const result of results) {
    totalAssigned += result.trips.length;
    totalRevenue += result.trips.reduce((sum, trip) => sum + (parseFloat(trip.delivery_price) || 0), 0);
    sharedRideOpportunities += result.sharedRideOpportunities;
    shortTripAssigned += result.shortTripAssigned;
  }

  if (!dryRun && config.auto_assign) {
    const claimedTripIds = new Set(assignedTripIds);
    for (const { driver, trips: tripList } of results) {
      for (const trip of tripList) {
        const tripId = String(trip.sentry_trip_id || '');
        if (!tripId || claimedTripIds.has(tripId)) {
          continue;
        }
        const schedulerMeta = trip._meta || {};
        const driverLat = Number(driver.current_lat);
        const driverLng = Number(driver.current_lng);
        const pickupDistance = trip.coords?.lat && Number.isFinite(driverLat) && Number.isFinite(driverLng)
          ? haversine(driverLat, driverLng, trip.coords.lat, trip.coords.lng)
          : null;

        const { error: assignmentError } = await supabase.from('trip_assignments').insert({
          trip_id: tripId,
          driver_id: driver.id,
          company_id: driver.company_id || trip.company_id || null,
          driver_name: driver.full_name,
          status: 'pending',
          trip_processing_status_id: 0,
          pu_address: trip.pu_address,
          do_address: trip.do_address,
          pu_time: trip.pu_time,
          do_time: trip.do_time || trip.scheduled_dropoff_time || '',
          scheduled_pickup_time: trip.scheduled_pickup_time || trip.pu_time || null,
          scheduled_dropoff_time: trip.scheduled_dropoff_time || trip.do_time || null,
          delivery_price: parseFloat(trip.delivery_price) || 0,
          mileage: parseFloat(trip.mileage) || 0,
          notes: schedulerMeta.sharedRideBonus > 0 ? 'AUTO_SCHEDULER_SHARED_CANDIDATE' : '',
          scheduled_order: trip.scheduled_order,
          travel_time_mins: schedulerMeta.driveTimeFromPrev ?? null,
          pickup_distance_miles: pickupDistance ? Number(pickupDistance.toFixed(2)) : null,
        });
        if (assignmentError) {
          logFailure('runAutoScheduler:insertAssignment', assignmentError);
          continue;
        }
        claimedTripIds.add(tripId);

        const { error: tripUpdateError } = await supabase
          .from('marketplace_trips')
          .update({
            status: 'assigned',
            taken_by: driver.id,
            company_id: driver.company_id || trip.company_id || null,
          })
          .eq('sentry_trip_id', tripId);
        if (tripUpdateError) {
          logFailure('runAutoScheduler:updateMarketplaceTrip', tripUpdateError);
        }
      }
    }
  }

  const avgRPH = onlineDrivers.length > 0
    ? totalRevenue / Math.max(parseShiftHours(config.shift_hours || '7am-5pm'), 1)
    : 0;

  const issues = [];
  if (avgRPH < revenueTarget && onlineDrivers.length > 0) {
    issues.push(`Avg revenue ${avgRPH.toFixed(0)}/hr is below $${revenueTarget}/hr target`);
  }
  if (availableTrips.length < onlineDrivers.length) {
    issues.push(`Only ${availableTrips.length} trips available for ${onlineDrivers.length} drivers`);
  }

  const runSummary = results.map(result => ({
    driver_name: result.driver.full_name,
    trip_count: result.trips.length,
    projected_revenue: result.projectedRevenue,
    short_trip_assigned: result.shortTripAssigned,
    shared_ride_opportunities: result.sharedRideOpportunities,
  }));

  if (!dryRun && orgId) {
    const { error: runInsertError } = await supabase.from('auto_scheduler_runs').insert({
      org_id: orgId,
      drivers_processed: onlineDrivers.length,
      trips_assigned: totalAssigned,
      total_revenue: totalRevenue,
      avg_revenue_per_hour: avgRPH,
      issues,
      assignments: runSummary,
    });
    if (runInsertError) logFailure('runAutoScheduler:logRun', runInsertError);

    const { error: configUpdateError } = await supabase
      .from('auto_scheduler_config')
      .update({ last_run_at: new Date().toISOString() })
      .eq('org_id', orgId);
    if (configUpdateError) logFailure('runAutoScheduler:updateConfig', configUpdateError);
  }

  return {
    results,
    totalAssigned,
    totalRevenue,
    avgRPH,
    issues,
    driversProcessed: onlineDrivers.length,
    availableCount: availableTrips.length,
    sharedRideOpportunities,
    shortTripAssigned,
  };
}
