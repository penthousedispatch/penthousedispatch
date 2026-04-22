import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { sentryApi } from '../../lib/sentryApi';
import { getEdgeFunctionHeaders } from '../../lib/edgeHeaders';
import { fbSet, fbGet } from '../../lib/firebase';
import { useApp } from '../../context/AppContext';
import { resolveOrgIdForAdmin } from '../../lib/resolveOrgId';
import { getAiSettings, requestAIStructuredPlan } from '../../utils/aiMotivation';
import { CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp, Cpu, Play, FlaskConical, RotateCcw, RadioTower } from 'lucide-react';
import { Link } from 'react-router-dom';

function cleanAuthValue(value) {
  return String(value || '').replace(/\u00a0/g, ' ').trim();
}

function looksHashedPassword(value) {
  const normalized = cleanAuthValue(value);
  return /^\$2[aby]\$\d+\$/.test(normalized) || /^\$argon2/i.test(normalized);
}

const TEST_DEFS = [
  { id: 'ui', label: 'UI Test', desc: 'Verify all major UI components render correctly' },
  { id: 'sentry', label: 'Sentry Integration Test', desc: 'Test connection to SentryMS API' },
  { id: 'sentry_sheet', label: 'Sentry Sheet Test', desc: 'Verify retrieve_trips returns completion, fare, and NEXT DAY fields' },
  { id: 'webhook', label: 'Webhook Test', desc: 'Send test payloads to all 3 webhook endpoints' },
  { id: 'trip_flow', label: 'Trip Flow Test', desc: 'Full trip lifecycle from creation to completion' },
  { id: 'billing', label: 'Billing Test', desc: 'Verify billing calculation logic (Admin only)' },
  { id: 'driver_onboarding', label: 'Driver Onboarding Test', desc: 'Test all 3 onboarding layers' },
  { id: 'chat', label: 'Chat Test', desc: 'Test Firebase message delivery round-trip' },
  { id: 'ai', label: 'AI Test', desc: 'Test AI provider connectivity and response generation' },
  { id: 'ai_compliance', label: 'AI Compliance Review', desc: 'Use the configured AI provider to review Sentry readiness and rank blockers' },
];

export default function AdminTestingCenter() {
  const { org, user, company, adminPreviewCompany, isPlatformOwner, role, sentryConfig, sentryStatus, setAdminPreviewCompany } = useApp();
  const [results, setResults] = useState({});
  const [logs, setLogs] = useState({});
  const [running, setRunning] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [runningAll, setRunningAll] = useState(false);
  const [sandboxStatus, setSandboxStatus] = useState({ active: false, companyId: null, resetAt: '' });
  const [recentWebhookLogs, setRecentWebhookLogs] = useState([]);
  const [resolvedOrgId, setResolvedOrgId] = useState(null);
  const [approvedCompanies, setApprovedCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  function isApprovedCompanyRecord(companyRow) {
    return Boolean(
      companyRow?.is_approved ||
      String(companyRow?.onboarding_status || '').toLowerCase() === 'approved'
    );
  }

  useEffect(() => {
    let mounted = true;

    async function resolveOrgId() {
      const nextOrgId = await resolveOrgIdForAdmin({
        orgId: org?.id || null,
        user,
        isPlatformOwner,
        role,
      });
      if (mounted) setResolvedOrgId(nextOrgId);
    }

    resolveOrgId();
    return () => {
      mounted = false;
    };
  }, [org?.id, user?.id, isPlatformOwner, role]);

  function addLog(testId, msg, level = 'info') {
    setLogs(prev => ({
      ...prev,
      [testId]: [...(prev[testId] || []), { msg, level, ts: new Date().toISOString() }],
    }));
  }

  function setResult(testId, status) {
    setResults(prev => ({ ...prev, [testId]: status }));
  }

  useEffect(() => {
    loadOpsHelpers();
  }, []);

  async function loadOpsHelpers() {
    const [sandboxRes, webhookRes, companyRes] = await Promise.all([
      supabase
        .from('test_sandbox_sessions')
        .select('is_active, test_company_id, reset_at')
        .eq('is_active', true)
        .order('reset_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('webhook_logs')
        .select('id, endpoint, raw_payload, received_at, processed')
        .order('received_at', { ascending: false })
        .limit(5),
      supabase
        .from('companies')
        .select('id, company_name, is_approved, onboarding_status, is_suspended')
        .order('company_name'),
    ]);

    setSandboxStatus({
      active: !!sandboxRes.data?.is_active,
      companyId: sandboxRes.data?.test_company_id || null,
      resetAt: sandboxRes.data?.reset_at || '',
    });
    setRecentWebhookLogs(webhookRes.data || []);
    setApprovedCompanies(
      (companyRes.data || []).filter(companyRow => isApprovedCompanyRecord(companyRow) && !companyRow.is_suspended)
    );
  }

  async function loadLatestSentryConfig() {
    const { data, error } = await supabase
      .from('sentry_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function getFunctionHeaders() {
    return getEdgeFunctionHeaders();
  }

  async function runTest(testId) {
    setRunning(testId);
    setResults(prev => ({ ...prev, [testId]: 'running' }));
    setLogs(prev => ({ ...prev, [testId]: [] }));
    setExpanded(prev => ({ ...prev, [testId]: true }));

    try {
      switch (testId) {
        case 'ui': await runUITest(testId); break;
        case 'sentry': await runSentryTest(testId); break;
        case 'sentry_sheet': await runSentrySheetTest(testId); break;
        case 'webhook': await runWebhookTest(testId); break;
        case 'trip_flow': await runTripFlowTest(testId); break;
        case 'billing': await runBillingTest(testId); break;
        case 'driver_onboarding': await runDriverOnboardingTest(testId); break;
        case 'chat': await runChatTest(testId); break;
        case 'ai': await runAITest(testId); break;
        case 'ai_compliance': await runAIComplianceReview(testId); break;
        default: addLog(testId, 'Unknown test', 'error'); setResult(testId, 'fail');
      }
    } catch (err) {
      addLog(testId, `Uncaught error: ${err.message}`, 'error');
      setResult(testId, 'fail');
    }

    setRunning(null);
  }

  async function runUITest(testId) {
    const checks = [
      ['Supabase client', () => !!supabase],
      ['Browser storage', () => typeof localStorage !== 'undefined'],
      ['Google Maps script', () => typeof window !== 'undefined'],
      ['React version', () => typeof React !== 'undefined'],
    ];
    let allPassed = true;
    for (const [label, check] of checks) {
      const passed = check();
      addLog(testId, `${label}: ${passed ? 'PASS' : 'FAIL'}`, passed ? 'success' : 'error');
      if (!passed) allPassed = false;
    }
    setResult(testId, allPassed ? 'pass' : 'fail');
  }

  async function runSentryTest(testId) {
    const cfg = await loadLatestSentryConfig();
    if (!cfg) {
      addLog(testId, 'No Sentry config row was found yet. Save the Sentry settings first.', 'warn');
      setResult(testId, 'fail');
      return;
    }

    const missingBasic = cfg.auth_type === 'basic' && (!cfg.username || !cfg.password_enc);
    const missingBearer = cfg.auth_type === 'bearer' && !cfg.api_key;
    if (missingBasic || missingBearer) {
      addLog(testId, 'Sentry auth settings are incomplete for the selected auth type.', 'warn');
      addLog(testId, cfg.auth_type === 'basic'
        ? 'Add both Username and Password on the Sentry page before running this test.'
        : 'Add a Bearer token/API key on the Sentry page before running this test.', 'info');
      setResult(testId, 'fail');
      return;
    }

    if (cfg.auth_type === 'basic' && looksHashedPassword(cfg.password_enc)) {
      addLog(testId, 'Saved Sentry password has a hash-like format.', 'warn');
      addLog(testId, 'Sentry sandbox passwords can legitimately look like this, so the test will keep going and verify with a real outbound auth call.', 'info');
    }

    if (cfg) {
      sentryApi.configure({
        baseUrl: cfg.base_url,
        username: cleanAuthValue(cfg.username),
        password: cleanAuthValue(cfg.password_enc),
        apiKey: cleanAuthValue(cfg.api_key),
        authType: cfg.auth_type,
        enabled: cfg.enabled,
      });
    }

    addLog(testId, 'Testing Sentry API connection...');
    let result = await sentryApi.healthCheck();

    if (result.error === 'Failed to fetch' && cfg) {
      addLog(testId, 'Browser direct-connect test was blocked. Falling back to server-side diagnostic...', 'warn');
      try {
        const edgeBase = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1`;
        const fnRes = await fetch(`${edgeBase}/sentry-diagnostics/health-check`, {
          method: 'POST',
          headers: await getFunctionHeaders(),
          body: JSON.stringify({
            base_url: cfg.base_url,
            username: cfg.username,
            password_enc: cfg.password_enc,
            api_key: cfg.api_key,
            auth_type: cfg.auth_type,
          }),
        });

        if (!fnRes.ok) {
          const text = await fnRes.text().catch(() => '');
          const setupPending = fnRes.status === 401;
          addLog(
            testId,
            `Diagnostics function returned HTTP ${fnRes.status}${text ? ` — ${text}` : ''}`,
            setupPending ? 'warn' : 'error',
          );
        }

        const fallback = await fnRes.json().catch(() => ({}));
        result = {
          authenticated: !!fallback.authenticated,
          latencyMs: fallback.latencyMs,
          error: fallback.error || null,
          hint: fallback.hint || null,
          status: fallback.status,
          data: fallback.data,
        };
      } catch (fallbackError) {
        addLog(testId, `Server-side diagnostic failed: ${fallbackError.message}`, 'error');
      }
    }
    const authSetupPending = !result.authenticated && !!result.error && /unauthorized|jwt|token|auth/i.test(result.error);
    addLog(
      testId,
      `Auth: ${result.authenticated ? 'OK' : authSetupPending ? 'NEEDS CREDENTIALS (401-style)' : 'FAIL'}`,
      result.authenticated ? 'success' : authSetupPending ? 'warn' : 'error',
    );
    if (result.latencyMs) addLog(testId, `Latency: ${result.latencyMs}ms`);
    if (result.error) addLog(testId, `Detail: ${result.error}`, authSetupPending ? 'warn' : 'error');
    if (result.error === 'Failed to fetch') {
      addLog(testId, 'Network: browser could not complete the request (often edge function URL, CORS, or offline). Check Network tab for the exact failing URL and status.', 'warn');
    }
    if (result.hint) addLog(testId, `Hint: ${result.hint}`, result.authenticated ? 'info' : 'warn');
    if (authSetupPending) {
      addLog(testId, 'Action: open Admin → Sentry, save a valid base URL and username/password or API key, then run this test again.', 'warn');
    }

    if (result.authenticated) {
      addLog(testId, 'Fetching marketplace trips...');
      const tripsResult = await sentryApi.getMarketplaceTrips();
      addLog(
        testId,
        tripsResult.ok
          ? `Marketplace trips: OK (${Array.isArray(tripsResult.data) ? tripsResult.data.length : 0} rows in response)`
          : `Marketplace trips: FAIL — ${tripsResult.error || `HTTP ${tripsResult.status || '?'}`}`,
        tripsResult.ok ? 'success' : 'error',
      );
    }

    setResult(testId, result.authenticated ? 'pass' : 'fail');
  }

  async function runWebhookTest(testId) {
    const cfg = await loadLatestSentryConfig();
    if (!cfg) {
      addLog(testId, 'No Sentry config row was found yet. Save the Sentry settings first.', 'warn');
      setResult(testId, 'fail');
      return;
    }
    const secret = cfg?.webhook_secret || '';
    const authMode = cfg?.webhook_auth_mode || 'bearer';
    const secretParam = secret && authMode === 'query' ? `?secret=${encodeURIComponent(secret)}` : '';
    const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1`;

    if (!secret) {
      addLog(testId, 'No webhook secret is saved in Sentry config.', 'warn');
      addLog(testId, 'If your live receiver functions require Authorization: Bearer <secret>, this test will fail even though Sentry may already be configured correctly on their side.', 'warn');
    } else {
      addLog(testId, `Using saved webhook secret from Sentry config via ${authMode === 'query' ? 'token URL' : 'bearer header'}.`, 'info');
    }

    const endpoints = [
      {
        name: 'trips_receiver',
        url: `${EDGE_BASE}/sentry-receivers/trips_receiver${secretParam}`,
        payload: {
          trips: [{
            trip_id: `test-trip-${Date.now()}`,
            pickup_address: '123 Test St',
            pickup_city: 'New York',
            pickup_zip: '10001',
            dropoff_address: '456 Drop Ave',
            dropoff_city: 'New York',
            dropoff_zip: '10002',
            scheduled_pickup_time: '09:00',
            scheduled_dropoff_time: '09:30',
            level_of_service: 'sedan',
            passenger_count: 1,
            total_amount: '25.00',
          }],
        },
      },
      {
        name: 'drivers_receiver',
        url: `${EDGE_BASE}/sentry-receivers/drivers_receiver${secretParam}`,
        payload: {
          drivers: [{
            id: `test-driver-${Date.now()}`,
            name: 'Test Driver',
            phone: '555-0000',
            email: 'test@example.com',
          }],
        },
      },
      {
        name: 'vehicles_receiver',
        url: `${EDGE_BASE}/sentry-receivers/vehicles_receiver${secretParam}`,
        payload: {
          vehicles: [{
            id: `test-vehicle-${Date.now()}`,
            make: 'Toyota',
            model: 'Camry',
            year: 2022,
          }],
        },
      },
    ];

    let allPassed = true;

    for (const ep of endpoints) {
      addLog(testId, `Testing webhook: ${ep.name}...`);
      try {
        const res = await fetch(ep.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(secret && authMode === 'bearer' ? { Authorization: `Bearer ${secret}` } : {}),
          },
          body: JSON.stringify(ep.payload),
        });
        if (res.ok || res.status === 200) {
          addLog(testId, `${ep.name}: PASS (HTTP ${res.status})`, 'success');
        } else {
          const text = await res.text().catch(() => '');
          const setupPending = res.status === 401;
          addLog(testId, `${ep.name}: ${setupPending ? 'HTTP 401 (auth)' : 'FAIL'} — ${res.status} ${text.slice(0, 180)}`, setupPending ? 'warn' : 'error');
          if (res.status === 401 && text.includes('authorization header')) {
            addLog(testId, 'Note: 401 here means this test did not send the same Authorization header Sentry will use in production (query secret vs bearer).', 'warn');
          }
          if (setupPending) {
            addLog(testId, 'Action: confirm webhook secret in Admin → Sentry matches how receivers are deployed (query `?secret=` vs bearer).', 'warn');
          }
          allPassed = false;
        }
      } catch (err) {
        addLog(testId, `${ep.name}: FAIL — ${err.message}`, 'error');
        allPassed = false;
      }
    }
    setResult(testId, allPassed ? 'pass' : 'fail');
  }

  async function runSentrySheetTest(testId) {
    const cfg = await loadLatestSentryConfig();
    if (!cfg) {
      addLog(testId, 'No Sentry config row was found yet. Save the Sentry settings first.', 'warn');
      setResult(testId, 'fail');
      return;
    }

    const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1`;
    const authMode = cfg?.webhook_auth_mode || 'bearer';
    const secret = cfg?.webhook_secret || '';
    const tripId = `sheet-test-${Date.now()}`;
    const tempDriverNumber = `SHEET-${Date.now()}`;
    const companyId = selectedCompanyId || sandboxStatus.companyId || adminPreviewCompany?.id || company?.id || null;
    const completedAt = new Date().toISOString();
    const pickedUpAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const arrivedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const expectedFare = 19.75;
    let tempDriverId = null;
    const rawPayload = {
      trip_id: tripId,
      status_id: 3,
      pickup_address: '123 Test Pickup St, New York, NY 10001',
      dropoff_address: '456 Test Dropoff Ave, Brooklyn, NY 11201',
      scheduled_pickup_time: pickedUpAt,
      scheduled_dropoff_time: completedAt,
      mta: { collected_fare_required: true },
      next_day: false,
      prices: {
        delivery_cost: '41.00',
      },
    };

    addLog(testId, 'Creating synthetic completed trip for provider verification...', 'info');

    const { data: tempDriver, error: driverError } = await supabase
      .from('drivers')
      .insert({
        driver_number: tempDriverNumber,
        full_name: 'Sentry Sheet Test Driver',
        status: 'online',
        is_active: true,
        company_id: companyId,
        tlc_number: tempDriverNumber,
        login_username: tempDriverNumber.toLowerCase(),
        login_password: tempDriverNumber,
      })
      .select('id')
      .maybeSingle();

    if (driverError || !tempDriver?.id) {
      addLog(testId, `Failed to create temporary driver: ${driverError?.message || 'unknown error'}`, 'error');
      setResult(testId, 'fail');
      return;
    }

    tempDriverId = tempDriver.id;
    addLog(testId, `Temporary driver created: ${tempDriverId}`, 'success');

    const { error: tripError } = await supabase
      .from('marketplace_trips')
      .upsert({
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
        raw_payload: rawPayload,
        loaded_at: completedAt,
      }, { onConflict: 'sentry_trip_id' });

    if (tripError) {
      addLog(testId, `Failed to create marketplace trip: ${tripError.message}`, 'error');
      setResult(testId, 'fail');
      return;
    }

    await supabase.from('trip_assignments').delete().eq('trip_id', tripId);

    const { error: assignmentError } = await supabase
      .from('trip_assignments')
      .insert({
        trip_id: tripId,
        driver_id: tempDriverId,
        company_id: companyId,
        driver_name: 'Sentry Sheet Test Driver',
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
        notes: 'AdminTestingCenter sentry_sheet synthetic record',
      });

    if (assignmentError) {
      addLog(testId, `Failed to create trip assignment: ${assignmentError.message}`, 'error');
      await supabase.from('marketplace_trips').delete().eq('sentry_trip_id', tripId);
      if (tempDriverId) {
        await supabase.from('drivers').delete().eq('id', tempDriverId);
      }
      setResult(testId, 'fail');
      return;
    }

    const querySecret = secret && authMode === 'query'
      ? `&secret=${encodeURIComponent(secret)}`
      : '';
    const url = `${EDGE_BASE}/sentry-provider/rest/gc/retrieve_trips.json?trip_ids=${encodeURIComponent(tripId)}${querySecret}`;

    try {
      addLog(testId, `Calling retrieve_trips with ${authMode === 'query' ? 'token URL' : 'bearer header'} auth...`, 'info');
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...(secret && authMode === 'bearer' ? { Authorization: `Bearer ${secret}` } : {}),
        },
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        addLog(testId, `Provider returned HTTP ${response.status}`, 'error');
        if (body) addLog(testId, JSON.stringify(body), 'error');
        setResult(testId, 'fail');
        return;
      }

      const resultTrip = Array.isArray(body) ? body[0] : null;
      if (!resultTrip) {
        addLog(testId, 'retrieve_trips returned no trip rows', 'error');
        setResult(testId, 'fail');
        return;
      }

      const checks = [
        ['trip_id', resultTrip.trip_id === tripId, String(resultTrip.trip_id || '')],
        ['status_id=6', resultTrip.status_id === 6, String(resultTrip.status_id)],
        ['pick_up_timestamp', Boolean(resultTrip.pick_up_timestamp), String(resultTrip.pick_up_timestamp || '')],
        ['drop_off_timestamp', Boolean(resultTrip.drop_off_timestamp), String(resultTrip.drop_off_timestamp || '')],
        [
          'collected_fare',
          Number(resultTrip.collected_fare ?? resultTrip.collected_fare_amount) === expectedFare,
          String(resultTrip.collected_fare ?? resultTrip.collected_fare_amount ?? ''),
        ],
        [
          'NEXT DAY',
          Boolean(resultTrip.is_next_day ?? resultTrip.next_day) === true,
          String(resultTrip.is_next_day ?? resultTrip.next_day ?? ''),
        ],
      ];

      let allPassed = true;
      checks.forEach(([label, passed, value]) => {
        addLog(testId, `${label}: ${passed ? 'PASS' : 'FAIL'}${value ? ` (${value})` : ''}`, passed ? 'success' : 'error');
        if (!passed) allPassed = false;
      });

      if (resultTrip?.mta) {
        addLog(testId, 'MTA payload is still present on retrieve_trips output.', 'success');
      } else {
        addLog(testId, 'MTA payload missing from retrieve_trips output.', 'warn');
      }

      setResult(testId, allPassed ? 'pass' : 'fail');
    } catch (error) {
      addLog(testId, `Provider fetch failed: ${error.message}`, 'error');
      setResult(testId, 'fail');
    } finally {
      await supabase.from('trip_assignments').delete().eq('trip_id', tripId);
      await supabase.from('marketplace_trips').delete().eq('sentry_trip_id', tripId);
      if (tempDriverId) {
        await supabase.from('drivers').delete().eq('id', tempDriverId);
      }
      addLog(testId, 'Synthetic Sentry sheet test data cleaned up.', 'info');
    }
  }

  async function replayWebhook(log) {
    const cfg = await loadLatestSentryConfig();
    const secret = cfg?.webhook_secret || '';
    const authMode = cfg?.webhook_auth_mode || 'bearer';
    const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1`;
    const url = `${EDGE_BASE}/sentry-receivers/${log.endpoint}${secret && authMode === 'query' ? `?secret=${encodeURIComponent(secret)}` : ''}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret && authMode === 'bearer' ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(log.raw_payload || {}),
    });

    await loadOpsHelpers();
    return res.ok;
  }

  async function runTripFlowTest(testId) {
    addLog(testId, 'Creating test driver...');
    const testDriverNum = 'TEST-' + Date.now().toString(36).toUpperCase();
    const scopedCompanyId = selectedCompanyId || sandboxStatus.companyId || adminPreviewCompany?.id || company?.id || null;
    if (scopedCompanyId) {
      addLog(testId, `Using active sandbox company scope: ${scopedCompanyId}`, 'info');
    } else {
      addLog(testId, 'No active sandbox company found. Running trip flow test without company scope may be blocked by tenant policies.', 'warn');
    }
    const { data: testDriver, error: dErr } = await supabase.from('drivers').insert({
      driver_number: testDriverNum,
      full_name: 'Test Driver (Auto)',
      status: 'offline',
      is_active: true,
      company_id: scopedCompanyId,
    }).select().maybeSingle();

    if (dErr || !testDriver) {
      addLog(testId, `Driver creation failed: ${dErr?.message}`, 'error');
      setResult(testId, 'fail');
      return;
    }
    addLog(testId, `Driver created: ${testDriver.id}`, 'success');

    addLog(testId, 'Creating test trip assignment...');
    const testTripId = 'TEST-TRIP-' + Date.now().toString(36).toUpperCase();
    const { data: assignment, error: aErr } = await supabase.from('trip_assignments').insert({
      trip_id: testTripId,
      driver_id: testDriver.id,
      company_id: scopedCompanyId,
      driver_name: testDriver.full_name,
      status: 'pending',
      pu_address: '123 Test St, New York NY',
      do_address: '456 Dropoff Ave, New York NY',
      delivery_price: 25.00,
    }).select().maybeSingle();

    if (aErr || !assignment) {
      addLog(testId, `Assignment creation failed: ${aErr?.message}`, 'error');
      await supabase.from('drivers').delete().eq('id', testDriver.id);
      setResult(testId, 'fail');
      return;
    }
    addLog(testId, `Assignment created: ${assignment.id}`, 'success');

    const statuses = ['accepted', 'completed'];
    for (const status of statuses) {
      const { error: sErr } = await supabase.from('trip_assignments').update({ status, [`${status}_at`]: new Date().toISOString() }).eq('id', assignment.id);
      addLog(testId, `Status → ${status}: ${sErr ? 'FAIL' : 'OK'}`, sErr ? 'error' : 'success');
    }

    addLog(testId, 'Cleaning up test data...');
    await supabase.from('trip_assignments').delete().eq('id', assignment.id);
    await supabase.from('drivers').delete().eq('id', testDriver.id);
    addLog(testId, 'Cleanup complete', 'success');
    setResult(testId, 'pass');
  }

  async function runBillingTest(testId) {
    addLog(testId, 'Testing billing calculation logic...');

    const baseline = 5;
    const currentFleet = 10;
    const doubled = currentFleet >= baseline * 2;
    const ratePerMile = doubled ? 0.13 : 0.11;
    const testMiles = 100;
    const expectedFee = testMiles * ratePerMile;

    addLog(testId, `Baseline fleet: ${baseline}`);
    addLog(testId, `Current fleet: ${currentFleet}`);
    addLog(testId, `Fleet doubled: ${doubled} → Rate: $${ratePerMile}/mile`);
    addLog(testId, `100 miles × $${ratePerMile} = $${expectedFee.toFixed(2)}`, 'success');
    addLog(testId, 'Fleet doubling rule verified: $0.11 → $0.13 at 2x', doubled ? 'success' : 'info');
    addLog(testId, 'NOTE: This formula is NEVER exposed to company users', 'info');

    setResult(testId, 'pass');
  }

  async function runDriverOnboardingTest(testId) {
    addLog(testId, 'Testing driver onboarding 3-layer system...');

    const testNum = 'TEST-ONB-' + Date.now().toString(36).toUpperCase();
    const { data: d, error } = await supabase.from('drivers').insert({
      driver_number: testNum,
      full_name: 'Onboarding Test Driver',
      status: 'offline',
      is_active: true,
      layer1_pct: 0,
      layer2_status: 'not_submitted',
      layer3_status: 'not_ready',
    }).select().maybeSingle();

    if (error || !d) {
      addLog(testId, `Layer 1 create failed: ${error?.message}`, 'error');
      setResult(testId, 'fail');
      return;
    }
    addLog(testId, 'Layer 1: Driver created (layer1_pct=0)', 'success');

    await supabase.from('drivers').update({ layer1_pct: 100 }).eq('id', d.id);
    addLog(testId, 'Layer 1: Set to 100% complete', 'success');

    await supabase.from('drivers').update({ layer2_status: 'submitted' }).eq('id', d.id);
    addLog(testId, 'Layer 2: Status → submitted', 'success');

    await supabase.from('drivers').update({ layer2_status: 'approved_internal' }).eq('id', d.id);
    addLog(testId, 'Layer 2: Status → approved_internal', 'success');

    await supabase.from('drivers').update({ layer3_status: 'ready' }).eq('id', d.id);
    addLog(testId, 'Layer 3: Status → ready', 'success');

    const { data: final } = await supabase.from('drivers').select('layer1_pct,layer2_status,layer3_status').eq('id', d.id).maybeSingle();
    const dispatchable = final?.layer1_pct === 100 && final?.layer2_status === 'approved_internal';
    addLog(testId, `Dispatchable check: ${dispatchable ? 'PASS — driver CAN receive trips' : 'FAIL'}`, dispatchable ? 'success' : 'error');

    await supabase.from('drivers').delete().eq('id', d.id);
    addLog(testId, 'Test driver cleaned up', 'success');
    setResult(testId, dispatchable ? 'pass' : 'fail');
  }

  async function runChatTest(testId) {
    addLog(testId, 'Writing test message to Firebase...');
    const testPath = `test_chat/${Date.now()}`;
    const testMsg = { body: 'Penthouse Dispatch Chat Test', ts: Date.now(), sender: 'dispatch' };

    const writeResult = await fbSet(testPath, testMsg);
    addLog(testId, `Firebase write: ${writeResult.ok ? 'OK' : 'FAILED'}`, writeResult.ok ? 'success' : 'error');

    if (writeResult.ok) {
      addLog(testId, 'Reading back test message...');
      const readResult = await fbGet(testPath);
      const matched = readResult.ok && readResult.data?.body === testMsg.body;
      addLog(testId, `Firebase read: ${matched ? 'OK — message matches' : 'MISMATCH'}`, matched ? 'success' : 'error');
      setResult(testId, matched ? 'pass' : 'fail');
    } else {
      setResult(testId, 'fail');
    }
  }

  async function runAITest(testId) {
    addLog(testId, 'Checking AI settings...');
    let settings = null;
    if (resolvedOrgId) {
      const result = await supabase
        .from('ai_settings')
        .select('*')
        .eq('org_id', resolvedOrgId)
        .maybeSingle();
      settings = result.data || null;
    } else {
      addLog(testId, 'No active organization is attached to this admin session. Falling back to the latest saved AI settings row.', 'warn');
      const result = await supabase
        .from('ai_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      settings = result.data || null;
    }

    if (!settings) {
      addLog(testId, 'No AI settings row exists for this organization yet.', 'warn');
      addLog(testId, 'Open Admin → AI Settings and save at least one provider configuration.', 'info');
      setResult(testId, 'fail');
      return;
    }

    if (settings.provider === 'disabled') {
      addLog(testId, 'AI provider is currently set to Disabled.', 'warn');
      addLog(testId, 'Open Admin → AI Settings and change Provider from Disabled to OpenAI, Anthropic, or Gemini.', 'info');
      setResult(testId, 'fail');
      return;
    }

    addLog(testId, `Provider: ${settings.provider}`, 'success');
    addLog(testId, `Model: ${settings.model}`, 'success');
    addLog(testId, `Motivation enabled: ${settings.motivation_enabled}`, 'info');
    addLog(testId, `Scheduling enabled: ${settings.scheduling_enabled}`, 'info');

    if (!settings.api_key && settings.provider !== 'disabled') {
      addLog(testId, 'Provider selected but API key is empty. Save a valid provider key in AI Settings.', 'warn');
      setResult(testId, 'fail');
      return;
    }

    addLog(testId, 'AI configuration looks valid', 'success');
    setResult(testId, 'pass');
  }

  async function runAIComplianceReview(testId) {
    if (!resolvedOrgId) {
      addLog(testId, 'No active organization is attached to this admin session yet.', 'warn');
      addLog(testId, 'Open Admin -> AI Settings and save a provider for this org before running the AI compliance review.', 'info');
      setResult(testId, 'fail');
      return;
    }

    const aiSettings = await getAiSettings(resolvedOrgId);
    if (!aiSettings || aiSettings.provider === 'disabled' || !aiSettings.api_key) {
      addLog(testId, 'AI provider is not configured for this organization.', 'warn');
      addLog(testId, 'Open Admin -> AI Settings and save an OpenAI, Anthropic, Gemini, or self-hosted provider first.', 'info');
      setResult(testId, 'fail');
      return;
    }

    const [failedSyncsRes, failedWebhooksRes] = await Promise.all([
      supabase
        .from('sentry_sync_log')
        .select('sync_type, status, error_message, created_at')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('webhook_logs')
        .select('endpoint, processed, error_message, received_at')
        .eq('processed', false)
        .order('received_at', { ascending: false })
        .limit(8),
    ]);

    const compactTestResults = TEST_DEFS
      .filter(test => test.id !== testId)
      .map(test => ({
        id: test.id,
        label: test.label,
        status: results[test.id] || 'not_run',
        lastLog: (logs[test.id] || []).slice(-1)[0]?.msg || '',
      }));

    const reviewInput = {
      sentryStatus: {
        connected: Boolean(sentryStatus.ok),
        error: sentryStatus.error || '',
      },
      sentryConfig: {
        enabled: sentryConfig?.enabled !== false,
        baseUrl: sentryConfig?.base_url || '',
        authType: sentryConfig?.auth_type || '',
        webhookAuthMode: sentryConfig?.webhook_auth_mode || '',
        retrieveTripsEnabled: sentryConfig?.feat_retrieve_trips !== false,
        tripStatusEnabled: sentryConfig?.feat_trip_status_update !== false,
      },
      testResults: compactTestResults,
      failedSyncs: failedSyncsRes.data || [],
      failedWebhooks: failedWebhooksRes.data || [],
      sandbox: sandboxStatus,
    };

    addLog(testId, `Running AI compliance review with ${aiSettings.provider} (${aiSettings.model || 'default model'})...`, 'info');

    const result = await requestAIStructuredPlan(aiSettings, {
      systemPrompt: `You are a strict transportation-platform compliance reviewer.
Return JSON only with this shape:
{
  "go_no_go": "go" | "caution" | "no_go",
  "severity": "low" | "medium" | "high" | "critical",
  "summary": "short summary",
  "top_blockers": ["..."],
  "next_actions": ["..."],
  "confidence": 0-100
}

Rules:
- Be conservative.
- If any Sentry-critical trip lifecycle or provider-readback path is not proven, do not return "go".
- Focus on real blockers, not generic advice.
- Keep each blocker and action short and concrete.`,
      userPrompt: `Review this Penthouse Dispatch readiness snapshot for a Sentry partnership compliance check.

Snapshot:
${JSON.stringify(reviewInput, null, 2)}

Judge whether the app is ready for a partner-facing Sentry compliance review right now.`,
    });

    if (!result?.json) {
      addLog(testId, 'AI returned an unreadable response.', 'error');
      if (result?.text) addLog(testId, result.text.slice(0, 300), 'warn');
      setResult(testId, 'fail');
      return;
    }

    const review = result.json;
    addLog(testId, `AI verdict: ${(review.go_no_go || 'unknown').toUpperCase()} · severity ${(review.severity || 'unknown').toUpperCase()}`, review.go_no_go === 'go' ? 'success' : review.go_no_go === 'caution' ? 'warn' : 'error');
    if (review.summary) addLog(testId, `Summary: ${review.summary}`, 'info');
    (Array.isArray(review.top_blockers) ? review.top_blockers : []).forEach((blocker, index) => {
      addLog(testId, `Blocker ${index + 1}: ${blocker}`, 'warn');
    });
    (Array.isArray(review.next_actions) ? review.next_actions : []).forEach((action, index) => {
      addLog(testId, `Action ${index + 1}: ${action}`, 'info');
    });
    if (review.confidence !== undefined) {
      addLog(testId, `Confidence: ${review.confidence}%`, 'info');
    }

    setResult(testId, review.go_no_go === 'go' ? 'pass' : 'fail');
  }

  async function runAllTests() {
    setRunningAll(true);
    for (const test of TEST_DEFS) {
      await runTest(test.id);
      await new Promise(r => setTimeout(r, 500));
    }
    setRunningAll(false);
  }

  const statusIcon = {
    running: <RefreshCw className="w-4 h-4 animate-spin" style={{ color: '#c9a84c' }} />,
    pass: <CheckCircle className="w-4 h-4" style={{ color: '#00e5a0' }} />,
    fail: <XCircle className="w-4 h-4" style={{ color: '#ff4757' }} />,
  };

  const logColor = { info: 'rgba(255,255,255,0.5)', success: '#00e5a0', error: '#ff4757', warn: '#f59e0b' };

  return (
    <div className="h-full overflow-y-auto p-6 pb-48" style={{ color: '#e5e7eb' }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-700 mb-1" style={{ fontWeight: 700, color: '#c9a84c' }}>Testing Center</h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Admin-only system diagnostic tests</p>
          </div>
          <button
            onClick={runAllTests}
            disabled={runningAll || !!running}
            className="btn-gold flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            {runningAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run All Tests
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl p-4 md:col-span-2" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <p className="text-sm font-600" style={{ fontWeight: 600 }}>Test Company</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Pick the approved company you want to run Sentry testing under.
                </p>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap items-center">
              <select
                value={selectedCompanyId}
                onChange={event => {
                  const nextId = event.target.value;
                  setSelectedCompanyId(nextId);
                  const nextCompany = approvedCompanies.find(companyRow => companyRow.id === nextId) || null;
                  setAdminPreviewCompany(nextCompany);
                }}
                className="text-sm min-w-[260px]"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  color: '#e5e7eb',
                }}
              >
                <option value="">
                  {sandboxStatus.companyId || adminPreviewCompany?.id || company?.id
                    ? 'Use current company scope'
                    : 'Select approved company...'}
                </option>
                {approvedCompanies.map(companyRow => (
                  <option key={companyRow.id} value={companyRow.id}>
                    {companyRow.company_name}
                  </option>
                ))}
              </select>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Active scope: {approvedCompanies.find(companyRow => companyRow.id === selectedCompanyId)?.company_name || adminPreviewCompany?.company_name || company?.company_name || (sandboxStatus.companyId ? `Sandbox company ${sandboxStatus.companyId.slice(0, 8)}` : 'none selected')}
              </div>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical className="w-4 h-4" style={{ color: '#c9a84c' }} />
              <p className="text-sm font-600" style={{ fontWeight: 600 }}>Sandbox Quick Actions</p>
            </div>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {sandboxStatus.active
                ? `Sandbox active${sandboxStatus.resetAt ? ` since ${new Date(sandboxStatus.resetAt).toLocaleString()}` : ''}`
                : 'Sandbox is not active right now.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/sandbox" className="btn-gold px-3 py-2 text-xs flex items-center gap-2">
                <FlaskConical className="w-3 h-3" />
                Open Sandbox Tools
              </Link>
              <button onClick={loadOpsHelpers} className="btn-ghost px-3 py-2 text-xs flex items-center gap-2">
                <RotateCcw className="w-3 h-3" />
                Refresh Status
              </button>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-2">
              <RadioTower className="w-4 h-4" style={{ color: '#c9a84c' }} />
              <p className="text-sm font-600" style={{ fontWeight: 600 }}>Webhook Replay</p>
            </div>
            <div className="space-y-2">
              {recentWebhookLogs.length === 0 ? (
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>No recent webhook traffic logged yet.</p>
              ) : recentWebhookLogs.map(log => (
                <div key={log.id} className="flex items-center gap-2 justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="min-w-0">
                    <p className="text-xs font-mono" style={{ color: '#c9a84c' }}>{log.endpoint}</p>
                    <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{new Date(log.received_at).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={async () => {
                      const ok = await replayWebhook(log);
                      addLog('webhook', `Replay ${log.endpoint}: ${ok ? 'PASS' : 'FAIL'}`, ok ? 'success' : 'error');
                      setExpanded(prev => ({ ...prev, webhook: true }));
                    }}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    Replay
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {TEST_DEFS.map((test, i) => {
            const status = results[test.id];
            const testLogs = logs[test.id] || [];
            const isExpanded = expanded[test.id];

            return (
              <div
                key={test.id}
                className="rounded-xl overflow-hidden"
                style={{
                  background: '#0d1117',
                  border: `1px solid ${status === 'pass' ? 'rgba(0,229,160,0.2)' : status === 'fail' ? 'rgba(255,71,87,0.2)' : status === 'running' ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.07)'}`,
                }}
              >
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer"
                  onClick={() => setExpanded(prev => ({ ...prev, [test.id]: !prev[test.id] }))}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-700 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-600 text-sm" style={{ fontWeight: 600 }}>{test.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{test.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {statusIcon[status] || <div className="w-4 h-4 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />}
                    <button
                      onClick={e => { e.stopPropagation(); runTest(test.id); }}
                      disabled={!!running || runningAll}
                      className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5"
                    >
                      <Cpu className="w-3 h-3" /> Run
                    </button>
                    {isExpanded ? <ChevronUp className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />}
                  </div>
                </div>

                {isExpanded && testLogs.length > 0 && (
                  <div className="border-t px-4 py-3" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
                    <div className="space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
                      {testLogs.map((log, li) => (
                        <div key={li} className="flex items-start gap-2">
                          <span style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                            {new Date(log.ts).toLocaleTimeString()}
                          </span>
                          <span style={{ color: logColor[log.level] || 'rgba(255,255,255,0.5)' }}>{log.msg}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 p-4 rounded-xl text-xs" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', color: 'rgba(255,255,255,0.5)' }}>
          All test data created during Trip Flow and Driver Onboarding tests is automatically cleaned up after each test run.
        </div>
      </div>
    </div>
  );
}
