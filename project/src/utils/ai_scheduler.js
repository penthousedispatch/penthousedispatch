import { detectServiceZone, getZonePreferenceBonus, normalizePreferredZones } from '../lib/serviceZones';

// Penthouse Dispatch — AI Scheduler v4.0
// Full-day schedule generation with traffic buffer, shared ride detection,
// $60/hr minimum revenue quota, and 2+ trips/hr density target.

'use strict';

const AI_SCHED = {
  AVG_SPEED_MPH: 18,
  BUFFER_MINS: 15,
  MIN_TRIPS_PER_DAY: 10,
  MIN_TRIPS_PER_HOUR: 2,
  HOURLY_RATE_DRIVER: 18,
  MIN_REVENUE_PER_HOUR: 60,
  DEFAULT_TRAFFIC_BUFFER_PCT: 20,
  DEFAULT_TRAFFIC_WEIGHT: 8,
  DEFAULT_SHORT_TRIP_MAX_MILES: 4,
  DEFAULT_SHORT_TRIP_BONUS_WEIGHT: 9,
  DEFAULT_CHAINING_WEIGHT: 8,
  DEFAULT_SHARED_RIDE_BONUS_WEIGHT: 6,

  estimateTripDuration(mileage, trafficBufferPct = 20) {
    const raw = Math.ceil((parseFloat(mileage) || 5) / this.AVG_SPEED_MPH * 60) + 8;
    return Math.ceil(raw * (1 + trafficBufferPct / 100));
  },

  estimateDriveTime(dist, trafficBufferPct = 20) {
    const raw = Math.ceil((dist / this.AVG_SPEED_MPH) * 60);
    return Math.ceil(raw * (1 + trafficBufferPct / 100));
  },

  parseShift(shiftStr) {
    if (!shiftStr) return { startMin: 7 * 60, endMin: 17 * 60 };
    const clean = shiftStr.toLowerCase().replace(/\s/g, '');
    const parts = clean.split(/[-to]+/);
    if (parts.length < 2) return { startMin: 7 * 60, endMin: 17 * 60 };
    return { startMin: parseTimeStr(parts[0]), endMin: parseTimeStr(parts[1]) };
  },

  isSharedRideCandidate(tripA, tripB) {
    if (!tripA.coords || !tripB.coords) return false;
    const dist = haversineKm(
      tripA.coords.lat, tripA.coords.lng,
      tripB.coords.lat, tripB.coords.lng
    );
    if (dist > 3) return false;
    const bearingA = getBearing(tripA.coords, tripA.doCoords || tripA.coords);
    const bearingB = getBearing(tripB.coords, tripB.doCoords || tripB.coords);
    const angleDiff = Math.abs(bearingA - bearingB) % 360;
    return angleDiff < 45 || angleDiff > 315;
  },

  buildFullDaySchedule(driver, allTrips, shiftStr, alreadyTakenIds, options = {}) {
    const trafficBuf = options.trafficBufferPct ?? this.DEFAULT_TRAFFIC_BUFFER_PCT;
    const trafficWeight = Number(options.trafficWeight ?? this.DEFAULT_TRAFFIC_WEIGHT);
    const sharedRidesEnabled = options.sharedRidesEnabled !== false;
    const shortTripMaxMiles = Number(options.shortTripMaxMiles ?? this.DEFAULT_SHORT_TRIP_MAX_MILES);
    const shortTripBonusWeight = Number(options.shortTripBonusWeight ?? this.DEFAULT_SHORT_TRIP_BONUS_WEIGHT);
    const chainingWeight = Number(options.chainingWeight ?? this.DEFAULT_CHAINING_WEIGHT);
    const sharedRideBonusWeight = Number(options.sharedRideBonusWeight ?? this.DEFAULT_SHARED_RIDE_BONUS_WEIGHT);
    const priceWeight = Number(options.priceWeight ?? 8);
    const proximityWeight = Number(options.proximityWeight ?? 7);
    const zoneWeight = Number(options.zoneWeight ?? 10);
    const { startMin, endMin } = this.parseShift(shiftStr);
    const shiftHours = (endMin - startMin) / 60;
    const targetTrips = Math.max(this.MIN_TRIPS_PER_DAY, shiftHours * this.MIN_TRIPS_PER_HOUR);

    if (!driver.startCoords) return { schedule: [], issues: ['No start location'] };

    const available = allTrips
      .filter(t => {
        if (!t.coords) return false;
        if (alreadyTakenIds.has(t.tripId)) return false;
        if (!t.startMin) return false;
        if (t.startMin < startMin - 30) return false;
        if (t.startMin > endMin) return false;
        return true;
      })
      .map(t => {
        const dist = haversine(
          driver.startCoords.lat, driver.startCoords.lng,
          t.coords.lat, t.coords.lng
        );
        const price = parseFloat(t.deliveryPrice) || 0;
        const miles = parseFloat(t.mileage) || 1;
        const revenuePerMile = price / Math.max(miles, 0.1);
        const driveTime = this.estimateDriveTime(dist, trafficBuf);
        const earlyBonus = t.startMin < startMin + 120 ? 20 : 0;
        const shortTripBonus = miles <= shortTripMaxMiles
          ? shortTripBonusWeight * Math.max(1, shortTripMaxMiles - miles + 1)
          : 0;
        const zonePreferenceBonus = getZonePreferenceBonus(
          t.serviceZone,
          normalizePreferredZones(driver.preferred_zones),
          zoneWeight
        );
        const nearbyFutureTrips = allTrips.filter(candidate => {
          if (!candidate?.coords || candidate.tripId === t.tripId || alreadyTakenIds.has(candidate.tripId)) return false;
          if (!candidate.startMin || candidate.startMin < t.startMin) return false;
          if ((candidate.startMin - t.startMin) > 120) return false;

          const fromCoords = t.doCoords || t.coords;
          return haversine(
            fromCoords.lat,
            fromCoords.lng,
            candidate.coords.lat,
            candidate.coords.lng
          ) <= 3;
        }).length;
        const sharedRideBonus = sharedRidesEnabled
          && allTrips.some(candidate => candidate.tripId !== t.tripId && this.isSharedRideCandidate(t, candidate))
          ? sharedRideBonusWeight
          : 0;
        const score = (price * Math.max(0.5, priceWeight / 4))
          + (revenuePerMile * 1.75)
          + earlyBonus
          + shortTripBonus
          + zonePreferenceBonus
          + (nearbyFutureTrips * chainingWeight)
          + sharedRideBonus
          - (dist * Math.max(0.1, proximityWeight / 4))
          - (driveTime * Math.max(0.2, trafficWeight / 5));
        return {
          ...t,
          dist,
          driveTime,
          revenuePerMile,
          nearbyFutureTrips,
          shortTripBonus,
          zonePreferenceBonus,
          sharedRideBonus,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);

    const schedule = [];
    const usedIds = new Set(alreadyTakenIds);
    const hourRevenue = {};

    let lastEndMin = startMin;
    let lastCoords = driver.startCoords;

    for (const trip of available) {
      if (schedule.length >= Math.ceil(targetTrips * 1.1)) break;
      if (usedIds.has(trip.tripId)) continue;

      const driveFromLast = lastCoords
        ? this.estimateDriveTime(
            haversine(lastCoords.lat, lastCoords.lng, trip.coords.lat, trip.coords.lng),
            trafficBuf
          )
        : 0;

      const earliestStart = lastEndMin + driveFromLast + this.BUFFER_MINS;
      if (trip.startMin < earliestStart) continue;

      const hour = Math.floor(trip.startMin / 60);
      hourRevenue[hour] = (hourRevenue[hour] || 0) + (parseFloat(trip.deliveryPrice) || 0);

      const tripDuration = this.estimateTripDuration(trip.mileage, trafficBuf);
      const bufferMins = trip.startMin - earliestStart;
      const scheduledDropoffMin = trip.doTime
        ? parseTimeStr(trip.doTime)
        : trip.startMin + tripDuration;

      schedule.push({
        ...trip,
        scheduledStart: trip.startMin,
        estimatedEnd: trip.startMin + tripDuration,
        scheduledDropoffMin,
        scheduledDropoffTime: minToTime(scheduledDropoffMin),
        driveTimeFromPrev: driveFromLast,
        bufferMins,
        tightBuffer: bufferMins < 5,
        trafficBufferPct: trafficBuf,
        confirmed: false,
        isSharedRide: false,
      });

      usedIds.add(trip.tripId);
      lastEndMin = trip.startMin + tripDuration;
      lastCoords = trip.doCoords || trip.coords;

      if (schedule.length >= targetTrips) break;
    }

    const issues = [];
    const totalHours = Math.ceil((endMin - startMin) / 60);
    const totalRevenue = schedule.reduce((s, t) => s + (parseFloat(t.deliveryPrice) || 0), 0);
    const revenuePerHour = totalRevenue / totalHours;

    if (revenuePerHour < this.MIN_REVENUE_PER_HOUR) {
      issues.push(`Revenue $${revenuePerHour.toFixed(0)}/hr is below $${this.MIN_REVENUE_PER_HOUR}/hr target`);
    }
    if (schedule.length < this.MIN_TRIPS_PER_DAY) {
      issues.push(`Only ${schedule.length} trips found — target is ${this.MIN_TRIPS_PER_DAY}`);
    }

    const tripsPerHourBySlot = {};
    for (const t of schedule) {
      const h = Math.floor(t.scheduledStart / 60);
      tripsPerHourBySlot[h] = (tripsPerHourBySlot[h] || 0) + 1;
    }
    const underDensityHours = Object.entries(tripsPerHourBySlot)
      .filter(([, count]) => count < this.MIN_TRIPS_PER_HOUR)
      .map(([h]) => `${h}:00`);
    if (underDensityHours.length > 0) {
      issues.push(`Hours below 2 trips/hr: ${underDensityHours.join(', ')}`);
    }

    let sharedCandidates = [];
    if (sharedRidesEnabled) {
      const unassigned = allTrips.filter(t => !usedIds.has(t.tripId) && t.coords && t.startMin);
      for (const sched of schedule) {
        for (const candidate of unassigned) {
          if (this.isSharedRideCandidate(sched, candidate)) {
            const driveFromSched = this.estimateDriveTime(
              haversine(sched.coords.lat, sched.coords.lng, candidate.coords.lat, candidate.coords.lng),
              trafficBuf
            );
            const wouldFit = candidate.startMin >= sched.scheduledStart - 10
              && candidate.startMin <= sched.scheduledStart + driveFromSched + 10;
            if (wouldFit) {
              sharedCandidates.push({
                nearTrip: sched,
                sharedTrip: candidate,
                detourMins: driveFromSched,
                bonusRevenue: parseFloat(candidate.deliveryPrice) || 0,
              });
            }
          }
        }
      }
    }

    return {
      schedule,
      sharedCandidates,
      totalRevenue: totalRevenue.toFixed(2),
      revenuePerHour: revenuePerHour.toFixed(2),
      shiftHours: totalHours,
      issues,
      feasible: issues.length === 0,
      trafficBufferPct: trafficBuf,
    };
  },

  validateSchedule(schedule, startCoords, trafficBufferPct = 20) {
    const conflicts = [], warnings = [];
    const sorted = [...schedule].filter(t => t.startMin).sort((a, b) => a.startMin - b.startMin);
    let lastEndMin = null, lastCoords = startCoords;
    for (const trip of sorted) {
      const dur = this.estimateTripDuration(trip.mileage, trafficBufferPct);
      if (lastCoords && trip.coords) {
        const dist = haversine(lastCoords.lat, lastCoords.lng, trip.coords.lat, trip.coords.lng);
        const drive = this.estimateDriveTime(dist, trafficBufferPct);
        const earliest = (lastEndMin || 0) + drive;
        if (lastEndMin && earliest > trip.startMin) {
          conflicts.push({
            trip,
            message: `${trip.tripId}: ${drive}min drive but only ${trip.startMin - (lastEndMin || 0)}min gap. Short by ${earliest - trip.startMin}min.`,
            shortfallMins: earliest - trip.startMin,
          });
        } else if (lastEndMin && (trip.startMin - earliest) < this.BUFFER_MINS) {
          warnings.push({
            trip,
            message: `${trip.tripId}: Only ${trip.startMin - earliest}min buffer — tight.`,
          });
        }
      }
      lastEndMin = trip.startMin + dur;
      lastCoords = trip.doCoords || trip.coords;
    }
    return { feasible: conflicts.length === 0, conflicts, warnings };
  },

  findNextTrips(completedTrip, allTrips, assignedIds, currentTime, limit = 3, trafficBufferPct = 20) {
    const currentEndMin = completedTrip.startMin
      ? completedTrip.startMin + this.estimateTripDuration(completedTrip.mileage, trafficBufferPct)
      : currentTime;
    const refCoords = completedTrip.doCoords || completedTrip.coords;
    return allTrips
      .filter(t => {
        if (!t.coords || assignedIds.has(t.tripId) || !t.startMin) return false;
        const dist = refCoords
          ? haversine(refCoords.lat, refCoords.lng, t.coords.lat, t.coords.lng)
          : 999;
        const drive = this.estimateDriveTime(dist, trafficBufferPct);
        return t.startMin >= currentEndMin + drive + this.BUFFER_MINS;
      })
      .map(t => {
        const dist = refCoords
          ? haversine(refCoords.lat, refCoords.lng, t.coords.lat, t.coords.lng)
          : 999;
        const price = parseFloat(t.deliveryPrice) || 0;
        const drive = this.estimateDriveTime(dist, trafficBufferPct);
        return {
          ...t,
          dist,
          drive,
          score: (price * 2) + (Math.max(0, 10 - dist) * 3) - (drive * 1.15),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },

  buildAllDriversSchedules(drivers, allTrips, config) {
    const shiftStr = config.shift_hours || '7am-5pm';
    const trafficBufferPct = config.traffic_buffer_pct ?? this.DEFAULT_TRAFFIC_BUFFER_PCT;
    const sharedRidesEnabled = config.shared_rides_enabled !== false;
    const takenIds = new Set();
    const results = [];

    const driversWithCoords = drivers.map(d => ({
      ...d,
      preferred_zones: normalizePreferredZones(d.preferred_zones),
      startCoords: d.current_lat && d.current_lng
        ? { lat: parseFloat(d.current_lat), lng: parseFloat(d.current_lng) }
        : null,
    })).filter(d => d.startCoords);

    const normalizedTrips = allTrips.map(t => ({
      tripId: t.sentry_trip_id || t.id,
      deliveryPrice: t.delivery_price,
      mileage: t.mileage,
      coords: t.coords || (t.pu_lat && t.pu_lng ? { lat: parseFloat(t.pu_lat), lng: parseFloat(t.pu_lng) } : null),
      doCoords: t.do_coords || (t.do_lat && t.do_lng ? { lat: parseFloat(t.do_lat), lng: parseFloat(t.do_lng) } : null),
      startMin: t.pu_time ? parseTimeStr(t.pu_time.replace(/^(\d+):(\d+).*$/, '$1:$2')) : null,
      puAddress: t.pu_address,
      doAddress: t.do_address,
      puTime: t.pu_time,
      doTime: t.do_time,
      serviceZone: detectServiceZone(t.pu_address || ''),
      status: t.status,
      raw: t,
    })).filter(t => t.coords && t.startMin !== null);

    for (const driver of driversWithCoords) {
      const result = this.buildFullDaySchedule(
        driver,
        normalizedTrips,
        shiftStr,
        takenIds,
        {
          trafficBufferPct,
          sharedRidesEnabled,
          priceWeight: config.price_weight,
          proximityWeight: config.proximity_weight,
          trafficWeight: config.traffic_weight,
          zoneWeight: config.zone_weight,
          shortTripMaxMiles: config.short_trip_max_miles,
          shortTripBonusWeight: config.short_trip_bonus_weight,
          chainingWeight: config.chaining_weight,
          sharedRideBonusWeight: config.shared_ride_bonus_weight,
        }
      );
      for (const s of result.schedule) takenIds.add(s.tripId);
      results.push({ driver, ...result });
    }

    return results;
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseTimeStr(s) {
  if (!s) return 0;
  const raw = String(s).trim();
  if (!raw) return 0;

  const isoDate = new Date(raw);
  if (!Number.isNaN(isoDate.getTime()) && (raw.includes('T') || raw.includes('-'))) {
    return isoDate.getHours() * 60 + isoDate.getMinutes();
  }

  s = raw.toLowerCase();
  const ampm = s.includes('pm') ? 'pm' : 'am';
  s = s.replace(/[apm]/g, '');
  const parts = s.split(':');
  let h = parseInt(parts[0]) || 0;
  const m = parseInt(parts[1]) || 0;
  if (ampm === 'pm' && h !== 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

function minToTime(min) {
  const safeMin = Math.max(0, Number(min) || 0);
  const h = Math.floor(safeMin / 60);
  const m = safeMin % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function haversineKm(a, b, c, d) {
  const R = 6371;
  const dL = (c - a) * Math.PI / 180;
  const dl = (d - b) * Math.PI / 180;
  const x = Math.sin(dL / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
}

function getBearing(from, to) {
  if (!from || !to) return 0;
  const dLon = (to.lng - from.lng) * Math.PI / 180;
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

if (typeof window !== 'undefined') {
  window.AI_SCHED = AI_SCHED;
  window.parseTimeStr = parseTimeStr;
}

export { AI_SCHED, parseTimeStr, haversine, haversineKm };
export default AI_SCHED;
