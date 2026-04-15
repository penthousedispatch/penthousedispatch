const SENTRY_SANDBOX_URL = 'https://dsp-integration.test.sentryms.com';

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
    this.username = config.username || '';
    this.password = config.password || '';
    this.apiKey = config.apiKey || '';
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
    if (this.authType === 'basic' && this.username) {
      headers['Authorization'] = 'Basic ' + btoa(`${this.username}:${this.password}`);
    } else if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const opts = {
      method,
      headers: this.getHeaders(),
    };
    if (body) opts.body = JSON.stringify(body);
    try {
      const t0 = Date.now();
      const res = await fetch(url, opts);
      const latency = Date.now() - t0;
      const raw = await res.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = raw || null;
      }
      return { ok: res.ok, status: res.status, data, latency };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async healthCheck() {
    const result = await this.request('GET', '/rest/transportation_provider_facade/v4.0/trips.json');
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
    const qs = new URLSearchParams(params).toString();
    return this.request('GET', `/rest/transportation_provider_facade/v4.0/trips.json${qs ? '?' + qs : ''}`);
  }

  // Alias kept for backward compat
  async getTrips(params = {}) {
    return this.getAssignedTrips(params);
  }

  // ─── Marketplace ──────────────────────────────────────────────────────────
  async getMarketplaceTrips() {
    return this.request('GET', '/rest/transportation_provider_facade/v4.0/marketplace_trips.json');
  }

  async takeMarketplaceTrip(tripId) {
    return this.request('POST', `/rest/transportation_provider_facade/v4.0/marketplace_trips/${tripId}/take`);
  }

  // ─── Trip Accept / Reject / Status ───────────────────────────────────────
  // Acceptance signals TP has agreed to perform the trip.
  async acceptTrip(tripId, data = {}) {
    return this.request('POST', '/rest/transportation_provider_facade/v4.0/trips/accept', { trip_id: tripId, ...data });
  }

  // Rejection signals TP refuses the trip so it can be rerouted.
  // status_id: 1 = rejected, last_modified_at helps avoid stale rejections.
  async rejectTrip(tripId, statusId = 1, lastModifiedAt = null) {
    const params = new URLSearchParams({ status_id: statusId });
    if (lastModifiedAt) params.set('last_modified_at', lastModifiedAt);
    return this.request('POST', `/rest/transportation_provider_facade/v4.0/trips/${tripId}/reject?${params}`);
  }

  // Update trip status (e.g. status_id=7 = completed).
  async updateTripStatus(tripId, statusData) {
    return this.request('POST', `/rest/transportation_provider_facade/v4.0/trips/${tripId}/update_status`, statusData);
  }

  // Report trip as "Processed" (trip_processing_status_id=0) — TP stored the
  // trip but has not yet decided to accept or reject.
  async reportTripProcessed(tripId, lastModifiedAt = null) {
    const body = { trip_processing_status_id: 0 };
    if (lastModifiedAt) body.last_modified_at = lastModifiedAt;
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
      timestamp: new Date().toISOString(),
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
