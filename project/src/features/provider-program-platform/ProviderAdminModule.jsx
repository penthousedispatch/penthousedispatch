import React from 'react';
import { BulletCard, DataTable, ModuleShell, StatGrid } from './shared';
import { useProviderProgramPlatformData } from './useProviderProgramPlatformData';

export default function ProviderAdminModule() {
  const { providers } = useProviderProgramPlatformData();

  return (
    <ModuleShell
      title="Provider Admin Module"
      description="This module assumes daycare and program operators must sign up as company admins first before they manage children, subscriptions, or future ride intake."
      badge="Prepared only - not wired"
    >
      <StatGrid
        stats={[
          { label: 'Providers', value: providers.length, hint: 'company-admin entities', color: '#c9a84c' },
          { label: 'Admin Required', value: providers.filter(provider => provider.onboarding_status !== 'ready').length, hint: 'must finish signup', color: '#f59e0b' },
          { label: 'Dispatch-Ready Children', value: providers.reduce((sum, provider) => sum + provider.dispatch_ready_children, 0), hint: 'across staged providers', color: '#00e5a0' },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
        <DataTable
          columns={[
            { key: 'admin_name', label: 'Provider' },
            { key: 'onboarding_status', label: 'Admin Signup' },
            { key: 'parent_enrollment_rate', label: 'Parent Enrollment' },
            { key: 'dispatch_ready_children', label: 'Dispatch-Ready Children' },
          ]}
          rows={providers}
          emptyText="No provider admin records staged yet."
        />

        <div className="space-y-4">
          <BulletCard
            title="Provider Admin Rules"
            items={[
              'Provider must sign up as a company account first.',
              'Provider admin owns program profile, roster, subscriptions, and dispatch-readiness.',
              'No parent enrollment flow should be treated as complete if there is no provider admin record.',
            ]}
          />
          <BulletCard
            title="Future Integration Notes"
            items={[
              'Map provider signup into company onboarding.',
              'Attach provider-admin permissions to program and parent modules.',
              'Use this module as the enforcement layer for admin-required workflows.',
            ]}
            tone="info"
          />
        </div>
      </div>
    </ModuleShell>
  );
}
