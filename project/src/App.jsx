import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { supabase } from './lib/supabase';
import AuthPage from './pages/AuthPage';
import DriverApp from './pages/driver/DriverApp';
import RiderTracking from './pages/rider/RiderTracking';
import LoadingScreen from './components/ui/LoadingScreen';
import AdminDashboard from './pages/admin/AdminDashboard';
import CompanyDashboard from './pages/company/CompanyDashboard';
import CompanyOnboarding from './pages/company/CompanyOnboarding';
import ToastContainer from './components/ui/ToastContainer';
import ChangeMyPassword from './pages/ChangeMyPassword'; 
import { LogOut, RefreshCw } from 'lucide-react';
import { normalizeAppRole } from './lib/roles';

function defaultPathForRole(role) {
  if (role === 'admin') return '/admin/ops';
  return '/';
}

function MissingProfileScreen() {
  const { user, repairAccountProfile } = useApp();
  const [repairing, setRepairing] = React.useState(false);
  const [repairMessage, setRepairMessage] = React.useState('Trying to reconnect your account profile.');

  React.useEffect(() => {
    let mounted = true;

    async function repair() {
      setRepairing(true);
      setRepairMessage('Trying to reconnect your account profile.');
      const repaired = await repairAccountProfile();
      if (!mounted) return;
      if (repaired) {
        setRepairMessage('Account profile repaired. Finishing sign-in...');
      } else {
        setRepairing(false);
        setRepairMessage('We could not repair this account automatically yet.');
      }
    }

    repair();

    return () => {
      mounted = false;
    };
  }, [repairAccountProfile]);

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
          {repairMessage}
        </p>
        <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Signed in as {user?.email || 'unknown account'}
        </p>
        {!repairing && (
          <button
            onClick={async () => {
              setRepairing(true);
              setRepairMessage('Trying to reconnect your account profile.');
              const repaired = await repairAccountProfile();
              if (repaired) {
                setRepairMessage('Account profile repaired. Finishing sign-in...');
              } else {
                setRepairing(false);
                setRepairMessage('We could not repair this account automatically yet.');
              }
            }}
            className="btn-ghost w-full py-3 mb-3 flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Account Repair
          </button>
        )}
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

function UnsupportedRoleScreen({ rawRole }) {
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: '#07090d' }}>
      <div
        className="w-full max-w-md rounded-2xl p-6 text-center"
        style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
      >
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.25)' }}>
          <RefreshCw className="w-6 h-6" style={{ color: '#ff4757' }} />
        </div>
        <p className="text-lg font-semibold mb-2" style={{ color: '#ff4757' }}>Account Role Needs Attention</p>
        <p className="text-sm mb-2" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
          Your account signed in successfully, but the app could not map its role to a supported dashboard.
        </p>
        <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.38)' }}>
          Current saved role: {rawRole || 'unknown'}
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

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleWindowError = this.handleWindowError.bind(this);
    this.handleUnhandledRejection = this.handleUnhandledRejection.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  handleWindowError(event) {
    if (event?.error) {
      this.setState({ error: event.error });
      return;
    }

    if (event?.message) {
      this.setState({ error: new Error(event.message) });
    }
  }

  handleUnhandledRejection(event) {
    const reason = event?.reason;
    if (reason instanceof Error) {
      this.setState({ error: reason });
      return;
    }

    if (typeof reason === 'string') {
      this.setState({ error: new Error(reason) });
      return;
    }

    if (reason && typeof reason === 'object') {
      this.setState({ error: new Error(reason.message || JSON.stringify(reason)) });
    }
  }

  async handleSignOut() {
    await supabase.auth.signOut();
    this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: '#07090d' }}>
          <div
            className="w-full max-w-lg rounded-2xl p-6 text-center"
            style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
          >
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.25)' }}>
              <RefreshCw className="w-6 h-6" style={{ color: '#ff4757' }} />
            </div>
            <p className="text-lg font-semibold mb-2" style={{ color: '#ff4757' }}>App Recovery Screen</p>
            <p className="text-sm mb-2" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
              The app hit a runtime error after loading. Sign out and retry so we can recover your session cleanly.
            </p>
            <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.38)', wordBreak: 'break-word' }}>
              {this.state.error?.message || 'Unknown runtime error'}
            </p>
            <button
              onClick={() => this.handleSignOut()}
              className="btn-gold w-full py-3 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out and Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
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

  if (loading && !user) return <LoadingScreen />;

  const role = normalizeAppRole(profile?.role);

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

  const needsOnboarding = role === 'company' && !org && !company;
  const defaultRolePath = defaultPathForRole(role);

  if (!role) {
    return <UnsupportedRoleScreen rawRole={profile?.role} />;
  }

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

      {!needsOnboarding && <Route path="/*" element={<Navigate to={defaultRolePath} replace />} />}
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppErrorBoundary>
          <AppRoutes />
          <ToastContainer />
        </AppErrorBoundary>
      </AppProvider>
    </ThemeProvider>
  );
}
