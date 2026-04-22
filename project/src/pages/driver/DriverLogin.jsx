import React, { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { handleSupabaseError } from '../../utils/errorHandler';
import { loadCompanyBranding, DEFAULT_BRANDING } from '../../lib/companyBranding';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

export default function DriverLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  const credentialHint = useMemo(() => (
    'Use your assigned driver email, username, or TLC number with your driver password. If your account has not been customized yet, your TLC number can still work for both fields.'
  ), []);

  React.useEffect(() => {
    loadCompanyBranding().then(setBranding);
  }, []);

  async function loadDriverByEmail(email) {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, photo_data, tlc_number, login_username, login_password, email, is_active, status')
      .ilike('email', email)
      .eq('is_active', true)
      .order('full_name')
      .limit(1)
      .maybeSingle();

    if (error) {
      handleSupabaseError(error, 'DriverLogin:loadDriverByEmail', { fallback: 'Failed to load driver profile.' });
      return null;
    }

    return data || null;
  }

  async function trySandboxCredentialLogin(cleanUsername, cleanPassword) {
    const { data: sentryCfg, error: sentryErr } = await supabase
      .from('sentry_config')
      .select('driver_sandbox_username, driver_sandbox_password')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sentryErr || !sentryCfg?.driver_sandbox_username || !sentryCfg?.driver_sandbox_password) {
      return null;
    }

    const sandboxUsernameMatch = normalize(sentryCfg.driver_sandbox_username) === cleanUsername;
    const sandboxPasswordMatch = String(sentryCfg.driver_sandbox_password || '').trim() === cleanPassword;

    if (!sandboxUsernameMatch || !sandboxPasswordMatch) {
      return null;
    }

    const { data: session, error: sessionErr } = await supabase
      .from('test_sandbox_sessions')
      .select('test_company_id')
      .eq('is_active', true)
      .order('reset_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionErr || !session?.test_company_id) {
      return null;
    }

    const { data: sandboxDriver, error: driverErr } = await supabase
      .from('drivers')
      .select('id, full_name, photo_data, tlc_number, login_username, login_password, email, is_active, status')
      .eq('company_id', session.test_company_id)
      .eq('is_active', true)
      .order('status', { ascending: true })
      .order('full_name', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (driverErr || !sandboxDriver) {
      return null;
    }

    return sandboxDriver;
  }

  async function handleStart(e) {
    e.preventDefault();
    setError('');
    setDriver(null);

    const cleanUsername = normalize(username);
    const cleanPassword = String(password || '').trim();

    if (!cleanUsername || !cleanPassword) {
      setError('Enter your driver username and password.');
      return;
    }

    setLoading(true);

    if (cleanUsername.includes('@')) {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: cleanUsername,
        password: cleanPassword,
      });

      if (!authError) {
        const emailDriver = await loadDriverByEmail(cleanUsername);
        if (emailDriver) {
          setDriver(emailDriver);
          onLogin({ id: emailDriver.id, name: emailDriver.full_name, photo: emailDriver.photo_data, email: emailDriver.email });
          setLoading(false);
          setError('');
          return;
        }

        await supabase.auth.signOut();
        setError('This email signed in, but no active driver profile is linked to it yet.');
        setLoading(false);
        return;
      }
    }

    const { data, error: queryError } = await supabase
      .from('drivers')
      .select('id, full_name, photo_data, tlc_number, login_username, login_password, email, is_active, status')
      .eq('is_active', true)
      .order('full_name');

    if (queryError) {
      handleSupabaseError(queryError, 'DriverLogin:loadDrivers', { fallback: 'Failed to load driver list.' });
      setLoading(false);
      return;
    }

    const matchedDriver = (data || []).find(row => {
      const aliases = [
        row.email,
        row.login_username,
        row.tlc_number,
        row.full_name,
      ].map(normalize).filter(Boolean);

      const usernameMatch = aliases.includes(cleanUsername);
      const effectivePassword = String(row.login_password || row.tlc_number || '').trim();
      const passwordMatch = effectivePassword && cleanPassword === effectivePassword;

      return usernameMatch && passwordMatch;
    });

    const finalDriver = matchedDriver || await trySandboxCredentialLogin(cleanUsername, cleanPassword);

    if (!finalDriver) {
      setError('Driver email, username, TLC number, or password is incorrect.');
      setLoading(false);
      return;
    }

    setDriver(finalDriver);
    onLogin({ id: finalDriver.id, name: finalDriver.full_name, photo: finalDriver.photo_data });
    setLoading(false);
  }

  return (
    <div
      className="fixed inset-0 overflow-y-auto"
      style={{ background: '#07090d', paddingTop: 'calc(var(--safe-top) + 20px)', paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}
    >
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-4" style={{ minHeight: '100dvh' }}>
        <div className="flex flex-col items-center gap-6 w-full max-w-xs">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${branding.brand_primary}33, ${branding.brand_primary}12)`, border: `2px solid ${branding.brand_primary}55` }}
            >
              {branding.logo_url ? (
                <img src={branding.logo_url} alt={branding.app_display_name} className="w-14 h-14 rounded-2xl object-cover" />
              ) : (
                <span style={{ color: branding.brand_primary, fontSize: 42, fontWeight: 800 }}>{branding.app_display_name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="text-center">
              <p style={{ color: branding.brand_primary, fontSize: 22, fontWeight: 800, letterSpacing: '0.5px' }}>{branding.app_display_name}</p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Driver App</p>
            </div>
          </div>

          <form onSubmit={handleStart} className="w-full flex flex-col gap-4">
            <input
              type="text"
              placeholder="Driver email, username, or TLC number"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              required
              className="w-full text-center text-base py-4 rounded-2xl"
              style={{ fontSize: 16, textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb' }}
            />

            <input
              type="password"
              placeholder="Driver password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full text-center text-base py-4 rounded-2xl"
              style={{ fontSize: 16, textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb' }}
            />

            {driver && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)' }}>
                {driver.photo_data ? (
                  <img src={driver.photo_data} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-700" style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', fontWeight: 700 }}>
                    {driver.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p style={{ color: '#00e5a0', fontSize: 14, fontWeight: 600 }}>{driver.full_name}</p>
                  {driver.tlc_number && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>TLC #{driver.tlc_number}</p>}
                </div>
              </div>
            )}

            {error && (
              <div className="px-4 py-3 rounded-2xl" style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.18)', color: '#ff4757', fontSize: 13 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl text-xl font-800 flex items-center justify-center gap-2 transition-all"
              style={{
                background: `linear-gradient(135deg, ${branding.brand_primary}, ${branding.brand_accent})`,
                color: '#07090d',
                fontWeight: 800,
                fontSize: 18,
                boxShadow: `0 8px 32px ${branding.brand_primary}55`,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Starting shift...' : 'Start Shift'}
            </button>
          </form>

          <div className="text-center px-2">
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.36)', lineHeight: 1.6 }}>
              {credentialHint}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
