import React from 'react';
import { BulletCard, DataTable, ModuleShell, REPORTING_CATEGORIES, StatGrid } from './shared';
import { useProviderProgramPlatformData } from './useProviderProgramPlatformData';

export default function ComplianceReportingModule() {
  const { reportingRows } = useProviderProgramPlatformData();

  return (
    <ModuleShell
      title="Compliance And Reporting Module"
      description="Staged reporting layer for auditability, compliance evidence, utilization, incidents, and institutional reporting expectations."
      badge="Prepared only - not wired"
    >
      <StatGrid
        stats={[
          { label: 'Reports', value: reportingRows.length, hint: 'staged outputs', color: '#c9a84c' },
          { label: 'Real-Time', value: reportingRows.filter(item => item.cadence === 'real-time').length, hint: 'incident and exception reporting', color: '#00e5a0' },
          { label: 'Categories', value: REPORTING_CATEGORIES.length, hint: 'prepared compliance buckets', color: '#7dd3fc' },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
        <DataTable
          columns={[
            { key: 'report_name', label: 'Report' },
            { key: 'audience', label: 'Audience' },
            { key: 'cadence', label: 'Cadence' },
            { key: 'metric_focus', label: 'Metric Focus' },
          ]}
          rows={reportingRows}
          emptyText="No reporting artifacts staged yet."
        />

        <div className="space-y-4">
          <BulletCard
            title="Reporting Categories"
            items={REPORTING_CATEGORIES.map(item => item.replaceAll('_', ' '))}
          />
          <BulletCard
            title="Expected Later Outputs"
            items={[
              'Enrollment and dispatch-readiness summaries.',
              'Guardian release exceptions and incident logs.',
              'Future ride demand and utilization reports.',
              'Subscription and incentive exposure reporting.',
            ]}
            tone="success"
          />
        </div>
      </div>
    </ModuleShell>
  );
}
