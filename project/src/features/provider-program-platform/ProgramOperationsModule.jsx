import React from 'react';
import { BulletCard, DataTable, ModuleShell, StatGrid } from './shared';
import { useProviderProgramPlatformData } from './useProviderProgramPlatformData';

export default function ProgramOperationsModule() {
  const { programs } = useProviderProgramPlatformData();

  return (
    <ModuleShell
      title="Program Operations Module"
      description="Separate module for daycare and program setup, child roster management, and operational readiness before live dispatch."
      badge="Prepared only - not wired"
    >
      <StatGrid
        stats={[
          { label: 'Programs', value: programs.length, hint: 'staged program entities', color: '#c9a84c' },
          { label: 'Ready', value: programs.filter(program => program.future_ride_ready === 'ready').length, hint: 'future-ride ready', color: '#00e5a0' },
          { label: 'Children', value: programs.reduce((sum, program) => sum + program.active_children, 0), hint: 'active roster count', color: '#7dd3fc' },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <DataTable
          columns={[
            { key: 'program_name', label: 'Program' },
            { key: 'provider_admin_status', label: 'Provider Admin' },
            { key: 'future_ride_ready', label: 'Future Ride Readiness' },
            { key: 'active_children', label: 'Active Children' },
          ]}
          rows={programs}
          emptyText="No staged programs yet."
        />

        <BulletCard
          title="Module Scope"
          items={[
            'Program profile and transportation contact settings.',
            'Child roster and guardian details.',
            'Release rules, mobility notes, and pickup/dropoff storage.',
            'Operational handoff into future ride requests and dispatch-readiness.',
          ]}
        />
      </div>
    </ModuleShell>
  );
}
