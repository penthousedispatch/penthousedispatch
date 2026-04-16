export const APP_AUDIT_CHECKLIST = [
  {
    section: 'Deployment & Routing',
    checks: [
      'Confirm the visible deployment URL matches the latest Vercel commit before testing.',
      'Verify /admin/sentry, /driver, and /change-password load without Vercel 404 errors.',
      'Check both desktop and mobile breakpoints for cut-off nav text, theme toggle placement, and hidden controls.',
    ],
  },
  {
    section: 'Authentication & Access',
    checks: [
      'Test admin sign-in, company sign-in, and driver username/password sign-in.',
      'Confirm verification, magic-link, and password reset flows return to the correct sign-in or reset screens.',
      'Verify company users cannot access platform-only pages such as full Sentry admin and platform ops controls.',
    ],
  },
  {
    section: 'Dispatch & Trips',
    checks: [
      'Ensure drivers load, detail panel opens, and offline/online status actions persist after refresh.',
      'Verify pay-rate saves return real success or error feedback and update the driver row immediately.',
      'Run scheduler, test marketplace trip assignment, and confirm trip status changes update dashboards.',
    ],
  },
  {
    section: 'Messaging & Notifications',
    checks: [
      'Open dispatch chat, confirm driver list is clickable, and verify the text box accepts input.',
      'Trigger rider pickup, dropoff, and no-show events to confirm alert inbox notifications appear for admin and company.',
      'Check any unread indicators, timestamps, and empty states for clarity.',
    ],
  },
  {
    section: 'Integrations & Sentry',
    checks: [
      'Save Sentry config, confirm bearer webhook secret persists after refresh, and copy the Authorization header preview.',
      'Run Sentry diagnostics and webhook tests; verify failures show actionable errors instead of silent fails.',
      'Open Integration Hub and confirm provider health, credentials, and test-run status match reality.',
    ],
  },
  {
    section: 'Sandbox & QA',
    checks: [
      'Activate test mode, seed trips and drivers, and confirm org/company seeding does not hit RLS errors.',
      'Run AI Scheduler and Simulate Route Activity to verify synthetic pickups, dropoffs, and no-shows.',
      'Validate that test data is isolated and can be reset or purged cleanly.',
    ],
  },
  {
    section: 'Branding & Subscriber Experience',
    checks: [
      'Review white-label company branding, logo, colors, and app display name in driver and rider surfaces.',
      'Verify company-only drivers and invoices do not leak to other subscriber dashboards.',
      'Check user guides, incentives, leaderboards, and company-specific marketplace views for copy and layout quality.',
    ],
  },
];

