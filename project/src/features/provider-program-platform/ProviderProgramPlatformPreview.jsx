import React from 'react';
import { ArrowRight, BadgeDollarSign, Building2, ClipboardCheck, FileText, ShieldCheck, Users } from 'lucide-react';
import { providerProgramPlatformRegistry } from './moduleRegistry';
import { MODULE_THEME, PROVIDER_PLATFORM_MODULES } from './shared';

const MODULE_ORDER = [
  'providerAdmin',
  'daycareOperations',
  'daycareFamilyPackets',
  'programOps',
  'parentEnrollment',
  'parentSubscriptions',
  'futureRideRequests',
  'dispatchReadiness',
  'procurement',
  'reporting',
  'safetyControls',
];

const DAYCARE_FLOW = [
  {
    title: '1. Provider becomes admin',
    detail: 'Daycare or program operator signs up first as the admin account that controls the site, roster, safety rules, and dispatch settings.',
  },
  {
    title: '2. Parents enroll early',
    detail: 'Families add their child now even if they do not need a ride today, so the child is already in the system when a future need comes up.',
  },
  {
    title: '3. Family packet locks in release rules',
    detail: 'The packet captures pickup contacts, restrictions, behavior or medical notes, and permission for later rides like sports, appointments, or events.',
  },
  {
    title: '4. Dispatch readiness is built before demand spikes',
    detail: 'The platform marks each child as ready, partially ready, or blocked so staff are not scrambling when a same-week ride request shows up.',
  },
  {
    title: '5. Compliance and funding reporting follow the same workflow',
    detail: 'Procurement, safety, incident logging, and utilization reporting stay attached to the same child, provider, and program records.',
  },
];

const PARENT_INCENTIVES = [
  'signup credits that reduce the first paid ride or family plan fee',
  'referral rewards when another parent enrolls a child',
  'priority dispatch positioning for pre-enrolled families',
  'stored family packet so parents do not have to redo intake during urgent ride requests',
];

const FUNDING_PATHS = [
  'managed Medicaid or brokerage transportation contracts where eligible',
  'county or city youth / family transportation programs',
  'school, district, or after-school program transport agreements',
  'grant-backed mobility pilots for attendance, therapy, or enrichment access',
];

function PreviewSection({ title, eyebrow, children, aside }) {
  return (
    <section
      className="rounded-3xl p-6 lg:p-8"
      style={{
        background: 'linear-gradient(180deg, rgba(13,17,23,0.96) 0%, rgba(9,12,18,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
      }}
    >
      <div className="flex items-start justify-between gap-6 flex-wrap mb-5">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className="text-xs uppercase tracking-[0.28em] mb-3" style={{ color: 'rgba(201,168,76,0.72)' }}>
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-2xl font-700 mb-2" style={{ color: '#f8fafc', fontWeight: 700 }}>
            {title}
          </h2>
        </div>
        {aside || null}
      </div>
      {children}
    </section>
  );
}

function SummaryCard({ icon: Icon, title, value, detail, color = '#c9a84c' }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div className="w-11 h-11 rounded-2xl mb-4 flex items-center justify-center" style={{ background: `${color}20`, color }}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(255,255,255,0.42)' }}>
        {title}
      </p>
      <p className="text-3xl font-700 mb-2" style={{ color: '#f8fafc', fontWeight: 700 }}>
        {value}
      </p>
      <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.58)' }}>
        {detail}
      </p>
    </div>
  );
}

export default function ProviderProgramPlatformPreview() {
  const [activeModuleKey, setActiveModuleKey] = React.useState('daycareOperations');
  const ActiveModule = providerProgramPlatformRegistry[activeModuleKey]?.component || providerProgramPlatformRegistry.providerAdmin.component;

  return (
    <div
      className="min-h-screen px-4 py-8 md:px-6 lg:px-8"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(201,168,76,0.16) 0%, rgba(201,168,76,0.02) 22%, transparent 40%), linear-gradient(180deg, #06080d 0%, #0a0f17 100%)',
      }}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <PreviewSection
          eyebrow="Daycare + Program Platform Preview"
          title="Local integration page for the daycare angle"
          aside={
            <span
              className="text-xs px-3 py-2 rounded-full"
              style={{ background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0' }}
            >
              staged locally, not part of the live workflow
            </span>
          }
        >
          <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl font-700 leading-tight" style={{ color: '#f8fafc', fontWeight: 700 }}>
                A daycare signs up once, families enroll once, and dispatch is ready before the ride is needed.
              </h1>
              <p className="text-base leading-7 max-w-3xl" style={{ color: 'rgba(255,255,255,0.66)' }}>
                This preview ties together provider-admin onboarding, daycare site rules, family packets, parent subscription incentives,
                future ride intake, procurement, reporting, and safety controls into one staged package.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href="#module-preview"
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-600 transition-all"
                  style={{ background: '#c9a84c', color: '#06080d', fontWeight: 600 }}
                >
                  Open module preview
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="#funding"
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl text-sm"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', background: 'rgba(255,255,255,0.03)' }}
                >
                  See funding paths
                </a>
              </div>
            </div>

            <div
              className="rounded-3xl p-5"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <p className="text-sm font-600 mb-4" style={{ color: MODULE_THEME.accent, fontWeight: 600 }}>
                What this is solving
              </p>
              <div className="space-y-3">
                {[
                  'Children who cannot always rely on a bus route.',
                  'Families who need transport later for appointments, football games, after-school programs, and other events.',
                  'Daycare and program operators who need admin control before parent enrollment starts.',
                  'A platform that can support future procurement and reporting instead of acting like a one-off ride form.',
                ].map(item => (
                  <div key={item} className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.66)' }}>
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PreviewSection>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <SummaryCard
            icon={Building2}
            title="Admin-first model"
            value="Provider-led"
            detail="Daycare and program operators start as the admin account before any family flow is treated as complete."
          />
          <SummaryCard
            icon={Users}
            title="Parent strategy"
            value="Enroll early"
            detail="Families can sign up now and stay on file for future rides instead of waiting for the first urgent request."
            color="#00e5a0"
          />
          <SummaryCard
            icon={BadgeDollarSign}
            title="Incentive stack"
            value="Credits + referrals"
            detail="The parent subscription layer is built around signup credits, referrals, and better readiness for future transport."
            color="#7dd3fc"
          />
          <SummaryCard
            icon={ShieldCheck}
            title="Compliance layer"
            value="Procurement-ready"
            detail="Safety controls, reporting, and audit visibility stay attached to the same operating records."
            color="#f59e0b"
          />
        </section>

        <PreviewSection eyebrow="How The Daycare Angle Works" title="This is the actual business flow the preview is built around">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {DAYCARE_FLOW.map(step => (
              <div
                key={step.title}
                className="rounded-2xl p-4"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <p className="text-sm font-600 mb-2" style={{ color: MODULE_THEME.accent, fontWeight: 600 }}>
                  {step.title}
                </p>
                <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {step.detail}
                </p>
              </div>
            ))}
          </div>
        </PreviewSection>

        <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
          <PreviewSection eyebrow="Parent Offer" title="Why parents would subscribe before they need service">
            <div className="space-y-3">
              {PARENT_INCENTIVES.map(item => (
                <div key={item} className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.66)' }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </PreviewSection>

          <PreviewSection eyebrow="Admin Guardrails" title="What the provider admin must own">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  icon: ClipboardCheck,
                  title: 'Enrollment controls',
                  detail: 'Parent intake, child packet status, and missing permissions should all roll up under the provider admin.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Release controls',
                  detail: 'No ride should move forward unless pickup contacts, release restrictions, and site handoff rules are defined.',
                },
                {
                  icon: FileText,
                  title: 'Reporting controls',
                  detail: 'Utilization, incidents, and future-ride demand should be packaged in buyer-facing reports.',
                },
                {
                  icon: Building2,
                  title: 'Procurement controls',
                  detail: 'Insurance, contract status, training, and background checks need a clear readiness view before expansion.',
                },
              ].map(card => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.title}
                    className="rounded-2xl p-4"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <div className="w-10 h-10 rounded-2xl mb-3 flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.12)', color: MODULE_THEME.accent }}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className="text-sm font-600 mb-2" style={{ color: '#f8fafc', fontWeight: 600 }}>
                      {card.title}
                    </p>
                    <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {card.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </PreviewSection>
        </div>

        <PreviewSection
          eyebrow="Module Preview"
          title="Pick a staged module and inspect it"
          aside={
            <span id="module-preview" className="text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>
              {MODULE_ORDER.length} staged modules
            </span>
          }
        >
          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
            <div className="space-y-2">
              {MODULE_ORDER.map(key => {
                const moduleEntry = providerProgramPlatformRegistry[key];
                const moduleMeta = PROVIDER_PLATFORM_MODULES.find(item => {
                  const normalized = item.id.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
                  return normalized === key;
                });

                if (!moduleEntry || !moduleMeta) return null;

                const Icon = moduleMeta.icon;
                const isActive = activeModuleKey === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveModuleKey(key)}
                    className="w-full text-left rounded-2xl p-4 transition-all"
                    style={{
                      background: isActive ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.025)',
                      border: isActive ? '1px solid rgba(201,168,76,0.26)' : '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: isActive ? 'rgba(201,168,76,0.16)' : 'rgba(255,255,255,0.05)', color: isActive ? MODULE_THEME.accent : '#e5e7eb' }}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-600 mb-1" style={{ color: '#f8fafc', fontWeight: 600 }}>
                          {moduleEntry.name}
                        </p>
                        <p className="text-xs leading-5" style={{ color: 'rgba(255,255,255,0.56)' }}>
                          {moduleMeta.summary}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              <ActiveModule />
            </div>
          </div>
        </PreviewSection>

        <PreviewSection
          eyebrow="Funding Paths"
          title="Ways this kind of platform can potentially be paid for"
          aside={<span id="funding" className="text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>planning view, not legal advice</span>}
        >
          <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-5">
            <div className="space-y-3">
              {FUNDING_PATHS.map(item => (
                <div key={item} className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.66)' }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
            <div
              className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-sm font-600 mb-3" style={{ color: MODULE_THEME.accent, fontWeight: 600 }}>
                What makes payment more realistic
              </p>
              <div className="space-y-3" style={{ color: 'rgba(255,255,255,0.62)' }}>
                <p className="text-sm leading-6">You usually do not get paid just because an app exists. The stronger angle is showing a real transportation service with controls, eligible riders, reporting, and contract readiness.</p>
                <p className="text-sm leading-6">This package was structured so buyer conversations can point to provider onboarding, safety workflow, incident visibility, family permissions, and utilization reporting instead of only talking about software screens.</p>
                <p className="text-sm leading-6">Before treating any funding path as active, you would still want legal, Medicaid, procurement, and local contract review for the exact state or city opportunity.</p>
              </div>
            </div>
          </div>
        </PreviewSection>
      </div>
    </div>
  );
}
