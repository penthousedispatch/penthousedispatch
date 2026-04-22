import { getEdgeFunctionHeaders } from './edgeHeaders';

const SENTRY_SANDBOX_URL = 'https://dsp-integration.test.sentryms.com';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

function shouldAllowDirectSentryFallback() {
  if (typeof window === 'undefined') return false;
  const hostname = window.location?.hostname || '';
  return Boolean(import.meta.env.DEV) && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(hostname);
}

function cleanAuthValue(value) {
  return String(value || '').replace(/\u00a0/g, ' ').trim();
}

function resolveAuthMode(authType, username, apiKey) {
  const normalized = cleanAuthValue(authType).toLowerCase();
  if (normalized === 'bearer' && apiKey) return 'bearer';
  if (normalized === 'api_key' && apiKey) return 'bearer';
  if (username) return 'basic';
  if (apiKey) return 'bearer';
  return 'none';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatSentryDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return cleanAuthValue(value);

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

function shouldNormalizeTimestamp(key) {
  return /(?:^|_)(?:at|timestamp|time|max|min)$/.test(key)
    || key === 'last_modified_at'
    || key === 'sput_min'
    || key === 'sput_max';
}

function normalizeSentryPayloadTimestamps(value, parentKey = '') {
  if (Array.isArray(value)) {
    return value.map(item => normalizeSentryPayloadTimestamps(item, parentKey));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeSentryPayloadTimestamps(nestedValue, key),
      ])
    );
  }

  if (value === null || value === undefined || value === '') {
    return value;
  }

  if (parentKey && shouldNormalizeTimestamp(parentKey)) {
    return formatSentryDateTime(value);
  }

  return value;
}

function shouldRetryStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function parseResponsePayload(res) {
  const raw = await res.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return raw || null;
  }
}

async function wait(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function formatStructuredError({ phase = '', errorType = '', status = null, message = '' } = {}) {
  const tags = [];
  if (phase) tags.push(`phase=${phase}`);
  if (errorType) tags.push(`type=${errorType}`);
  if (status) tags.push(`status=${status}`);
  const prefix = tags.length ? `[${tags.join(' ')}] ` : '';
  return `${prefix}${message || 'Unknown Sentry request error'}`.trim();
}

function extractErrorFromPayload(payload, fallbackStatus = null, phase = '') {
  if (!payload) {
    return {
      error: formatStructuredError({
        phase,
        status: fallbackStatus,
        message: fallbackStatus ? `HTTP ${fallbackStatus}` : 'Unknown Sentry request error',
      }),
      errorType: null,
    };
  }

  if (typeof payload === 'string') {
    return {
      error: formatStructuredError({
        phase,
        status: fallbackStatus,
        message: payload || (fallbackStatus ? `HTTP ${fallbackStatus}` : 'Unknown Sentry request error'),
      }),
      errorType: null,
    };
  }

  const error = payload.message || payload.error || payload.detail || payload.hint || (fallbackStatus ? `HTTP ${fallbackStatus}` : 'Unknown Sentry request error');
  return {
    error: formatStructuredError({
      phase,
      errorType: payload.error_type || null,
      status: payload.status || fallbackStatus,
      message: error,
    }),
    errorType: payload.error_type || null,
  };
}

class SentryApiClient {
  constructor() {
    this.baseUrl = SENTRY_SANDBOX_URL;
    this.username = '';
    this.password = '';
    this.apiKey = '';
    this.authType = 'basic';
    this.enabled = true;
    this.config = { enabled: true };

    this.features = {
      assignedTrips: true,
      marketplaceTrips: true,
      tripAcceptReject: true,
      tripStatusUpdate: true,
      drivers: true,
      vehicles: true,
      vehicleLocations: true,
      vehicleWaypointEtas: true,
      driverWorkShifts: true,
      retrieveTrips: true,
    };
  }

  configure(config) {
    this.baseUrl = config.baseUrl || SENTRY_SANDBOX_URL;
    this.username = cleanAuthValue(config.username);
    this.password = cleanAuthValue(config.password);
    this.apiKey = cleanAuthValue(config.apiKey);
    this.authType = config.authType || 'basic';
    this.enabled = config.enabled !== false;

    if (config.features && typeof config.features === 'object') {
      this.features = { ...this.features, ...config.features };
    }

    this.config = { ...this.config, ...config };
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    const mode = resolveAuthMode(this.authType, this.username, this.apiKey);
    if (mode === 'basic' && this.username) {
      headers['Authorization'] = 'Basic ' + btoa(`${this.username}:${this.password}`);
    } else if (mode === 'bearer' && this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async request(method, path, body = null) {
    const normalizedBody = body ? normalizeSentryPayloadTimestamps(body) : null;
    const allowDirectFallback = shouldAllowDirectSentryFallback();
    let edgeTransportError = null;

    if (typeof window !== 'undefined' && EDGE_BASE) {
      try {
        const edgeHeaders = await getEdgeFunctionHeaders();

        for (let attempt = 0; attempt < 2; attempt += 1) {
          const t0 = Date.now();
          const res = await fetch(`${EDGE_BASE}/sentry-outbound/request`, {
            method: 'POST',
            headers: edgeHeaders,
            body: JSON.stringify({
              method,
              path,
              body: normalizedBody,
            }),
          });
          const latency = Date.now() - t0;
          const data = await parseResponsePayload(res);

          if (res.ok || !shouldRetryStatus(res.status) || attempt === 1) {
            if (res.ok) {
              return { ok: true, status: res.status, data, latency };
            }

            const { error, errorType } = extractErrorFromPayload(data, res.status, 'edge');
            return {
              ok: false,
              status: res.status,
              data,
              latency,
              error,
              error_type: errorType,
            };
          }

          await wait(250 * (attempt + 1));
        }
      } catch (error) {
        edgeTransportError = error instanceof Error ? error.message : 'Edge outbound request failed';
        if (!allowDirectFallback) {
          return {
            ok: false,
            error: formatStructuredError({
              phase: 'edge',
              errorType: 'network',
              message: `Edge outbound transport failed: ${edgeTransportError}`,
            }),
            error_type: 'network',
          };
        }
      }
    }

    if (typeof window !== 'undefined' && !EDGE_BASE && !allowDirectFallback) {
      return {
        ok: false,
        error: formatStructuredError({
          phase: 'edge',
          errorType: 'config',
          message: 'Edge outbound is unavailable because VITE_SUPABASE_URL is missing in this deployment.',
        }),
        error_type: 'config',
      };
    }

    if (typeof window !== 'undefined' && EDGE_BASE && !SUPABASE_ANON_KEY && !allowDirectFallback) {
      return {
        ok: false,
        error: 'Edge outbound is unavailable because VITE_SUPABASE_ANON_KEY is missing in this deployment.',
        error_type: 'config',
      };
    }

    const url = `${this.baseUrl}${path}`;
    const opts = {
      method,
      headers: this.getHeaders(),
    };
    if (normalizedBody) opts.body = JSON.stringify(normalizedBody);
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const t0 = Date.now();
        const res = await fetch(url, opts);
        const latency = Date.now() - t0;
        const data = await parseResponsePayload(res);

        if (res.ok || !shouldRetryStatus(res.status) || attempt === 1) {
          if (res.ok) {
            return { ok: true, status: res.status, data, latency };
          }

          const { error, errorType } = extractErrorFromPayload(data, res.status, 'direct');
          return {
            ok: false,
            status: res.status,
            data,
            latency,
            error,
            error_type: errorType,
          };
        }

        await wait(250 * (attempt + 1));
      }

      return { ok: false, status: 500, error: 'Request retry limit reached' };
    } catch (e) {
      const directError = e instanceof Error ? e.message : 'Direct Sentry request failed';
      if (edgeTransportError) {
        return {
          ok: false,
          error: formatStructuredError({
            phase: 'direct',
            errorType: 'network',
            message: `Edge outbound failed: ${edgeTransportError}. Direct fallback failed: ${directError}`,
          }),
          error_type: 'network',
        };
      }
      return {
        ok: false,
        error: formatStructuredError({
          phase: 'direct',
          errorType: 'network',
          message: directError,
        }),
        error_type: 'network',
      };
    }
  }

  async healthCheck() {
    const result = await this.getAssignedTrips();
    const authenticated = result.ok || result.status === 400 || result.status === 206;
    let hint = null;
    if (result.status === 400) {
      hint = 'Connected. Sentry responded with 400 because the trips endpoint usually expects date parameters.';
    } else if (result.status === 401) {
      hint = 'Authentication failed. Double-check your Sentry username/password or bearer token.';
    } else if (result.status === 403) {
      hint = 'Authenticated but this account does not have permission for the endpoint.';
    } else if (result.status === 404) {
      hint = 'The base URL looks incorrect for the Sentry environment.';
    }
    return {
      authenticated,
      latencyMs: result.latency,
      error: result.error || (authenticated ? null : `HTTP ${result.status}`),
      hint,
      status: result.status,
      data: result.data,
    };
  }

  // ─── Assigned Trips ───────────────────────────────────────────────────────
  // Periodically poll this to receive assigned trips and their modifications.
  async getAssignedTrips(params = {}) {
    const today = new Date();
    const dateMin = params.date_min || today.toISOString().slice(0, 10);
    const dateMaxDate = new Date(today);
    dateMaxDate.setDate(dateMaxDate.getDate() + 7);
    const dateMax = params.date_max || dateMaxDate.toISOString().slice(0, 10);
    const query = {
      date_min: dateMin,
      date_max: dateMax,
      ...params,
    };
    const qs = new URLSearchParams(query).toString();
    return this.request('GET', `/rest/transportation_provider_facade/v4.0/trips.json${qs ? '?' + qs : ''}`);
  }

  // Alias kept for backward compat
  async getTrips(params = {}) {
    return this.getAssignedTrips(params);
  }

  // ─── Marketplace ──────────────────────────────────────────────────────────
  async getMarketplaceTrips(params = {}) {
    const now = new Date();
    const inTwelveHours = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const query = {
      include_related_trips: 1,
      sput_min: formatSentryDateTime(now),
      sput_max: formatSentryDateTime(inTwelveHours),
      ...params,
    };
    const qs = new URLSearchParams(query).toString();
    return this.request('GET', `/rest/transportation_provider_facade/v4.0/marketplace_trips.json${qs ? '?' + qs : ''}`);
  }

  async takeMarketplaceTrip(tripId, data = {}) {
    return this.request(
      'POST',
      `/rest/transportation_provider_facade/v4.0/marketplace_trips/${tripId}/take`,
      data
    );
  }

  // ─── Trip Accept / Reject / Status ───────────────────────────────────────
  // Acceptance signals TP has agreed to perform the trip.
  async acceptTrip(tripId, data = {}) {
    const payload = Array.isArray(data)
      ? data
      : [{
          trip_id: tripId,
          ...(data.last_modified_at ? { last_modified_at: data.last_modified_at } : {}),
        }];

    return this.request('POST', '/rest/transportation_provider_facade/v4.0/trips/accept', payload);
  }

  // Rejection signals TP refuses the trip so it can be rerouted.
  // status_id: 1 = rejected, last_modified_at helps avoid stale rejections.
  async rejectTrip(tripId, statusId = 1, lastModifiedAt = null, rejectionNote = null) {
    const params = new URLSearchParams({ status_id: statusId });
    if (lastModifiedAt) params.set('last_modified_at', formatSentryDateTime(lastModifiedAt));
    return this.request(
      'POST',
      `/rest/transportation_provider_facade/v4.0/trips/${tripId}/reject?${params}`,
      { rejection_note: rejectionNote }
    );
  }

  // Update trip status (e.g. status_id=6 = completed).
  async updateTripStatus(tripId, statusData) {
    return this.request('POST', `/rest/transportation_provider_facade/v4.0/trips/${tripId}/update_status`, statusData);
  }

  // Report trip as "Processed" (trip_processing_status_id=0) — TP stored the
  // trip but has not yet decided to accept or reject.
  async reportTripProcessed(tripId, lastModifiedAt = null) {
    const body = { trip_processing_status_id: 0 };
    if (lastModifiedAt) body.last_modified_at = formatSentryDateTime(lastModifiedAt);
    return this.request('POST', `/rest/transportation_provider_facade/v4.0/trips/${tripId}/update_status`, body);
  }

  // ─── Trips stored on TP side ─────────────────────────────────────────────
  // Returns trips data that the TP has stored on their end.
  async retrieveTrips(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request('GET', `/rest/gc/retrieve_trips.json${qs ? '?' + qs : ''}`);
  }

  // ─── Vehicles ─────────────────────────────────────────────────────────────
  async getVehicles() {
    return this.request('GET', '/rest/transportation_provider_facade/v4.0/vehicles.json');
  }

  async getVehicle(id) {
    return this.request('GET', `/rest/transportation_provider_facade/v4.0/vehicles/${id}.json`);
  }

  async createVehicle(data) {
    return this.request('POST', '/rest/transportation_provider_facade/v4.0/vehicles.json', data);
  }

  async updateVehicle(id, data) {
    return this.request('PUT', `/rest/transportation_provider_facade/v4.0/vehicles/${id}.json`, data);
  }

  async deactivateVehicle(id) {
    return this.request('POST', `/rest/transportation_provider_facade/v4.0/vehicles/deactivate/${id}.json`);
  }

  // ─── Drivers ──────────────────────────────────────────────────────────────
  async getDrivers() {
    return this.request('GET', '/rest/transportation_provider_facade/v4.0/drivers.json');
  }

  async getDriver(id) {
    return this.request('GET', `/rest/transportation_provider_facade/v4.0/drivers/${id}.json`);
  }

  async createDriver(data) {
    return this.request('POST', '/rest/transportation_provider_facade/v4.0/drivers.json', data);
  }

  async updateDriver(id, data) {
    return this.request('PUT', `/rest/transportation_provider_facade/v4.0/drivers/${id}.json`, data);
  }

  async deactivateDriver(id) {
    return this.request('POST', `/rest/transportation_provider_facade/v4.0/drivers/deactivate/${id}.json`);
  }

  // ─── Vehicle Locations ────────────────────────────────────────────────────
  // Push a single vehicle's location to Sentry.
  async pushVehicleLocation(vehicleId, lat, lng, heading = 0) {
    return this.request('POST', '/rest/gc/vehicle_location.json', {
      vehicle_id: vehicleId,
      lat,
      lng,
      heading,
      timestamp: formatSentryDateTime(new Date()),
    });
  }

  // Retrieve all fleet vehicle locations from Sentry.
  async getAllVehicleLocations() {
    return this.request('GET', '/rest/gc/vehicle_locations.json');
  }

  // Push locations for all online drivers in bulk.
  async pushAllVehicleLocations(drivers) {
    const online = drivers.filter(d => d.sentry_vehicle_id && d.current_lat && d.current_lng);
    if (!online.length) return { pushed: 0 };
    const results = await Promise.all(
      online.map(d => this.pushVehicleLocation(d.sentry_vehicle_id, d.current_lat, d.current_lng))
    );
    const failed = results.filter(r => !r.ok);
    return { pushed: online.length - failed.length, failed: failed.length, error: failed.length > 0 ? `${failed.length} pushes failed` : null };
  }

  // ─── Vehicle Waypoint ETAs ────────────────────────────────────────────────
  // Update ETAs for vehicle waypoints (outbound — TP → Sentry).
  async updateVehicleWaypointEtas(data) {
    return this.request('POST', '/rest/transportation_provider_facade/v4.0/vehicle_waypoint_etas.json', data);
  }

  // Retrieve waypoint ETAs for vehicles (inbound from Sentry GC endpoint).
  async getVehicleWaypointEtas(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request('GET', `/rest/gc/vehicle_waypoint_etas.json${qs ? '?' + qs : ''}`);
  }

  // ─── Driver Work Shifts ───────────────────────────────────────────────────
  async getDriverWorkShifts() {
    return this.request('GET', '/rest/transportation_provider_facade/v4.0/driver_work_shifts.json');
  }

  // ─── Sync helpers ─────────────────────────────────────────────────────────
  async syncDriverAddresses() {
    const result = await this.getDrivers();
    if (!result.ok) return { error: result.error || 'API error', updated: 0 };
    const list = Array.isArray(result.data) ? result.data : (result.data?.drivers || []);
    return { updated: list.length, drivers: list };
  }
}

export const sentryApi = new SentryApiClient();

if (typeof window !== 'undefined') {
  window.SENTRY_API = sentryApi;
}
