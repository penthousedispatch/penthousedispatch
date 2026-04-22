import React, { useState, useRef, useEffect } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import {
  Radio, Calendar, LayoutGrid, Settings, DollarSign,
  LogOut, Bot, Navigation, Trophy, Activity, Banknote,
  MessageSquare, Zap, Sun, Moon, HelpCircle, Menu, X,
  Users, Shield, ChevronDown, Car
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import LiveDispatch from './LiveDispatch';
import FullDayScheduler from './FullDayScheduler';
import DispatchBoard from './DispatchBoard';
import EarningsTab from './EarningsTab';
import SettingsPanel from './SettingsPanel';
import AISettingsPanel from './AISettingsPanel';
import IncentivesPanel from './IncentivesPanel';
import ETABoard from './ETABoard';
import DriverPerformanceTab from './DriverPerformanceTab';
import PayoutsTab from './PayoutsTab';
import AdminChatbot from './AdminChatbot';
import AutoSchedulerPanel from './AutoSchedulerPanel';
import BotTeamPanel from './BotTeamPanel';
import HelpCenter from './HelpCenter';
import SupervisorBadge from '../../components/supervisor/SupervisorBadge';

const PRIMARY_TABS = [
  { path: '/', label: 'Dispatch', icon: Radio, exact: true },
  { path: '/scheduler', label: 'Schedule', icon: Calendar },
  { path: '/board', label: 'Board', icon: LayoutGrid },
  { path: '/eta', label: 'ETA', icon: Navigation },
  { path: '/performance', label: 'Drivers', icon: Activity },
  { path: '/earnings', label: 'Earnings', icon: DollarSign },
];

const MORE_TABS = [
  { path: '/incentives', label: 'Incentives', icon: Trophy },
  { path: '/payouts', label: 'Payouts', icon: Banknote },
  { path: '/chatbot', label: 'Chat AI', icon: MessageSquare },
  { path: '/auto-scheduler', label: 'Auto-Scheduler', icon: Zap },
  { path: '/bots', label: 'Bot Team', icon: Bot },
  { path: '/ai', label: 'AI Config', icon: Shield },
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/help', label: 'Help', icon: HelpCircle },
];

const ALL_TABS = [...PRIMARY_TABS, ...MORE_TABS];

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

function MoreMenu({ tabs, onClose }) {
  const location = useLocation();
  return (
    <div
      className="absolute top-full right-0 mt-1 rounded-2xl overflow-hidden shadow-2xl z-50 py-1"
      style={{
        background: 'var(--s1)',
        border: '1px solid var(--border)',
        minWidth: 200,
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
              color: isActive ? 'var(--gold)' : 'var(--text-muted)',
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
  const location = useLocation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div
        className="absolute left-0 top-0 bottom-0 w-72 flex flex-col"
        style={{
          background: 'var(--s1)',
          borderRight: '1px solid var(--border)',
          paddingTop: 'var(--safe-top)',
          paddingBottom: 'var(--safe-bottom)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))', border: '1px solid rgba(201,168,76,0.3)' }}>
              <span style={{ color: '#c9a84c', fontSize: 16, fontWeight: 800 }}>P</span>
            </div>
            <span style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 700, letterSpacing: '0.5px' }}>PENTHOUSE</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle showLabel />
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <p className="text-xs px-4 py-2 font-700 uppercase tracking-wider" style={{ color: 'var(--text-faint)', fontWeight: 700 }}>Navigation</p>
          <Link
            to="/"
            onClick={onClose}
            className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm transition-all"
            style={{
              color: '#c9a84c',
              background: 'rgba(201,168,76,0.1)',
              fontWeight: 600,
              textDecoration: 'none',
              border: '1px solid rgba(201,168,76,0.2)',
              marginBottom: 6,
            }}
          >
            <Radio className="w-4 h-4 flex-shrink-0" />
            Home
          </Link>
          {ALL_TABS.map(({ path, label, icon: Icon, exact }) => {
            const isActive = exact ? location.pathname === path : location.pathname.startsWith(path);
            return (
              <NavLink
                key={path}
                to={path}
                end={exact}
                onClick={onClose}
                className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm transition-all"
                style={{
                  color: isActive ? 'var(--gold)' : 'var(--text-muted)',
                  background: isActive ? 'rgba(201,168,76,0.1)' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  textDecoration: 'none',
                  border: '1px solid',
                  borderColor: isActive ? 'rgba(201,168,76,0.2)' : 'transparent',
                  marginBottom: 2,
                }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </NavLink>
            );
          })}
        </div>
        <div className="p-4 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
          <Link
            to="/driver"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.15)', color: '#00e5a0', textDecoration: 'none', fontWeight: 600 }}
            onClick={onClose}
          >
            <Car className="w-4 h-4" />
            Open Driver App
          </Link>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl btn-ghost text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DispatcherDashboard() {
  const { profile, org, sentryStatus, drivers, trips } = useApp();
  const { theme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    function handleClick(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false);
      }
    }
    if (moreOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen]);

  const onlineDrivers = drivers.filter(d => d.status === 'online' || d.status === 'on_trip').length;
  const isMoreActive = MORE_TABS.some(t => t.exact ? location.pathname === t.path : location.pathname.startsWith(t.path));

  const bg = theme === 'dark' ? '#07090d' : '#f4f5f7';
  const borderColor = theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  const textMuted = theme === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)';

  return (
    <div className="flex flex-col h-screen overflow-hidden mobile-safe-top" style={{ background: bg }}>
      <header
        className="flex items-center justify-between px-4 min-h-14 flex-shrink-0"
        style={{ borderBottom: `1px solid ${borderColor}`, background: bg }}
      >
        <div className="flex items-center gap-3">
          <button
            className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg btn-ghost text-xs font-semibold"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-4 h-4" />
            Menu
          </button>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))', border: '1px solid rgba(201,168,76,0.3)' }}>
            <span style={{ color: '#c9a84c', fontSize: 16, fontWeight: 800 }}>P</span>
          </div>
          <div className="hidden sm:block">
            <p style={{ color: '#c9a84c', fontSize: 13, fontWeight: 700, letterSpacing: '0.5px' }}>PENTHOUSE DISPATCH</p>
            {org && <p style={{ color: textMuted, fontSize: 10 }}>{org.name}</p>}
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-0.5">
          {PRIMARY_TABS.map(({ path, label, icon: Icon, exact }) => (
            <NavLink
              key={path}
              to={path}
              end={exact}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
              style={({ isActive }) => ({
                color: isActive ? '#c9a84c' : textMuted,
                background: isActive ? 'rgba(201,168,76,0.1)' : 'transparent',
                border: '1px solid',
                borderColor: isActive ? 'rgba(201,168,76,0.2)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
                fontSize: 11,
                textDecoration: 'none',
              })}
            >
              <Icon className="w-3 h-3 flex-shrink-0" />
              {label}
            </NavLink>
          ))}

          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(p => !p)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                color: isMoreActive ? '#c9a84c' : textMuted,
                background: isMoreActive || moreOpen ? 'rgba(201,168,76,0.1)' : 'transparent',
                border: '1px solid',
                borderColor: isMoreActive || moreOpen ? 'rgba(201,168,76,0.2)' : 'transparent',
                fontWeight: isMoreActive ? 600 : 400,
                fontSize: 11,
              }}
            >
              More
              <ChevronDown className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            </button>
            {moreOpen && <MoreMenu tabs={MORE_TABS} onClose={() => setMoreOpen(false)} />}
          </div>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="status-dot online" />
              <span style={{ color: textMuted }}>{onlineDrivers} online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: sentryStatus.ok ? '#00e5a0' : '#ff4757', boxShadow: sentryStatus.ok ? '0 0 6px #00e5a0' : '0 0 6px #ff4757' }} />
              <span style={{ color: textMuted }}>Sentry {sentryStatus.ok ? 'Live' : sentryStatus.checked ? 'Offline' : '—'}</span>
            </div>
            <div className="flex items-center gap-1" style={{ color: textMuted, fontSize: 11 }}>
              <span style={{ color: '#c9a84c' }}>{trips.length}</span> trips
            </div>
          </div>

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
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg btn-ghost text-xs font-semibold"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<LiveDispatch />} />
          <Route path="/scheduler" element={<FullDayScheduler />} />
          <Route path="/board" element={<DispatchBoard />} />
          <Route path="/eta" element={<ETABoard />} />
          <Route path="/incentives" element={<IncentivesPanel />} />
          <Route path="/performance" element={<DriverPerformanceTab />} />
          <Route path="/earnings" element={<EarningsTab />} />
          <Route path="/payouts" element={<PayoutsTab />} />
          <Route path="/chatbot" element={<AdminChatbot />} />
          <Route path="/auto-scheduler" element={<AutoSchedulerPanel />} />
          <Route path="/bots" element={<BotTeamPanel />} />
          <Route path="/ai" element={<AISettingsPanel />} />
          <Route path="/settings" element={<SettingsPanel />} />
          <Route path="/help" element={<HelpCenter />} />
        </Routes>
      </main>

      <SupervisorBadge />
    </div>
  );
}
