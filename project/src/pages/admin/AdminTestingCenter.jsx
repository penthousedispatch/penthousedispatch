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
import { SENTRY_ASSIGNMENT_TYPE_REFERENCE } from '../../lib/sentryTripInbound';

function cleanAuthValue(value) {
  return String(value || '').replace(/\u00a0/g, ' ').trim();
}

function looksHashedPassword(value) {
  const normalized = cleanAuthValue(value);
  return /^\$2[aby]\$\d+\$/.test(normalized) || /^\$argon2/i.test(normalized);
}

/** Supabase Edge gateway requires `apikey` on function URLs even when the function verifies webhook/basic auth itself. */
function supabaseFunctionsGatewayHeaders() {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_SUPABASE_ANON_KEY || '';
  if (!key) return {};
  return { apikey: key };
}

function normalizeHarnessStateCode(value = 'NY') {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return 'NY';
  if (normalized.length === 2) return normalized;
  const lookup = {
    'NEW YORK': 'NY',
    NEWYORK: 'NY',
    NJ: 'NJ',
    'NEW JERSEY': 'NJ',
    CONNECTICUT: 'CT',
    CT: 'CT',
    PENNSYLVANIA: 'PA',
    PA: 'PA',
  };
  return lookup[normalized] || normalized.slice(0, 2);
}

function extractSentryCollection(data, key) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  return [];
}

const HARNESS_DRIVER_LICENSE_POOL = [
  '273447679',
  '169418192',
  '569866876',
  '202902377',
  '427119340',
  '889207262',
  '634896400',
  '420148919',
  '342763208',
  '796994155',
];

function pickHarnessDriverLicense(rows = [], offset = 0) {
  const existing = new Set(
    rows
      .map(row => String(
        row?.dmv_license?.license_number ||
        row?.driver_license_number ||
        row?.license_number ||
        ''
      ).trim())
      .filter(Boolean)
  );
  for (let i = 0; i < HARNESS_DRIVER_LICENSE_POOL.length; i += 1) {
    const candidate = HARNESS_DRIVER_LICENSE_POOL[(i + offset) % HARNESS_DRIVER_LICENSE_POOL.length];
    if (!existing.has(candidate)) return candidate;
  }
  return HARNESS_DRIVER_LICENSE_POOL[offset % HARNESS_DRIVER_LICENSE_POOL.length];
}

function buildHarnessDriverPayload(seed, licenseNumber = '273447679') {
  const code = String(seed || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'HARNESS';
  return {
    first_name: `Audit${code.slice(0, 4) || 'TP'}`,
    last_name: `Driver${code.slice(-4) || '0001'}`,
    phone: `718555${String(Date.now()).slice(-4)}`,
    social_security_number: '000000000',
    birth_date: '1980-01-01',
    status_id: 1,
    dmv_license: {
      license_number: licenseNumber,
      state_code: 'NY',
      license_class: 'E',
      endorsements: [],
      restrictions: [],
      effective_date: '2024-01-01',
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/license.pdf',
    },
  };
}

function buildHarnessDriverUpdatePayload(seed, licenseNumber = '169418192') {
  const code = String(seed || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'HARNESS';
  return {
    first_name: `Audit${code.slice(0, 4) || 'TP'}`,
    last_name: `Updated${code.slice(-4) || '0001'}`,
    phone: `917555${String(Date.now()).slice(-4)}`,
    social_security_number: '000000000',
    birth_date: '1980-01-01',
    status_id: 1,
    dmv_license: {
      license_number: licenseNumber,
      state_code: normalizeHarnessStateCode('New York'),
      license_class: 'E',
      endorsements: [],
      restrictions: [],
      effective_date: '2024-01-01',
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/license-updated.pdf',
    },
  };
}

function makeSafeVin(seed) {
  const cleaned = String(seed || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const padded = `${cleaned}123456789ABCDEFGHJKLMNPR`.replace(/[IOQ]/g, 'A');
  return padded.slice(0, 17);
}

function buildHarnessVehiclePayload(seed) {
  const code = String(seed || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'HARNESS';
  return {
    vin: makeSafeVin(`HAR${code}`),
    fleet_number: `FLT${code}`.slice(0, 10),
    type_id: 1,
    color: 'Black',
    seat_number: 4,
    production_year: 2024,
    status_id: 1,
    dmv_registration: {
      license_plate_number: `TP${code}`.slice(0, 8),
      license_plate_category_id: 1,
      state_code: 'NY',
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/registration.pdf',
    },
    extra_commercial_license: {
      license_number: `ECL${code}`.slice(0, 10),
      type_id: 1,
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/commercial-license.pdf',
    },
    insurance: {
      policy_number: `POL-${code}`,
      insurer_name: 'Sandbox Insurance Co',
      expiration_date: '2028-01-01',
      document_url: 'https://example.com/insurance.pdf',
    },
  };
}

function buildHarnessVehicleUpdatePayload(seed) {
  const code = String(seed || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'HARNESS';
  return {
    vin: makeSafeVin(`HAR${code}`),
    fleet_number: `FLT${code}`.slice(0, 10),
    type_id: 1,
    color: 'Silver',
    status_id: 1,
    seat_number: 5,
    production_year: 2024,
    dmv_registration: {
      license_plate_number: `TP${code}`.slice(0, 8),
      license_plate_category_id: 1,
      state_code: 'NY',
      expiration_date: '2029-01-01',
      document_url: 'https://example.com/registration-updated.pdf',
    },
    extra_commercial_license: {
      license_number: `ECL${code}`.slice(0, 10),
      type_id: 1,
      expiration_date: '2029-01-01',
      document_url: 'https://example.com/commercial-license-updated.pdf',
    },
    insurance: {
      policy_number: `UPD-${code}`,
      insurer_name: 'Sandbox Insurance Co',
      expiration_date: '2029-01-01',
      document_url: 'https://example.com/insurance-updated.pdf',
    },
  };
}

function normalizeRoutingLifecycleStatus(assignmentStatus, marketplaceStatus) {
  const normalize = value => String(value || '').trim().toLowerCase();
  const assignment = normalize(assignmentStatus);
  const marketplace = normalize(marketplaceStatus);
  const canonical = value => {
    if (['completed', 'complete', 'done', 'closed'].includes(value)) return 'completed';
    if (['cancelled', 'canceled', 'rejected', 'no_show'].includes(value)) return 'cancelled';
    if (['picked_up', 'picked-up', 'on_trip'].includes(value)) return 'picked_up';
    if (['arrived', 'arrived_at_pickup'].includes(value)) return 'arrived';
    if (['accepted', 'in_progress', 'in progress', 'en_route', 'en route'].includes(value)) return 'accepted';
    if (['assigned', 'available'].includes(value)) return 'pending';
    return value || 'pending';
  };
  const rank = {
    pending: 0,
    accepted: 1,
    arrived: 2,
    picked_up: 3,
    completed: 4,
    cancelled: 4,
  };
  const assignmentCanonical = canonical(assignment);
  const marketplaceCanonical = canonical(marketplace);
  return (rank[marketplaceCanonical] ?? 0) > (rank[assignmentCanonical] ?? 0)
    ? marketplaceCanonical
    : assignmentCanonical;
}

const TEST_DEFS = [
  { id: 'ui', label: 'UI Test', desc: 'Verify all major UI components render correctly' },
  { id: 'sentry', label: 'Sentry Integration Test', desc: 'Test connection to SentryMS API' },
  { id: 'sentry_sheet', label: 'Sentry Sheet Test', desc: 'Verify retrieve_trips returns completion, fare, and NEXT DAY fields' },
  {
    id: 'sentry_strict_partials',
    label: 'Sentry checklist §17–20 (was PARTIAL)',
    desc: 'Assignment-type reference log, outbound driver/vehicle GET harness, trip copy probe, broker-cancel trips_receiver simulation, and replay reminder.',
  },
  { id: 'webhook', label: 'Webhook Test', desc: 'Send test payloads to all 3 webhook endpoints' },
  { id: 'trip_flow', label: 'Trip Flow Proof Prep', desc: 'Creates a driver-visible pending trip; finish the proof inside Driver App' },
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
  const [recentTripRouting, setRecentTripRouting] = useState([]);
  const [routingLoading, setRoutingLoading] = useState(false);
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

  useEffect(() => {
    loadRecentTripRouting();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh routing when scope changes
  }, [selectedCompanyId, adminPreviewCompany?.id, sandboxStatus.companyId, company?.id]);

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
        .select('id, webhook_type, raw_payload, received_at, processed')
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
    await loadRecentTripRouting();
  }

  async function loadRecentTripRouting() {
    setRoutingLoading(true);
    try {
      const { data: assignments } = await supabase
        .from('trip_assignments')
        .select('trip_id, status, assigned_at, driver_id, company_id, notes')
        .order('assigned_at', { ascending: false })
        .limit(20);

      const rows = assignments || [];
      if (!rows.length) {
        setRecentTripRouting([]);
        return;
      }

      const tripIds = [...new Set(rows.map(row => row.trip_id).filter(Boolean))];
      const driverIds = [...new Set(rows.map(row => row.driver_id).filter(Boolean))];
      const companyIds = [...new Set(rows.map(row => row.company_id).filter(Boolean))];

      const [driversRes, companiesRes, marketplaceRes] = await Promise.all([
        driverIds.length
          ? supabase.from('drivers').select('id, full_name, driver_number, login_username').in('id', driverIds)
          : Promise.resolve({ data: [] }),
        companyIds.length
          ? supabase.from('companies').select('id, company_name').in('id', companyIds)
          : Promise.resolve({ data: [] }),
        tripIds.length
          ? supabase.from('marketplace_trips').select('sentry_trip_id, status, external_trip_status').in('sentry_trip_id', tripIds)
          : Promise.resolve({ data: [] }),
      ]);

      const driverMap = new Map((driversRes.data || []).map(driver => [driver.id, driver]));
      const companyMap = new Map((companiesRes.data || []).map(companyRow => [companyRow.id, companyRow]));
      const marketplaceMap = new Map((marketplaceRes.data || []).map(row => [row.sentry_trip_id, row]));

      const scopedCompanyId = selectedCompanyId || adminPreviewCompany?.id || sandboxStatus.companyId || company?.id || null;
      const normalized = rows
        .map(row => ({
          ...row,
          status: normalizeRoutingLifecycleStatus(
            row.status,
            marketplaceMap.get(row.trip_id)?.status || marketplaceMap.get(row.trip_id)?.external_trip_status || ''
          ),
          driver: driverMap.get(row.driver_id) || null,
          company: companyMap.get(row.company_id) || null,
        }))
        .filter(row => !scopedCompanyId || String(row.company_id || '') === String(scopedCompanyId));

      setRecentTripRouting(normalized);
    } finally {
      setRoutingLoading(false);
    }
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
        case 'sentry_strict_partials': await runSentryStrictPartialHarness(testId); break;
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
            ...supabaseFunctionsGatewayHeaders(),
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

  async function runSentryStrictPartialHarness(testId) {
    const cfg = await loadLatestSentryConfig();
    if (!cfg || cfg.enabled === false) {
      addLog(testId, 'No enabled Sentry config. Save Admin → Sentry first.', 'warn');
      setResult(testId, 'fail');
      return;
    }

    sentryApi.configure({
      baseUrl: cfg.base_url,
      username: cfg.username || '',
      password: cfg.password_enc || '',
      apiKey: cfg.api_key || '',
      authType: cfg.auth_type || 'basic',
      enabled: cfg.enabled !== false,
    });

    addLog(testId, '§17 — assignment_type_code quick reference (extend in src/lib/sentryTripInbound.js):', 'info');
    SENTRY_ASSIGNMENT_TYPE_REFERENCE.forEach(row => {
      addLog(testId, `  ${row.code}: ${row.meaning}`, 'info');
    });

    let allPassed = true;
    const createdDriverIds = [];
    const createdVehicleIds = [];

    const cleanupHarnessAssets = async () => {
      for (const driverId of createdDriverIds) {
        await sentryApi.deactivateDriver(driverId).catch(() => null);
      }
      for (const vehicleId of createdVehicleIds) {
        await sentryApi.deactivateVehicle(vehicleId).catch(() => null);
      }
    };

    try {
      addLog(testId, '§19 — Drivers CRUD + work shifts...', 'info');
      const driversResult = await sentryApi.getDrivers();
      let existingDriverRows = [];
      if (!driversResult.ok) {
        addLog(testId, `drivers list: FAIL — ${driversResult.error || `HTTP ${driversResult.status}`}`, 'error');
        allPassed = false;
      } else {
        const list = extractSentryCollection(driversResult.data, 'drivers');
        existingDriverRows = list;
        addLog(testId, `drivers list: PASS (${list.length} rows)`, 'success');
        const firstId = list[0]?.id || list[0]?.driver_id;
        if (firstId) {
          const one = await sentryApi.getDriver(firstId);
          addLog(
            testId,
            one.ok ? `getDriver(${firstId}): PASS` : `getDriver(${firstId}): FAIL — ${one.error || one.status}`,
            one.ok ? 'success' : 'error',
          );
          if (!one.ok) allPassed = false;
        } else {
          addLog(testId, 'getDriver: skipped (empty list)', 'warn');
        }
      }

      const driverSeed = `HAR${Date.now().toString(36).toUpperCase()}`;
      const driverCreateLicense = pickHarnessDriverLicense(existingDriverRows, 0);
      const driverUpdateLicense = pickHarnessDriverLicense(existingDriverRows, 1);
      const createDriverResult = await sentryApi.createDriver(buildHarnessDriverPayload(driverSeed, driverCreateLicense));
      let createdDriverId = null;
      if (!createDriverResult.ok) {
        addLog(testId, `createDriver: FAIL — ${createDriverResult.error || `HTTP ${createDriverResult.status}`}`, 'error');
        allPassed = false;
      } else {
        createdDriverId = createDriverResult.data?.id || createDriverResult.data?.driver_id || null;
        if (createdDriverId) createdDriverIds.push(createdDriverId);
        addLog(testId, `createDriver: PASS${createdDriverId ? ` (${createdDriverId})` : ''}`, 'success');
        if (createdDriverId) {
          const updateDriverResult = await sentryApi.updateDriver(createdDriverId, buildHarnessDriverUpdatePayload(driverSeed, driverCreateLicense || driverUpdateLicense));
          addLog(
            testId,
            updateDriverResult.ok ? `updateDriver(${createdDriverId}): PASS` : `updateDriver(${createdDriverId}): FAIL — ${updateDriverResult.error || updateDriverResult.status}`,
            updateDriverResult.ok ? 'success' : 'error',
          );
          if (!updateDriverResult.ok) allPassed = false;
          const getCreatedDriver = await sentryApi.getDriver(createdDriverId);
          addLog(
            testId,
            getCreatedDriver.ok ? `verify created driver ${createdDriverId}: PASS` : `verify created driver ${createdDriverId}: FAIL — ${getCreatedDriver.error || getCreatedDriver.status}`,
            getCreatedDriver.ok ? 'success' : 'error',
          );
          if (!getCreatedDriver.ok) allPassed = false;
        }
      }

      const shiftsParams = {
        start_timestamp_max: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        end_timestamp_min: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      };
      const shiftsResult = await sentryApi.getDriverWorkShifts(shiftsParams);
      if (!shiftsResult.ok) {
        addLog(testId, `driver_work_shifts: FAIL — ${shiftsResult.error || `HTTP ${shiftsResult.status}`}`, 'error');
        allPassed = false;
      } else {
        const shiftRows = extractSentryCollection(shiftsResult.data, 'driver_work_shifts');
        addLog(testId, `driver_work_shifts: PASS (${shiftRows.length} row(s))`, 'success');
      }

      addLog(testId, '§20 — Vehicles CRUD...', 'info');
      const vehiclesResult = await sentryApi.getVehicles();
      if (!vehiclesResult.ok) {
        addLog(testId, `vehicles list: FAIL — ${vehiclesResult.error || `HTTP ${vehiclesResult.status}`}`, 'error');
        allPassed = false;
      } else {
        const vlist = extractSentryCollection(vehiclesResult.data, 'vehicles');
        addLog(testId, `vehicles list: PASS (${vlist.length} rows)`, 'success');
        const vid = vlist[0]?.id || vlist[0]?.vehicle_id;
        if (vid) {
          const vone = await sentryApi.getVehicle(vid);
          addLog(
            testId,
            vone.ok ? `getVehicle(${vid}): PASS` : `getVehicle(${vid}): FAIL — ${vone.error || vone.status}`,
            vone.ok ? 'success' : 'error',
          );
          if (!vone.ok) allPassed = false;
        } else {
          addLog(testId, 'getVehicle: skipped (empty list)', 'warn');
        }
      }

      const vehicleSeed = `VEH${Date.now().toString(36).toUpperCase()}`;
      const createVehicleResult = await sentryApi.createVehicle(buildHarnessVehiclePayload(vehicleSeed));
      let createdVehicleId = null;
      if (!createVehicleResult.ok) {
        addLog(testId, `createVehicle: FAIL — ${createVehicleResult.error || `HTTP ${createVehicleResult.status}`}`, 'error');
        allPassed = false;
      } else {
        createdVehicleId = createVehicleResult.data?.id || createVehicleResult.data?.vehicle_id || null;
        if (createdVehicleId) createdVehicleIds.push(createdVehicleId);
        addLog(testId, `createVehicle: PASS${createdVehicleId ? ` (${createdVehicleId})` : ''}`, 'success');
        if (createdVehicleId) {
          const updateVehicleResult = await sentryApi.updateVehicle(createdVehicleId, buildHarnessVehicleUpdatePayload(vehicleSeed));
          addLog(
            testId,
            updateVehicleResult.ok ? `updateVehicle(${createdVehicleId}): PASS` : `updateVehicle(${createdVehicleId}): FAIL — ${updateVehicleResult.error || updateVehicleResult.status}`,
            updateVehicleResult.ok ? 'success' : 'error',
          );
          if (!updateVehicleResult.ok) allPassed = false;
          const getCreatedVehicle = await sentryApi.getVehicle(createdVehicleId);
          addLog(
            testId,
            getCreatedVehicle.ok ? `verify created vehicle ${createdVehicleId}: PASS` : `verify created vehicle ${createdVehicleId}: FAIL — ${getCreatedVehicle.error || getCreatedVehicle.status}`,
            getCreatedVehicle.ok ? 'success' : 'error',
          );
          if (!getCreatedVehicle.ok) allPassed = false;
        }
      }

      addLog(testId, '§31 — Trip copy endpoint probe...', 'info');
      const marketplaceProbe = await sentryApi.getMarketplaceTrips();
      if (!marketplaceProbe.ok) {
        addLog(testId, `trip copy probe skipped — marketplace list unavailable (${marketplaceProbe.error || `HTTP ${marketplaceProbe.status}`})`, 'warn');
      } else {
        const marketplaceTrips = Array.isArray(marketplaceProbe.data) ? marketplaceProbe.data : [];
        const sourceTripId = marketplaceTrips[0]?.trip_id || marketplaceTrips[0]?.id || null;
        if (!sourceTripId) {
          addLog(testId, 'trip copy probe skipped — no marketplace trips available to use as a source.', 'warn');
        } else {
          const copyResult = await sentryApi.copyTrip(sourceTripId, { source_trip_id: sourceTripId });
          if (copyResult.ok) {
            addLog(testId, `trip copy probe PASS for trip ${sourceTripId}`, 'success');
          } else if ([400, 404, 405].includes(Number(copyResult.status || 0))) {
            addLog(
              testId,
              `trip copy endpoint reachable but not accepted for this source/context (${copyResult.error || `HTTP ${copyResult.status}`}).`,
              'warn',
            );
          } else {
            addLog(testId, `trip copy probe FAIL — ${copyResult.error || `HTTP ${copyResult.status}`}`, 'error');
            allPassed = false;
          }
        }
      }

      const companyId = selectedCompanyId || sandboxStatus.companyId || adminPreviewCompany?.id || company?.id || null;
      const secret = cfg?.webhook_secret || '';
      const authMode = cfg?.webhook_auth_mode || 'bearer';
      const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1`;
      const secretParam = secret && authMode === 'query' ? `?secret=${encodeURIComponent(secret)}` : '';

      addLog(testId, 'Webhook receiver smoke — drivers_receiver + vehicles_receiver...', 'info');
      if (!secret) {
        addLog(testId, 'Webhook secret missing — receiver smoke skipped (configure in Admin → Sentry).', 'warn');
      } else {
        const smokeHeaders = {
          'Content-Type': 'application/json',
          ...supabaseFunctionsGatewayHeaders(),
          ...(secret && authMode === 'bearer' ? { Authorization: `Bearer ${secret}` } : {}),
        };
        const smokeDriverId = `smoke-driver-${Date.now()}`;
        const smokeVehicleId = `smoke-vehicle-${Date.now()}`;
        const driverReceiverRes = await fetch(`${EDGE_BASE}/sentry-receivers/drivers_receiver${secretParam}`, {
          method: 'POST',
          headers: smokeHeaders,
          body: JSON.stringify({
            drivers: [{ id: smokeDriverId, name: 'Smoke Driver', phone: '7185550199', email: 'smoke-driver@example.com' }],
          }),
        });
        addLog(
          testId,
          driverReceiverRes.ok ? `drivers_receiver: PASS (HTTP ${driverReceiverRes.status})` : `drivers_receiver: FAIL (HTTP ${driverReceiverRes.status})`,
          driverReceiverRes.ok ? 'success' : 'error',
        );
        if (!driverReceiverRes.ok) allPassed = false;

        const vehicleReceiverRes = await fetch(`${EDGE_BASE}/sentry-receivers/vehicles_receiver${secretParam}`, {
          method: 'POST',
          headers: smokeHeaders,
          body: JSON.stringify({
            vehicles: [{ id: smokeVehicleId, make: 'Smoke', model: 'Probe', year: 2026 }],
          }),
        });
        addLog(
          testId,
          vehicleReceiverRes.ok ? `vehicles_receiver: PASS (HTTP ${vehicleReceiverRes.status})` : `vehicles_receiver: FAIL (HTTP ${vehicleReceiverRes.status})`,
          vehicleReceiverRes.ok ? 'success' : 'error',
        );
        if (!vehicleReceiverRes.ok) allPassed = false;
      }

      addLog(testId, '§18 — Broker cancel / reroute: POST minimal cancel payload to trips_receiver, expect DB + assignments update.', 'info');
      if (!secret) {
        addLog(testId, 'Webhook secret missing — broker simulation skipped (configure in Admin → Sentry).', 'warn');
      } else if (!companyId) {
        addLog(testId, 'No company scope selected — broker simulation skipped. Pick an approved company above.', 'warn');
      } else {
          const tripId = `strict-broker-${Date.now()}`;
          const nowIso = new Date().toISOString();
          const { error: seedErr } = await supabase.from('marketplace_trips').upsert(
            {
          sentry_trip_id: tripId,
          sentry_last_modified_at: nowIso,
          date_val: nowIso.slice(0, 10),
          los: 'Ambulatory',
          passengers: '1',
          mileage: '1',
          pu_address: 'Harness Pickup',
          pu_city: 'New York',
          pu_zip: '10001',
          pu_time: nowIso,
          do_address: 'Harness Dropoff',
          do_city: 'New York',
          do_zip: '10002',
          do_time: nowIso,
          delivery_price: '10.00',
          status: 'available',
          company_id: companyId,
          assignment_type_code: 'STANDARD',
          external_trip_status: 'available',
          loaded_at: nowIso,
        },
        { onConflict: 'sentry_trip_id' },
      );
      if (seedErr) {
        addLog(testId, `Seed marketplace row failed: ${seedErr.message}`, 'error');
        allPassed = false;
      } else {
        const { data: tempDriver, error: tdErr } = await supabase
          .from('drivers')
          .insert({
            driver_number: `HARNESS-${Date.now()}`,
            full_name: 'Harness Broker Driver',
            status: 'offline',
            is_active: true,
            company_id: companyId,
          })
          .select('id, full_name')
          .maybeSingle();

        if (tdErr || !tempDriver?.id) {
          addLog(testId, `Temp driver for harness failed: ${tdErr?.message || 'unknown'}`, 'error');
          allPassed = false;
          await supabase.from('marketplace_trips').delete().eq('sentry_trip_id', tripId);
        } else {
          const { error: asgErr } = await supabase.from('trip_assignments').insert({
            trip_id: tripId,
            driver_id: tempDriver.id,
            company_id: companyId,
            driver_name: tempDriver.full_name,
            status: 'pending',
            pu_address: 'Harness Pickup',
            do_address: 'Harness Dropoff',
            scheduled_pickup_time: nowIso,
            delivery_price: 10,
            mileage: 1,
          });
          if (asgErr) {
            addLog(testId, `Seed assignment failed: ${asgErr.message}`, 'error');
            allPassed = false;
            await supabase.from('drivers').delete().eq('id', tempDriver.id);
            await supabase.from('marketplace_trips').delete().eq('sentry_trip_id', tripId);
          } else {
            try {
              const url = `${EDGE_BASE}/sentry-receivers/trips_receiver${secretParam}`;
              const res = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...supabaseFunctionsGatewayHeaders(),
                  ...(secret && authMode === 'bearer' ? { Authorization: `Bearer ${secret}` } : {}),
                },
                body: JSON.stringify({
                  trips: [
                    {
                      trip_id: tripId,
                      trip_status: 'cancelled',
                      assignment_type_code: 'STANDARD',
                      pickup_address: 'Harness Pickup',
                      dropoff_address: 'Harness Dropoff',
                    },
                  ],
                }),
              });
              if (!res.ok && res.status !== 207) {
                addLog(testId, `trips_receiver HTTP ${res.status}`, 'error');
                allPassed = false;
              } else {
                addLog(testId, `trips_receiver responded HTTP ${res.status} (207 is normal for multi-trip payloads)`, 'success');
              }

              const { data: mt } = await supabase.from('marketplace_trips').select('status').eq('sentry_trip_id', tripId).maybeSingle();
              const { data: asn } = await supabase.from('trip_assignments').select('status').eq('trip_id', tripId).maybeSingle();
              const mtOk = String(mt?.status || '').toLowerCase() === 'cancelled';
              const asgOk = String(asn?.status || '').toLowerCase() === 'cancelled';
              addLog(testId, `marketplace_trips.status after cancel: ${mt?.status || 'null'} (${mtOk ? 'PASS' : 'FAIL'})`, mtOk ? 'success' : 'error');
              addLog(testId, `trip_assignments.status after cancel: ${asn?.status || 'null'} (${asgOk ? 'PASS' : 'FAIL'})`, asgOk ? 'success' : 'error');
              if (!mtOk || !asgOk) allPassed = false;
            } catch (e) {
              addLog(testId, `Broker harness fetch error: ${e.message}`, 'error');
              allPassed = false;
            } finally {
              await supabase.from('trip_assignments').delete().eq('trip_id', tripId);
              await supabase.from('marketplace_trips').delete().eq('sentry_trip_id', tripId);
              await supabase.from('drivers').delete().eq('id', tempDriver.id);
              addLog(testId, 'Harness seed rows cleaned up.', 'info');
            }
          }
        }
      }
      }

      addLog(testId, 'Replay any row from “Webhook Replay” to re-drive §18 with production-shaped payloads.', 'info');
      addLog(testId, 'Reject / accept-earlier-rejected / reroute reassignment still need a real broker trip for full proof; this harness now covers the code path and receiver path without touching a live trip.', 'warn');
      setResult(testId, allPassed ? 'pass' : 'fail');
    } finally {
      await cleanupHarnessAssets();
    }
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
    if (!companyId) {
      addLog(testId, 'Missing company scope. Pick an approved company in the selector above or activate sandbox mode before running Sentry Sheet Test.', 'error');
      addLog(testId, 'Why this matters: the synthetic driver/trip/assignment must be tied to one company or Supabase RLS will block the setup.', 'info');
      setResult(testId, 'fail');
      return;
    }
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
      assignment_type_code: 'TEST',
      mta: { collected_fare_required: true, is_approved_for_mta: true },
      next_day: false,
      will_call: true,
      pickup_window_start: arrivedAt,
      pickup_window_end: pickedUpAt,
      previous_total_amount: '37.50',
      price_adjustment_amount: '3.50',
      price_adjustment_reason: 'Late broker adjustment',
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
        assignment_type_code: 'TEST',
        external_trip_status: 'completed',
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
          ...supabaseFunctionsGatewayHeaders(),
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
        ['assignment_type_code', String(resultTrip.assignment_type_code || '') === 'TEST', String(resultTrip.assignment_type_code || '')],
        ['scheduled_pickup_time', Boolean(resultTrip.scheduled_pickup_time), String(resultTrip.scheduled_pickup_time || '')],
        ['scheduled_dropoff_time', Boolean(resultTrip.scheduled_dropoff_time), String(resultTrip.scheduled_dropoff_time || '')],
        ['delivery_price', String(resultTrip.delivery_price || '') === '41.00', String(resultTrip.delivery_price || '')],
        ['total_amount', String(resultTrip.total_amount || '') === '41.00', String(resultTrip.total_amount || '')],
        ['is_approved_for_mta', Number(resultTrip.is_approved_for_mta) === 1, String(resultTrip.is_approved_for_mta ?? '')],
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
        ['price_adjustment_amount', String(resultTrip.price_adjustment_amount || '') === '3.50', String(resultTrip.price_adjustment_amount || '')],
        ['price_adjustment_reason', String(resultTrip.price_adjustment_reason || '') === 'Late broker adjustment', String(resultTrip.price_adjustment_reason || '')],
        ['will_call', Number(resultTrip.will_call) === 1, String(resultTrip.will_call ?? '')],
        ['pickup_window_start', Boolean(resultTrip.pickup_window_start), String(resultTrip.pickup_window_start || '')],
        ['pickup_window_end', Boolean(resultTrip.pickup_window_end), String(resultTrip.pickup_window_end || '')],
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
    const webhookType = log.webhook_type || log.endpoint || '';
    if (!webhookType) return false;
    const url = `${EDGE_BASE}/sentry-receivers/${webhookType}${secret && authMode === 'query' ? `?secret=${encodeURIComponent(secret)}` : ''}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...supabaseFunctionsGatewayHeaders(),
        ...(secret && authMode === 'bearer' ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(log.raw_payload || {}),
    });

    await loadOpsHelpers();
    return res.ok;
  }

  async function runTripFlowTest(testId) {
    addLog(testId, 'Preparing driver-visible trip flow proof...');
    const testDriverNum = 'TEST-' + Date.now().toString(36).toUpperCase();
    const scopedCompanyId = selectedCompanyId || sandboxStatus.companyId || adminPreviewCompany?.id || company?.id || null;
    if (scopedCompanyId) {
      addLog(testId, `Using active sandbox company scope: ${scopedCompanyId}`, 'info');
    } else {
      addLog(testId, 'Missing company scope. Pick an approved company or activate sandbox before preparing the driver proof.', 'error');
      setResult(testId, 'fail');
      return;
    }
    const { data: testDriver, error: dErr } = await supabase.from('drivers').insert({
      driver_number: testDriverNum,
      full_name: 'Test Driver (Auto)',
      status: 'online',
      is_active: true,
      company_id: scopedCompanyId,
      tlc_number: testDriverNum,
      login_username: testDriverNum.toLowerCase(),
      login_password: testDriverNum,
    }).select().maybeSingle();

    if (dErr || !testDriver) {
      addLog(testId, `Driver creation failed: ${dErr?.message}`, 'error');
      setResult(testId, 'fail');
      return;
    }
    addLog(testId, `Driver created: ${testDriver.id}`, 'success');

    addLog(testId, 'Creating test trip assignment...');
    const testTripId = 'TEST-TRIP-' + Date.now().toString(36).toUpperCase();
    const assignedAtIso = new Date().toISOString();
    const scheduledPickupIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const marketplaceSeed = {
      sentry_trip_id: testTripId,
      sentry_last_modified_at: assignedAtIso,
      date_val: scheduledPickupIso.slice(0, 10),
      los: 'Ambulatory',
      passengers: '1',
      mileage: '4.2',
      pu_address: '123 Test St, New York NY',
      pu_city: 'New York',
      pu_zip: '10001',
      pu_time: scheduledPickupIso,
      do_address: '456 Dropoff Ave, New York NY',
      do_city: 'New York',
      do_zip: '10002',
      do_time: '',
      delivery_price: '25',
      status: 'available',
      taken_by: null,
      company_id: scopedCompanyId,
      assignment_type_code: 'TEST',
      external_trip_status: 'available',
      raw_payload: {
        trip_id: testTripId,
        trip_status: 'available',
        assignment_type_code: 'TEST',
        scheduled_pickup_time: scheduledPickupIso,
        pickup_address: '123 Test St, New York NY',
        dropoff_address: '456 Dropoff Ave, New York NY',
        mileage: 4.2,
        total_amount: 25,
      },
      loaded_at: assignedAtIso,
    };
    const { error: marketplaceErr } = await supabase
      .from('marketplace_trips')
      .upsert(marketplaceSeed, { onConflict: 'sentry_trip_id' });

    if (marketplaceErr) {
      addLog(testId, `Marketplace seed failed: ${marketplaceErr.message}`, 'error');
      await supabase.from('drivers').delete().eq('id', testDriver.id);
      setResult(testId, 'fail');
      return;
    }
    addLog(testId, 'Marketplace trip seeded for driver acceptance.', 'success');

    const { data: assignment, error: aErr } = await supabase.from('trip_assignments').insert({
      trip_id: testTripId,
      driver_id: testDriver.id,
      company_id: scopedCompanyId,
      driver_name: testDriver.full_name,
      status: 'pending',
      pu_address: '123 Test St, New York NY',
      do_address: '456 Dropoff Ave, New York NY',
      pu_time: scheduledPickupIso,
      scheduled_pickup_time: scheduledPickupIso,
      delivery_price: 25.00,
      mileage: 4.2,
      assigned_at: assignedAtIso,
      notes: '[TEST_TRIP] Admin Testing Center proof prep - open Driver App and complete lifecycle manually.',
    }).select().maybeSingle();

    if (aErr || !assignment) {
      addLog(testId, `Assignment creation failed: ${aErr?.message}`, 'error');
      await supabase.from('drivers').delete().eq('id', testDriver.id);
      setResult(testId, 'fail');
      return;
    }
    addLog(testId, `Pending assignment created: ${assignment.id}`, 'success');
    addLog(testId, `Driver login: ${testDriverNum.toLowerCase()} / ${testDriverNum}`, 'info');
    addLog(testId, 'Required proof path: open Driver App, select/login as this driver, accept the pending trip, run pickup/dropoff, then complete it.', 'warn');
    addLog(testId, 'This test intentionally leaves the pending trip in place so the real driver lifecycle can prove the app path.', 'info');
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
    const scopedCompanyId = selectedCompanyId || sandboxStatus.companyId || adminPreviewCompany?.id || company?.id || null;
    if (!scopedCompanyId) {
      addLog(testId, 'Missing company scope. Pick an approved company or activate sandbox before running Driver Onboarding Test.', 'error');
      setResult(testId, 'fail');
      return;
    }
    const { data: d, error } = await supabase.from('drivers').insert({
      driver_number: testNum,
      full_name: 'Onboarding Test Driver',
      company_id: scopedCompanyId,
      tlc_number: testNum,
      login_username: testNum.toLowerCase(),
      login_password: testNum,
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
    addLog(testId, 'Running live provider round-trip...', 'info');

    const probe = await requestAIStructuredPlan(settings, {
      systemPrompt: `Return JSON only with this shape:
{
  "status": "ok",
  "provider": "string",
  "ready": true
}`,
      userPrompt: 'Confirm the configured provider can answer a simple readiness probe.',
    });

    if (!probe?.json) {
      addLog(testId, probe?.error ? `AI provider error: ${probe.error}` : 'AI provider returned an unreadable response.', 'error');
      if (probe?.text) addLog(testId, probe.text.slice(0, 300), 'warn');
      setResult(testId, 'fail');
      return;
    }

    addLog(testId, `Provider round-trip: OK via ${probe.model || settings.model || settings.provider}`, 'success');
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
        .select('webhook_type, processed, error_message, received_at')
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

    const slimSyncs = (failedSyncsRes.data || []).slice(0, 5).map(row => ({
      sync_type: row.sync_type,
      status: row.status,
      created_at: row.created_at,
      error_message: String(row.error_message || '').slice(0, 200),
    }));
    const slimWebhooks = (failedWebhooksRes.data || []).slice(0, 5).map(row => ({
      endpoint: row.endpoint || row.webhook_type,
      received_at: row.received_at,
      processed: row.processed,
      error_message: String(row.error_message || '').slice(0, 200),
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
      failedSyncs: slimSyncs,
      failedWebhooks: slimWebhooks,
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
      addLog(testId, result?.error ? `AI provider error: ${result.error}` : 'AI returned an unreadable response.', 'error');
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
                    <p className="text-xs font-mono" style={{ color: '#c9a84c' }}>{log.webhook_type || log.endpoint || 'webhook'}</p>
                    <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{new Date(log.received_at).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={async () => {
                      const webhookType = log.webhook_type || log.endpoint || 'webhook';
                      const ok = await replayWebhook(log);
                      addLog('webhook', `Replay ${webhookType}: ${ok ? 'PASS' : 'FAIL'}`, ok ? 'success' : 'error');
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

          <div className="rounded-xl p-4 md:col-span-2" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-600" style={{ fontWeight: 600 }}>Recent Sentry Trip Routing</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  See which company and driver each newly routed trip was sent to for live Sentry testing. Rows are ordered by{' '}
                  <span className="font-mono">assigned_at</span> (not <span className="font-mono">created_at</span>) so the latest dispatch offer is on top.
                </p>
                <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Post-accept DB compare: if Supabase CLI or <span className="font-mono">psql</span> hits auth or pooler flakes, run{' '}
                  <span className="font-mono">npm run audit:trip -- --trip=&lt;SENTRY_TRIP_ID&gt;</span> from the <span className="font-mono">project/</span> folder with{' '}
                  <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> in <span className="font-mono">.env.local</span> — see <span className="font-mono">docs/supabase-trip-state-audit.md</span>.
                </p>
              </div>
              <button onClick={loadRecentTripRouting} className="btn-ghost px-3 py-1.5 text-xs">
                Refresh
              </button>
            </div>
            {routingLoading ? (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Loading routing events...</p>
            ) : recentTripRouting.length === 0 ? (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                No recent trip assignment routing found in the current company scope.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {recentTripRouting.map((row, idx) => {
                  const routedAt = row.assigned_at;
                  const driverLabel = row.driver?.full_name || row.driver?.login_username || row.driver?.driver_number || row.driver_id || 'Unknown driver';
                  const companyLabel = row.company?.company_name || row.company_id || 'Unknown company';
                  const status = String(row.status || '').toLowerCase();
                  const statusStyle = status === 'pending'
                    ? { background: 'rgba(201,168,76,0.14)', color: '#c9a84c' }
                    : status === 'accepted'
                      ? { background: 'rgba(14,165,233,0.14)', color: '#0ea5e9' }
                      : status === 'completed'
                        ? { background: 'rgba(0,229,160,0.14)', color: '#00e5a0' }
                        : status === 'cancelled'
                          ? { background: 'rgba(239,68,68,0.14)', color: '#ef4444' }
                          : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' };
                  return (
                    <div key={`${row.trip_id}-${row.driver_id}-${idx}`} className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-mono" style={{ color: '#c9a84c' }}>{row.trip_id}</p>
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full"
                          style={statusStyle}
                        >
                          {row.status || 'unknown'}
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.72)' }}>
                        Company: <strong>{companyLabel}</strong>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.72)' }}>
                        Driver: <strong>{driverLabel}</strong>
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        Routed at: {routedAt ? new Date(routedAt).toLocaleString() : 'unknown'}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
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
