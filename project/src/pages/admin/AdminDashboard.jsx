import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, NavLink, Link, useLocation, useParams } from 'react-router-dom';
import {
  Building2, DollarSign, Zap, Settings, Cpu, FileText,
  Users, LogOut, LayoutGrid, ShieldCheck, Shield, Layers, Banknote, BookOpen,
  Sun, Moon, Globe, Key, Car, FlaskConical, Bot, MessageSquare,
  Menu, X, RadioTower, Eye
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import CompanyDashboard from '../company/CompanyDashboard';
import ModuleBoundary from '../../components/app/ModuleBoundary';
import { adminModules } from '../../modules/adminModules';

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
  { path: '/admin/companies', label: 'Companies', icon: Building2 },
  { path: '/admin/ai', label: 'AI Settings', icon: ShieldCheck },
  { path: '/admin/bots', label: 'Bot Team', icon: Bot },
];

const PLATFORM_TABS = [
  { path: '/admin/billing', label: 'Billing', icon: DollarSign },
  { path: '/admin/sentry', label: 'Sentry', icon: Settings },
  { path: '/admin/testing', label: 'Testing', icon: Cpu },
  { path: '/admin/rider-preview', label: 'Rider Preview', icon: Eye },
  { path: '/admin/security', label: 'Security', icon: Shield },
  { path: '/admin/payroll', label: 'Payroll', icon: Banknote },
  { path: '/admin/incentives', label: 'Incentives', icon: Zap },
  { path: '/admin/sentry-guide', label: 'Setup Guide', icon: BookOpen },
  { path: '/admin/chatbot', label: 'Chat AI', icon: MessageSquare },
  { path: '/admin/auto-scheduler', label: 'Auto-Scheduler', icon: Zap },
  { path: '/admin/settings', label: 'Ops Settings', icon: Settings },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/logs', label: 'Logs', icon: FileText },
  { path: '/admin/integrations', label: 'Partner Sandbox', icon: Layers },
  { path: '/admin/hub', label: 'Integration Hub', icon: Globe },
  { path: '/admin/api-keys', label: 'API Keys', icon: Key },
  { path: '/admin/permissions', label: 'Permissions', icon: ShieldCheck },
  { path: '/admin/tenants', label: 'Tenants', icon: ShieldCheck },
  { path: '/admin/sandbox', label: 'Test Mode', icon: FlaskConical },
];

const ALL_TABS = [...PRIMARY_TABS, ...PLATFORM_TABS];

function renderAdminModule(key, extraProps = {}) {
  const moduleEntry = adminModules[key];
  if (!moduleEntry) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: '#ff4757' }}>
        Unknown admin module: {key}
      </div>
    );
  }

  const ModuleComponent = moduleEntry.component;
  return (
    <ModuleBoundary moduleName={moduleEntry.name}>
      <ModuleComponent {...extraProps} />
    </ModuleBoundary>
  );
}

function AdminPlatformHome() {
  const sections = [
    {
      title: 'Core Platform',
      items: [
        { path: '/admin/sentry', label: 'Sentry', desc: 'Receiver URLs, webhook bearer secret, sandbox driver credentials.' },
        { path: '/admin/testing', label: 'Testing', desc: 'Run diagnostics, sandbox flow checks, and webhook verification.' },
        { path: '/admin/security', label: 'Security', desc: 'MITRE, alerts, research, and active threats.' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { path: '/admin/hub', label: 'Integration Hub', desc: 'Partner/provider health, credentials, and connection status.' },
        { path: '/admin/api-keys', label: 'API Keys', desc: 'Manage internal API access and downstream integrations.' },
        { path: '/admin/incentives', label: 'Incentives', desc: 'Driver bonus goals, enrollments, and celebrations. Open a company preview first to scope programs to that fleet.' },
        { path: '/admin/sandbox', label: 'Test Mode', desc: 'Seed test trips, test drivers, and scheduler scenarios.' },
      ],
    },
    {
      title: 'Administration',
      items: [
        { path: '/admin/users', label: 'Users', desc: 'Platform users, roles, and subscriber access.' },
        { path: '/admin/logs', label: 'Logs', desc: 'Audit activity, sync history, and operational traces.' },
        { path: '/admin/permissions', label: 'Permissions', desc: 'Role matrix and platform access reference.' },
        { path: '/admin/tenants', label: 'Tenants', desc: 'Subscriber tenant registry and platform tenancy view.' },
      ],
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 pb-48" style={{ color: '#e5e7eb' }}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-700 mb-1" style={{ color: '#c9a84c', fontWeight: 700 }}>Platform Tools</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
            Admin-only configuration, testing, and security pages are grouped here so the dispatch workflow stays cleaner.
          </p>
        </div>

        {sections.map(section => (
          <section key={section.title} className="space-y-3">
            <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.42)', fontWeight: 700 }}>
              {section.title}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {section.items.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="rounded-2xl p-4 transition-all"
                  style={{
                    background: '#0d1117',
                    border: '1px solid rgba(255,255,255,0.07)',
                    textDecoration: 'none',
                    color: '#e5e7eb',
                  }}
                >
                  <p className="text-sm font-700 mb-1" style={{ color: '#c9a84c', fontWeight: 700 }}>{item.label}</p>
                  <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.45)' }}>{item.desc}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function MobileDrawer({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="flex flex-col w-72 h-full overflow-y-auto" style={{ background: '#0d1117', borderRight: '1px solid rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)', paddingTop: 'calc(var(--safe-top) + 10px)' }}>
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
            to="/"
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all"
            style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)', color: '#c9a84c', textDecoration: 'none', fontWeight: 600 }}
            onClick={onClose}
          >
            <LayoutGrid className="w-4 h-4" />
            Dispatch Map
          </Link>
          <Link
            to="/driver"
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all"
            style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.15)', color: '#00e5a0', textDecoration: 'none', fontWeight: 600 }}
            onClick={onClose}
          >
            <Car className="w-4 h-4" />
            Open Driver App
          </Link>
          <Link
            to="/admin/rider-preview"
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all"
            style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.15)', color: '#7dd3fc', textDecoration: 'none', fontWeight: 600 }}
            onClick={onClose}
          >
            <Eye className="w-4 h-4" />
            Open Rider App
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

function AdminCompanyPreview() {
  const { companyId } = useParams();
  const { loadDrivers, loadTrips, loadAssignments, adminPreviewCompany, setAdminPreviewCompany } = useApp();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const channel = supabase.channel(`admin-company-preview:${companyId}`);

    async function loadPreviewCompany({ preserveCurrent = false } = {}) {
      if (!preserveCurrent) {
        setLoading(true);
      }
      const companyResult = await Promise.race([
        supabase.from('companies').select('*').eq('id', companyId).maybeSingle(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Company preview lookup timed out')), 2500)
        ),
      ]).catch(() => ({ data: null, error: null }));

      const { data, error } = companyResult || {};
      if (!mounted) return;

      if (data) {
        setAdminPreviewCompany(data);
        setLoading(false);
        Promise.all([
          loadDrivers({ companyId: data.id }),
          loadTrips({ companyId: data.id }),
          loadAssignments({ companyId: data.id }),
        ]).catch(() => {});
        return;
      }

      if (!data) {
        setAdminPreviewCompany(null);
        setLoading(false);
        return;
      }
    }

    loadPreviewCompany();

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'companies', filter: `id=eq.${companyId}` },
        () => {
          loadPreviewCompany({ preserveCurrent: true }).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      setAdminPreviewCompany(null);
      loadDrivers();
      loadTrips();
      loadAssignments();
    };
  }, [companyId, setAdminPreviewCompany]);

  if (loading) {
    return <div className="h-full flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.45)' }}>Loading company workspace...</div>;
  }

  if (!adminPreviewCompany?.id) {
    return <div className="h-full flex items-center justify-center" style={{ color: '#ff4757' }}>Company workspace could not be loaded.</div>;
  }

  return <CompanyDashboard previewMode />;
}

export default function AdminDashboard() {
  const { sentryStatus, drivers, adminPreviewCompany } = useApp();
  const [mobileNav, setMobileNav] = useState(false);
  const location = useLocation();

  const onlineDrivers = drivers.filter(d => d.status === 'online' || d.status === 'on_trip').length;
  const isPlatformActive =
    location.pathname === '/admin/platform' ||
    PLATFORM_TABS.some(t => t.exact ? location.pathname === t.path : location.pathname.startsWith(t.path));

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#07090d', paddingTop: 'calc(var(--safe-top) + 6px)' }}>
      <header className="flex items-center justify-between gap-3 px-3 sm:px-4 min-h-14 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#07090d' }}>
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg btn-ghost text-xs font-semibold flex-shrink-0"
            onClick={() => setMobileNav(true)}
            title="Open admin menu"
          >
            <Menu className="w-4 h-4" />
            Menu
          </button>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.25), rgba(201,168,76,0.08))', border: '1px solid rgba(201,168,76,0.4)' }}>
            <ShieldCheck className="w-4 h-4" style={{ color: '#c9a84c' }} />
          </div>
          <div className="min-w-0 max-w-[190px]">
            <p className="truncate" style={{ color: '#c9a84c', fontSize: 13, fontWeight: 700, letterSpacing: '0.5px' }}>PENTHOUSE ADMIN</p>
            <p className="truncate" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>Platform Control Center</p>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-hide justify-center">
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
          <NavLink
            to="/admin/platform"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
            style={({ isActive }) => ({
              color: isActive || isPlatformActive ? '#c9a84c' : 'rgba(255,255,255,0.45)',
              background: isActive || isPlatformActive ? 'rgba(201,168,76,0.1)' : 'transparent',
              border: '1px solid',
              borderColor: isActive || isPlatformActive ? 'rgba(201,168,76,0.2)' : 'transparent',
              fontWeight: isActive || isPlatformActive ? 600 : 400,
              textDecoration: 'none',
            })}
          >
            More
          </NavLink>
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0">
          {adminPreviewCompany && (
            <Link
              to={`/admin/company-preview/${adminPreviewCompany.id}`}
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all"
              style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', textDecoration: 'none', fontWeight: 600 }}
            >
              Previewing {adminPreviewCompany.company_name}
            </Link>
          )}
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' }}>
            <div className="status-dot online" />
            <span>{onlineDrivers} online</span>
            <div className="w-px h-3 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="w-2 h-2 rounded-full" style={{ background: sentryStatus.ok ? '#00e5a0' : '#ff4757' }} />
            <span>Sentry {sentryStatus.ok ? 'live' : 'offline'}</span>
          </div>
          <Link
            to="/driver"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all"
            title="Open Driver App"
            style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0', fontWeight: 600, textDecoration: 'none' }}
          >
            <Car className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Driver App</span>
          </Link>
          <Link
            to="/admin/rider-preview"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all"
            title="Open Rider App Preview"
            style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', color: '#7dd3fc', fontWeight: 600, textDecoration: 'none' }}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rider App</span>
          </Link>
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg btn-ghost text-xs font-semibold"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <MobileDrawer open={mobileNav} onClose={() => setMobileNav(false)} />

      <main className="flex-1 overflow-hidden pb-6">
        <Routes>
          <Route path="/" element={renderAdminModule('dispatch')} />
          <Route path="/admin/ops" element={renderAdminModule('ops')} />
          <Route path="/admin/platform" element={<AdminPlatformHome />} />
          <Route path="/admin/companies" element={renderAdminModule('companies')} />
          <Route path="/admin/company-preview/:companyId/*" element={<AdminCompanyPreview />} />
          <Route path="/admin/billing" element={renderAdminModule('billing')} />
          <Route path="/admin/payroll" element={renderAdminModule('payroll')} />
          <Route path="/admin/incentives" element={renderAdminModule('incentives')} />
          <Route path="/admin/sentry" element={renderAdminModule('sentry')} />
          <Route path="/admin/sentry-guide" element={renderAdminModule('sentryGuide')} />
          <Route path="/admin/testing" element={renderAdminModule('testing')} />
          <Route path="/admin/rider-preview" element={renderAdminModule('riderPreview')} />
          <Route path="/admin/chatbot" element={renderAdminModule('chatbot')} />
          <Route path="/admin/auto-scheduler" element={renderAdminModule('autoScheduler')} />
          <Route path="/admin/bots" element={renderAdminModule('bots')} />
          <Route path="/admin/ai" element={renderAdminModule('ai')} />
          <Route path="/admin/settings" element={renderAdminModule('settings')} />
          <Route path="/admin/users" element={renderAdminModule('users')} />
          <Route path="/admin/logs" element={renderAdminModule('logs')} />
          <Route path="/admin/security/*" element={renderAdminModule('security')} />
          <Route path="/admin/integrations" element={renderAdminModule('integrations')} />
          <Route path="/admin/hub" element={renderAdminModule('hub')} />
          <Route path="/admin/api-keys" element={renderAdminModule('apiKeys')} />
          <Route path="/admin/permissions" element={renderAdminModule('permissions')} />
          <Route path="/admin/tenants" element={renderAdminModule('tenants')} />
          <Route path="/admin/sandbox" element={renderAdminModule('sandbox')} />
          <Route path="/*" element={renderAdminModule('dispatch')} />
        </Routes>
      </main>

    </div>
  );
}
