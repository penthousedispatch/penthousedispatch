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

function AppRoutes() {
  const { user, loading, profile, org, company } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

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
    return (
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/driver" element={<DriverApp />} />
        <Route path="/rider" element={<RiderTracking />} />
        <Route path="/change-password" element={<ChangeMyPassword />} />
        <Route path="/*" element={<AuthPage />} />
      </Routes>
    );
  }

  const needsOnboarding = role === 'dispatcher' && !org && !company;

  return (
    <Routes>
      <Route path="/driver" element={<DriverApp />} />
      <Route path="/rider" element={<RiderTracking />} />
      <Route path="/company/onboarding" element={<CompanyOnboarding />} />
      <Route path="/change-password" element={<ChangeMyPassword />} />
      <Route path="/auth" element={<Navigate to="/" />} />

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
