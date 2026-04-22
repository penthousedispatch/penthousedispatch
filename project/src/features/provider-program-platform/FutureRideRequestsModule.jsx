import React from 'react';
import { BulletCard, DataTable, ModuleShell, StatGrid } from './shared';
import { useProviderProgramPlatformData } from './useProviderProgramPlatformData';

export default function FutureRideRequestsModule() {
  const { futureRideRequests } = useProviderProgramPlatformData();

  return (
    <ModuleShell
      title="Future Ride Requests Module"
      description="Staged module for non-immediate dispatch requests like appointments, football games, programs, and other future transportation needs."
      badge="Prepared only - not wired"
    >
      <StatGrid
        stats={[
          { label: 'Future Requests', value: futureRideRequests.length, hint: 'staged demand examples', color: '#c9a84c' },
          { label: 'Ready', value: futureRideRequests.filter(item => item.readiness === 'ready').length, hint: 'request can move to dispatch', color: '#00e5a0' },
          { label: 'Use Cases', value: 'medical + sports', hint: 'expandable request types', color: '#7dd3fc' },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
        <DataTable
          columns={[
            { key: 'child_name', label: 'Child' },
            { key: 'ride_type', label: 'Ride Type' },
            { key: 'requested_by', label: 'Requested By' },
            { key: 'dispatch_window', label: 'Dispatch Window' },
            { key: 'readiness', label: 'Readiness' },
          ]}
          rows={futureRideRequests}
          emptyText="No future ride requests staged yet."
        />

        <BulletCard
          title="Examples This Should Cover"
          items={[
            'Doctor and therapy appointments.',
            'After-school programs and summer programs.',
            'Football games and school events.',
            'Bus backup or transportation failure days.',
          ]}
        />
      </div>
    </ModuleShell>
  );
}
