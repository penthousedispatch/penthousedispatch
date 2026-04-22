import React from 'react';
import { BulletCard, ModuleShell, StatGrid, DISPATCH_READINESS_CHECKLIST } from './shared';
import { useProviderProgramPlatformData } from './useProviderProgramPlatformData';

export default function DispatchReadinessModule() {
  const { programs, parentSubscriptions, futureRideRequests } = useProviderProgramPlatformData();

  return (
    <ModuleShell
      title="Dispatch Readiness Module"
      description="This module is the handoff layer between enrollment and live operations. It answers one question: if a ride request appears right now, are we actually ready?"
      badge="Prepared only - not wired"
    >
      <StatGrid
        stats={[
          { label: 'Programs', value: programs.length, hint: 'must have provider admin ownership', color: '#c9a84c' },
          { label: 'Parent Records', value: parentSubscriptions.length, hint: 'future-use parents included', color: '#00e5a0' },
          { label: 'Future Requests', value: futureRideRequests.length, hint: 'rides waiting for later dispatch', color: '#7dd3fc' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BulletCard
          title="Readiness Checklist"
          items={DISPATCH_READINESS_CHECKLIST}
        />
        <BulletCard
          title="Integration Intent"
          items={[
            'Feed green-light records into live dispatch later.',
            'Block request creation if provider admin setup is missing.',
            'Surface missing guardian or release info before assignment.',
            'Use this module to keep the current site untouched until rollout time.',
          ]}
          tone="success"
        />
      </div>
    </ModuleShell>
  );
}
