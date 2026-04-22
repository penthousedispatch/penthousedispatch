import ComplianceReportingModule from './ComplianceReportingModule';
import DaycareFamilyPacketsModule from './DaycareFamilyPacketsModule';
import DaycareOperationsModule from './DaycareOperationsModule';
import DispatchReadinessModule from './DispatchReadinessModule';
import FutureRideRequestsModule from './FutureRideRequestsModule';
import ParentEnrollmentModule from './ParentEnrollmentModule';
import ParentSubscriptionIncentivesModule from './ParentSubscriptionIncentivesModule';
import ProcurementReadinessModule from './ProcurementReadinessModule';
import ProgramOperationsModule from './ProgramOperationsModule';
import ProviderAdminModule from './ProviderAdminModule';
import SafetyControlsModule from './SafetyControlsModule';

export const providerProgramPlatformRegistry = {
  providerAdmin: {
    name: 'Provider Admin',
    component: ProviderAdminModule,
  },
  programOps: {
    name: 'Program Operations',
    component: ProgramOperationsModule,
  },
  parentEnrollment: {
    name: 'Parent Enrollment',
    component: ParentEnrollmentModule,
  },
  parentSubscriptions: {
    name: 'Parent Subscriptions And Incentives',
    component: ParentSubscriptionIncentivesModule,
  },
  futureRideRequests: {
    name: 'Future Ride Requests',
    component: FutureRideRequestsModule,
  },
  dispatchReadiness: {
    name: 'Dispatch Readiness',
    component: DispatchReadinessModule,
  },
  procurement: {
    name: 'Procurement Readiness',
    component: ProcurementReadinessModule,
  },
  reporting: {
    name: 'Compliance And Reporting',
    component: ComplianceReportingModule,
  },
  safetyControls: {
    name: 'Safety Controls',
    component: SafetyControlsModule,
  },
  daycareOperations: {
    name: 'Daycare Operations',
    component: DaycareOperationsModule,
  },
  daycareFamilyPackets: {
    name: 'Daycare Family Packets',
    component: DaycareFamilyPacketsModule,
  },
};
