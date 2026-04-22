import React from 'react';
import { BulletCard, ModuleShell, StatGrid } from './shared';
import { useProviderProgramPlatformData } from './useProviderProgramPlatformData';

export default function ParentEnrollmentModule() {
  const { parentSubscriptions } = useProviderProgramPlatformData();
  const preEnrolledCount = parentSubscriptions.filter(item => item.use_case === 'future rides' || item.status === 'pre-enrolled').length;

  return (
    <ModuleShell
      title="Parent Enrollment Module"
      description="This module is for getting all parents enrolled now so children are dispatch-ready later, even when no current service is active."
      badge="Prepared only - not wired"
    >
      <StatGrid
        stats={[
          { label: 'Parent Records', value: parentSubscriptions.length, hint: 'staged subscriptions', color: '#c9a84c' },
          { label: 'Future-Use Enrollments', value: preEnrolledCount, hint: 'not waiting for active rides', color: '#00e5a0' },
          { label: 'Reason', value: 'Pre-enroll', hint: 'appointments, sports, bus backup', color: '#7dd3fc' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BulletCard
          title="Enrollment Positioning"
          items={[
            'Parents sign up even if rides are only needed later.',
            'Children stay dispatch-ready for appointments, programs, sports, and emergency schedule gaps.',
            'Some children cannot use bus service, so the platform should be ready before transportation becomes urgent.',
          ]}
        />
        <BulletCard
          title="What This Module Should Capture"
          items={[
            'Child identity and guardian contacts.',
            'Future-use intent even when current rides are zero.',
            'Addresses, release rules, and mobility notes.',
            'Consent and readiness for later dispatch requests.',
          ]}
          tone="success"
        />
      </div>
    </ModuleShell>
  );
}
