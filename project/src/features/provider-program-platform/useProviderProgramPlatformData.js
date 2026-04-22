import { useMemo } from 'react';

export function useProviderProgramPlatformData() {
  return useMemo(() => {
    const providers = [
      {
        id: 'provider-1',
        admin_name: 'Bright Start Daycare',
        onboarding_status: 'admin-required',
        parent_enrollment_rate: '68%',
        dispatch_ready_children: 29,
      },
    ];

    const programs = [
      {
        id: 'program-1',
        program_name: 'Bright Start Daycare',
        provider_admin_status: 'needs company admin',
        future_ride_ready: 'partial',
        active_children: 29,
      },
      {
        id: 'program-2',
        program_name: 'Northside Youth Athletics',
        provider_admin_status: 'ready',
        future_ride_ready: 'ready',
        active_children: 14,
      },
    ];

    const parentSubscriptions = [
      {
        id: 'subscription-1',
        parent_name: 'Tanya Brooks',
        child_name: 'Micah Brooks',
        plan_type: 'monthly',
        status: 'active',
        incentive: '$25 signup credit',
        use_case: 'future rides',
      },
      {
        id: 'subscription-2',
        parent_name: 'Luis Ortega',
        child_name: 'Jaden Ortega',
        plan_type: 'trial',
        status: 'pre-enrolled',
        incentive: '$10 referral credit',
        use_case: 'sports and appointments',
      },
    ];

    const futureRideRequests = [
      {
        id: 'future-1',
        child_name: 'Jaden Ortega',
        ride_type: 'football game',
        requested_by: 'Parent pre-enrollment',
        dispatch_window: 'Friday 5:30 PM',
        readiness: 'ready',
      },
      {
        id: 'future-2',
        child_name: 'Micah Brooks',
        ride_type: 'medical appointment',
        requested_by: 'Provider admin',
        dispatch_window: 'Tuesday 2:00 PM',
        readiness: 'pending guardian note',
      },
    ];

    const procurementRecords = [
      {
        id: 'proc-1',
        provider_name: 'Bright Start Daycare',
        procurement_status: 'needs insurance packet',
        insurance_status: 'pending',
        contract_status: 'draft',
        background_checks: 'partial',
      },
      {
        id: 'proc-2',
        provider_name: 'Northside Youth Athletics',
        procurement_status: 'ready for review',
        insurance_status: 'verified',
        contract_status: 'reviewed',
        background_checks: 'complete',
      },
    ];

    const reportingRows = [
      {
        id: 'report-1',
        report_name: 'Dispatch Readiness Summary',
        audience: 'provider admin',
        cadence: 'weekly',
        metric_focus: 'pre-enrolled vs ready',
      },
      {
        id: 'report-2',
        report_name: 'Guardian Release Exception Log',
        audience: 'compliance and safety',
        cadence: 'real-time',
        metric_focus: 'handoff failures',
      },
      {
        id: 'report-3',
        report_name: 'Future Ride Utilization Report',
        audience: 'procurement / government buyer',
        cadence: 'monthly',
        metric_focus: 'appointments, sports, program rides',
      },
    ];

    const safetyControls = [
      {
        id: 'safety-1',
        control_name: 'Guardian Release Blocking',
        status: 'required',
        severity: 'high',
        owner: 'dispatch + provider admin',
      },
      {
        id: 'safety-2',
        control_name: 'Incident Escalation Workflow',
        status: 'required',
        severity: 'high',
        owner: 'operations',
      },
      {
        id: 'safety-3',
        control_name: 'Driver Training And Attestation',
        status: 'required',
        severity: 'medium',
        owner: 'provider admin',
      },
    ];

    const daycareSites = [
      {
        id: 'site-1',
        site_name: 'Bright Start Daycare - Main Campus',
        dismissal_window: '2:30 PM - 5:30 PM',
        classroom_handoff: 'front desk sign-out',
        release_policy: 'guardian required',
        future_ride_intake: 'enabled',
      },
      {
        id: 'site-2',
        site_name: 'Bright Start Daycare - Early Learners',
        dismissal_window: '1:45 PM - 4:30 PM',
        classroom_handoff: 'teacher to dispatcher runner',
        release_policy: 'authorized list only',
        future_ride_intake: 'enabled',
      },
    ];

    const daycareFamilyPackets = [
      {
        id: 'packet-1',
        child_name: 'Micah Brooks',
        packet_status: 'complete',
        future_ride_permission: 'yes',
        authorized_contacts: 3,
        sports_transport_interest: 'football',
      },
      {
        id: 'packet-2',
        child_name: 'Jaden Ortega',
        packet_status: 'missing release note',
        future_ride_permission: 'yes',
        authorized_contacts: 2,
        sports_transport_interest: 'basketball',
      },
    ];

    return {
      providers,
      programs,
      parentSubscriptions,
      futureRideRequests,
      procurementRecords,
      reportingRows,
      safetyControls,
      daycareSites,
      daycareFamilyPackets,
    };
  }, []);
}
