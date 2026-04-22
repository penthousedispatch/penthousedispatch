import React from 'react';
import { Building2, ClipboardList, CreditCard, CalendarClock, ShieldCheck, Users, FileCheck, FileText, Siren } from 'lucide-react';

export const MODULE_THEME = {
  card: {
    background: '#0d1117',
    border: '1px solid rgba(255,255,255,0.07)',
  },
  mutedText: {
    color: 'rgba(255,255,255,0.45)',
  },
  strongText: {
    color: '#e5e7eb',
  },
  accent: '#c9a84c',
  success: '#00e5a0',
  info: '#7dd3fc',
};

export const PROVIDER_PLATFORM_MODULES = [
  {
    id: 'provider-admin',
    name: 'Provider Admin',
    icon: Building2,
    summary: 'Provider signs up as the company admin and controls the whole program workspace.',
  },
  {
    id: 'program-ops',
    name: 'Program Ops',
    icon: ClipboardList,
    summary: 'Program setup, child roster, guardian rules, and transportation-readiness controls.',
  },
  {
    id: 'parent-enrollment',
    name: 'Parent Enrollment',
    icon: Users,
    summary: 'Parents enroll children now, even if rides are only needed in the future.',
  },
  {
    id: 'parent-subscriptions',
    name: 'Parent Subscriptions',
    icon: CreditCard,
    summary: 'Subscription plans, signup credits, referral rewards, and billing positioning.',
  },
  {
    id: 'future-rides',
    name: 'Future Ride Intake',
    icon: CalendarClock,
    summary: 'Appointments, programs, football games, and other later dispatch requests.',
  },
  {
    id: 'dispatch-readiness',
    name: 'Dispatch Readiness',
    icon: ShieldCheck,
    summary: 'Marks children and families as ready-to-dispatch before a ride is requested.',
  },
  {
    id: 'procurement',
    name: 'Procurement',
    icon: FileCheck,
    summary: 'Vendor readiness, insurance, contracting, and public-sector procurement staging.',
  },
  {
    id: 'reporting',
    name: 'Reporting',
    icon: FileText,
    summary: 'Compliance, utilization, audit, incident, and buyer-facing reporting layers.',
  },
  {
    id: 'safety-controls',
    name: 'Safety Controls',
    icon: Siren,
    summary: 'Guardian release, incident escalation, training, and dispatch blocking rules.',
  },
  {
    id: 'daycare-operations',
    name: 'Daycare Operations',
    icon: ClipboardList,
    summary: 'Site schedules, dismissal windows, classroom handoff, and pickup flow for daycare operators.',
  },
  {
    id: 'daycare-family-packets',
    name: 'Daycare Family Packets',
    icon: Users,
    summary: 'Enrollment packet, authorized pickup list, future-use rides, and family intake required for daycare rollout.',
  },
];

export const SUBSCRIPTION_PLAN_OPTIONS = [
  'monthly',
  'annual',
  'trial',
  'case-by-case',
];

export const FUTURE_RIDE_USE_CASES = [
  'medical_appointment',
  'therapy',
  'after_school_program',
  'sports',
  'school_event',
  'summer_program',
  'special_event',
  'bus_backup',
];

export const DISPATCH_READINESS_CHECKLIST = [
  'Provider signed up as a company admin',
  'Program profile exists',
  'Child roster entry exists',
  'Guardian contact exists',
  'Pickup and dropoff saved',
  'Release rules documented',
  'Subscription or future-use status explained',
];

export const PROCUREMENT_REQUIREMENTS = [
  'Provider admin identity and onboarding complete',
  'Insurance packet status tracked',
  'Contract or MOU status tracked',
  'Background checks tracked',
  'Training attestations tracked',
  'Policy acknowledgments tracked',
];

export const REPORTING_CATEGORIES = [
  'utilization',
  'future_ride_requests',
  'incident_log',
  'guardian_release_exceptions',
  'service_gaps',
  'billing_and_incentive_exposure',
];

export const DAYCARE_SITE_REQUIREMENTS = [
  'Site address and arrival window',
  'Dismissal windows by classroom or age band',
  'Authorized pickup and release rules',
  'Parent contact ladder and backup contacts',
  'Allergy, mobility, behavior, and aide notes',
  'Daily absence and future-ride request workflow',
];

export const DAYCARE_PACKET_SECTIONS = [
  'child profile',
  'guardian contacts',
  'authorized pickup contacts',
  'release restrictions',
  'future ride permission',
  'medical and behavior notes',
  'sports and special event transport needs',
];

export function ModuleShell({ title, description, badge, children }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-5" style={MODULE_THEME.card}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-700 mb-1" style={{ ...MODULE_THEME.strongText, fontWeight: 700 }}>{title}</h2>
            <p className="text-sm" style={MODULE_THEME.mutedText}>{description}</p>
          </div>
          {badge ? (
            <span
              className="text-xs px-3 py-1 rounded-full"
              style={{ background: 'rgba(201,168,76,0.12)', color: MODULE_THEME.accent, border: '1px solid rgba(201,168,76,0.2)' }}
            >
              {badge}
            </span>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function StatGrid({ stats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {stats.map(stat => (
        <div key={stat.label} className="rounded-xl p-4" style={MODULE_THEME.card}>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,0.42)' }}>{stat.label}</p>
          <p className="text-2xl font-700" style={{ ...MODULE_THEME.strongText, fontWeight: 700 }}>{stat.value}</p>
          <p className="text-xs mt-2" style={{ color: stat.color || MODULE_THEME.accent }}>{stat.hint}</p>
        </div>
      ))}
    </div>
  );
}

export function BulletCard({ title, items, tone = 'default' }) {
  const toneColor =
    tone === 'success' ? MODULE_THEME.success :
    tone === 'info' ? MODULE_THEME.info :
    MODULE_THEME.accent;

  return (
    <div className="rounded-xl p-4" style={MODULE_THEME.card}>
      <p className="text-sm font-600 mb-3" style={{ color: toneColor, fontWeight: 600 }}>{title}</p>
      <div className="space-y-2">
        {items.map(item => (
          <p key={item} className="text-sm leading-6" style={MODULE_THEME.mutedText}>
            • {item}
          </p>
        ))}
      </div>
    </div>
  );
}

export function DataTable({ columns, rows, emptyText = 'No rows yet.' }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl p-5 text-sm" style={{ ...MODULE_THEME.card, ...MODULE_THEME.mutedText }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={MODULE_THEME.card}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
            <tr>
              {columns.map(column => (
                <th key={column.key} className="px-4 py-3 text-left" style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || index} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {columns.map(column => (
                  <td key={column.key} className="px-4 py-3" style={MODULE_THEME.strongText}>
                    {column.render ? column.render(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
