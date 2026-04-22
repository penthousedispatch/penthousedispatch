import React from 'react';
import { BulletCard, DataTable, ModuleShell, StatGrid } from './shared';
import { useProviderProgramPlatformData } from './useProviderProgramPlatformData';

export default function SafetyControlsModule() {
  const { safetyControls } = useProviderProgramPlatformData();

  return (
    <ModuleShell
      title="Safety Controls Module"
      description="Staged child-transport safety layer for guardian release, incident escalation, training, attestations, and dispatch-blocking rules."
      badge="Prepared only - not wired"
    >
      <StatGrid
        stats={[
          { label: 'Controls', value: safetyControls.length, hint: 'staged safety rules', color: '#c9a84c' },
          { label: 'High Severity', value: safetyControls.filter(item => item.severity === 'high').length, hint: 'must block unsafe dispatch', color: '#ff7a7a' },
          { label: 'Required', value: safetyControls.filter(item => item.status === 'required').length, hint: 'non-optional controls', color: '#00e5a0' },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
        <DataTable
          columns={[
            { key: 'control_name', label: 'Control' },
            { key: 'status', label: 'Status' },
            { key: 'severity', label: 'Severity' },
            { key: 'owner', label: 'Owner' },
          ]}
          rows={safetyControls}
          emptyText="No safety controls staged yet."
        />

        <div className="space-y-4">
          <BulletCard
            title="Safety Design Rules"
            items={[
              'Do not allow dispatch if guardian release requirements are missing.',
              'Track incidents and near-misses as structured events.',
              'Track training and policy attestations, not just notes.',
              'Separate release exceptions from generic incidents in reporting.',
            ]}
          />
          <BulletCard
            title="Integration Intent"
            items={[
              'Later tie safety state to dispatch blocking.',
              'Support procurement and compliance review with real safety artifacts.',
              'Keep this staged now so safety is not bolted on at the end.',
            ]}
            tone="info"
          />
        </div>
      </div>
    </ModuleShell>
  );
}
