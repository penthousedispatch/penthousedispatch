import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, ClipboardList, FileCheck, LogOut, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { providerProgramPlatformRegistry } from '../../features/provider-program-platform/moduleRegistry';
import { PROVIDER_PLATFORM_MODULES } from '../../features/provider-program-platform/shared.jsx';
import { getCompanySegmentMeta } from '../../lib/companyType';

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

const MODULE_META_BY_KEY = {
  providerAdmin: 'provider-admin',
  daycareOperations: 'daycare-operations',
  daycareFamilyPackets: 'daycare-family-packets',
  programOps: 'program-ops',
  parentEnrollment: 'parent-enrollment',
  parentSubscriptions: 'parent-subscriptions',
  futureRideRequests: 'future-rides',
  dispatchReadiness: 'dispatch-readiness',
  procurement: 'procurement',
  reporting: 'reporting',
  safetyControls: 'safety-controls',
};

function StatCard({ icon: Icon, label, value, hint, color }) {
  return (
    <div className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${color}20`, color }}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs uppercase tracking-[0.22em] mb-2" style={{ color: 'rgba(255,255,255,0.42)' }}>{label}</p>
      <p className="text-3xl font-700 mb-2" style={{ color: '#f8fafc', fontWeight: 700 }}>{value}</p>
      <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.58)' }}>{hint}</p>
    </div>
  );
}

export default function DaycareProviderDashboard({ previewMode = false, companyOverride = null }) {
  const { company } = useApp();
  const activeCompany = companyOverride || company;
  const segmentMeta = getCompanySegmentMeta(activeCompany);
  const [activeModuleKey, setActiveModuleKey] = React.useState('daycareOperations');
  const ActiveModule = providerProgramPlatformRegistry[activeModuleKey]?.component || providerProgramPlatformRegistry.providerAdmin.component;

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(0,229,160,0.12) 0%, transparent 30%), radial-gradient(circle at top right, rgba(14,165,233,0.10) 0%, transparent 26%), linear-gradient(180deg, #061018 0%, #08111a 100%)',
        color: '#e5e7eb',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 py-5 md:px-6 lg:px-8 space-y-6">
        <div
          className="rounded-3xl p-6 lg:p-7"
          style={{
            background: 'linear-gradient(135deg, rgba(0,229,160,0.14), rgba(14,165,233,0.09))',
            border: '1px solid rgba(125,211,252,0.14)',
          }}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span
                  className="text-xs px-3 py-1 rounded-full"
                  style={{ background: `${segmentMeta.accent}20`, border: `1px solid ${segmentMeta.accent}40`, color: segmentMeta.accent }}
                >
                  {segmentMeta.label}
                </span>
                <span
                  className="text-xs px-3 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.62)' }}
                >
                  Provider workflow dashboard
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-700 leading-tight mb-3" style={{ color: '#f8fafc', fontWeight: 700 }}>
                {activeCompany?.app_display_name || activeCompany?.company_name || 'Provider Dashboard'}
              </h1>
              <p className="text-sm md:text-base leading-7" style={{ color: 'rgba(255,255,255,0.66)' }}>
                This layout is different from the regular dispatch company dashboard. It is built around provider-admin setup,
                daycare operations, family packets, future rides, safety, and compliance workflow.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {previewMode && activeCompany?.id && (
                <Link
                  to="/admin/companies"
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl text-sm"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', textDecoration: 'none' }}
                >
                  Back To Companies
                </Link>
              )}
              <button
                onClick={() => supabase.auth.signOut()}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl text-sm"
                style={{ background: 'rgba(255,71,87,0.10)', border: '1px solid rgba(255,71,87,0.2)', color: '#ff6b7a' }}
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard icon={Building2} label="Admin model" value="Provider-led" hint="The daycare or program operator owns the account first." color={segmentMeta.accent} />
          <StatCard icon={Users} label="Parent strategy" value="Enroll early" hint="Families can pre-enroll before they need the first ride." color="#00e5a0" />
          <StatCard icon={ClipboardList} label="Operations" value="Site + packet" hint="Dismissal flow and family handoff rules stay together." color="#0ea5e9" />
          <StatCard icon={ShieldCheck} label="Safety" value="Release first" hint="Guardian permissions stay ahead of dispatch activity." color="#f59e0b" />
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
          <aside className="rounded-3xl p-4 h-fit" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-xs uppercase tracking-[0.22em] px-2 mb-3" style={{ color: 'rgba(255,255,255,0.42)' }}>Provider Workflow</p>
            <div className="space-y-2">
              {MODULE_ORDER.map(key => {
                const moduleEntry = providerProgramPlatformRegistry[key];
                const moduleMeta = PROVIDER_PLATFORM_MODULES.find(item => item.id === MODULE_META_BY_KEY[key]);
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
                      background: isActive ? `${segmentMeta.accent}18` : 'rgba(255,255,255,0.03)',
                      border: isActive ? `1px solid ${segmentMeta.accent}55` : '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: isActive ? `${segmentMeta.accent}18` : 'rgba(255,255,255,0.05)', color: isActive ? segmentMeta.accent : '#e5e7eb' }}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-600 mb-1" style={{ color: '#f8fafc', fontWeight: 600 }}>{moduleEntry.name}</p>
                        <p className="text-xs leading-5" style={{ color: 'rgba(255,255,255,0.55)' }}>{moduleMeta.summary}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="space-y-5">
            <div className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-xs uppercase tracking-[0.22em] mb-2" style={{ color: segmentMeta.accent }}>Current Focus</p>
              <h2 className="text-xl font-700 mb-2" style={{ color: '#f8fafc', fontWeight: 700 }}>
                {providerProgramPlatformRegistry[activeModuleKey]?.name || 'Provider Module'}
              </h2>
              <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.62)' }}>
                This screen keeps provider process control front and center instead of defaulting to the normal trip and driver company layout.
              </p>
            </div>

            <ActiveModule />

            <div className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-xs uppercase tracking-[0.22em] mb-3" style={{ color: '#7dd3fc' }}>Why this is different</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  'It starts with provider-admin control instead of dispatch operations.',
                  'It keeps daycare site rules and family packet readiness visible before demand spikes.',
                  'It gives procurement, compliance, and safety the same weight as enrollment and future rides.',
                ].map(item => (
                  <div key={item} className="rounded-2xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.035)' }}>
                    <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.62)' }}>{item}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm" style={{ color: segmentMeta.accent }}>
                <FileCheck className="w-4 h-4" />
                Admin can open these provider accounts from `Companies` and land in this layout automatically.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
