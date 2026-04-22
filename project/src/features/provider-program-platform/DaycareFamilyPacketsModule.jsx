import React from 'react';
import { BulletCard, DataTable, DAYCARE_PACKET_SECTIONS, ModuleShell, StatGrid } from './shared';
import { useProviderProgramPlatformData } from './useProviderProgramPlatformData';

export default function DaycareFamilyPacketsModule() {
  const { daycareFamilyPackets } = useProviderProgramPlatformData();

  return (
    <ModuleShell
      title="Daycare Family Packets Module"
      description="Staged daycare family intake layer for child packets, authorized pickup contacts, future-ride permission, and sports or event transport readiness."
      badge="Prepared only - not wired"
    >
      <StatGrid
        stats={[
          { label: 'Family Packets', value: daycareFamilyPackets.length, hint: 'staged examples', color: '#c9a84c' },
          { label: 'Future Ride Permission', value: daycareFamilyPackets.filter(packet => packet.future_ride_permission === 'yes').length, hint: 'ready for later dispatch', color: '#00e5a0' },
          { label: 'Incomplete', value: daycareFamilyPackets.filter(packet => packet.packet_status !== 'complete').length, hint: 'needs family follow-up', color: '#f59e0b' },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
        <DataTable
          columns={[
            { key: 'child_name', label: 'Child' },
            { key: 'packet_status', label: 'Packet Status' },
            { key: 'future_ride_permission', label: 'Future Ride Permission' },
            { key: 'authorized_contacts', label: 'Authorized Contacts' },
            { key: 'sports_transport_interest', label: 'Sports / Event Need' },
          ]}
          rows={daycareFamilyPackets}
          emptyText="No daycare family packets staged yet."
        />

        <div className="space-y-4">
          <BulletCard
            title="Packet Sections"
            items={DAYCARE_PACKET_SECTIONS}
          />
          <BulletCard
            title="Daycare Angle"
            items={[
              'Parents enroll now even when service is not active today.',
              'Packet should cover football games, appointments, after-school programs, and special events.',
              'Authorized pickup and release restrictions should be captured before any ride becomes urgent.',
            ]}
            tone="success"
          />
        </div>
      </div>
    </ModuleShell>
  );
}
