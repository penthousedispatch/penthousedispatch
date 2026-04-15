// Penthouse Dispatch — Supervisor Bots v2.0
// Alpha: monitors data integrity (scraping, trips, geocoding)
// Beta: monitors scheduling, dispatch flow, driver assignments
// Gamma: monitors Sentry API integration health
// Delta: monitors billing anomalies (fleet spikes, mileage, uninvoiced trips)
// They communicate via a shared message bus and only alert you when they can't fix it

'use strict';

const SUPERVISOR_LOG_KEY = 'pds_supervisor_log';
const MAX_LOG = 100;

// ── Shared message bus ────────────────────────────────────────────────────────
const BUS = {
  _handlers: {},
  on(event, fn) { (this._handlers[event] = this._handlers[event] || []).push(fn); },
  emit(event, data) {
    (this._handlers[event] || []).forEach(fn => fn(data));
    log('BUS', `${event}: ${JSON.stringify(data).slice(0, 80)}`);
  }
};

function log(bot, msg, level = 'info') {
  const entry = { bot, msg, level, ts: Date.now(), time: new Date().toLocaleTimeString() };
  const logs = JSON.parse(localStorage.getItem(SUPERVISOR_LOG_KEY) || '[]');
  logs.unshift(entry);
  if (logs.length > MAX_LOG) logs.splice(MAX_LOG);
  localStorage.setItem(SUPERVISOR_LOG_KEY, JSON.stringify(logs));
  if (level === 'error') console.error(`[${bot}]`, msg);
  else console.log(`[${bot}]`, msg);
}

function getLogs() {
  return JSON.parse(localStorage.getItem(SUPERVISOR_LOG_KEY) || '[]');
}

// Alert the dispatcher — only called when bots can't auto-fix
function alertDispatcher(title, message, level = 'warning') {
  // Remove old alert if exists
  document.getElementById('supervisor-alert')?.remove();

  const colors = { warning: 'var(--yellow)', error: 'var(--red)', success: 'var(--green)', info: 'var(--blue)' };
  const icons = { warning: '⚠️', error: '🚨', success: '✅', info: 'ℹ️' };
  const div = document.createElement('div');
  div.id = 'supervisor-alert';
  div.style.cssText = `position:fixed;top:60px;right:16px;width:320px;background:var(--s1);border:1px solid ${colors[level]};border-radius:11px;padding:13px 15px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.5);`;
  div.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:9px;">
      <span style="font-size:16px;">${icons[level]}</span>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:13px;color:${colors[level]};margin-bottom:3px;">${title}</div>
        <div style="font-size:12px;color:var(--muted2);line-height:1.5;">${message}</div>
      </div>
      <button onclick="this.closest('#supervisor-alert').remove()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:0;line-height:1;">×</button>
    </div>`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 15000);
}

// ══════════════════════════════════════════════════════════════
// SUPERVISOR ALPHA — Data Integrity Bot
// Monitors: trip counts, scraping accuracy, geocoding health,
// Firebase connectivity, webhook status
// ══════════════════════════════════════════════════════════════

const ALPHA = {
  name: 'ALPHA',
  lastTripCount: 0,
  lastCheckTs: 0,
  geocodeFailCount: 0,
  fbConnected: false,

  async run() {
    log(this.name, 'Running data integrity check...');
    await this.checkFirebase();
    await this.checkTripData();
    await this.checkWebhook();
    this.lastCheckTs = Date.now();
  },

  async checkFirebase() {
    try {
      const res = await fetch('https://transit-rx-default-rtdb.firebaseio.com/.json?shallow=true');
      if (res.ok) {
        this.fbConnected = true;
        log(this.name, 'Firebase: connected ✅');
        BUS.emit('fb_status', { ok: true });
      } else {
        throw new Error('HTTP ' + res.status);
      }
    } catch (e) {
      this.fbConnected = false;
      log(this.name, 'Firebase: DISCONNECTED — ' + e.message, 'error');
      BUS.emit('fb_status', { ok: false, error: e.message });
      alertDispatcher('Firebase Connection Lost', 'Cannot reach the database. Check your internet connection. Driver updates are not syncing.', 'error');
    }
  },

  async checkTripData() {
    const trips = JSON.parse(localStorage.getItem('pds_trips') || '[]');
    const count = trips.length;

    if (count === 0) {
      log(this.name, 'No trips loaded — triggering refresh', 'error');
      BUS.emit('need_refresh', { reason: 'zero_trips' });
      // Auto-fix: trigger refresh
      if (typeof refreshTrips === 'function') {
        log(this.name, 'Auto-fix: calling refreshTrips()');
        setTimeout(() => refreshTrips(), 2000);
      }
      return;
    }

    // Check for stale trips (older than 2 hours)
    const freshTrips = trips.filter(t => !t._loadedAt || (Date.now() - t._loadedAt) < 7200000);
    if (freshTrips.length < count * 0.5) {
      log(this.name, `Trips are stale (${count - freshTrips.length} old) — refreshing`, 'error');
      BUS.emit('need_refresh', { reason: 'stale_trips' });
      if (typeof refreshTrips === 'function') setTimeout(() => refreshTrips(), 1000);
      return;
    }

    // Check geocode success rate
    const geocoded = trips.filter(t => t.coords);
    const geoRate = count > 0 ? (geocoded.length / count * 100).toFixed(0) : 0;

    if (count > 10 && geocoded.length < count * 0.3) {
      log(this.name, `Low geocode rate: ${geoRate}% (${geocoded.length}/${count})`, 'error');
      BUS.emit('geocode_issue', { rate: geoRate, count, geocoded: geocoded.length });
      alertDispatcher('Trip Geocoding Issue', `Only ${geoRate}% of trips have location data. AI scheduling may be inaccurate. Check internet connection.`, 'warning');
    } else {
      log(this.name, `Trip data OK: ${count} trips, ${geoRate}% geocoded ✅`);
    }

    // Detect trip count mismatch
    if (this.lastTripCount > 0 && count < this.lastTripCount * 0.5) {
      log(this.name, `Trip count dropped: ${this.lastTripCount} → ${count}`, 'error');
      alertDispatcher('Trip Count Dropped', `Had ${this.lastTripCount} trips, now only ${count}. SentryMS may have refreshed. Click Refresh Trips.`, 'warning');
    }

    this.lastTripCount = count;
    BUS.emit('trip_data_ok', { count, geocoded: geocoded.length, geoRate });
  },

  async checkWebhook() {
    try {
      const res = await fetch('https://penthouse-driver.netlify.app/.netlify/functions/trips', { method: 'GET' });
      if (res.ok) {
        log(this.name, 'Webhook: live ✅');
        BUS.emit('webhook_status', { ok: true });
      } else {
        log(this.name, 'Webhook: returned ' + res.status, 'error');
        BUS.emit('webhook_status', { ok: false, status: res.status });
      }
    } catch (e) {
      log(this.name, 'Webhook: unreachable — ' + e.message, 'error');
      BUS.emit('webhook_status', { ok: false, error: e.message });
    }
  }
};

// ══════════════════════════════════════════════════════════════
// SUPERVISOR BETA — Scheduling & Dispatch Flow Bot
// Monitors: schedule completeness, driver assignments,
// quota compliance, stuck builds, dispatch confirmations
// ══════════════════════════════════════════════════════════════

const BETA = {
  name: 'BETA',
  buildAttempts: {},
  lastDispatchCheck: 0,

  async run() {
    log(this.name, 'Running scheduling & dispatch check...');
    await this.checkSchedules();
    await this.checkDriverAddresses();
    await this.checkDispatchBoard();
    await this.checkQuotas();
  },

  async checkSchedules() {
    const drivers = JSON.parse(localStorage.getItem('pds_drivers') || '[]');
    const workingDrivers = drivers.filter(d => d.workingToday);
    if (!workingDrivers.length) {
      log(this.name, 'No drivers marked working today');
      return;
    }

    const schedules = JSON.parse(localStorage.getItem('pds_schedules') || '{}');
    const trips = JSON.parse(localStorage.getItem('pds_trips') || '[]');
    const emptySchedules = [];
    const lowSchedules = [];

    for (const driver of workingDrivers) {
      const sched = window.driverSchedules?.[driver.id] || schedules[driver.id] || [];
      if (!sched.length) {
        emptySchedules.push(driver.name);
      } else if (sched.length < 5) {
        lowSchedules.push({ name: driver.name, count: sched.length });
      }
    }

    if (emptySchedules.length > 0) {
      log(this.name, `Empty schedules: ${emptySchedules.join(', ')}`, 'error');
      BUS.emit('schedule_empty', { drivers: emptySchedules });
      // Auto-fix: try to rebuild
      if (trips.length > 0 && typeof autoScheduleAll === 'function') {
        log(this.name, 'Auto-fix: rebuilding empty schedules');
        alertDispatcher('Auto-Fixing Schedules', `${emptySchedules.join(', ')} had no schedule. Beta bot is rebuilding automatically.`, 'info');
        setTimeout(() => autoScheduleAll(), 3000);
      } else if (trips.length === 0) {
        alertDispatcher('Cannot Build Schedules', 'No trips loaded. Click ↻ Refresh Trips first, then Build All.', 'error');
      }
    } else if (lowSchedules.length > 0) {
      const names = lowSchedules.map(d => `${d.name} (${d.count})`).join(', ');
      log(this.name, `Low schedules: ${names}`, 'error');
      BUS.emit('schedule_low', { drivers: lowSchedules });
      alertDispatcher('Low Trip Count', `${names} — has fewer than 5 trips scheduled. Target is 10+. Click Rebuild for those drivers.`, 'warning');
    } else {
      log(this.name, `Schedules OK: ${workingDrivers.length} drivers scheduled ✅`);
      BUS.emit('schedules_ok', { count: workingDrivers.length });
    }
  },

  async checkDriverAddresses() {
    const drivers = JSON.parse(localStorage.getItem('pds_drivers') || '[]');
    const workingDrivers = drivers.filter(d => d.workingToday);
    const noAddr = workingDrivers.filter(d => !d.homeAddress || d.homeAddress.length < 5);

    if (noAddr.length > 0) {
      log(this.name, `Drivers missing start address: ${noAddr.map(d=>d.name).join(', ')}`, 'error');
      BUS.emit('missing_addresses', { drivers: noAddr.map(d => d.name) });
      alertDispatcher(
        'Missing Driver Addresses',
        `${noAddr.map(d=>d.name).join(', ')} have no start address. AI scheduling uses home address as route start. Ask drivers to save their address in their app, or pull from SentryMS in Settings.`,
        'warning'
      );
    } else {
      log(this.name, 'All working drivers have start addresses ✅');
    }
  },

  async checkDispatchBoard() {
    const board = JSON.parse(localStorage.getItem('pds_board') || '[]');
    const pending = board.filter(t => t.status === 'pending');
    const now = Date.now();

    // Find trips stuck in pending for more than 30 minutes
    const stuck = pending.filter(t => t.assignedAt && (now - t.assignedAt) > 1800000);
    if (stuck.length > 0) {
      log(this.name, `Stuck trips (>30min pending): ${stuck.map(t=>t.tripId).join(', ')}`, 'error');
      BUS.emit('stuck_trips', { trips: stuck });
      alertDispatcher(
        'Trips Stuck in Pending',
        `${stuck.map(t=>`${t.tripId} → ${t.driverName}`).join(', ')} — assigned over 30 min ago with no response. Consider reassigning.`,
        'warning'
      );
    }

    // Check for rejected trips needing reassignment
    const rejected = board.filter(t => t.status === 'rejected' && !t.rescuedBy);
    if (rejected.length > 0) {
      log(this.name, `Rejected unrescued trips: ${rejected.length}`);
      BUS.emit('unrescued_trips', { trips: rejected });
    }

    log(this.name, `Board check: ${board.length} total, ${pending.length} pending, ${stuck.length} stuck`);
  },

  async checkQuotas() {
    const settings = JSON.parse(localStorage.getItem('pds_settings') || '{}');
    const target = settings.revenueTarget || 60;
    const drivers = JSON.parse(localStorage.getItem('pds_drivers') || '[]').filter(d => d.workingToday);

    for (const driver of drivers) {
      const sched = window.driverSchedules?.[driver.id] || [];
      if (!sched.length) continue;
      const shift = window.driverShifts?.[driver.id] || '7am-5pm';
      const parts = shift.toLowerCase().split(/[-to]+/);
      const startH = parseInt(parts[0]) || 7;
      const endH = parseInt(parts[1]) || 17;
      const hours = endH - startH;
      const revenue = sched.reduce((s, t) => s + (parseFloat(t.deliveryPrice) || 0), 0);
      const rph = hours > 0 ? revenue / hours : 0;

      if (rph < target * 0.7 && sched.length >= 3) {
        log(this.name, `${driver.name} below quota: $${rph.toFixed(0)}/hr (target $${target}/hr)`, 'error');
        BUS.emit('quota_miss', { driver: driver.name, rph: rph.toFixed(0), target });
      }
    }
  }
};

// ── Communication between Alpha and Beta ──────────────────────────────────────

BUS.on('fb_status', data => {
  if (!data.ok) {
    log('BETA', 'Received FB disconnect from Alpha — pausing dispatch attempts');
  }
});

BUS.on('need_refresh', data => {
  log('BETA', `Alpha requested refresh (${data.reason}) — scheduling pause until fresh data`);
});

BUS.on('trip_data_ok', data => {
  log('BETA', `Alpha confirmed ${data.count} trips ready — scheduling can proceed`);
  // Auto-trigger schedule build if drivers are waiting
  const drivers = JSON.parse(localStorage.getItem('pds_drivers') || '[]').filter(d => d.workingToday);
  const hasEmptyScheds = drivers.some(d => !(window.driverSchedules?.[d.id]?.length));
  if (hasEmptyScheds && data.geocoded > 10 && typeof autoScheduleAll === 'function') {
    log('BETA', 'Auto-triggering schedule build for working drivers with empty schedules');
    setTimeout(() => autoScheduleAll(), 2000);
  }
});

BUS.on('schedules_ok', data => {
  log('ALPHA', `Beta reports ${data.count} schedules complete — performing final validation`);
});

BUS.on('schedule_empty', data => {
  log('ALPHA', `Beta reports empty schedules for ${data.drivers.join(', ')} — checking trip availability`);
});

// ── Supervisor Panel UI ───────────────────────────────────────────────────────

function renderSupervisorPanel() {
  let panel = document.getElementById('supervisor-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'supervisor-panel';
    panel.style.cssText = 'position:fixed;bottom:28px;right:14px;z-index:200;';
    document.body.appendChild(panel);
  }

  const logs = getLogs().slice(0, 5);
  const hasErrors = logs.some(l => l.level === 'error');
  const statusColor = hasErrors ? 'var(--red)' : 'var(--green)';
  const statusIcon = hasErrors ? '⚠️' : '✅';

  panel.innerHTML = `
    <div style="background:rgba(6,8,12,0.92);border:1px solid ${statusColor};border-radius:9px;padding:8px 12px;backdrop-filter:blur(8px);cursor:pointer;display:flex;align-items:center;gap:7px;font-size:11px;" onclick="toggleSupervisorLog()">
      <span>${statusIcon}</span>
      <span style="color:var(--muted2);">Supervisors</span>
      <span style="width:7px;height:7px;border-radius:50%;background:${statusColor};animation:blink 1.5s infinite;"></span>
    </div>
    <div id="supervisor-log" style="display:none;background:rgba(6,8,12,0.95);border:1px solid var(--b2);border-radius:9px;margin-top:6px;padding:10px;max-height:280px;overflow-y:auto;min-width:320px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center;">
        <span>🤖 Supervisor Log</span>
        <div style="display:flex;gap:5px;">
          <button onclick="event.stopPropagation();window.ALPHA&&ALPHA.run();window.BETA&&BETA.run();" style="font-size:10px;padding:2px 7px;background:var(--gold-d);color:var(--gold);border:1px solid rgba(201,168,76,0.3);border-radius:5px;cursor:pointer;">↻ Run Now</button>
          <button onclick="event.stopPropagation();localStorage.removeItem('${SUPERVISOR_LOG_KEY}');renderSupervisorPanel();" style="font-size:10px;padding:2px 7px;background:var(--s2);color:var(--muted);border:1px solid var(--b2);border-radius:5px;cursor:pointer;">Clear</button>
        </div>
      </div>
      ${getLogs().slice(0,20).map(l => `
        <div style="display:flex;gap:7px;padding:3px 0;border-bottom:1px solid var(--b1);font-size:10px;">
          <span style="color:${l.bot==='ALPHA'?'var(--blue)':'var(--green)'};font-weight:700;width:38px;flex-shrink:0;">${l.bot}</span>
          <span style="color:${l.level==='error'?'var(--red)':l.level==='warning'?'var(--yellow)':'var(--muted2)'};flex:1;">${l.msg}</span>
          <span style="color:var(--muted);font-family:monospace;flex-shrink:0;">${l.time}</span>
        </div>`).join('')}
    </div>`;
}

window.toggleSupervisorLog = function() {
  const log = document.getElementById('supervisor-log');
  if (log) log.style.display = log.style.display === 'none' ? 'block' : 'none';
};

// ── Main supervisor loop ──────────────────────────────────────────────────────

async function runSupervisors() {
  try {
    await ALPHA.run();
    await new Promise(r => setTimeout(r, 1000));
    await BETA.run();
  } catch (e) {
    log('SYSTEM', 'Supervisor error: ' + e.message, 'error');
  }
  renderSupervisorPanel();
}

// Export
window.ALPHA = ALPHA;
window.BETA = BETA;
window.runSupervisors = runSupervisors;
window.getSupervisorLogs = getLogs;

// Run immediately, then every 2 minutes
setTimeout(runSupervisors, 3000);
setInterval(runSupervisors, 120000);

// Re-render panel every 30 seconds
setInterval(renderSupervisorPanel, 30000);

// ══════════════════════════════════════════════════════════════
// SUPERVISOR GAMMA — Sentry API Integration Monitor
// Monitors: API health, auth status, trip pull success,
// driver sync, GPS push, rate limits
// ══════════════════════════════════════════════════════════════

const GAMMA = {
  name: 'GAMMA',
  lastHealthCheck: null,
  consecutiveFailures: 0,
  MAX_FAILURES: 3,

  async run() {
    if (!window.SENTRY_API) { log(this.name, 'SENTRY_API module not loaded', 'error'); return; }
    const cfg = SENTRY_API.config;
    if (!cfg.enabled) { log(this.name, 'Sentry API disabled in settings — skipping checks'); return; }
    if (!cfg.apiKey && !(cfg.username && cfg.password)) {
      log(this.name, '⚠️ No Sentry credentials configured — open Settings → Sentry API', 'error');
      BUS.emit('gamma_status', { ok: false, reason: 'no_credentials' });
      return;
    }
    log(this.name, 'Running Sentry API health check...');
    await this.checkHealth();
    await this.checkTripPullRecency();
    await this.checkDriverSync();
    await this.checkGPSPush();
  },

  async checkHealth() {
    try {
      const health = await SENTRY_API.healthCheck();
      this.lastHealthCheck = { ...health, checkedAt: Date.now() };
      if (health.authenticated) {
        this.consecutiveFailures = 0;
        log(this.name, `✅ Sentry API authenticated — ${health.latencyMs}ms latency`);
        BUS.emit('gamma_status', { ok: true, latency: health.latencyMs });
        renderSupervisorPanel();
      } else {
        this.consecutiveFailures++;
        log(this.name, `❌ Sentry API auth failed: ${health.error}`, 'error');
        BUS.emit('gamma_status', { ok: false, error: health.error });
        if (this.consecutiveFailures >= this.MAX_FAILURES) {
          alertDispatcher(
            '🔴 Sentry API Connection Lost',
            `${this.consecutiveFailures} consecutive failures. Error: ${health.error}. Check your credentials in Settings → Sentry API.`,
            'error'
          );
        }
      }
    } catch (e) {
      log(this.name, 'Health check exception: ' + e.message, 'error');
    }
  },

  async checkTripPullRecency() {
    const trips = JSON.parse(localStorage.getItem('pds_trips') || '[]');
    if (!trips.length) {
      log(this.name, 'No trips loaded — triggering API pull', 'error');
      BUS.emit('need_api_trip_pull', { reason: 'no_trips' });
      if (typeof refreshTripsFromAPI === 'function') setTimeout(() => refreshTripsFromAPI(), 2000);
      return;
    }
    const apiTrips = trips.filter(t => t._source === 'sentry_api');
    const lastLoad = Math.max(...trips.map(t => t._loadedAt || 0));
    const ageMins = (Date.now() - lastLoad) / 60000;
    if (ageMins > 30) {
      log(this.name, `Trips are ${ageMins.toFixed(0)} mins old — refreshing`, 'error');
      BUS.emit('need_api_trip_pull', { reason: 'stale', ageMins });
      if (typeof refreshTripsFromAPI === 'function') setTimeout(() => refreshTripsFromAPI(), 1000);
    } else {
      log(this.name, `✅ ${trips.length} trips loaded — ${ageMins.toFixed(0)} mins old (${apiTrips.length} from API)`);
    }
  },

  async checkDriverSync() {
    const drivers = JSON.parse(localStorage.getItem('pds_drivers') || '[]');
    const noSentryId = drivers.filter(d => !d.sentryDriverId);
    if (noSentryId.length > 0) {
      log(this.name, `${noSentryId.length} drivers missing Sentry IDs — syncing`);
      if (window.SENTRY_API) {
        const result = await SENTRY_API.syncDriverAddresses();
        if (!result.error) log(this.name, `✅ Synced ${result.updated} driver addresses from Sentry`);
        else log(this.name, `Driver sync failed: ${result.error}`, 'error');
      }
    } else {
      log(this.name, `✅ All ${drivers.length} drivers have Sentry IDs`);
    }
  },

  async checkGPSPush() {
    const drivers = JSON.parse(localStorage.getItem('pds_drivers') || '[]');
    const online = drivers.filter(d => d.coords && d.sentryVehicleId);
    if (online.length > 0) {
      const result = await SENTRY_API.pushAllVehicleLocations(drivers);
      if (!result.error) log(this.name, `✅ Pushed GPS for ${online.length} vehicles to Sentry`);
      else log(this.name, `GPS push warning: ${result.error}`);
    } else {
      log(this.name, 'No vehicles online with Sentry IDs — GPS push skipped');
    }
  },
};

// Wire Gamma into BUS
BUS.on('need_api_trip_pull', data => {
  log('ALPHA', `Gamma requested trip pull (${data.reason}) — coordinating with Beta`);
});

BUS.on('gamma_status', data => {
  if (data.ok) {
    log('ALPHA', `Gamma: Sentry API healthy (${data.latency}ms)`);
    log('BETA', 'Gamma confirmed API connected — trip pull available');
  } else {
    log('ALPHA', `Gamma: API issue — ${data.error || data.reason}`, 'error');
    log('BETA', 'Gamma reports API down — holding auto-schedule until resolved', 'error');
  }
});

window.GAMMA = GAMMA;

// Add Gamma to the run loop
const _origRunSupervisors = window.runSupervisors;
window.runSupervisors = async function() {
  await _origRunSupervisors();
  try { await GAMMA.run(); } catch (e) { log('GAMMA', 'Error: ' + e.message, 'error'); }
  renderSupervisorPanel();
};

// ══════════════════════════════════════════════════════════════
// SUPERVISOR DELTA — Billing Anomaly Monitor
// Monitors: fleet size spikes, unusual mileage, uninvoiced trips >7 days
// ══════════════════════════════════════════════════════════════

const DELTA = {
  name: 'DELTA',
  lastFleetSize: null,
  baselineFleetSize: null,

  async run() {
    log(this.name, 'Running billing anomaly check...');
    await this.checkFleetSpike();
    await this.checkUnusualMileage();
    await this.checkUninvoicedTrips();
  },

  async saveAlert(alertType, message, severity, payload) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = import.meta.env?.VITE_SUPABASE_URL || window.__SUPABASE_URL;
      const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || window.__SUPABASE_ANON_KEY;
      if (!url || !key) { log(this.name, 'Cannot save alert — Supabase config missing'); return; }
      const sb = createClient(url, key);
      await sb.from('supervisor_alerts').insert({
        bot_name: this.name,
        alert_type: alertType,
        message,
        severity,
        payload: payload || {},
      });
      log(this.name, `Alert saved to DB: ${alertType}`);
    } catch (e) {
      log(this.name, 'Alert DB save error: ' + e.message);
    }
  },

  async checkFleetSpike() {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = import.meta.env?.VITE_SUPABASE_URL || window.__SUPABASE_URL;
      const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || window.__SUPABASE_ANON_KEY;
      if (!url || !key) return;
      const sb = createClient(url, key);

      const { count } = await sb.from('drivers').select('id', { count: 'exact', head: true }).eq('is_active', true);
      const currentSize = count || 0;

      if (this.baselineFleetSize === null) {
        this.baselineFleetSize = currentSize;
        log(this.name, `Baseline fleet size set: ${currentSize} drivers`);
        return;
      }

      if (currentSize > this.baselineFleetSize * 2 && this.baselineFleetSize > 0) {
        const msg = `Fleet doubled: was ${this.baselineFleetSize}, now ${currentSize} drivers. Billing rate may increase from $0.11 to $0.13/trip.`;
        log(this.name, msg, 'error');
        alertDispatcher('Fleet Size Spike Detected', msg, 'warning');
        BUS.emit('delta_billing_alert', { type: 'fleet_spike', baseline: this.baselineFleetSize, current: currentSize });
        await this.saveAlert('fleet_spike', msg, 'warning', { baseline: this.baselineFleetSize, current: currentSize });
      } else {
        log(this.name, `Fleet size OK: ${currentSize} drivers (baseline: ${this.baselineFleetSize}) ✅`);
      }

      this.lastFleetSize = currentSize;
    } catch (e) {
      log(this.name, 'Fleet check error: ' + e.message, 'error');
    }
  },

  async checkUnusualMileage() {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = import.meta.env?.VITE_SUPABASE_URL || window.__SUPABASE_URL;
      const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || window.__SUPABASE_ANON_KEY;
      if (!url || !key) return;
      const sb = createClient(url, key);

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentTrips } = await sb
        .from('trip_assignments')
        .select('id, driver_name, mileage, pu_address, do_address')
        .gte('created_at', since)
        .eq('status', 'completed');

      if (!recentTrips || recentTrips.length === 0) {
        log(this.name, 'No completed trips in last 24h to check mileage');
        return;
      }

      const mileages = recentTrips.map(t => parseFloat(t.mileage) || 0).filter(m => m > 0);
      if (mileages.length === 0) { log(this.name, 'No mileage data on completed trips'); return; }

      const avg = mileages.reduce((a, b) => a + b, 0) / mileages.length;
      const highMileage = recentTrips.filter(t => (parseFloat(t.mileage) || 0) > avg * 3 && (parseFloat(t.mileage) || 0) > 50);
      const zeroMileage = recentTrips.filter(t => (parseFloat(t.mileage) || 0) === 0);

      if (highMileage.length > 0) {
        const msg = `${highMileage.length} trip(s) have unusually high mileage (>3x avg of ${avg.toFixed(1)} mi). Review for billing accuracy: ${highMileage.map(t => `${t.driver_name} (${t.mileage}mi)`).join(', ')}`;
        log(this.name, msg, 'error');
        alertDispatcher('Unusual Mileage Detected', msg, 'warning');
        await this.saveAlert('unusual_mileage', msg, 'warning', { trips: highMileage, avgMileage: avg });
      }

      if (zeroMileage.length > 3) {
        const msg = `${zeroMileage.length} completed trips have zero mileage — may indicate missing data or billing discrepancy.`;
        log(this.name, msg, 'error');
        await this.saveAlert('zero_mileage', msg, 'info', { count: zeroMileage.length });
      }

      log(this.name, `Mileage check: ${recentTrips.length} trips, avg ${avg.toFixed(1)} mi, ${highMileage.length} anomalies ✅`);
    } catch (e) {
      log(this.name, 'Mileage check error: ' + e.message, 'error');
    }
  },

  async checkUninvoicedTrips() {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = import.meta.env?.VITE_SUPABASE_URL || window.__SUPABASE_URL;
      const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || window.__SUPABASE_ANON_KEY;
      if (!url || !key) return;
      const sb = createClient(url, key);

      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: oldTrips, count } = await sb
        .from('trip_assignments')
        .select('id, driver_name, pu_time, delivery_price, created_at', { count: 'exact' })
        .eq('status', 'completed')
        .lte('created_at', cutoff)
        .is('invoice_id', null)
        .limit(20);

      const uninvoicedCount = count || 0;
      if (uninvoicedCount > 0) {
        const totalValue = (oldTrips || []).reduce((s, t) => s + (parseFloat(t.delivery_price) || 0), 0);
        const msg = `${uninvoicedCount} completed trip${uninvoicedCount > 1 ? 's' : ''} are 7+ days old with no invoice. Estimated value: $${totalValue.toFixed(2)}. Go to Billing to generate invoices.`;
        log(this.name, msg, 'error');
        BUS.emit('delta_billing_alert', { type: 'uninvoiced_trips', count: uninvoicedCount, totalValue });
        alertDispatcher('Uninvoiced Trips Detected', msg, 'error');
        await this.saveAlert('uninvoiced_trips', msg, 'error', { count: uninvoicedCount, totalValue, sample: oldTrips?.slice(0, 5) });
      } else {
        log(this.name, 'Uninvoiced trips check: all trips within 7 days are invoiced ✅');
      }
    } catch (e) {
      log(this.name, 'Uninvoiced trip check error: ' + e.message, 'error');
    }
  },
};

BUS.on('delta_billing_alert', data => {
  log('ALPHA', `Delta billing alert: ${data.type}`);
  log('BETA', `Delta detected billing issue (${data.type}) — escalating to admin`);
});

window.DELTA = DELTA;

// Add Delta to the run loop
const _origRunSupervisorsWithGamma = window.runSupervisors;
window.runSupervisors = async function() {
  await _origRunSupervisorsWithGamma();
  try { await DELTA.run(); } catch (e) { log('DELTA', 'Error: ' + e.message, 'error'); }
  renderSupervisorPanel();
};

log('SYSTEM', 'Supervisor bots Alpha + Beta + Gamma + Delta initialized');
