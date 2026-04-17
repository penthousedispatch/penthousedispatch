import React, { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical, Play, RefreshCw, CheckCircle, XCircle, AlertTriangle,
  Car, MapPin, Clock, Zap, Users, Route, BarChart2, X, Trash2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { runAutoScheduler } from '../../utils/autoScheduler';

const NYC_BOROUGHS = [
  { name: 'Manhattan', zip: '10001', coords: { lat: 40.7549, lng: -73.9840 } },
  { name: 'Brooklyn', zip: '11201', coords: { lat: 40.6892, lng: -73.9880 } },
  { name: 'Queens', zip: '11354', coords: { lat: 40.7282, lng: -73.7949 } },
  { name: 'Bronx', zip: '10451', coords: { lat: 40.8448, lng: -73.8648 } },
  { name: 'Staten Island', zip: '10301', coords: { lat: 40.6295, lng: -74.0943 } },
  { name: 'Long Island', zip: '11501', coords: { lat: 40.7535, lng: -73.6401 } },
];

const TEST_DRIVERS = [
  { full_name: 'Avery Stone', borough: 'Manhattan', tlc: 'DEMO-TLC-001', status: 'online' },
  { full_name: 'Jordan Blake', borough: 'Brooklyn', tlc: 'DEMO-TLC-002', status: 'online' },
  { full_name: 'Taylor Reed', borough: 'Queens', tlc: 'DEMO-TLC-003', status: 'online' },
  { full_name: 'Morgan Vale', borough: 'Bronx', tlc: 'DEMO-TLC-004', status: 'offline' },
  { full_name: 'Cameron Hale', borough: 'Staten Island', tlc: 'DEMO-TLC-005', status: 'online' },
  { full_name: 'Riley Hart', borough: 'Long Island', tlc: 'DEMO-TLC-006', status: 'online' },
  { full_name: 'Skyler Quinn', borough: 'Manhattan', tlc: 'DEMO-TLC-007', status: 'online' },
  { full_name: 'Dakota Lane', borough: 'Brooklyn', tlc: 'DEMO-TLC-008', status: 'break' },
];

const TRIP_TEMPLATES = [
  { pu: '350 W 42nd St, New York, NY 10036', do: '1 MetroTech Center, Brooklyn, NY 11201', miles: 8.2, price: 42 },
  { pu: '125-02 Queens Blvd, Kew Gardens, NY 11415', do: '30 Rockefeller Plaza, New York, NY 10112', miles: 11.5, price: 58 },
  { pu: '2300 Grand Concourse, Bronx, NY 10468', do: '225 Broadway, New York, NY 10007', miles: 13.1, price: 65 },
  { pu: '4 Richmond Terrace, Staten Island, NY 10301', do: '401 Park Ave S, New York, NY 10016', miles: 16.4, price: 78 },
  { pu: '1000 Franklin Ave, Garden City, NY 11530', do: 'JFK International Airport, Queens, NY 11430', miles: 14.8, price: 72 },
  { pu: '200 Varick St, New York, NY 10014', do: '86-01 Rockaway Blvd, Ozone Park, NY 11416', miles: 9.7, price: 49 },
  { pu: '470 Vanderbilt Ave, Brooklyn, NY 11238', do: '125th St & Lexington Ave, New York, NY 10035', miles: 7.3, price: 38 },
  { pu: '147-05 Jamaica Ave, Jamaica, NY 11435', do: '1 Hempstead Turnpike, Elmont, NY 11003', miles: 6.1, price: 31 },
  { pu: 'LaGuardia Airport, East Elmhurst, NY 11371', do: '1585 Broadway, New York, NY 10036', miles: 10.9, price: 55 },
  { pu: '55 Water St, New York, NY 10041', do: '200 Old Country Rd, Mineola, NY 11501', miles: 24.3, price: 98 },
  { pu: '610 Exterior St, Bronx, NY 10451', do: '545 5th Ave, New York, NY 10017', miles: 10.2, price: 51 },
  { pu: '2535 Richmond Ave, Staten Island, NY 10314', do: '350 Jay St, Brooklyn, NY 11201', miles: 18.7, price: 86 },
];

const SCENARIOS = {
  full: { label: 'Full Coverage', templates: TRIP_TEMPLATES },
  morning_rush: { label: 'Morning Rush', templates: TRIP_TEMPLATES.slice(0, 5) },
  airport_day: { label: 'Airport Day', templates: TRIP_TEMPLATES.filter(t => /Airport|JFK|LaGuardia/i.test(`${t.pu} ${t.do}`)) },
  long_haul: { label: 'Long Haul', templates: TRIP_TEMPLATES.filter(t => t.miles >= 14) },
};

function getSandboxMarker(companyId) {
  return `TEST_MODE_SANDBOX:${companyId}`;
}

function getSandboxMarketplacePrefix(companyId) {
  return `TST-MKT-${companyId}`;
}

function StatusBadge({ status }) {
  const colors = { seeding: '#c9a84c', done: '#00e5a0', error: '#ff4757', idle: 'rgba(255,255,255,0.3)' };
  const labels = { seeding: 'Seeding...', done: 'Ready', error: 'Error', idle: 'Not started' };
  return (
    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${colors[status]}15`, color: colors[status], border: `1px solid ${colors[status]}30`, fontWeight: 600 }}>
      {labels[status]}
    </span>
  );
}

export default function TestModeSandbox() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState('idle');
  const [logs, setLogs] = useState([]);
  const [testDrivers, setTestDrivers] = useState([]);
  const [testTrips, setTestTrips] = useState([]);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setCurrentUser(user);
    const { data } = await supabase
      .from('test_sandbox_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('reset_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setSession(data);
    setLoading(false);
    if (data?.is_active && data?.test_company_id) {
      await loadTestData(data.test_company_id);
    }
  }

  async function loadTestData(companyId) {
    const marker = getSandboxMarker(companyId);
    const { data: drivers } = await supabase.from('drivers').select('*').eq('company_id', companyId);
    const driverIds = (drivers || []).map(d => d.id).filter(Boolean);

    const tripQueries = [
      supabase.from('trip_assignments').select('*').like('notes', `${marker}%`).order('scheduled_pickup_time', { ascending: true }),
    ];

    if (driverIds.length > 0) {
      tripQueries.push(
        supabase.from('trip_assignments').select('*').in('driver_id', driverIds).order('scheduled_pickup_time', { ascending: true })
      );
    }

    const results = await Promise.all(tripQueries);
    const mergedTrips = new Map();
    results.forEach(result => {
      (result.data || []).forEach(trip => mergedTrips.set(trip.id, trip));
    });

    setTestDrivers(drivers || []);
    setTestTrips(Array.from(mergedTrips.values()).sort((a, b) => new Date(a.scheduled_pickup_time || 0) - new Date(b.scheduled_pickup_time || 0)));
  }

  function addLog(msg, level = 'info') {
    const colors = { info: 'rgba(255,255,255,0.5)', success: '#00e5a0', error: '#ff4757', warn: '#f59e0b' };
    setLogs(prev => [...prev, { msg, level, color: colors[level], ts: new Date().toLocaleTimeString() }]);
  }

  async function createSandboxAlert(companyId, driver, trip, alertType, message, severity = 'info') {
    const { error } = await supabase.from('supervisor_alerts').insert({
      bot_name: 'TestModeSandbox',
      alert_type: alertType,
      message,
      severity,
      payload: {
        company_id: companyId,
        driver_id: driver?.id || null,
        driver_name: driver?.full_name || '',
        trip_id: trip?.trip_id || null,
        pickup_address: trip?.pu_address || '',
        dropoff_address: trip?.do_address || '',
        sandbox: true,
      },
    });

    if (error) addLog(`Alert write failed: ${error.message}`, 'error');
  }

  async function seedTripsForTemplates(companyId, driverIds, templates, scenarioLabel = 'Full Coverage') {
    const today = new Date();
    today.setHours(6, 0, 0, 0);
    let successfulTrips = 0;
    const sandboxMarker = getSandboxMarker(companyId);

    for (const [i, tt] of templates.entries()) {
      const tripTime = new Date(today.getTime() + i * 70 * 60000);
      const driverIdx = i % driverIds.length;
      const driverId = driverIds[driverIdx];
      const driver = TEST_DRIVERS[driverIdx];
      const preassigned = i < Math.min(4, templates.length);

      const { error: tripErr } = await supabase.from('trip_assignments').insert({
        trip_id: `TST-${Date.now()}-${scenarioLabel}-${i}`,
        driver_id: preassigned ? driverId : null,
        company_id: companyId,
        driver_name: preassigned ? (driver?.full_name || 'Test Driver') : '',
        status: i < 3 ? 'completed' : i === 3 ? 'in_progress' : 'pending',
        pu_address: tt.pu,
        do_address: tt.do,
        mileage: tt.miles,
        delivery_price: tt.price,
        scheduled_pickup_time: tripTime.toISOString(),
        notes: `${sandboxMarker}|${scenarioLabel}|synthetic_trip_${i + 1}`,
        scheduled_order: i + 1,
        travel_time_mins: Math.round(tt.miles * 3.5),
        assigned_at: new Date().toISOString(),
      });

      if (tripErr) {
        addLog(`Failed to seed trip ${i + 1}: ${tripErr.message}`, 'error');
      } else {
        successfulTrips++;
      }
    }

    return successfulTrips;
  }

  async function seedMarketplaceForTemplates(companyId, templates, scenarioKey = 'full_coverage') {
    const today = new Date();
    today.setHours(6, 0, 0, 0);
    const sentryPrefix = getSandboxMarketplacePrefix(companyId);

    const rows = templates.map((tt, i) => {
      const tripTime = new Date(today.getTime() + i * 45 * 60000);
      const pickupZone = NYC_BOROUGHS[i % NYC_BOROUGHS.length];
      const dropoffZone = NYC_BOROUGHS[(i + 2) % NYC_BOROUGHS.length];
      return {
        sentry_trip_id: `${sentryPrefix}-${scenarioKey}-${String(i + 1).padStart(3, '0')}`,
        sentry_last_modified_at: new Date().toISOString(),
        date_val: tripTime.toISOString().slice(0, 10),
        los: 'Ambulatory',
        passengers: String((i % 2) + 1),
        mileage: String(tt.miles),
        pu_address: tt.pu,
        pu_city: pickupZone.name,
        pu_zip: pickupZone.zip,
        pu_time: tripTime.toISOString(),
        do_address: tt.do,
        do_city: dropoffZone.name,
        do_zip: dropoffZone.zip,
        do_time: new Date(tripTime.getTime() + Math.round(tt.miles * 4.5) * 60000).toISOString(),
        delivery_price: String(tt.price),
        status: 'available',
        company_id: companyId,
        loaded_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('marketplace_trips')
      .upsert(rows, { onConflict: 'sentry_trip_id' });

    if (error) {
      addLog(`Failed to seed marketplace queue: ${error.message}`, 'error');
      return 0;
    }

    return rows.length;
  }

  async function activateTestMode(selectedTemplates = SCENARIOS.full.templates, scenarioLabel = SCENARIOS.full.label) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { addLog('Not authenticated', 'error'); return; }

    setSeeding(true);
    setSeedStatus('seeding');
    setLogs([]);

    try {
      addLog('Starting test mode initialization...', 'info');
      const { data: existingMembership } = await supabase
        .from('org_members')
        .select('org_id, organizations(id, name)')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      let testOrg = existingMembership?.organizations || (existingMembership?.org_id ? { id: existingMembership.org_id } : null);
      if (testOrg?.id) {
        addLog(`Using your existing organization for scheduler helpers: ${testOrg.name || testOrg.id}`, 'info');
      } else {
        addLog('No dispatch organization is linked to this admin yet. Sandbox will seed company/drivers/trips without org-level helpers.', 'warn');
      }

      addLog('Setting up test company...', 'info');
      let testCompany;
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('owner_user_id', user.id)
        .ilike('company_name', '%SANDBOX%')
        .maybeSingle();

      if (existingCompany) {
        testCompany = existingCompany;
        addLog('Test company already exists — reusing', 'warn');
      } else {
        const { data: newCompany, error: compErr } = await supabase
          .from('companies')
          .insert({
            company_name: `Penthouse Test Co [SANDBOX]`,
            legal_entity: 'Penthouse Test LLC',
            is_approved: true,
            onboarding_status: 'approved',
            baseline_fleet_size: TEST_DRIVERS.length,
            owner_user_id: user.id,
            phone: '555-TEST-001',
            address: '350 W 42nd St, New York, NY 10036',
            notes: 'TEST_MODE_SANDBOX — do not use for production',
          })
          .select()
          .maybeSingle();
        if (compErr) throw new Error(`Company creation failed: ${compErr.message}`);
        testCompany = newCompany;
        addLog('Test company created', 'success');
      }

      if (!testCompany?.id) throw new Error('Could not get test company ID');

      addLog(`Seeding ${TEST_DRIVERS.length} test drivers across all boroughs...`, 'info');
      const seededDriverIds = [];
      for (const [i, td] of TEST_DRIVERS.entries()) {
        const borough = NYC_BOROUGHS.find(b => b.name === td.borough) || NYC_BOROUGHS[0];
        const { data: existing } = await supabase
          .from('drivers')
          .select('id')
          .eq('tlc_number', td.tlc)
          .maybeSingle();

        if (existing) {
          const { error: existingDriverErr } = await supabase
            .from('drivers')
            .update({
              status: td.status,
              company_id: testCompany.id,
              is_active: true,
              pay_rate: (18 + i * 2).toString(),
              pay_rate_type: 'hourly',
              current_lat: borough.coords.lat + (Math.random() - 0.5) * 0.05,
              current_lng: borough.coords.lng + (Math.random() - 0.5) * 0.05,
              home_address: `${td.borough}, New York`,
              preferred_zones: [td.borough.toLowerCase()],
              working_today: td.status !== 'offline',
              layer1_pct: 100,
              layer2_status: 'approved_internal',
              layer3_status: 'ready',
              driver_number: `TST-${String(i + 1).padStart(3, '0')}`,
              login_username: `tst${String(i + 1).padStart(3, '0')}`,
              login_password: td.tlc,
            })
            .eq('id', existing.id);
          if (existingDriverErr) {
            addLog(`Failed to refresh ${td.full_name}: ${existingDriverErr.message}`, 'error');
            continue;
          }
          seededDriverIds.push(existing.id);
          addLog(`${td.full_name} already exists — refreshed sandbox profile`, 'warn');
          continue;
        }

        const { data: newDriver, error: driverErr } = await supabase
          .from('drivers')
          .insert({
            full_name: td.full_name,
            tlc_number: td.tlc,
            status: td.status,
            company_id: testCompany.id,
            is_active: true,
            pay_rate: (18 + i * 2).toString(),
            pay_rate_type: 'hourly',
            current_lat: borough.coords.lat + (Math.random() - 0.5) * 0.05,
            current_lng: borough.coords.lng + (Math.random() - 0.5) * 0.05,
            home_address: `${td.borough}, New York`,
            preferred_zones: [td.borough.toLowerCase()],
            working_today: td.status !== 'offline',
            layer1_pct: 100,
            layer2_status: 'approved_internal',
            layer3_status: 'ready',
            driver_number: `TST-${String(i + 1).padStart(3, '0')}`,
            login_username: `tst${String(i + 1).padStart(3, '0')}`,
            login_password: td.tlc,
          })
          .select()
          .maybeSingle();

        if (driverErr) {
          addLog(`Failed to seed ${td.full_name}: ${driverErr.message}`, 'error');
        } else {
          seededDriverIds.push(newDriver.id);
          addLog(`Created driver: ${td.full_name} (${td.borough})`, 'success');
        }
      }

      if (seededDriverIds.length === 0) throw new Error('No drivers were seeded — cannot create trips');

      addLog(`Seeding ${selectedTemplates.length} fake marketplace trips for ${scenarioLabel}...`, 'info');
      const seededMarketplaceCount = await seedMarketplaceForTemplates(
        testCompany.id,
        selectedTemplates,
        scenarioLabel.toLowerCase().replace(/\s+/g, '_'),
      );
      addLog(
        `${seededMarketplaceCount}/${selectedTemplates.length} marketplace trips seeded`,
        seededMarketplaceCount === selectedTemplates.length ? 'success' : 'warn'
      );
      addLog(`Seeding ${selectedTemplates.length} scheduled assignment examples for ${scenarioLabel}...`, 'info');
      const successfulTrips = await seedTripsForTemplates(testCompany.id, seededDriverIds, selectedTemplates, scenarioLabel.toLowerCase().replace(/\s+/g, '_'));
      addLog(`${successfulTrips}/${selectedTemplates.length} trips seeded`, successfulTrips === selectedTemplates.length ? 'success' : 'warn');
      addLog('Driver login credentials seeded. Username format: tst001 / password: DEMO-TLC-001', 'success');

      const sessionData = {
        user_id: user.id,
        is_active: true,
        test_org_id: testOrg?.id || null,
        test_company_id: testCompany.id,
        reset_at: new Date().toISOString(),
      };

      const { data: existingSession } = await supabase
        .from('test_sandbox_sessions')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingSession) {
        await supabase.from('test_sandbox_sessions').update(sessionData).eq('id', existingSession.id);
      } else {
        await supabase.from('test_sandbox_sessions').insert(sessionData);
      }

      addLog('Test mode activated!', 'success');
      setSeedStatus('done');
      await loadSession();
    } catch (err) {
      addLog(`Error: ${err.message}`, 'error');
      setSeedStatus('error');
    }
    setSeeding(false);
  }

  async function resetTestData() {
    if (!session?.test_company_id) return;
    setSeeding(true);
    addLog('Resetting test data...', 'info');
    const marker = getSandboxMarker(session.test_company_id);
    const { data: companyDrivers } = await supabase.from('drivers').select('id').eq('company_id', session.test_company_id);
    const driverIds = (companyDrivers || []).map(d => d.id).filter(Boolean);
    await supabase.from('trip_assignments').delete().like('notes', `${marker}%`);
    await supabase
      .from('marketplace_trips')
      .delete()
      .eq('company_id', session.test_company_id)
      .like('sentry_trip_id', `${getSandboxMarketplacePrefix(session.test_company_id)}%`);
    if (driverIds.length > 0) {
      await supabase.from('trip_assignments').delete().in('driver_id', driverIds);
    }
    addLog('Cleared sandbox marketplace and assignment data', 'success');
    setSeedStatus('idle');
    setTestTrips([]);
    setSeeding(false);
    await activateTestMode();
  }

  async function seedScenario(key) {
    if (!session?.test_company_id) return;
    const scenario = SCENARIOS[key];
    if (!scenario) return;

    setSeeding(true);
    addLog(`Resetting sandbox trips for scenario: ${scenario.label}`, 'info');
    const marker = getSandboxMarker(session.test_company_id);
    await supabase.from('trip_assignments').delete().like('notes', `${marker}%`);
    await supabase
      .from('marketplace_trips')
      .delete()
      .eq('company_id', session.test_company_id)
      .like('sentry_trip_id', `${getSandboxMarketplacePrefix(session.test_company_id)}%`);

    const { data: companyDrivers } = await supabase.from('drivers').select('id').eq('company_id', session.test_company_id);
    const driverIds = (companyDrivers || []).map(d => d.id).filter(Boolean);
    if (driverIds.length === 0) {
      addLog('No sandbox drivers were found for this company. Activate test mode first so drivers are seeded before loading a scenario.', 'error');
      setSeeding(false);
      return;
    }

    const marketplaceCount = await seedMarketplaceForTemplates(session.test_company_id, scenario.templates, key);
    addLog(`Scenario marketplace ready: ${marketplaceCount} fake queue trips loaded`, marketplaceCount > 0 ? 'success' : 'warn');
    const count = await seedTripsForTemplates(session.test_company_id, driverIds, scenario.templates, key);
    addLog(`Scenario ready: ${count} trips seeded for ${scenario.label}`, count > 0 ? 'success' : 'warn');
    await loadTestData(session.test_company_id);
    setSeeding(false);
  }

  async function deactivateTestMode() {
    if (!session) return;
    await supabase.from('test_sandbox_sessions').update({ is_active: false }).eq('id', session.id);
    setSession(prev => ({ ...prev, is_active: false }));
    setTestDrivers([]);
    setTestTrips([]);
    setSeedStatus('idle');
    addLog('Test mode deactivated', 'warn');
  }

  async function runAIScheduler() {
    if (!session?.test_company_id) return;
    setSchedulerRunning(true);
    addLog('Running AI auto-scheduler on test data...', 'info');

    const pendingTrips = testTrips.filter(t => t.status === 'pending' && !t.driver_id);
    const availableDrivers = testDrivers.filter(d => d.status === 'online' || d.status === 'on_trip');

    addLog(`Found ${pendingTrips.length} unassigned trips and ${availableDrivers.length} available drivers`, 'info');
    if (pendingTrips.length === 0 || availableDrivers.length === 0) {
      addLog('No pending trips or no available drivers — nothing to schedule', 'warn');
      setSchedulerRunning(false);
      return;
    }

    const schedulerTrips = pendingTrips.map(trip => ({
      sentry_trip_id: trip.trip_id,
      status: 'available',
      pu_address: trip.pu_address,
      do_address: trip.do_address,
      pu_time: trip.scheduled_pickup_time,
      mileage: trip.mileage,
      delivery_price: trip.delivery_price,
      notes: trip.notes,
    }));

    const currentAssignments = testTrips
      .filter(trip => trip.driver_id && !['completed', 'cancelled', 'rejected'].includes(trip.status))
      .map(trip => ({
        trip_id: trip.trip_id,
        driver_id: trip.driver_id,
        status: trip.status,
      }));

    const scheduleResult = await runAutoScheduler({
      drivers: availableDrivers,
      trips: schedulerTrips,
      assignments: currentAssignments,
      config: {
        enabled: true,
        auto_assign: false,
        revenue_target_per_hour: 60,
        driver_pay_per_hour: 35,
        max_trip_distance_miles: 25,
        proximity_weight: 7,
        mileage_weight: 5,
        price_weight: 8,
        short_trip_max_miles: 4,
        short_trip_bonus_weight: 9,
        chaining_weight: 8,
        shared_ride_bonus_weight: 6,
        buffer_mins: 15,
        traffic_buffer_pct: 20,
        shift_hours: '7am-5pm',
      },
      orgId: session.test_org_id,
      dryRun: true,
    });

    let assigned = 0;
    for (const plan of scheduleResult.results || []) {
      for (const trip of plan.trips || []) {
        const { error } = await supabase
          .from('trip_assignments')
          .update({
            driver_id: plan.driver.id,
            driver_name: plan.driver.full_name,
            status: 'pending',
            assigned_at: new Date().toISOString(),
            scheduled_order: trip.scheduled_order || null,
            travel_time_mins: trip._meta?.driveTimeFromPrev ?? null,
          })
          .eq('trip_id', trip.sentry_trip_id)
          .like('notes', `${getSandboxMarker(session.test_company_id)}%`);

        if (!error) {
          assigned++;
          addLog(`Assigned trip ${trip.sentry_trip_id?.slice(-8)} to ${plan.driver.full_name}`, 'success');
        } else {
          addLog(`Failed to assign ${trip.sentry_trip_id?.slice(-8)}: ${error.message}`, 'error');
        }
      }
    }

    if ((scheduleResult.results || []).length === 0) {
      addLog('Scheduler returned no assignment plans. This usually means the current trip windows, distances, or driver availability do not produce a valid match.', 'warn');
    }

    addLog(
      `AI scheduler complete: ${assigned} trips auto-assigned${scheduleResult.sharedRideOpportunities ? ` · ${scheduleResult.sharedRideOpportunities} shared-ride candidates found` : ''}`,
      assigned > 0 ? 'success' : 'warn'
    );
    await loadTestData(session.test_company_id);
    setSchedulerRunning(false);
  }

  async function simulateRouteActivity() {
    if (!session?.test_company_id) return;
    setSimulating(true);
    addLog('Simulating live trip progress for sandbox drivers...', 'info');

    const sandboxTrips = [...testTrips].sort((a, b) => new Date(a.scheduled_pickup_time || 0) - new Date(b.scheduled_pickup_time || 0));
    const accepted = sandboxTrips.find(trip => trip.status === 'pending' && trip.driver_id);
    const pickedUp = sandboxTrips.find(trip => trip.status === 'picked_up' || trip.status === 'in_progress');
    const arrived = sandboxTrips.find(trip => trip.status === 'accepted');
    const fallbackAssigned = sandboxTrips.find(trip => trip.driver_id);

    const tripToArrive = arrived || accepted || fallbackAssigned;
    const tripToPickup = pickedUp || arrived || accepted || fallbackAssigned;
    const tripToComplete = pickedUp || tripToPickup;
    const tripToNoShow = sandboxTrips.find(trip => trip.status === 'arrived') || sandboxTrips.find(trip => trip.status === 'pending' && trip.driver_id && trip.id !== tripToComplete?.id);

    const driverMap = new Map(testDrivers.map(driver => [driver.id, driver]));

    if (!tripToArrive && !tripToPickup && !tripToComplete && !tripToNoShow) {
      addLog('No assigned sandbox trips found yet. Run the AI scheduler first.', 'warn');
      setSimulating(false);
      return;
    }

    if (tripToArrive?.trip_id) {
      const { error } = await supabase.from('trip_assignments').update({ status: 'arrived' }).eq('id', tripToArrive.id);
      if (!error) {
        await createSandboxAlert(session.test_company_id, driverMap.get(tripToArrive.driver_id), tripToArrive, 'sandbox_driver_arrived', `${tripToArrive.driver_name || 'Sandbox driver'} arrived at pickup.`, 'info');
        addLog(`Simulated arrival for ${tripToArrive.driver_name || 'driver'}`, 'success');
      }
    }

    if (tripToPickup?.trip_id) {
      const { error } = await supabase.from('trip_assignments').update({ status: 'picked_up' }).eq('id', tripToPickup.id);
      if (!error) {
        await createSandboxAlert(session.test_company_id, driverMap.get(tripToPickup.driver_id), tripToPickup, 'sandbox_rider_picked_up', `${tripToPickup.driver_name || 'Sandbox driver'} picked up the rider.`, 'info');
        addLog(`Simulated pickup for ${tripToPickup.driver_name || 'driver'}`, 'success');
      }
    }

    if (tripToComplete?.trip_id) {
      const { error } = await supabase.from('trip_assignments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', tripToComplete.id);
      if (!error) {
        await createSandboxAlert(session.test_company_id, driverMap.get(tripToComplete.driver_id), tripToComplete, 'sandbox_rider_dropped_off', `${tripToComplete.driver_name || 'Sandbox driver'} dropped off the rider.`, 'info');
        addLog(`Simulated dropoff for ${tripToComplete.driver_name || 'driver'}`, 'success');
      }
    }

    if (tripToNoShow?.trip_id) {
      const { error } = await supabase.from('trip_assignments').update({ status: 'no_show' }).eq('id', tripToNoShow.id);
      if (!error) {
        await createSandboxAlert(session.test_company_id, driverMap.get(tripToNoShow.driver_id), tripToNoShow, 'sandbox_rider_no_show', `${tripToNoShow.driver_name || 'Sandbox driver'} marked the rider as no-show.`, 'warning');
        addLog(`Simulated no-show for ${tripToNoShow.driver_name || 'driver'}`, 'warn');
      }
    }

    await loadTestData(session.test_company_id);
    setSimulating(false);
  }

  async function purgeAllTestData() {
    if (!session) return;
    setSeeding(true);
    addLog('Purging all test data...', 'info');

    if (session.test_company_id) {
      const marker = getSandboxMarker(session.test_company_id);
      const { data: drivers } = await supabase.from('drivers').select('id').eq('company_id', session.test_company_id);
      await supabase
        .from('marketplace_trips')
        .delete()
        .eq('company_id', session.test_company_id)
        .like('sentry_trip_id', `${getSandboxMarketplacePrefix(session.test_company_id)}%`);
      if (drivers?.length) {
        await supabase.from('trip_assignments').delete().in('driver_id', drivers.map(d => d.id));
        await supabase.from('drivers').delete().eq('company_id', session.test_company_id);
        addLog(`Removed ${drivers.length} test drivers and their trips`, 'success');
      }
      await supabase.from('trip_assignments').delete().like('notes', `${marker}%`);
    }

    await supabase.from('test_sandbox_sessions').update({ is_active: false }).eq('id', session.id);
    addLog('All test data purged', 'success');

    setSession(prev => ({ ...prev, is_active: false }));
    setTestDrivers([]);
    setTestTrips([]);
    setSeedStatus('idle');
    setSeeding(false);
  }

  const isActive = session?.is_active;
  const completedTrips = testTrips.filter(t => t.status === 'completed').length;
  const pendingTripsCount = testTrips.filter(t => t.status === 'pending').length;
  const inProgressTrips = testTrips.filter(t => t.status === 'in_progress').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#07090d', color: '#e5e7eb' }}>
      {isActive && (
        <div className="sticky top-0 z-40 flex items-center justify-between px-5 py-2.5" style={{ background: 'rgba(245,158,11,0.15)', borderBottom: '1px solid rgba(245,158,11,0.3)', backdropFilter: 'blur(8px)' }}>
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4" style={{ color: '#f59e0b' }} />
            <span className="text-sm font-700" style={{ color: '#f59e0b', fontWeight: 700 }}>TEST MODE ACTIVE — Isolated Sandbox Data Only</span>
          </div>
          <button
            onClick={deactivateTestMode}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all"
            style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.25)', color: '#ff4757' }}
          >
            <X className="w-3 h-3" />
            Deactivate
          </button>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-5 py-6 space-y-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <FlaskConical className="w-5 h-5" style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <h1 className="text-lg font-700" style={{ fontWeight: 700, color: '#f59e0b' }}>Test Mode Sandbox</h1>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Isolated environment with synthetic NYC/LI data — no real data is touched</p>
          </div>
        </div>

        <div className="rounded-2xl p-5 space-y-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-700" style={{ fontWeight: 700 }}>Sandbox Status</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {isActive ? 'Test data is loaded and ready. No production data is affected.' : 'Click Activate to seed test drivers and trips.'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={isActive ? (seedStatus === 'idle' ? 'done' : seedStatus) : seedStatus} />
              {!isActive ? (
                <button
                  onClick={activateTestMode}
                  disabled={seeding}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
                  style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontWeight: 600 }}
                >
                  {seeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Activate Test Mode
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={resetTestData}
                    disabled={seeding}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                    style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', color: '#0ea5e9', fontWeight: 600 }}
                  >
                    {seeding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Reset Data
                  </button>
                  <button
                    onClick={runAIScheduler}
                    disabled={schedulerRunning}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                    style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0', fontWeight: 600 }}
                  >
                    {schedulerRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Run AI Scheduler
                  </button>
                  <button
                    onClick={simulateRouteActivity}
                    disabled={simulating}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                    style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', fontWeight: 600 }}
                  >
                    {simulating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Route className="w-3.5 h-3.5" />}
                    Simulate Route Activity
                  </button>
                  <button
                    onClick={purgeAllTestData}
                    disabled={seeding}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                    style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', color: '#ff4757', fontWeight: 600 }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Purge All
                  </button>
                </div>
              )}
            </div>
          </div>

          {isActive && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Test Drivers', value: testDrivers.length, icon: Users, color: '#0ea5e9' },
                { label: 'Total Trips', value: testTrips.length, icon: Route, color: '#c9a84c' },
                { label: 'Completed', value: completedTrips, icon: CheckCircle, color: '#00e5a0' },
                { label: 'Pending', value: pendingTripsCount + inProgressTrips, icon: Clock, color: '#f59e0b' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3" style={{ background: `${s.color}08`, border: `1px solid ${s.color}20` }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <s.icon className="w-3 h-3" style={{ color: s.color }} />
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</p>
                  </div>
                  <p className="text-xl font-800" style={{ color: s.color, fontWeight: 800 }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {isActive && (
          <div className="rounded-2xl p-5 space-y-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div>
              <p className="text-sm font-700" style={{ fontWeight: 700 }}>Scenario Buttons</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>One-click sandbox states so you can test routing, airport demand, and longer mileage days without rebuilding the whole dataset.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SCENARIOS).map(([key, scenario]) => (
                <button
                  key={key}
                  onClick={() => seedScenario(key)}
                  disabled={seeding}
                  className="px-3 py-2 rounded-xl text-xs transition-all"
                  style={{
                    background: 'rgba(201,168,76,0.08)',
                    border: '1px solid rgba(201,168,76,0.2)',
                    color: '#c9a84c',
                    fontWeight: 600,
                  }}
                >
                  {scenario.label}
                </button>
              ))}
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)' }}>
              <p className="text-xs font-700 mb-1" style={{ color: '#0ea5e9', fontWeight: 700 }}>Sandbox Driver Login</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Username pattern: <span style={{ color: '#e5e7eb' }}>tst001</span>, <span style={{ color: '#e5e7eb' }}>tst002</span>, etc.
                Password: each driver&apos;s TLC number, for example <span style={{ color: '#e5e7eb' }}>TLC-TST-001</span>.
              </p>
            </div>
          </div>
        )}

        {isActive && testDrivers.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-sm font-700" style={{ fontWeight: 700 }}>Test Drivers</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Covering all 5 boroughs + Long Island</p>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              {testDrivers.map(d => {
                const statusColors = { online: '#00e5a0', on_trip: '#c9a84c', offline: 'rgba(255,255,255,0.25)', break: '#f59e0b' };
                const driverTrips = testTrips.filter(t => t.driver_id === d.id);
                return (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', fontWeight: 700 }}>
                      {d.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{d.full_name}</p>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusColors[d.status] || 'rgba(255,255,255,0.2)' }} />
                          <span className="text-xs capitalize" style={{ color: statusColors[d.status] || 'rgba(255,255,255,0.3)' }}>{d.status}</span>
                        </div>
                      </div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{d.home_address} · {d.tlc_number}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-600" style={{ color: '#c9a84c', fontWeight: 600 }}>{driverTrips.length} trips</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>${d.pay_rate}/hr</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isActive && testTrips.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-sm font-700" style={{ fontWeight: 700 }}>Test Trips</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Routes spanning all NYC boroughs and Long Island</p>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              {testTrips.map((t, i) => {
                const statusColor = t.status === 'completed' ? '#00e5a0' : t.status === 'in_progress' ? '#c9a84c' : 'rgba(255,255,255,0.3)';
                return (
                  <div key={t.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-700 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,168,76,0.1)', color: '#c9a84c', fontWeight: 700, fontSize: 10 }}>{i + 1}</span>
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{t.driver_name || 'Unassigned'}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: `${statusColor}15`, color: statusColor, fontSize: 10 }}>{t.status}</span>
                        </div>
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: '#00e5a0' }} />
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.pu_address}</p>
                        </div>
                        <div className="flex items-start gap-1.5 mt-0.5">
                          <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: '#ff4757' }} />
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.do_address}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${t.delivery_price}</p>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{t.mileage} mi</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-sm font-700" style={{ fontWeight: 700 }}>Activity Log</p>
              <button onClick={() => setLogs([])} className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Clear</button>
            </div>
            <div className="p-4 space-y-1 max-h-64 overflow-y-auto font-mono">
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>{log.ts}</span>
                  <span style={{ color: log.color }}>{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl p-5" style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.15)' }}>
          <p className="text-sm font-700 mb-2" style={{ color: '#0ea5e9', fontWeight: 700 }}>How Test Mode Works</p>
          <ul className="space-y-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <li>Creates a separate "Penthouse Test Co" company with 8 synthetic drivers</li>
            <li>Seeds 12 test trips spanning Manhattan, Brooklyn, Queens, Bronx, Staten Island, and Long Island</li>
            <li>All test records are tagged — they never mix with your real dispatch data</li>
            <li>Use "Run AI Scheduler" to see the autonomous scheduling engine assign trips to drivers</li>
            <li>Driver App at <span style={{ color: '#0ea5e9' }}>/driver</span> — select any "TST-" driver to test the full driver experience</li>
            <li>Use "Simulate Route Activity" after scheduling to fire pickup, dropoff, and no-show alerts into admin/company dashboards</li>
            <li>Reset Data wipes all test trips and re-seeds fresh data at any time</li>
            <li>Purge All removes test drivers and trips entirely — start completely fresh</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
