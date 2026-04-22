import React from 'react';
import { BulletCard, DataTable, DAYCARE_SITE_REQUIREMENTS, ModuleShell, StatGrid } from './shared';
import { useProviderProgramPlatformData } from './useProviderProgramPlatformData';

export default function DaycareOperationsModule() {
  const { daycareSites } = useProviderProgramPlatformData();

  return (
    <ModuleShell
      title="Daycare Operations Module"
      description="Staged daycare-specific operations layer for dismissal windows, classroom handoff, release policy, and future ride intake."
      badge="Prepared only - not wired"
    >
      <StatGrid
        stats={[
          { label: 'Daycare Sites', value: daycareSites.length, hint: 'multi-site capable', color: '#c9a84c' },
          { label: 'Future Ride Intake', value: daycareSites.filter(site => site.future_ride_intake === 'enabled').length, hint: 'sites accepting later ride requests', color: '#00e5a0' },
          { label: 'Release Rule Types', value: '2', hint: 'guardian and authorized-list flows', color: '#7dd3fc' },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
        <DataTable
          columns={[
            { key: 'site_name', label: 'Daycare Site' },
            { key: 'dismissal_window', label: 'Dismissal Window' },
            { key: 'classroom_handoff', label: 'Classroom Handoff' },
            { key: 'release_policy', label: 'Release Policy' },
            { key: 'future_ride_intake', label: 'Future Ride Intake' },
          ]}
          rows={daycareSites}
          emptyText="No daycare site operations staged yet."
        />

        <div className="space-y-4">
          <BulletCard
            title="Daycare Site Requirements"
            items={DAYCARE_SITE_REQUIREMENTS}
          />
          <BulletCard
            title="Why This Matters"
            items={[
              'Daycare operations break down at dismissal if release rules are vague.',
              'Dispatch needs a clean handoff model before the first ride is ever requested.',
              'Future rides only work when the site-level workflow is already defined.',
            ]}
            tone="info"
          />
        </div>
      </div>
    </ModuleShell>
  );
}
