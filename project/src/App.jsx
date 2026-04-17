import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { supabase } from './lib/supabase';
import AuthPage from './pages/AuthPage';
import DispatcherDashboard from './pages/dispatcher/DispatcherDashboard';
import DriverApp from './pages/driver/DriverApp';
import RiderTracking from './pages/rider/RiderTracking';
import LoadingScreen from './components/ui/LoadingScreen';
import AdminDashboard from './pages/admin/AdminDashboard';
import CompanyDashboard from './pages/company/CompanyDashboard';
import CompanyOnboarding from './pages/company/CompanyOnboarding';
import ToastContainer from './components/ui/ToastContainer';
import ChangeMyPassword from './pages/ChangeMyPassword'; 
import { LogOut, RefreshCw } from 'lucide-react';

function defaultPathForRole(role) {
  if (role === 'admin') return '/admin/ops';
  return '/';
}

function MissingProfileScreen() {
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: '#07090d' }}>
      <div
        className="w-full max-w-md rounded-2xl p-6 text-center"
        style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
      >
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)' }}>
          <RefreshCw className="w-6 h-6" style={{ color: '#c9a84c' }} />
        </div>
        <p className="text-lg font-semibold mb-2" style={{ color: '#c9a84c' }}>Account Still Loading</p>
        <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
          Your sign-in worked, but the app could not load your account profile cleanly. Please sign in again.
        </p>
        <button
          onClick={handleSignOut}
          className="btn-gold w-full py-3 flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out and Retry
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, profile, org, company } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const nextPath = searchParams.get('next');
  const safeNextPath = nextPath && nextPath.startsWith('/') ? nextPath : '/';

  React.useEffect(() => {
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(location.search);
    const authType = hashParams.get('type') || queryParams.get('type');
    const recoveryInUrl =
      authType === 'recovery' ||
      sessionStorage.getItem('pd_password_recovery') === 'true';

    if (recoveryInUrl) {
      sessionStorage.setItem('pd_password_recovery', 'true');
      if (location.pathname !== '/change-password') {
        navigate('/change-password', { replace: true });
      }
      return;
    }

    if (authType === 'signup' || authType === 'magiclink') {
      sessionStorage.removeItem('pd_password_recovery');
      supabase.auth.signOut().finally(() => {
        navigate(`/auth?auth=${authType === 'signup' ? 'verified' : 'magic'}`, { replace: true });
      });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  if (loading) return <LoadingScreen />;

  const role = profile?.role;

  if (!user) {
    const requestedPath = `${location.pathname}${location.search}${location.hash}`;

    return (
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/driver" element={<DriverApp />} />
        <Route path="/rider" element={<RiderTracking />} />
        <Route path="/change-password" element={<ChangeMyPassword />} />
        <Route
          path="/*"
          element={<Navigate to={`/auth?next=${encodeURIComponent(requestedPath)}`} replace />}
        />
      </Routes>
    );
  }

  if (!profile) {
    return <MissingProfileScreen />;
  }

  const needsOnboarding = role === 'dispatcher' && !org && !company;
  const defaultRolePath = defaultPathForRole(role);

  return (
    <Routes>
      <Route path="/driver" element={<DriverApp />} />
      <Route path="/rider" element={<RiderTracking />} />
      <Route path="/company/onboarding" element={<CompanyOnboarding />} />
      <Route path="/change-password" element={<ChangeMyPassword />} />
      <Route path="/auth" element={<Navigate to={safeNextPath === '/' ? defaultRolePath : safeNextPath} replace />} />

      {role === 'admin' && <Route path="/*" element={<AdminDashboard />} />}
      {role === 'company' && <Route path="/*" element={<CompanyDashboard />} />}

      {needsOnboarding && (
        <Route path="/*" element={<Navigate to="/company/onboarding" replace />} />
      )}

      {(role === 'dispatcher' || !role) && !needsOnboarding && (
        <Route path="/*" element={<DispatcherDashboard />} />
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppRoutes />
        <ToastContainer />
      </AppProvider>
    </ThemeProvider>
  );
}
