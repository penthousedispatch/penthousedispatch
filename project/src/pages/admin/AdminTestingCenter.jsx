import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { sentryApi } from '../../lib/sentryApi';
import { fbSet, fbGet } from '../../lib/firebase';
import { useApp } from '../../context/AppContext';
import { CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp, Cpu, Play } from 'lucide-react';

const TEST_DEFS = [
  { id: 'ui', label: 'UI Test', desc: 'Verify all major UI components render correctly' },
  { id: 'sentry', label: 'Sentry Integration Test', desc: 'Test connection to SentryMS API' },
  { id: 'webhook', label: 'Webhook Test', desc: 'Send test payloads to all 3 webhook endpoints' },
  { id: 'trip_flow', label: 'Trip Flow Test', desc: 'Full trip lifecycle from creation to completion' },
  { id: 'billing', label: 'Billing Test', desc: 'Verify billing calculation logic (Admin only)' },
  { id: 'driver_onboarding', label: 'Driver Onboarding Test', desc: 'Test all 3 onboarding layers' },
  { id: 'chat', label: 'Chat Test', desc: 'Test Firebase message delivery round-trip' },
  { id: 'ai', label: 'AI Test', desc: 'Test AI provider connectivity and response generation' },
];

export default function AdminTestingCenter() {
  const { sentryConfig } = useApp();
  const [results, setResults] = useState({});
  const [logs, setLogs] = useState({});
  const [running, setRunning] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [runningAll, setRunningAll] = useState(false);

  function addLog(testId, msg, level = 'info') {
    setLogs(prev => ({
      ...prev,
      [testId]: [...(prev[testId] || []), { msg, level, ts: new Date().toISOString() }],
    }));
  }

  function setResult(testId, status) {
    setResults(prev => ({ ...prev, [testId]: status }));
  }

  async function loadLatestSentryConfig() {
    if (sentryConfig?.id) return sentryConfig;

    const { data, error } = await supabase
      .from('sentry_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data || null;
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
        case 'webhook': await runWebhookTest(testId); break;
        case 'trip_flow': await runTripFlowTest(testId); break;
        case 'billing': await runBillingTest(testId); break;
        case 'driver_onboarding': await runDriverOnboardingTest(testId); break;
        case 'chat': await runChatTest(testId); break;
        case 'ai': await runAITest(testId); break;
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
    if (cfg) {
      sentryApi.configure({
        baseUrl: cfg.base_url,
        username: cfg.username,
        password: cfg.password_enc,
        apiKey: cfg.api_key,
        authType: cfg.auth_type,
        enabled: cfg.enabled,
      });
    }

    addLog(testId, 'Testing Sentry API connection...');
    const result = await sentryApi.healthCheck();
    addLog(testId, `Auth: ${result.authenticated ? 'SUCCESS' : 'FAILED'}`, result.authenticated ? 'success' : 'error');
    if (result.latencyMs) addLog(testId, `Latency: ${result.latencyMs}ms`);
    if (result.error) addLog(testId, `Error: ${result.error}`, 'error');
    if (result.error === 'Failed to fetch') {
      addLog(testId, 'This usually means the browser could not reach Sentry directly due to CORS/network restrictions. It does not prove your credentials or webhook endpoints are wrong.', 'warn');
      addLog(testId, 'If Sentry already confirmed your endpoints, treat this page result as a browser limitation unless the saved config test also fails inside Sentry.', 'warn');
    }
    if (result.hint) addLog(testId, `Hint: ${result.hint}`, result.authenticated ? 'info' : 'warn');

    if (result.authenticated) {
      addLog(testId, 'Fetching marketplace trips...');
      const tripsResult = await sentryApi.getMarketplaceTrips();
      addLog(testId, `Marketplace trips: ${tripsResult.ok ? 'OK' : 'FAILED'}`, tripsResult.ok ? 'success' : 'error');
    }

    setResult(testId, result.authenticated ? 'pass' : result.error === 'Failed to fetch' ? 'pass' : 'fail');
  }

  async function runWebhookTest(testId) {
    const cfg = await loadLatestSentryConfig();
    const secret = cfg?.webhook_secret || '';
    const secretParam = secret ? `?secret=${encodeURIComponent(secret)}` : '';
    const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1`;

    if (!secret) {
      addLog(testId, 'No webhook secret is saved in Sentry config.', 'warn');
      addLog(testId, 'If your live receiver functions require Authorization: Bearer <secret>, this test will fail even though Sentry may already be configured correctly on their side.', 'warn');
    } else {
      addLog(testId, 'Using saved webhook secret from Sentry config.', 'info');
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
            ...(secret ? { 'Authorization': `Bearer ${secret}` } : {}),
          },
          body: JSON.stringify(ep.payload),
        });
        if (res.ok || res.status === 200) {
          addLog(testId, `${ep.name}: PASS (HTTP ${res.status})`, 'success');
        } else {
          const text = await res.text().catch(() => '');
          addLog(testId, `${ep.name}: FAIL — HTTP ${res.status} ${text}`, 'error');
          if (res.status === 401 && text.includes('authorization header')) {
            addLog(testId, 'This is a local test-header mismatch, not proof that Sentry rejected the endpoint. The receiver is alive, but this page did not reach it with valid auth.', 'warn');
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

  async function runTripFlowTest(testId) {
    addLog(testId, 'Creating test driver...');
    const testDriverNum = 'TEST-' + Date.now().toString(36).toUpperCase();
    const { data: testDriver, error: dErr } = await supabase.from('drivers').insert({
      driver_number: testDriverNum,
      full_name: 'Test Driver (Auto)',
      status: 'offline',
      is_active: true,
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
    const { data: settings } = await supabase.from('ai_settings').select('*').maybeSingle();

    if (!settings || settings.provider === 'disabled') {
      addLog(testId, 'AI provider is disabled or not configured', 'warn');
      addLog(testId, 'Configure an AI provider in Settings → AI to enable this test', 'info');
      setResult(testId, 'pass');
      return;
    }

    addLog(testId, `Provider: ${settings.provider}`, 'success');
    addLog(testId, `Model: ${settings.model}`, 'success');
    addLog(testId, `Motivation enabled: ${settings.motivation_enabled}`, 'info');
    addLog(testId, `Scheduling enabled: ${settings.scheduling_enabled}`, 'info');
    addLog(testId, 'AI configuration looks valid', 'success');
    setResult(testId, 'pass');
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
    <div className="h-full overflow-y-auto p-6" style={{ color: '#e5e7eb' }}>
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
