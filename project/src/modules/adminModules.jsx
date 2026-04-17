import LiveDispatch from '../pages/dispatcher/LiveDispatch';
import AdminOpsCenter from '../pages/admin/AdminOpsCenter';
import AdminCompanies from '../pages/admin/AdminCompanies';
import AdminBilling from '../pages/admin/AdminBilling';
import AdminPayroll from '../pages/admin/AdminPayroll';
import AdminIncentives from '../pages/admin/AdminIncentives';
import AdminSentryConfig from '../pages/admin/AdminSentryConfig';
import AdminSentryGuide from '../pages/admin/AdminSentryGuide';
import AdminTestingCenter from '../pages/admin/AdminTestingCenter';
import AdminChatbot from '../pages/dispatcher/AdminChatbot';
import AutoSchedulerPanel from '../pages/dispatcher/AutoSchedulerPanel';
import BotTeamPanel from '../pages/dispatcher/BotTeamPanel';
import AISettingsPanel from '../pages/dispatcher/AISettingsPanel';
import SettingsPanel from '../pages/dispatcher/SettingsPanel';
import AdminUsers from '../pages/admin/AdminUsers';
import AdminAuditLogs from '../pages/admin/AdminAuditLogs';
import AdminSecurity from '../pages/admin/AdminSecurity';
import AdminIntegrations from '../pages/admin/AdminIntegrations';
import IntegrationHub from '../pages/admin/IntegrationHub';
import ApiKeyManager from '../pages/admin/ApiKeyManager';
import PermissionsMatrix from '../pages/admin/PermissionsMatrix';
import TenantManager from '../pages/admin/TenantManager';
import TestModeSandbox from '../pages/admin/TestModeSandbox';

export const adminModules = {
  dispatch: {
    name: 'Dispatch',
    component: LiveDispatch,
  },
  ops: {
    name: 'Ops Center',
    component: AdminOpsCenter,
  },
  companies: {
    name: 'Companies',
    component: AdminCompanies,
  },
  billing: {
    name: 'Billing',
    component: AdminBilling,
  },
  payroll: {
    name: 'Payroll',
    component: AdminPayroll,
  },
  incentives: {
    name: 'Incentives',
    component: AdminIncentives,
  },
  sentry: {
    name: 'Sentry',
    component: AdminSentryConfig,
  },
  sentryGuide: {
    name: 'Sentry Guide',
    component: AdminSentryGuide,
  },
  testing: {
    name: 'Testing',
    component: AdminTestingCenter,
  },
  chatbot: {
    name: 'Chat AI',
    component: AdminChatbot,
  },
  autoScheduler: {
    name: 'Auto-Scheduler',
    component: AutoSchedulerPanel,
  },
  bots: {
    name: 'Bot Team',
    component: BotTeamPanel,
  },
  ai: {
    name: 'AI Settings',
    component: AISettingsPanel,
  },
  settings: {
    name: 'Ops Settings',
    component: SettingsPanel,
  },
  users: {
    name: 'Users',
    component: AdminUsers,
  },
  logs: {
    name: 'Logs',
    component: AdminAuditLogs,
  },
  security: {
    name: 'Security',
    component: AdminSecurity,
  },
  integrations: {
    name: 'Partner Sandbox',
    component: AdminIntegrations,
  },
  hub: {
    name: 'Integration Hub',
    component: IntegrationHub,
  },
  apiKeys: {
    name: 'API Keys',
    component: ApiKeyManager,
  },
  permissions: {
    name: 'Permissions',
    component: PermissionsMatrix,
  },
  tenants: {
    name: 'Tenants',
    component: TenantManager,
  },
  sandbox: {
    name: 'Test Mode',
    component: TestModeSandbox,
  },
};
