import React from 'react';
import { BulletCard, DataTable, ModuleShell, PROCUREMENT_REQUIREMENTS, StatGrid } from './shared';
import { useProviderProgramPlatformData } from './useProviderProgramPlatformData';

export default function ProcurementReadinessModule() {
  const { procurementRecords } = useProviderProgramPlatformData();

  return (
    <ModuleShell
      title="Procurement Readiness Module"
      description="Staged vendor and procurement layer for insurance, contracts, qualification, and public-sector buyer readiness."
      badge="Prepared only - not wired"
    >
      <StatGrid
        stats={[
          { label: 'Vendors', value: procurementRecords.length, hint: 'staged provider entities', color: '#c9a84c' },
          { label: 'Review Ready', value: procurementRecords.filter(item => item.procurement_status === 'ready for review').length, hint: 'can move into buyer review', color: '#00e5a0' },
          { label: 'Missing Docs', value: procurementRecords.filter(item => item.insurance_status !== 'verified').length, hint: 'insurance or packet gaps', color: '#f59e0b' },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
        <DataTable
          columns={[
            { key: 'provider_name', label: 'Provider' },
            { key: 'procurement_status', label: 'Procurement Status' },
            { key: 'insurance_status', label: 'Insurance' },
            { key: 'contract_status', label: 'Contract' },
            { key: 'background_checks', label: 'Background Checks' },
          ]}
          rows={procurementRecords}
          emptyText="No procurement staging records yet."
        />

        <div className="space-y-4">
          <BulletCard
            title="Required Procurement Controls"
            items={PROCUREMENT_REQUIREMENTS}
          />
          <BulletCard
            title="Purpose"
            items={[
              'Make this side of the platform look procurement-ready instead of consumer-only.',
              'Support later county, school, nonprofit, or managed-care buyer conversations.',
              'Stage missing vendor controls before rollout pressure shows up.',
            ]}
            tone="info"
          />
        </div>
      </div>
    </ModuleShell>
  );
}
