import React from 'react';
import { ShieldCheck, XCircle, CheckCircle2 } from 'lucide-react';

const ROLES = ['admin', 'company', 'driver', 'rider'];
const RULES = [
  ['Live Dispatch', { admin: true, company: true, driver: false, rider: false }],
  ['Billing', { admin: true, company: true, driver: false, rider: false }],
  ['Sentry / Integrations', { admin: true, company: false, driver: false, rider: false }],
  ['AI Settings', { admin: true, company: true, driver: false, rider: false }],
  ['Security / MITRE', { admin: true, company: false, driver: false, rider: false }],
  ['Users & Companies', { admin: true, company: false, driver: false, rider: false }],
  ['Test Mode / Sandbox', { admin: true, company: false, driver: false, rider: false }],
  ['Driver App', { admin: true, company: true, driver: true, rider: false }],
  ['Rider Tracking', { admin: true, company: true, driver: false, rider: true }],
  ['Company Onboarding', { admin: false, company: true, driver: false, rider: false }],
  ['Community / Leaderboard', { admin: false, company: false, driver: true, rider: false }],
];

export default function PermissionsMatrix() {
  return (
    <div className="h-full overflow-y-auto p-6" style={{ color: '#e5e7eb' }}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-700 mb-1" style={{ color: '#c9a84c', fontWeight: 700 }}>Permissions Matrix</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)' }}>
            This shows the intended access model clearly. Use it as the source of truth when we harden role enforcement further.
          </p>
        </div>

        <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.18)' }}>
          <ShieldCheck className="w-4 h-4" style={{ color: '#c9a84c' }} />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Today this page is the visibility and policy reference. Next we can bind this to enforceable per-role feature flags and approval rules.
          </p>
        </div>

        <div className="md:hidden space-y-3">
          {RULES.map(([label, map]) => (
            <div
              key={label}
              className="rounded-2xl p-4"
              style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <p className="text-sm font-600 mb-3" style={{ color: '#e5e7eb', fontWeight: 600 }}>{label}</p>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map(role => {
                  const allowed = map[role];
                  return (
                    <div
                      key={`${label}-${role}`}
                      className="rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.55)', textTransform: 'capitalize', fontSize: 12 }}>{role}</span>
                      {allowed ? (
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#00e5a0' }} />
                      ) : (
                        <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.18)' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th className="text-left px-4 py-3" style={{ color: 'rgba(255,255,255,0.45)' }}>Capability</th>
                {ROLES.map(role => (
                  <th key={role} className="px-4 py-3 text-center" style={{ color: 'rgba(255,255,255,0.45)', textTransform: 'capitalize' }}>
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RULES.map(([label, map]) => (
                <tr key={label} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td className="px-4 py-3" style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{label}</td>
                  {ROLES.map(role => {
                    const allowed = map[role];
                    return (
                      <td key={`${label}-${role}`} className="px-4 py-3 text-center">
                        {allowed ? (
                          <CheckCircle2 className="w-4 h-4 mx-auto" style={{ color: '#00e5a0' }} />
                        ) : (
                          <XCircle className="w-4 h-4 mx-auto" style={{ color: 'rgba(255,255,255,0.18)' }} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
