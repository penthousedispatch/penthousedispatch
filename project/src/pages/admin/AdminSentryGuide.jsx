import React, { useState } from 'react';
import { CheckCircle, Circle, ChevronRight, ExternalLink, Copy, Terminal, Globe, Key, Wifi, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { sentryApi } from '../../lib/sentryApi';
import { useApp } from '../../context/AppContext';

const SANDBOX_URL = 'https://dsp-integration.test.sentryms.com';

const STEPS = [
  {
    id: 'account',
    icon: Globe,
    title: 'Request Sandbox Access',
    description: 'Contact SentryMS to provision a sandbox transportation provider account.',
    substeps: [
      'Email SentryMS support at integration@sentryms.com or contact your SentryMS account representative',
      'Request a Transportation Provider (TP) sandbox account for API testing',
      'Specify that you need access to the DSP Integration sandbox environment',
      'You will receive a username and password for Basic Auth access',
    ],
    note: 'Sandbox URL: ' + SANDBOX_URL,
    noteType: 'info',
  },
  {
    id: 'credentials',
    icon: Key,
    title: 'Enter Your Credentials',
    description: 'Configure the connection settings in the Sentry Integration panel.',
    substeps: [
      'Navigate to Admin → Sentry Integration',
      'Set the Base URL to: ' + SANDBOX_URL,
      'Set Auth Type to "Basic Auth"',
      'Enter your sandbox username and password',
      'Choose the receiver auth mode your team is using: Bearer Header or Token URL',
      'Make sure "Sandbox Mode" is toggled ON',
      'Make sure "Integration" toggle is ON',
    ],
    note: 'Keep sandbox mode enabled during testing to avoid sending data to production.',
    noteType: 'warning',
  },
  {
    id: 'connect',
    icon: Wifi,
    title: 'Test the Connection',
    description: 'Verify your credentials work by running the connection test.',
    substeps: [
      'In the Sentry Integration panel, click "Test Connection"',
      'A green "Connected successfully" badge will appear with latency if credentials are valid',
      'If you see "Connection failed", double-check your username and password',
      'The test hits GET /rest/transportation_provider_facade/v4.0/trips.json which requires auth',
    ],
    note: 'A 401 error means bad credentials. A network error means the URL is wrong.',
    noteType: 'error',
    hasAction: true,
    actionLabel: 'Test Connection Now',
    actionKey: 'test',
  },
  {
    id: 'features',
    icon: ShieldCheck,
    title: 'Enable API Features',
    description: 'Turn on the integrations you want to use in the API Feature Controls section.',
    substeps: [
      'Assigned Trips Polling — polls /trips.json every 90 seconds for newly assigned trips',
      'Marketplace Trips — polls /marketplace_trips.json and lets you take unassigned trips',
      'Trip Accept / Reject — confirms or declines trip assignments back to SentryMS',
      'Trip Status Updates — pushes en-route, pickup, completion events to SentryMS',
      'Driver Sync — create and pull driver records between Penthouse and SentryMS',
      'Vehicle Sync — create and pull vehicle records between Penthouse and SentryMS',
      'Vehicle GPS Push — sends live fleet GPS coordinates to SentryMS',
      'Waypoint ETAs — exchange estimated arrival times for trip waypoints',
      'Driver Work Shifts — pull scheduled work shifts from SentryMS',
    ],
    note: 'Start with Marketplace Trips and Trip Accept/Reject for a basic end-to-end test.',
    noteType: 'info',
  },
  {
    id: 'trips',
    icon: RefreshCw,
    title: 'Pull Marketplace Trips',
    description: 'Fetch available trips from the SentryMS sandbox marketplace.',
    substeps: [
      'Go to Admin → Testing Center and run the "Sentry Integration Test"',
      'Alternatively, open the Dispatch Board or Marketplace page and click "Refresh Trips"',
      'Trips from /marketplace_trips.json will populate the trip list',
      'In sandbox, SentryMS may have pre-seeded test trips for you to work with',
      'If no trips appear, ask your SentryMS rep to add test trips to your sandbox org',
    ],
    note: 'The system auto-pulls every 90 seconds once configured.',
    noteType: 'info',
  },
  {
    id: 'take',
    icon: CheckCircle,
    title: 'Take and Accept a Trip',
    description: 'Assign a trip to a driver and confirm it back to SentryMS.',
    substeps: [
      'In the Dispatch Board, select a driver from the left panel',
      'Assign one of the available sandbox trips to that driver',
      'The app calls POST /marketplace_trips/{trip_id}/take automatically',
      'Sentry logs the take action — check Admin → Sync Log for confirmation',
      'When the driver accepts the trip, POST /trips/accept is called with the trip ID',
      'SentryMS will track the trip as accepted by your TP',
    ],
    note: 'Accepted trips are removed from the marketplace and locked to your TP.',
    noteType: 'info',
  },
  {
    id: 'status',
    icon: Zap,
    title: 'Push Trip Status Updates',
    description: 'Update trip status as the driver progresses through the trip lifecycle.',
    substeps: [
      'In the Driver App, have a driver accept and start a trip',
      'When the driver confirms pickup, status_id updates are sent to SentryMS',
      'When the driver completes the trip, POST /trips/{id}/update_status is called with status_id: 7',
      'All status updates are logged in the Sentry Sync Log',
      'You can also test rejection: POST /trips/{id}/reject with status_id=1',
    ],
    note: 'status_id=7 = completed. status_id=0 = processed (stored, not yet decided).',
    noteType: 'info',
  },
  {
    id: 'webhooks',
    icon: Terminal,
    title: 'Configure Inbound Webhooks',
    description: 'Provide SentryMS your receiver URLs so they can push trips and credentials to you.',
    substeps: [
      'In Admin → Sentry Integration, scroll to "Inbound Webhook URLs"',
      'Copy the Trips Receiver URL and provide it to your SentryMS integration contact',
      'Copy the Drivers Receiver URL for driver credential push notifications',
      'Copy the Vehicles Receiver URL for vehicle credential push notifications',
      'If you selected Token URL auth mode, send Sentry the exact tokenized URL instead of a plain endpoint',
      'SentryMS will call these URLs when trips are assigned or credentials change',
      'The URL must be publicly accessible — use ngrok or deploy to a live domain for testing',
    ],
    note: 'The receiver URL must be unique per TP. Add auth tokens as URL parameters if needed.',
    noteType: 'warning',
  },
];

const NOTE_STYLES = {
  info: { bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.2)', color: '#38bdf8' },
  warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', color: '#f59e0b' },
  error: { bg: 'rgba(255,71,87,0.08)', border: 'rgba(255,71,87,0.2)', color: '#ff4757' },
};

export default function AdminSentryGuide() {
  const { sentryConfig } = useApp();
  const [completed, setCompleted] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set(['account']));
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState('');

  function toggleComplete(id) {
    setCompleted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    const result = await sentryApi.healthCheck();
    setTestResult(result);
    setTesting(false);
    if (result.authenticated) {
      setCompleted(prev => new Set([...prev, 'connect']));
    }
  }

  function copy(text, key) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  const totalDone = completed.size;
  const totalSteps = STEPS.length;

  return (
    <div className="h-full overflow-y-auto p-6" style={{ color: '#e5e7eb' }}>
      <div className="max-w-2xl mx-auto">

        <div className="mb-6">
          <h1 className="text-xl font-700 mb-1" style={{ fontWeight: 700, color: '#c9a84c' }}>Sentry Sandbox Setup Guide</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            Step-by-step walkthrough to go from zero to a fully integrated SentryMS sandbox connection.
          </p>
        </div>

        <div className="rounded-xl p-4 mb-6" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Progress</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{totalDone} / {totalSteps} steps marked done</p>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${(totalDone / totalSteps) * 100}%`, background: 'linear-gradient(90deg, #c9a84c, #00e5a0)', transition: 'width 0.4s ease' }}
            />
          </div>

          {sentryConfig?.enabled ? (
            <p className="text-xs mt-2" style={{ color: '#00e5a0' }}>Integration is active in your config.</p>
          ) : (
            <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Integration is not yet enabled. Complete Step 2 to configure credentials.</p>
          )}
        </div>

        <div className="space-y-3">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isDone = completed.has(step.id);
            const isOpen = expanded.has(step.id);
            const noteStyle = NOTE_STYLES[step.noteType] || NOTE_STYLES.info;

            return (
              <div
                key={step.id}
                className="rounded-xl overflow-hidden"
                style={{ background: '#0d1117', border: `1px solid ${isDone ? 'rgba(0,229,160,0.2)' : 'rgba(255,255,255,0.07)'}` }}
              >
                <button
                  type="button"
                  className="w-full flex items-center gap-4 p-4 text-left"
                  onClick={() => toggleExpand(step.id)}
                >
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-700"
                    style={{
                      background: isDone ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${isDone ? 'rgba(0,229,160,0.3)' : 'rgba(255,255,255,0.1)'}`,
                      color: isDone ? '#00e5a0' : 'rgba(255,255,255,0.4)',
                      fontWeight: 700,
                    }}
                  >
                    {isDone ? <CheckCircle className="w-4 h-4" /> : index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isDone ? '#00e5a0' : '#c9a84c' }} />
                      <p className="text-sm font-600" style={{ fontWeight: 600, color: isDone ? '#00e5a0' : '#e5e7eb' }}>{step.title}</p>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{step.description}</p>
                  </div>

                  <ChevronRight
                    className="w-4 h-4 flex-shrink-0 transition-transform"
                    style={{ color: 'rgba(255,255,255,0.3)', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <ol className="mt-4 space-y-2.5">
                      {step.substeps.map((sub, i) => (
                        <li key={i} className="flex gap-3">
                          <span
                            className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-700 mt-0.5"
                            style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c', fontWeight: 700, fontSize: 10 }}
                          >
                            {i + 1}
                          </span>
                          <p className="text-sm flex-1" style={{ color: '#e5e7eb', lineHeight: 1.6 }}>
                            {sub.startsWith(SANDBOX_URL) || sub.includes(SANDBOX_URL) ? (
                              <>
                                {sub.split(SANDBOX_URL)[0]}
                                <span
                                  className="font-mono cursor-pointer inline-flex items-center gap-1"
                                  style={{ color: '#c9a84c', fontSize: 12 }}
                                  onClick={() => copy(SANDBOX_URL, 'url')}
                                >
                                  {SANDBOX_URL}
                                  <Copy className="w-3 h-3" />
                                </span>
                                {sub.split(SANDBOX_URL)[1]}
                              </>
                            ) : sub}
                          </p>
                        </li>
                      ))}
                    </ol>

                    {step.note && (
                      <div className="mt-4 rounded-lg p-3" style={{ background: noteStyle.bg, border: `1px solid ${noteStyle.border}` }}>
                        <p className="text-xs" style={{ color: noteStyle.color, lineHeight: 1.5 }}>{step.note}</p>
                      </div>
                    )}

                    {step.hasAction && step.actionKey === 'test' && (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={runTest}
                          disabled={testing}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-600"
                          style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontWeight: 600 }}
                        >
                          {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                          {testing ? 'Testing...' : step.actionLabel}
                        </button>

                        {testResult && (
                          <div
                            className="mt-3 flex items-start gap-3 p-3 rounded-lg"
                            style={{
                              background: testResult.authenticated ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)',
                              border: `1px solid ${testResult.authenticated ? 'rgba(0,229,160,0.2)' : 'rgba(255,71,87,0.2)'}`,
                            }}
                          >
                            {testResult.authenticated
                              ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#00e5a0' }} />
                              : <Circle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ff4757' }} />
                            }
                            <div>
                              <p className="text-sm font-600" style={{ color: testResult.authenticated ? '#00e5a0' : '#ff4757', fontWeight: 600 }}>
                                {testResult.authenticated ? 'Connection successful' : 'Connection failed'}
                              </p>
                              {testResult.latencyMs && (
                                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{testResult.latencyMs}ms response time</p>
                              )}
                              {testResult.error && (
                                <p className="text-xs mt-0.5" style={{ color: '#ff4757' }}>{testResult.error}</p>
                              )}
                              {!testResult.authenticated && (
                                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                  Go to Admin → Sentry Integration and verify your username and password, then try again.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleComplete(step.id)}
                      className="mt-4 flex items-center gap-2 text-xs font-600"
                      style={{ color: isDone ? '#00e5a0' : 'rgba(255,255,255,0.4)', fontWeight: 600 }}
                    >
                      {isDone
                        ? <CheckCircle className="w-4 h-4" />
                        : <Circle className="w-4 h-4" />
                      }
                      {isDone ? 'Marked as done' : 'Mark as done'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {totalDone === totalSteps && (
          <div className="mt-6 rounded-xl p-5 text-center" style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)' }}>
            <CheckCircle className="w-8 h-8 mx-auto mb-2" style={{ color: '#00e5a0' }} />
            <p className="font-700 mb-1" style={{ color: '#00e5a0', fontWeight: 700 }}>All steps complete!</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Your SentryMS sandbox integration is fully configured and tested.</p>
          </div>
        )}

        <div className="mt-6 rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Quick Reference</p>
          <div className="space-y-2">
            {[
              { label: 'Sandbox Base URL', value: SANDBOX_URL },
              { label: 'Trips endpoint', value: '/rest/transportation_provider_facade/v4.0/trips.json' },
              { label: 'Marketplace endpoint', value: '/rest/transportation_provider_facade/v4.0/marketplace_trips.json' },
              { label: 'Drivers endpoint', value: '/rest/transportation_provider_facade/v4.0/drivers.json' },
              { label: 'Vehicles endpoint', value: '/rest/transportation_provider_facade/v4.0/vehicles.json' },
              { label: 'GPS locations', value: '/rest/gc/vehicle_locations.json' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-3 p-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="min-w-0">
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{label}</p>
                  <p className="text-xs font-mono truncate" style={{ color: '#c9a84c' }}>{value}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copy(value, label)}
                  className="flex-shrink-0 btn-ghost px-2 py-1 text-xs"
                >
                  {copied === label ? 'Copied!' : <Copy className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
