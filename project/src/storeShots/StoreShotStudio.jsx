import React from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  BrainCircuit,
  Car,
  CheckCircle2,
  Clock3,
  CreditCard,
  DollarSign,
  MapPinned,
  Route,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Waves,
} from 'lucide-react';

const shell = {
  background: 'radial-gradient(circle at top, rgba(201,168,76,0.14), transparent 32%), linear-gradient(180deg, #07090d 0%, #0b1017 45%, #0d1117 100%)',
  minHeight: '100vh',
  color: '#e5e7eb',
};

const cardStyle = {
  background: 'rgba(13,17,23,0.92)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
};

function PhoneFrame({ children }) {
  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        padding: '18px 16px 24px',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)',
      }}
    >
      <div
        style={{
          ...cardStyle,
          minHeight: 'calc(100vh - 42px)',
          borderRadius: 32,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: 30,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.015)',
          }}
        >
          <div
            style={{
              width: 120,
              height: 7,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.16)',
            }}
          />
        </div>
        {children}
      </div>
    </div>
  );
}

function HeaderBar({ eyebrow, title, subtitle, right }) {
  return (
    <div style={{ padding: '18px 20px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            {eyebrow}
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.05, fontWeight: 800, marginTop: 6 }}>{title}</div>
          {subtitle ? (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.5, marginTop: 8, maxWidth: 290 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {right}
      </div>
    </div>
  );
}

function StatPill({ icon: Icon, label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: '14px 14px 12px',
        borderRadius: 20,
        background: `${color}12`,
        border: `1px solid ${color}28`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, fontSize: 12, fontWeight: 700 }}>
        <Icon size={14} />
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, subtitle, children, tone = 'rgba(255,255,255,0.04)' }) {
  return (
    <div
      style={{
        borderRadius: 24,
        padding: 16,
        background: tone,
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          {subtitle ? (
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>{subtitle}</div>
          ) : null}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

function MapBoard() {
  return (
    <div
      style={{
        position: 'relative',
        height: 290,
        borderRadius: 22,
        overflow: 'hidden',
        background:
          'linear-gradient(180deg, #12202a 0%, #0d151d 100%)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          opacity: 0.18,
        }}
      />
      <svg viewBox="0 0 360 280" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <path d="M15 208 C78 160, 126 180, 186 142 S302 110, 344 54" stroke="#0ea5e9" strokeWidth="6" fill="none" strokeDasharray="1 14" strokeLinecap="round" opacity="0.9" />
        <path d="M28 32 C70 60, 106 72, 168 80 S292 124, 350 198" stroke="rgba(255,255,255,0.16)" strokeWidth="16" fill="none" strokeLinecap="round" />
        <path d="M18 170 C88 132, 120 116, 208 126 S308 156, 346 230" stroke="rgba(255,255,255,0.13)" strokeWidth="18" fill="none" strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', top: 18, left: 18, display: 'flex', gap: 10 }}>
        <div style={{ padding: '8px 10px', borderRadius: 14, background: 'rgba(13,17,23,0.82)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12 }}>
          24 active drivers
        </div>
        <div style={{ padding: '8px 10px', borderRadius: 14, background: 'rgba(13,17,23,0.82)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12 }}>
          9 trips waiting
        </div>
      </div>
      {[
        { left: 54, top: 86, color: '#00e5a0' },
        { left: 168, top: 102, color: '#c9a84c' },
        { left: 250, top: 54, color: '#00e5a0' },
        { left: 278, top: 180, color: '#0ea5e9' },
      ].map((dot, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: dot.left,
            top: dot.top,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: dot.color,
            boxShadow: `0 0 0 8px ${dot.color}22`,
            border: '2px solid rgba(13,17,23,0.85)',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          right: 18,
          bottom: 18,
          width: 150,
          padding: 14,
          borderRadius: 18,
          background: 'rgba(13,17,23,0.9)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ color: '#c9a84c', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Now dispatching
        </div>
        <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700 }}>CLJExpress 412</div>
        <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.54)', fontSize: 12, lineHeight: 1.45 }}>
          Pickup in 4 min. Rider share link active.
        </div>
      </div>
    </div>
  );
}

function DriverRow({ name, status, metric }) {
  const color = status === 'On Trip' ? '#0ea5e9' : status === 'Ready' ? '#00e5a0' : '#c9a84c';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ width: 42, height: 42, borderRadius: 16, background: `${color}18`, border: `1px solid ${color}30`, display: 'grid', placeItems: 'center', color }}>
        <UserRound size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{name}</div>
        <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{metric}</div>
      </div>
      <div style={{ padding: '8px 10px', borderRadius: 999, background: `${color}14`, border: `1px solid ${color}22`, color, fontSize: 12, fontWeight: 700 }}>
        {status}
      </div>
    </div>
  );
}

function MiniChart() {
  return (
    <div style={{ display: 'flex', alignItems: 'end', gap: 8, height: 92 }}>
      {[36, 48, 58, 52, 70, 66, 84].map((h, i) => (
        <div key={i} style={{ flex: 1, borderRadius: 999, height: `${h}px`, background: i === 6 ? 'linear-gradient(180deg, #e8c76a 0%, #c9a84c 100%)' : 'rgba(255,255,255,0.12)' }} />
      ))}
    </div>
  );
}

function OpsShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar
          eyebrow="Penthouse Dispatch"
          title="Ops Center"
          subtitle="Monitor platform health, routing, billing, and live transportation activity from one control surface."
          right={
            <div style={{ padding: '10px 12px', borderRadius: 18, background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.25)', color: '#00e5a0', fontSize: 12, fontWeight: 700 }}>
              Stable
            </div>
          }
        />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatPill icon={ShieldCheck} label="Security" value="98%" color="#00e5a0" />
            <StatPill icon={Waves} label="Load" value="412" color="#0ea5e9" />
            <StatPill icon={DollarSign} label="Payouts" value="$9.8k" color="#c9a84c" />
          </div>
          <SectionCard title="Live Platform Signals" subtitle="Sentry, routing, testing, and payments">
            <MiniChart />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Now</span>
            </div>
          </SectionCard>
          <SectionCard title="Active Modules" subtitle="Operational controls used most today" tone="rgba(255,255,255,0.03)">
            {[
              ['AI Routing', 'Provider healthy, dispatch assist online', Bot, '#c9a84c'],
              ['Testing Center', 'Sandbox seeded and dispatch checks passing', Sparkles, '#0ea5e9'],
              ['Security Watch', 'No open threats above medium severity', ShieldCheck, '#00e5a0'],
            ].map(([title, copy, Icon, color]) => (
              <div key={title} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 42, height: 42, borderRadius: 16, background: `${color}16`, border: `1px solid ${color}30`, display: 'grid', placeItems: 'center', color }}>
                  <Icon size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.45 }}>{copy}</div>
                </div>
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function DispatchShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Company Workspace" title="Dispatch Board" subtitle="Live trip movement, map visibility, and the next riders in queue." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <MapBoard />
          <SectionCard title="Trip Queue" subtitle="Dispatch can move directly from map to action">
            {[
              ['Mt. Sinai Pickup', 'Pickup 4:10 PM • Driver assigned', '#00e5a0'],
              ['Brooklyn Dialysis', 'Waiting for acceptance • 8 min away', '#c9a84c'],
              ['JFK Return Ride', 'Marketplace import • ready to take', '#0ea5e9'],
            ].map(([title, subtitle, color]) => (
              <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 12, height: 12, borderRadius: 999, background: color, boxShadow: `0 0 0 6px ${color}20` }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{subtitle}</div>
                </div>
                <ArrowRight size={16} color="rgba(255,255,255,0.4)" />
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function DriversShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Fleet" title="Driver Roster" subtitle="View status, readiness, and the next shift actions from one roster." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatPill icon={Users} label="Drivers" value="24" color="#0ea5e9" />
            <StatPill icon={CheckCircle2} label="Ready" value="17" color="#00e5a0" />
            <StatPill icon={Clock3} label="Break" value="3" color="#c9a84c" />
          </div>
          <SectionCard title="Today’s Team" subtitle="Shift visibility and onboarding in one list">
            <DriverRow name="Avery Stone" status="Ready" metric="Queens • Shift until 6:00 PM" />
            <DriverRow name="Jordan Blake" status="On Trip" metric="Brooklyn • Rider ETA 7 min" />
            <DriverRow name="Taylor Reed" status="Review" metric="Docs updated • profile ready" />
            <DriverRow name="Morgan Vale" status="Ready" metric="Bronx • Airport preference enabled" />
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function AIShot() {
  const toggles = [
    ['Proximity Priority', 'Nearest viable driver receives more weight', true],
    ['Traffic Aware Routing', 'Route scoring accounts for current traffic', true],
    ['Shift Fill Optimization', 'Prefer routes that build a fuller day', true],
    ['Marketplace Pull Assist', 'Suggest strong imports before queue slows', false],
  ];

  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Automation" title="AI Settings" subtitle="Set how routing, trip selection, and shift decisions should behave for your company." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <SectionCard title="Routing Priorities" subtitle="Balanced for price, traffic, and coverage" tone="rgba(201,168,76,0.08)">
            {[
              ['Price', '72%'],
              ['Proximity', '81%'],
              ['Traffic', '76%'],
              ['Shared Ride Fit', '64%'],
            ].map(([label, value]) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span>{label}</span>
                  <span style={{ color: '#c9a84c', fontWeight: 700 }}>{value}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: value, height: '100%', background: 'linear-gradient(90deg, #e8c76a 0%, #c9a84c 100%)' }} />
                </div>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Assist Features" subtitle="Live rules your dispatch team can understand">
            {toggles.map(([title, copy, on]) => (
              <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 46, height: 28, borderRadius: 999, background: on ? 'rgba(0,229,160,0.22)' : 'rgba(255,255,255,0.12)', border: `1px solid ${on ? 'rgba(0,229,160,0.32)' : 'rgba(255,255,255,0.12)'}`, position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 20, height: 20, borderRadius: 999, background: on ? '#00e5a0' : '#9ca3af' }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                  <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 1.45 }}>{copy}</div>
                </div>
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function PayoutsShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Payments" title="Driver Pay" subtitle="Review payout-ready work, pay rates, and today’s release summary." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatPill icon={DollarSign} label="Ready Today" value="$2.4k" color="#00e5a0" />
            <StatPill icon={CreditCard} label="Pending" value="11" color="#c9a84c" />
          </div>
          <SectionCard title="Recent Driver Payouts" subtitle="Rates and payout status in one flow">
            {[
              ['Avery Stone', '$384.00', 'Sent'],
              ['Jordan Blake', '$426.50', 'Ready'],
              ['Taylor Reed', '$292.25', 'Review'],
            ].map(([name, pay, status]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 14, background: 'rgba(201,168,76,0.16)', display: 'grid', placeItems: 'center', color: '#c9a84c' }}>
                  <DollarSign size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{name}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Hours, route pay, and adjustment totals reviewed</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{pay}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: status === 'Sent' ? '#00e5a0' : status === 'Ready' ? '#c9a84c' : '#0ea5e9' }}>{status}</div>
                </div>
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function MarketplaceShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Marketplace" title="Imported Trips" subtitle="Review provider work quickly and keep dispatch moving when fresh trips land." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <SectionCard title="Incoming Queue" subtitle="Latest sync pulled 8 new trips" tone="rgba(14,165,233,0.08)">
            {[
              ['JFK to Nassau Dialysis', 'Pickup 3:45 PM • 22.4 mi', '#0ea5e9'],
              ['Brooklyn Rehab Return', 'Pickup 4:20 PM • 9.1 mi', '#c9a84c'],
              ['Queens Follow-Up Visit', 'Pickup 5:00 PM • 14.0 mi', '#00e5a0'],
            ].map(([title, copy, color]) => (
              <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 42, height: 42, borderRadius: 16, background: `${color}14`, border: `1px solid ${color}26`, display: 'grid', placeItems: 'center', color }}>
                  <Route size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
                  <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{copy}</div>
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 999, background: `${color}14`, border: `1px solid ${color}20`, color, fontSize: 12, fontWeight: 700 }}>
                  Review
                </div>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Queue Health" subtitle="A quick view of what dispatch can accept next">
            <div style={{ display: 'flex', gap: 12 }}>
              <StatPill icon={Activity} label="Fresh" value="8" color="#0ea5e9" />
              <StatPill icon={MapPinned} label="Airport" value="3" color="#c9a84c" />
              <StatPill icon={BrainCircuit} label="AI Fit" value="92%" color="#00e5a0" />
            </div>
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function DriverHomeShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Penthouse Driver" title="Active Shift" subtitle="Trip visibility, shift status, and trip preferences are always on the same screen." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <MapBoard />
          <div style={{ display: 'flex', gap: 12 }}>
            <StatPill icon={Car} label="Shift" value="Online" color="#00e5a0" />
            <StatPill icon={Route} label="Trips" value="4" color="#0ea5e9" />
          </div>
          <SectionCard title="Trip Preferences" subtitle="Airport and long-mile filters ready">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['Airport Trips', 'Long Distance', 'Shared Rides', 'Return Loads'].map((pill, i) => (
                <div key={pill} style={{ padding: '10px 12px', borderRadius: 999, background: i < 3 ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${i < 3 ? 'rgba(201,168,76,0.26)' : 'rgba(255,255,255,0.08)'}`, color: i < 3 ? '#c9a84c' : 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 700 }}>
                  {pill}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function DriverNavShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Penthouse Driver" title="Drive To Pickup" subtitle="Clear routing and ETA visibility while the shift stays in motion." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <MapBoard />
          <SectionCard title="Current Route" subtitle="Elmhurst Hospital pickup">
            <div style={{ display: 'flex', gap: 12 }}>
              <StatPill icon={Clock3} label="ETA" value="7 min" color="#00e5a0" />
              <StatPill icon={Route} label="Distance" value="2.8 mi" color="#0ea5e9" />
              <StatPill icon={MapPinned} label="Turn" value="2" color="#c9a84c" />
            </div>
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function DriverTripShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Accepted Ride" title="Trip Sheet" subtitle="Pickup, dropoff, and rider details stay readable without extra taps." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <SectionCard title="Trip Details" subtitle="Accepted and ready to complete">
            {[
              ['Pickup', 'Mount Sinai Queens • 4:10 PM'],
              ['Dropoff', 'Nassau Dialysis Center'],
              ['Rider', 'Sandra L. • mobility assist'],
              ['Tracking', 'Live rider link active'],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: '#c9a84c', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 15, marginTop: 6 }}>{value}</div>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Trip Progress" subtitle="One-line statuses drivers can act on">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              {['Accepted', 'Arrived', 'Picked Up', 'Complete'].map((step, i) => (
                <div key={step} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ width: 34, height: 34, margin: '0 auto', borderRadius: 999, background: i < 2 ? 'rgba(0,229,160,0.18)' : 'rgba(255,255,255,0.08)', border: `1px solid ${i < 2 ? 'rgba(0,229,160,0.28)' : 'rgba(255,255,255,0.08)'}`, color: i < 2 ? '#00e5a0' : 'rgba(255,255,255,0.35)', display: 'grid', placeItems: 'center' }}>
                    {i < 2 ? <CheckCircle2 size={18} /> : i + 1}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: i < 2 ? '#e5e7eb' : 'rgba(255,255,255,0.4)' }}>{step}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function DriverScheduleShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Schedule" title="Shift Planner" subtitle="The day is easier to read when routes, timing, and gaps are visible together." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <SectionCard title="Today" subtitle="AI-filled shift built around route flow">
            {[
              ['8:30 AM', 'Queens pickup to Flushing clinic', '#00e5a0'],
              ['11:00 AM', 'Hospital return to Brooklyn', '#0ea5e9'],
              ['2:15 PM', 'Dialysis pickup to Nassau', '#c9a84c'],
              ['4:40 PM', 'Return load suggested by AI', '#00e5a0'],
            ].map(([time, route, color]) => (
              <div key={time} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color, fontSize: 12, fontWeight: 800, minWidth: 64 }}>{time}</div>
                <div style={{ flex: 1, fontSize: 14 }}>{route}</div>
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function DriverHistoryShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Trip History" title="Completed Work" subtitle="Drivers can review current and previous rides without confusion." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <SectionCard title="Past Trips" subtitle="Last 7 days">
            {[
              ['JFK to Hempstead', '$148.20', 'Completed'],
              ['Bronx rehab return', '$86.40', 'Completed'],
              ['Queens dialysis pickup', '$92.10', 'Completed'],
              ['Brooklyn long-mile ride', '$133.90', 'Completed'],
            ].map(([route, pay, status]) => (
              <div key={route} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 14, background: 'rgba(0,229,160,0.14)', display: 'grid', placeItems: 'center', color: '#00e5a0' }}>
                  <CheckCircle2 size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{route}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{status}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{pay}</div>
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function RiderMapShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Penthouse Rider" title="Track Your Ride" subtitle="Live vehicle position and status updates in one clean rider view." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <MapBoard />
          <SectionCard title="Ride Status" subtitle="Driver assigned and moving toward pickup">
            <div style={{ display: 'flex', gap: 12 }}>
              <StatPill icon={Car} label="Vehicle" value="Assigned" color="#00e5a0" />
              <StatPill icon={Clock3} label="ETA" value="6 min" color="#0ea5e9" />
            </div>
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function RiderDetailsShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Ride Details" title="Driver And ETA" subtitle="Pickup, driver identity, and timing stay easy to understand." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <SectionCard title="Assigned Driver" subtitle="Vehicle and rider timing">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 54, height: 54, borderRadius: 20, background: 'rgba(201,168,76,0.14)', display: 'grid', placeItems: 'center', color: '#c9a84c' }}>
                <UserRound size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Avery Stone</div>
                <div style={{ marginTop: 4, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Gray Toyota Sienna • ETA 6 minutes</div>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Trip Stops" subtitle="Readable pickup and dropoff details">
            {[
              ['Pickup', 'Mount Sinai Queens'],
              ['Dropoff', 'Nassau Dialysis Center'],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: '#c9a84c', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ marginTop: 6, fontSize: 15 }}>{value}</div>
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function RiderStatusShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Ride Progress" title="Pickup To Dropoff" subtitle="Simple rider status messages keep the trip clear from start to finish." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <SectionCard title="Trip Status" subtitle="Current stage: driver on the way">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              {[
                ['Assigned', true],
                ['En Route', true],
                ['Picked Up', false],
                ['Completed', false],
              ].map(([label, active]) => (
                <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ width: 36, height: 36, margin: '0 auto', borderRadius: 999, background: active ? 'rgba(0,229,160,0.18)' : 'rgba(255,255,255,0.08)', border: `1px solid ${active ? 'rgba(0,229,160,0.28)' : 'rgba(255,255,255,0.08)'}`, color: active ? '#00e5a0' : 'rgba(255,255,255,0.35)', display: 'grid', placeItems: 'center' }}>
                    {active ? <CheckCircle2 size={18} /> : <Clock3 size={16} />}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: active ? '#e5e7eb' : 'rgba(255,255,255,0.4)' }}>{label}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

function RiderShareShot() {
  return (
    <PhoneFrame>
      <div style={shell}>
        <HeaderBar eyebrow="Ride Access" title="Share And Reopen" subtitle="Riders can copy, reopen, and share the live trip link with less friction." />
        <div style={{ padding: '0 20px 24px', display: 'grid', gap: 16 }}>
          <SectionCard title="Live Link" subtitle="Shared rider access stays easy to reopen">
            <div style={{ padding: 14, borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, lineHeight: 1.5 }}>
              https://www.penthousedps.com/rider?trip=preview-ride-412
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: '12px 14px', borderRadius: 18, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', fontWeight: 700 }}>
                Copy Link
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '12px 14px', borderRadius: 18, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.24)', color: '#c9a84c', fontWeight: 700 }}>
                Share
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Recent Trips" subtitle="Quick access on the rider side">
            {['Mount Sinai Queens to Nassau Dialysis', 'Brooklyn rehab return ride'].map((trip) => (
              <div key={trip} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 14 }}>
                {trip}
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </PhoneFrame>
  );
}

const scenes = {
  ops: OpsShot,
  dispatch: DispatchShot,
  drivers: DriversShot,
  ai: AIShot,
  payouts: PayoutsShot,
  marketplace: MarketplaceShot,
  'driver-home': DriverHomeShot,
  'driver-nav': DriverNavShot,
  'driver-trip': DriverTripShot,
  'driver-schedule': DriverScheduleShot,
  'driver-history': DriverHistoryShot,
  'rider-map': RiderMapShot,
  'rider-details': RiderDetailsShot,
  'rider-status': RiderStatusShot,
  'rider-share': RiderShareShot,
};

export default function StoreShotStudio() {
  const shot = new URLSearchParams(window.location.search).get('store-shot') || 'ops';
  const Scene = scenes[shot] || OpsShot;

  return (
    <div data-store-shot={shot} style={{ minHeight: '100vh', background: '#07090d' }}>
      <Scene />
    </div>
  );
}
