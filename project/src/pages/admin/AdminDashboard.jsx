import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import {
  Building2, DollarSign, Zap, Settings, Cpu, FileText,
  Users, LogOut, LayoutGrid, ShieldCheck, Shield, Layers, Banknote, BookOpen,
  Sun, Moon, Globe, Key, Car, FlaskConical, Bot, MessageSquare,
  ChevronDown, Menu, X, RadioTower
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import SupervisorBadge from '../../components/supervisor/SupervisorBadge';
import AlertInboxButton from '../../components/ui/AlertInboxButton';
import { BUILD_INFO } from '../../lib/buildInfo';

const AdminCompanies = lazy(() => import('./AdminCompanies'));
const AdminBilling = lazy(() => import('./AdminBilling'));
const AdminIncentives = lazy(() => import('./AdminIncentives'));
const AdminSentryConfig = lazy(() => import('./AdminSentryConfig'));
const AdminSentryGuide = lazy(() => import('./AdminSentryGuide'));
const AdminTestingCenter = lazy(() => import('./AdminTestingCenter'));
const AdminAuditLogs = lazy(() => import('./AdminAuditLogs'));
const AdminUsers = lazy(() => import('./AdminUsers'));
const AdminSecurity = lazy(() => import('./AdminSecurity'));
const AdminIntegrations = lazy(() => import('./AdminIntegrations'));
const AdminPayroll = lazy(() => import('./AdminPayroll'));
const IntegrationHub = lazy(() => import('./IntegrationHub'));
const ApiKeyManager = lazy(() => import('./ApiKeyManager'));
const TenantManager = lazy(() => import('./TenantManager'));
const TestModeSandbox = lazy(() => import('./TestModeSandbox'));
const LiveDispatch = lazy(() => import('../dispatcher/LiveDispatch'));
const AdminChatbot = lazy(() => import('../dispatcher/AdminChatbot'));
const AutoSchedulerPanel = lazy(() => import('../dispatcher/AutoSchedulerPanel'));
const BotTeamPanel = lazy(() => import('../dispatcher/BotTeamPanel'));
const AISettingsPanel = lazy(() => import('../dispatcher/AISettingsPanel'));
const SettingsPanel = lazy(() => import('../dispatcher/SettingsPanel'));
const AdminOpsCenter = lazy(() => import('./AdminOpsCenter'));
const PermissionsMatrix = lazy(() => import('./PermissionsMatrix'));

function ThemeToggle({ showLabel = false }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
        border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
        color: theme === 'dark' ? '#c9a84c' : '#b8860b',
      }}
    >
      {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      {showLabel && <span className="text-xs font-medium">{theme === 'dark' ? 'Light' : 'Dark'}</span>}
    </button>
  );
}

const PRIMARY_TABS = [
  { path: '/admin/ops', label: 'Ops Center', icon: RadioTower },
  { path: '/', label: 'Dispatch', icon: LayoutGrid, exact: true },
  { path: '/admin/billing', label: 'Billing', icon: DollarSign },
  { path: '/admin/sentry', label: 'Sentry', icon: Settings },
  { path: '/admin/testing', label: 'Testing', icon: Cpu },
  { path: '/admin/ai', label: 'AI Settings', icon: ShieldCheck },
  { path: '/admin/security', label: 'Security', icon: Shield },
];

const MORE_TABS = [
  { path: '/admin/companies', label: 'Companies', icon: Building2 },
  { path: '/admin/payroll', label: 'Payroll', icon: Banknote },
  { path: '/admin/incentives', label: 'Incentives', icon: Zap },
  { path: '/admin/sentry-guide', label: 'Setup Guide', icon: BookOpen },
  { path: '/admin/chatbot', label: 'Chat AI', icon: MessageSquare },
  { path: '/admin/auto-scheduler', label: 'Auto-Scheduler', icon: Zap },
  { path: '/admin/bots', label: 'Bot Team', icon: Bot },
  { path: '/admin/settings', label: 'Ops Settings', icon: Settings },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/logs', label: 'Logs', icon: FileText },
  { path: '/admin/integrations', label: 'Legacy Sandbox', icon: Layers },
  { path: '/admin/hub', label: 'Hub', icon: Globe },
  { path: '/admin/api-keys', label: 'API Keys', icon: Key },
  { path: '/admin/permissions', label: 'Permissions', icon: ShieldCheck },
  { path: '/admin/tenants', label: 'Tenants', icon: ShieldCheck },
  { path: '/admin/sandbox', label: 'Test Mode', icon: FlaskConical },
];

const ALL_TABS = [...PRIMARY_TABS, ...MORE_TABS];

function MoreMenu({ tabs, onClose }) {
  const location = useLocation();
  return (
    <div
      className="absolute top-full right-0 mt-1 rounded-2xl overflow-hidden shadow-2xl z-50 py-1"
      style={{
        background: '#0d1117',
        border: '1px solid rgba(255,255,255,0.08)',
        minWidth: 220,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}
    >
      {tabs.map(({ path, label, icon: Icon, exact }) => {
        const isActive = exact ? location.pathname === path : location.pathname.startsWith(path);
        return (
          <NavLink
            key={path}
            to={path}
            end={exact}
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-2.5 text-sm transition-all"
            style={{
              color: isActive ? '#c9a84c' : 'rgba(255,255,255,0.55)',
              background: isActive ? 'rgba(201,168,76,0.08)' : 'transparent',
              fontWeight: isActive ? 600 : 400,
              textDecoration: 'none',
            }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        );
      })}
    </div>
  );
}

function MobileDrawer({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="flex flex-col w-72 h-full overflow-y-auto" style={{ background: '#0d1117', borderRight: '1px solid rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>Admin Menu</p>
          <div className="flex items-center gap-2">
            <ThemeToggle showLabel />
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {ALL_TABS.map(({ path, label, icon: Icon, exact }) => (
          <NavLink
            key={path}
            to={path}
            end={exact}
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium transition-all border-b"
            style={({ isActive }) => ({
              color: isActive ? '#c9a84c' : 'rgba(255,255,255,0.6)',
              background: isActive ? 'rgba(201,168,76,0.08)' : 'transparent',
              borderColor: 'rgba(255,255,255,0.04)',
              textDecoration: 'none',
            })}
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
        <div className="mt-auto px-4 py-4 border-t space-y-2" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <Link
            to="/driver"
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all"
            style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.15)', color: '#00e5a0', textDecoration: 'none', fontWeight: 600 }}
            onClick={onClose}
          >
            <Car className="w-4 h-4" />
            Open Driver App
          </Link>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all"
            style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.15)', color: '#ff4757' }}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { profile, org, sentryStatus, drivers, trips } = useApp();
  const [mobileNav, setMobileNav] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    function handleClick(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    }
    if (moreOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen]);

  const onlineDrivers = drivers.filter(d => d.status === 'online' || d.status === 'on_trip').length;
  const isMoreActive = MORE_TABS.some(t => t.exact ? location.pathname === t.path : location.pathname.startsWith(t.path));

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#07090d' }}>
      <header className="flex items-center justify-between px-4 h-14 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#07090d' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.25), rgba(201,168,76,0.08))', border: '1px solid rgba(201,168,76,0.4)' }}>
            <ShieldCheck className="w-4 h-4" style={{ color: '#c9a84c' }} />
          </div>
          <div className="hidden sm:block">
            <p style={{ color: '#c9a84c', fontSize: 13, fontWeight: 700, letterSpacing: '0.5px' }}>PENTHOUSE ADMIN</p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>Platform Control Center</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-0.5">
          {PRIMARY_TABS.map(({ path, label, icon: Icon, exact }) => (
            <NavLink
              key={path}
              to={path}
              end={exact}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
              style={({ isActive }) => ({
                color: isActive ? '#c9a84c' : 'rgba(255,255,255,0.45)',
                background: isActive ? 'rgba(201,168,76,0.1)' : 'transparent',
                border: '1px solid',
                borderColor: isActive ? 'rgba(201,168,76,0.2)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(p => !p)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
              style={{
                color: isMoreActive ? '#c9a84c' : 'rgba(255,255,255,0.45)',
                background: isMoreActive || moreOpen ? 'rgba(201,168,76,0.1)' : 'transparent',
                border: '1px solid',
                borderColor: isMoreActive || moreOpen ? 'rgba(201,168,76,0.2)' : 'transparent',
                fontWeight: isMoreActive ? 600 : 400,
              }}
            >
              More
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            </button>
            {moreOpen && <MoreMenu tabs={MORE_TABS} onClose={() => setMoreOpen(false)} />}
          </div>
        </nav>

        <div className="flex items-center gap-3">
          <AlertInboxButton scope="admin" />
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>Build</span>
            <span className="text-[11px] font-semibold" style={{ color: '#c9a84c' }}>v{BUILD_INFO.version}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.06)' }}>
              {BUILD_INFO.releaseTag}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: '#c9a84c', boxShadow: '0 0 6px rgba(201,168,76,0.5)' }} />
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>ADMIN</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="status-dot online" />
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{onlineDrivers} online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: sentryStatus.ok ? '#00e5a0' : '#ff4757', boxShadow: sentryStatus.ok ? '0 0 6px #00e5a0' : '0 0 6px #ff4757' }} />
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Sentry {sentryStatus.ok ? 'Live' : 'Offline'}</span>
            </div>
          </div>
          <Link
            to="/admin/ai"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all"
            title="Open AI Settings"
            style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', fontWeight: 600, textDecoration: 'none' }}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            AI Settings
          </Link>
          <Link
            to="/driver"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all"
            title="Open Driver App"
            style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0', fontWeight: 600, textDecoration: 'none' }}
          >
            <Car className="w-3.5 h-3.5" />
            Driver App
          </Link>
          <ThemeToggle />
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg btn-ghost"
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </header>

      <MobileDrawer open={mobileNav} onClose={() => setMobileNav(false)} />

      <main className="flex-1 overflow-hidden">
        <Suspense fallback={<div className="h-full flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.45)' }}>Loading admin module...</div>}>
          <Routes>
            <Route path="/" element={<LiveDispatch />} />
            <Route path="/admin/ops" element={<AdminOpsCenter />} />
            <Route path="/admin/companies" element={<AdminCompanies />} />
            <Route path="/admin/billing" element={<AdminBilling />} />
            <Route path="/admin/payroll" element={<AdminPayroll />} />
            <Route path="/admin/incentives" element={<AdminIncentives />} />
            <Route path="/admin/sentry" element={<AdminSentryConfig />} />
            <Route path="/admin/sentry-guide" element={<AdminSentryGuide />} />
            <Route path="/admin/testing" element={<AdminTestingCenter />} />
            <Route path="/admin/chatbot" element={<AdminChatbot />} />
            <Route path="/admin/auto-scheduler" element={<AutoSchedulerPanel />} />
            <Route path="/admin/bots" element={<BotTeamPanel />} />
            <Route path="/admin/ai" element={<AISettingsPanel />} />
            <Route path="/admin/settings" element={<SettingsPanel />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/logs" element={<AdminAuditLogs />} />
            <Route path="/admin/security/*" element={<AdminSecurity />} />
            <Route path="/admin/integrations" element={<AdminIntegrations />} />
            <Route path="/admin/hub" element={<IntegrationHub />} />
            <Route path="/admin/api-keys" element={<ApiKeyManager />} />
            <Route path="/admin/permissions" element={<PermissionsMatrix />} />
            <Route path="/admin/tenants" element={<TenantManager />} />
            <Route path="/admin/sandbox" element={<TestModeSandbox />} />
            <Route path="/*" element={<LiveDispatch />} />
          </Routes>
        </Suspense>
      </main>

      <SupervisorBadge />
    </div>
  );
}
