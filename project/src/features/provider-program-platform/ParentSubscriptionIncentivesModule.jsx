import React from 'react';
import { BulletCard, DataTable, ModuleShell, StatGrid } from './shared';
import { useProviderProgramPlatformData } from './useProviderProgramPlatformData';

export default function ParentSubscriptionIncentivesModule() {
  const { parentSubscriptions } = useProviderProgramPlatformData();

  return (
    <ModuleShell
      title="Parent Subscriptions And Incentives Module"
      description="Separate module for subscription plans, signup credits, referral rewards, and the business case for getting parents enrolled before rides are active."
      badge="Prepared only - not wired"
    >
      <StatGrid
        stats={[
          { label: 'Subscriptions', value: parentSubscriptions.length, hint: 'staged records', color: '#c9a84c' },
          { label: 'Incentive Motion', value: parentSubscriptions.filter(item => item.incentive).length, hint: 'signup or referral offers', color: '#00e5a0' },
          { label: 'Use Model', value: 'Enroll now', hint: 'use later when rides are needed', color: '#7dd3fc' },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
        <DataTable
          columns={[
            { key: 'parent_name', label: 'Parent' },
            { key: 'child_name', label: 'Child' },
            { key: 'plan_type', label: 'Plan' },
            { key: 'status', label: 'Status' },
            { key: 'incentive', label: 'Incentive' },
            { key: 'use_case', label: 'Use Case' },
          ]}
          rows={parentSubscriptions}
          emptyText="No parent subscriptions staged yet."
        />

        <div className="space-y-4">
          <BulletCard
            title="Recommended Incentive Rules"
            items={[
              'Signup credit when parent subscribes early.',
              'Referral reward when the family brings another family in.',
              'Retention rule if they keep the subscription active for a minimum period.',
            ]}
          />
          <BulletCard
            title="Why This Exists"
            items={[
              'Parents should not wait until they suddenly need dispatch.',
              'Provider gets a deeper dispatch-ready roster.',
              'Future rides become easier to create and assign.',
            ]}
            tone="info"
          />
        </div>
      </div>
    </ModuleShell>
  );
}
