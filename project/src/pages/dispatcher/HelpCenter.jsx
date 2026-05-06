import React, { useMemo, useState } from 'react';
import {
  HelpCircle, Radio, Zap, Shield, CheckCircle, AlertTriangle,
  ExternalLink, ChevronDown, ChevronUp, Lock, Eye, Users,
  Activity, BookOpen, Terminal, Key, Globe, Database, Bot, Volume2, Pause, Square
} from 'lucide-react';
import { getGuideAudioSrc, useGuideAudioPlayback } from '../../lib/guideAudio';
import { useDriverVoiceGuide } from '../../lib/driverVoiceGuide';

const SECTIONS = [
  { id: 'dispatch_guide', label: 'Dispatcher Guide', icon: BookOpen },
  { id: 'sandbox', label: 'Sandbox Setup', icon: Terminal },
  { id: 'bots', label: 'Bot Team Guide', icon: Bot },
  { id: 'scheduler', label: 'Auto-Scheduler', icon: Zap },
  { id: 'security', label: 'Security Policies', icon: Shield },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
];

function AccordionItem({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-all"
        style={{ background: open ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)', border: 'none' }}
      >
        <span className="text-sm font-600" style={{ color: open ? '#c9a84c' : '#e5e7eb', fontWeight: 600 }}>{title}</span>
        {open ? <ChevronUp className="w-4 h-4" style={{ color: '#c9a84c' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 text-sm" style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, background: 'rgba(255,255,255,0.01)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-700" style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontWeight: 700 }}>
        {n}
      </div>
      <div className="flex-1 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <p className="text-sm font-600 mb-1" style={{ color: '#e5e7eb', fontWeight: 600 }}>{title}</p>
        <div className="text-sm" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>{children}</div>
      </div>
    </div>
  );
}

function CodeBlock({ children }) {
  return (
    <code className="block my-2 px-3 py-2 rounded-lg text-xs font-mono" style={{ background: 'rgba(0,0,0,0.4)', color: '#00e5a0', border: '1px solid rgba(255,255,255,0.07)' }}>
      {children}
    </code>
  );
}

function PolicyCard({ title, icon: Icon, color, items }) {
  return (
    <div className="rounded-xl p-4" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color }} />
        <p className="text-sm font-700" style={{ color, fontWeight: 700 }}>{title}</p>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
            <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color }} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HelpCenter() {
  const [activeSection, setActiveSection] = useState('dispatch_guide');
  const dispatcherGuideNarration = useMemo(() => (
    'Dispatcher guide. Start in Dispatch to watch live queue movement. Use Board for a cleaner assignment view. '
    + 'If a driver rejects a trip, use the recovery tools to reassign, reroute, or copy only when the broker flow needs it. '
    + 'Keep audit logs open during broker testing so you can compare local events with Sentry responses. '
    + 'Use Help for policy and setup, and only move the trip to the exact status the broker asks for.'
  ), []);
  const dispatcherAudioSrc = getGuideAudioSrc('dispatcher_guide');
  const dispatcherAudio = useGuideAudioPlayback(dispatcherAudioSrc);
  const usingUploadedAudio = dispatcherAudio.available;
  const dispatcherVoice = useDriverVoiceGuide(usingUploadedAudio ? '' : dispatcherGuideNarration, { rate: 0.94 });
  const audioControl = usingUploadedAudio ? dispatcherAudio : dispatcherVoice;

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#07090d' }}>
      <aside className="w-52 flex-shrink-0 border-r p-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2 mb-4 px-1">
          <BookOpen className="w-4 h-4" style={{ color: '#c9a84c' }} />
          <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Help Center</p>
        </div>
        <div className="space-y-1">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-all"
                style={{
                  background: activeSection === s.id ? 'rgba(201,168,76,0.1)' : 'transparent',
                  color: activeSection === s.id ? '#c9a84c' : 'rgba(255,255,255,0.5)',
                  fontWeight: activeSection === s.id ? 600 : 400,
                  border: '1px solid',
                  borderColor: activeSection === s.id ? 'rgba(201,168,76,0.2)' : 'transparent',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">

          {activeSection === 'dispatch_guide' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-700 mb-1" style={{ fontWeight: 700 }}>Dispatcher Guide</h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Fast ops guide for live queue work, recovery actions, and broker-safe testing.
                </p>
              </div>

              {(usingUploadedAudio || dispatcherVoice.supported) && (
                <div className="rounded-2xl px-4 py-4" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.16)' }}>
                  <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {usingUploadedAudio
                      ? 'Dispatcher audio is ready here so someone can listen through queue, recovery, and broker workflow steps.'
                      : 'Voice helper can read the dispatcher guide aloud from here while you work in Dispatch.'}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={audioControl.toggle}
                      className="px-3 py-2 rounded-full text-xs flex items-center gap-1.5"
                      style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c' }}
                    >
                      {audioControl.playing && !audioControl.paused ? <Pause className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      {audioControl.playing || audioControl.paused
                        ? (audioControl.paused ? 'Resume guide' : 'Pause guide')
                        : (usingUploadedAudio ? 'Play dispatcher audio' : 'Listen to guide')}
                    </button>
                    {(audioControl.playing || audioControl.paused) && (
                      <button
                        type="button"
                        onClick={audioControl.stop}
                        className="px-3 py-2 rounded-full text-xs flex items-center gap-1.5"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.72)' }}
                      >
                        <Square className="w-3.5 h-3.5" />
                        Stop
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="grid gap-3">
                {[
                  ['Run the queue from Dispatch first', 'Use Dispatch for live movement, then switch to Board only when you need a clearer assignment layout or manual cleanup.'],
                  ['Only do the exact broker step', 'When Sentry is testing, do not skip ahead. If they ask for assign, assign only. If they ask for reject, reject only.'],
                  ['Use recovery tools carefully', 'Reassign is the safest recovery action. Reroute and trip copy should be used only when the workflow really requires a new broker-side trip path.'],
                  ['Watch the evidence layer', 'Keep audit logs open so you can compare local assignment, provider readback, and raw broker response instead of trusting one layer.'],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-sm font-700 mb-1" style={{ color: '#e5e7eb', fontWeight: 700 }}>{title}</p>
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.7 }}>{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'sandbox' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-700 mb-1" style={{ fontWeight: 700 }}>SentryMS Sandbox Setup</h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Step-by-step guide to connect your dispatch workspace to the SentryMS sandbox environment and start pulling live marketplace trips.
                </p>
              </div>

              <div className="px-4 py-3 rounded-xl" style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.2)' }}>
                <p className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: '#c9a84c', fontWeight: 700 }}>Sandbox URL</p>
                <CodeBlock>https://dsp-integration.test.sentryms.com</CodeBlock>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>This is already pre-configured. No API key needed for sandbox — basic auth works.</p>
              </div>

              <div className="space-y-0">
                <Step n="1" title="Get SentryMS Sandbox Credentials">
                  Contact your SentryMS account representative or log in to the SentryMS portal and request sandbox transportation-provider credentials. You will receive a username and password for the test environment.
                  <br /><br />
                  If you already have credentials, skip to Step 2.
                </Step>

                <Step n="2" title="Open Settings → SentryMS API">
                  Navigate to <strong style={{ color: '#c9a84c' }}>Settings</strong> in the top navigation, then click <strong style={{ color: '#c9a84c' }}>SentryMS API</strong> in the sidebar. Make sure <strong style={{ color: '#c9a84c' }}>Sandbox Mode</strong> is ON (yellow indicator) and choose the right webhook auth mode for your setup, either bearer header or token URL.
                </Step>

                <Step n="3" title="Enter Your Credentials">
                  Select <strong style={{ color: '#c9a84c' }}>Basic Auth</strong> and enter your sandbox username and password. The base URL should remain:
                  <CodeBlock>https://dsp-integration.test.sentryms.com</CodeBlock>
                  Click <strong style={{ color: '#c9a84c' }}>Save Settings</strong>. If your receiver endpoints use tokenized URLs, copy the generated URLs from the Sentry setup area and send those exact links to Sentry.
                </Step>

                <Step n="4" title="Test the Connection">
                  Click <strong style={{ color: '#c9a84c' }}>Test Connection</strong>. A green "Connected" indicator with latency means you're live. If it fails, double-check your credentials and make sure Sandbox Mode is on.
                </Step>

                <Step n="5" title="Pull Marketplace Trips">
                  Go to <strong style={{ color: '#c9a84c' }}>Bot Team</strong> and enable <strong style={{ color: '#00e5a0' }}>SentryBot</strong>. It will automatically pull trips from the marketplace every 60 seconds.
                  <br /><br />
                  Or, go to <strong style={{ color: '#c9a84c' }}>Dispatch</strong> or <strong style={{ color: '#c9a84c' }}>Marketplace</strong> and click the refresh button to pull trips manually.
                </Step>

                <Step n="6" title="Sync Drivers from SentryMS">
                  In <strong style={{ color: '#c9a84c' }}>Settings → SentryMS API</strong>, click <strong style={{ color: '#c9a84c' }}>Sync Drivers</strong> to import all drivers from the sandbox environment into your local roster.
                </Step>

                <Step n="7" title="Enable Auto-Scheduling (Optional)">
                  Go to <strong style={{ color: '#c9a84c' }}>Auto-Sched</strong> tab. Configure your revenue target ($60/hr), driver pay ($35/hr), and routing weights. Enable <strong style={{ color: '#00e5a0' }}>SchedulerBot</strong> in the Bot Team to automatically assign trips every 5 minutes.
                </Step>
              </div>

              <div className="rounded-xl p-4" style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)' }}>
                <p className="text-sm font-700 mb-2" style={{ color: '#00e5a0', fontWeight: 700 }}>You're ready when:</p>
                <ul className="space-y-1.5">
                  {[
                    'Sentry shows green "Connected" in the header',
                    'Marketplace trips appear in the Dispatch tab',
                    'Drivers are synced and showing in the fleet',
                    'SentryBot is running in Bot Team',
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#00e5a0' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'bots' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-700 mb-1" style={{ fontWeight: 700 }}>Bot Team Guide</h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  The Bot Team is a fleet of automated agents that run the dispatch operation in the background.
                </p>
              </div>

              {[
                {
                  name: 'SentryBot', color: '#00e5a0', icon: Radio,
                  what: 'Polls the SentryMS marketplace API on an interval and imports new trips into your queue.',
                  when: 'Enable immediately after connecting to Sentry. Recommended interval: 60 seconds. If Sentry is not connected yet, this bot should stay off instead of self-enabling.',
                  requires: 'SentryMS API configured and connected in Settings, or a manual marketplace refresh when testing.',
                },
                {
                  name: 'SchedulerBot', color: '#c9a84c', icon: Zap,
                  what: 'Runs the AI routing engine to match available trips to online drivers based on proximity, price, mileage, preferred zones, and shared-ride settings. Targets your configured revenue goals.',
                  when: 'Enable after SentryBot is pulling trips. Set to every 5 minutes.',
                  requires: 'Drivers online, trips in queue. Configure in Auto-Sched tab first.',
                },
                {
                  name: 'HealthBot', color: '#0ea5e9', icon: Activity,
                  what: 'Checks Sentry API connectivity, driver counts, and trip freshness. Logs status every run.',
                  when: 'Enable at all times to get early warning of connectivity issues.',
                  requires: 'Nothing extra — runs independently.',
                },
                {
                  name: 'SecurityBot', color: '#f59e0b', icon: Shield,
                  what: 'Scans assignments for duplicates, offline drivers with active trips, and unusually high-value pending trips.',
                  when: 'Enable at all times. Recommended interval: 10 minutes.',
                  requires: 'Active assignments to scan.',
                },
              ].map(bot => {
                const Icon = bot.icon;
                return (
                  <div key={bot.name} className="rounded-xl p-4" style={{ background: '#0d1117', border: `1px solid ${bot.color}20` }}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="w-4 h-4" style={{ color: bot.color }} />
                      <p className="text-sm font-700" style={{ color: bot.color, fontWeight: 700 }}>{bot.name}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      {[['What it does', bot.what], ['When to enable', bot.when], ['Requires', bot.requires]].map(([label, val]) => (
                        <div key={label}>
                          <p className="font-700 mb-1" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 10 }}>{label}</p>
                          <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeSection === 'scheduler' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-700 mb-1" style={{ fontWeight: 700 }}>Auto-Scheduler Guide</h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  How the AI bot picks and routes trips to maximize your $60/hr revenue target.
                </p>
              </div>

              <div className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>How Scoring Works</p>
                <div className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                  <p>Each available trip gets a score based on three weighted factors:</p>
                  <div className="grid grid-cols-3 gap-3 my-3">
                    {[
                      { label: 'Price Weight', desc: 'Trip fee ×  weight', color: '#c9a84c' },
                      { label: 'Proximity', desc: 'Driver distance to pickup', color: '#00e5a0' },
                      { label: 'Mile Efficiency', desc: 'Fee ÷ miles × weight', color: '#0ea5e9' },
                    ].map(f => (
                      <div key={f.label} className="rounded-xl p-3 text-center" style={{ background: `${f.color}08`, border: `1px solid ${f.color}20` }}>
                        <p className="text-xs font-700 mb-1" style={{ color: f.color, fontWeight: 700 }}>{f.label}</p>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{f.desc}</p>
                      </div>
                    ))}
                  </div>
                  <p>The top-scoring trips within the max distance limit are assigned first. The bot keeps adding trips to each driver until the projected revenue hits your target.</p>
                </div>
              </div>

              <div className="space-y-3">
                <AccordionItem title="What does 'Suggestions Only' mode do?" defaultOpen>
                  In Suggestions Only mode, the scheduler runs its analysis and shows you which trips it would assign — but doesn't actually create assignments. Use this to preview results before enabling Auto-Assign.
                </AccordionItem>
                <AccordionItem title="What does 'Auto-Assign' mode do?">
                  In Auto-Assign mode, the bot actually writes trip assignments to the database and updates trip status to "assigned". Drivers will see their new trips immediately. Enable this only when you're confident in the configuration.
                </AccordionItem>
                <AccordionItem title="How does the $60/hr target work?">
                  The bot calculates projected revenue per hour by dividing total trip fees by shift length. It keeps adding high-score trips to each driver's queue until the projected hourly rate reaches $60. Drivers see only their hourly pay ($35/hr) — the $25 margin is your operational revenue.
                </AccordionItem>
                <AccordionItem title="What if there aren't enough trips?">
                  The bot will flag this as an issue: "Only X trips available for Y drivers." Enable SentryBot to pull trips more frequently from the marketplace, or expand the max trip distance in settings.
                </AccordionItem>
                <AccordionItem title="How does proximity work without GPS?">
                  If a driver doesn't have GPS coordinates in the system, the bot skips the proximity score and uses only price and mileage efficiency. Ensure drivers have the mobile app active to share location.
                </AccordionItem>
                <AccordionItem title="What happens when AI is turned off globally?">
                  If Admin uses All Off or the kill switch, company AI routing badges and AI-driven automation should reflect that state. Company-level AI settings stay saved, but routing pauses until Admin turns the platform back on.
                </AccordionItem>
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-700 mb-1" style={{ fontWeight: 700 }}>Security Policies</h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Platform security policies, access controls, and data protection standards.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <PolicyCard
                  title="Access Control"
                  icon={Lock}
                  color="#00e5a0"
                  items={[
                    'Role-based access: admin, company, and driver',
                    'Drivers can only see their own pay and trip assignments',
                    'Company users cannot access platform-only admin functions',
                    'All API requests require authenticated sessions',
                    'Session tokens expire automatically after inactivity',
                  ]}
                />
                <PolicyCard
                  title="Data Visibility"
                  icon={Eye}
                  color="#0ea5e9"
                  items={[
                    'Revenue targets are hidden from driver-facing views',
                    'Margin data is restricted to admin and company management views',
                    'Driver pay shows only their hourly/per-trip rate',
                    'Trip pricing shown only in management views',
                    'GPS location shared only during active shifts',
                  ]}
                />
                <PolicyCard
                  title="Database Security"
                  icon={Database}
                  color="#c9a84c"
                  items={[
                    'Row-level security (RLS) enforced on all tables',
                    'Drivers can only read their own profile and assignments',
                    'Organization isolation — data never leaks between orgs',
                    'All secrets stored encrypted at rest',
                    'No direct database access from driver-facing apps',
                  ]}
                />
                <PolicyCard
                  title="API & Integration"
                  icon={Globe}
                  color="#f59e0b"
                  items={[
                    'SentryMS credentials stored server-side only',
                    'Webhook endpoints require secret key authentication',
                    'All external API calls proxied through edge functions',
                    'Sandbox and production environments strictly separated',
                    'API keys never exposed in client-side code',
                  ]}
                />
                <PolicyCard
                  title="Bot Policies"
                  icon={Bot}
                  color="#a855f7"
                  items={[
                    'Bots operate with minimum required permissions',
                    'All bot actions are logged with timestamps',
                    'Auto-assign requires explicit management enablement',
                    'SecurityBot flags anomalies but does not auto-resolve',
                    'Bot intervals configurable — never override manual actions',
                  ]}
                />
                <PolicyCard
                  title="Driver Privacy"
                  icon={Users}
                  color="#ec4899"
                  items={[
                    'Driver financial data visible only to driver and admin',
                    'Location shared only when shift is active',
                    'TLC/license numbers stored encrypted',
                    'Driver photos stored in private Supabase storage',
                    'Right to data deletion honored on account close',
                  ]}
                />
              </div>

              <div className="rounded-xl p-4" style={{ background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.15)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4" style={{ color: '#ff4757' }} />
                  <p className="text-sm font-700" style={{ color: '#ff4757', fontWeight: 700 }}>Important Security Notes</p>
                </div>
                <ul className="space-y-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                  <li>Never share your admin credentials or SentryMS API keys</li>
                  <li>Always keep Sandbox Mode enabled until you're ready for production</li>
                  <li>Regularly review the Security tab for threats and anomalies</li>
                  <li>Rotate API keys if you suspect a breach</li>
                  <li>Enable SecurityBot for continuous policy monitoring</li>
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'faq' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-700 mb-1" style={{ fontWeight: 700 }}>Frequently Asked Questions</h2>
              </div>
              <div className="space-y-2">
                {[
                  {
                    q: 'Why are trips not appearing in the Dispatch tab?',
                    a: 'Make sure SentryMS API is connected (green indicator in header). Then either enable SentryBot in Bot Team to auto-pull, or click the manual refresh button in the Dispatch view. Check Settings → SentryMS API for connection status.',
                  },
                  {
                    q: 'Drivers can\'t see their trips — what\'s wrong?',
                    a: 'Drivers access the system via the Driver app (mobile). They see only trips assigned to them. Make sure you\'ve created an assignment in the Dispatch or Auto-Scheduler tab and the driver is marked "online".',
                  },
                  {
                    q: 'How do I prevent drivers from seeing the $60/hr revenue target?',
                    a: 'This is enforced by design. The driver app only shows their pay rate ($35/hr) and their individual trip earnings. Revenue targets, pricing, and margins are only visible in company and admin management views.',
                  },
                  {
                    q: 'The auto-scheduler assigned 0 trips — why?',
                    a: 'Check: (1) Are there drivers with status "online" or "on_trip"? (2) Are there trips in the marketplace with status "available"? (3) Is the max distance set too low? Expand max distance in Auto-Sched settings and ensure SentryBot is pulling trips.',
                  },
                  {
                    q: 'How do I switch from sandbox to production?',
                    a: 'In Settings → SentryMS API, toggle Sandbox Mode OFF, update the Base URL to your production SentryMS endpoint, and enter your production credentials. Test the connection before going live.',
                  },
                  {
                    q: 'Can I use both OpenAI and Gemini?',
                    a: 'Each org can configure one AI provider at a time. Go to AI Config tab, select your provider (OpenAI or Google Gemini), enter your API key, and test the connection. The Chat AI will then use that model for intelligent responses.',
                  },
                  {
                    q: 'What does the light/dark mode toggle do?',
                    a: 'The theme toggle (sun/moon icon in the header) switches between a dark theme (default, easier on eyes in dispatch environments) and a light theme. Your preference is saved automatically.',
                  },
                  {
                    q: 'How often should I run the auto-scheduler?',
                    a: 'For an active fleet, every 5 minutes via SchedulerBot is recommended. The scheduler is smart enough to skip drivers who already have enough trips queued. Running too frequently won\'t cause double-assignment.',
                  },
                ].map((item, i) => (
                  <AccordionItem key={i} title={item.q}>
                    {item.a}
                  </AccordionItem>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
