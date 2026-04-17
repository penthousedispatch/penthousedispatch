import { lazy } from 'react';

export const adminModules = {
  dispatch: {
    name: 'Dispatch',
    component: lazy(() => import('../pages/dispatcher/LiveDispatch')),
  },
  ops: {
    name: 'Ops Center',
    component: lazy(() => import('../pages/admin/AdminOpsCenter')),
  },
  companies: {
    name: 'Companies',
    component: lazy(() => import('../pages/admin/AdminCompanies')),
  },
  billing: {
    name: 'Billing',
    component: lazy(() => import('../pages/admin/AdminBilling')),
  },
  payroll: {
    name: 'Payroll',
    component: lazy(() => import('../pages/admin/AdminPayroll')),
  },
  incentives: {
    name: 'Incentives',
    component: lazy(() => import('../pages/admin/AdminIncentives')),
  },
  sentry: {
    name: 'Sentry',
    component: lazy(() => import('../pages/admin/AdminSentryConfig')),
  },
  sentryGuide: {
    name: 'Sentry Guide',
    component: lazy(() => import('../pages/admin/AdminSentryGuide')),
  },
  testing: {
    name: 'Testing',
    component: lazy(() => import('../pages/admin/AdminTestingCenter')),
  },
  chatbot: {
    name: 'Chat AI',
    component: lazy(() => import('../pages/dispatcher/AdminChatbot')),
  },
  autoScheduler: {
    name: 'Auto-Scheduler',
    component: lazy(() => import('../pages/dispatcher/AutoSchedulerPanel')),
  },
  bots: {
    name: 'Bot Team',
    component: lazy(() => import('../pages/dispatcher/BotTeamPanel')),
  },
  ai: {
    name: 'AI Settings',
    component: lazy(() => import('../pages/dispatcher/AISettingsPanel')),
  },
  settings: {
    name: 'Ops Settings',
    component: lazy(() => import('../pages/dispatcher/SettingsPanel')),
  },
  users: {
    name: 'Users',
    component: lazy(() => import('../pages/admin/AdminUsers')),
  },
  logs: {
    name: 'Logs',
    component: lazy(() => import('../pages/admin/AdminAuditLogs')),
  },
  security: {
    name: 'Security',
    component: lazy(() => import('../pages/admin/AdminSecurity')),
  },
  integrations: {
    name: 'Partner Sandbox',
    component: lazy(() => import('../pages/admin/AdminIntegrations')),
  },
  hub: {
    name: 'Integration Hub',
    component: lazy(() => import('../pages/admin/IntegrationHub')),
  },
  apiKeys: {
    name: 'API Keys',
    component: lazy(() => import('../pages/admin/ApiKeyManager')),
  },
  permissions: {
    name: 'Permissions',
    component: lazy(() => import('../pages/admin/PermissionsMatrix')),
  },
  tenants: {
    name: 'Tenants',
    component: lazy(() => import('../pages/admin/TenantManager')),
  },
  sandbox: {
    name: 'Test Mode',
    component: lazy(() => import('../pages/admin/TestModeSandbox')),
  },
};
