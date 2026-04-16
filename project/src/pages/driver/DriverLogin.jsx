import React, { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { handleSupabaseError } from '../../utils/errorHandler';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

export default function DriverLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const credentialHint = useMemo(() => (
    'Use your assigned driver username and password. If your account has not been customized yet, your TLC number works as both username and password.'
  ), []);

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

    const { data, error: queryError } = await supabase
      .from('drivers')
      .select('id, full_name, photo_data, tlc_number, login_username, login_password, is_active, status')
      .eq('is_active', true)
      .order('full_name');

    if (queryError) {
      handleSupabaseError(queryError, 'DriverLogin:loadDrivers', { fallback: 'Failed to load driver list.' });
      setLoading(false);
      return;
    }

    const matchedDriver = (data || []).find(row => {
      const aliases = [
        row.login_username,
        row.tlc_number,
        row.full_name,
      ].map(normalize).filter(Boolean);

      const usernameMatch = aliases.includes(cleanUsername);
      const effectivePassword = String(row.login_password || row.tlc_number || '').trim();
      const passwordMatch = effectivePassword && cleanPassword === effectivePassword;

      return usernameMatch && passwordMatch;
    });

    if (!matchedDriver) {
      setError('Driver username or password is incorrect.');
      setLoading(false);
      return;
    }

    setDriver(matchedDriver);
    onLogin({ id: matchedDriver.id, name: matchedDriver.full_name, photo: matchedDriver.photo_data });
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6" style={{ background: '#07090d' }}>
      <div className="flex flex-col items-center gap-8 w-full max-w-xs">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))', border: '2px solid rgba(201,168,76,0.3)' }}
          >
            <span style={{ color: '#c9a84c', fontSize: 42, fontWeight: 800 }}>P</span>
          </div>
          <div className="text-center">
            <p style={{ color: '#c9a84c', fontSize: 22, fontWeight: 800, letterSpacing: '0.5px' }}>PENTHOUSE</p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Driver App</p>
          </div>
        </div>

        <form onSubmit={handleStart} className="w-full flex flex-col gap-4">
          <input
            type="text"
            placeholder="Driver username or TLC number"
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
            className="w-full py-5 rounded-2xl text-xl font-800 flex items-center justify-center gap-2 transition-all"
            style={{
              background: 'linear-gradient(135deg, #c9a84c, #b8983e)',
              color: '#07090d',
              fontWeight: 800,
              fontSize: 18,
              boxShadow: '0 8px 32px rgba(201,168,76,0.35)',
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
  );
}
