import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, Lock, Mail, User, Building2, Database } from 'lucide-react';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [signupRole, setSignupRole] = useState('dispatcher');
  const [importSource, setImportSource] = useState('sentry');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    if (mode === 'login') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    } else {
      const cleanEmail = email.trim();
      const cleanName = name.trim();
      const cleanCompanyName = companyName.trim();
      const nextRole = signupRole;
      const { data, error: err } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: cleanName,
            role: nextRole,
            company_name: cleanCompanyName,
            import_source: importSource,
          },
        },
      });
      if (err) { setError(err.message); setLoading(false); return; }

      if (data.user && data.session) {
        const { error: profileErr } = await supabase.from('profiles').upsert({
          id: data.user.id,
          email: cleanEmail,
          full_name: cleanName,
          role: nextRole,
        });

        if (profileErr) {
          setError('Your account was created, but profile setup needs one more try after sign-in.');
          setLoading(false);
          return;
        }
      }

      if (nextRole === 'company') {
        localStorage.setItem('pd_company_signup_seed', JSON.stringify({
          company_name: cleanCompanyName,
          billing_contact_name: cleanName,
          billing_contact_email: cleanEmail,
          import_source: importSource,
        }));
      }

      if (data.user && !data.session) {
        setInfo('Account created. Check your email for the confirmation link, then sign in here.');
        setMode('login');
        setPassword('');
      } else {
        setInfo('Account created successfully. You can sign in now.');
      }
    }
    setLoading(false);
  }

  async function handleForgotPassword() {
    setError('');
    setInfo('');

    if (!email.trim()) {
      setError('Enter your email first, then tap Forgot password.');
      return;
    }

    setLoading(true);

    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/change-password`,
    });

    if (err) {
      setError(err.message);
    } else {
      setInfo('Password reset email sent. Open the link in that email to create a new password.');
    }

    setLoading(false);
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: '#07090d' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05))', border: '1px solid rgba(201,168,76,0.3)' }}
          >
            <span style={{ color: '#c9a84c', fontSize: 32, fontWeight: 800 }}>P</span>
          </div>
          <div className="text-center">
            <p style={{ color: '#c9a84c', fontSize: 18, fontWeight: 800 }}>PENTHOUSE DISPATCH</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Premium NEMT Operations Platform</p>
          </div>
        </div>

        <div className="rounded-2xl p-6" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex rounded-xl overflow-hidden mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {['login', 'signup'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                className="flex-1 py-2.5 text-sm transition-all"
                style={{
                  background: mode === m ? 'rgba(201,168,76,0.15)' : 'transparent',
                  color: mode === m ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                  fontWeight: mode === m ? 600 : 400,
                  border: 'none',
                }}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'dispatcher', label: 'Dispatcher', icon: User },
                    { value: 'company', label: 'Company', icon: Building2 },
                  ].map(option => {
                    const Icon = option.icon;
                    const active = signupRole === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSignupRole(option.value)}
                        className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm transition-all"
                        style={{
                          background: active ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${active ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.08)'}`,
                          color: active ? '#c9a84c' : 'rgba(255,255,255,0.45)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        <Icon className="w-4 h-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <input
                    type="text"
                    placeholder={signupRole === 'company' ? 'Primary contact name' : 'Full name'}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    className="w-full pl-10"
                  />
                </div>

                {signupRole === 'company' && (
                  <>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                      <input
                        type="text"
                        placeholder="Company name"
                        value={companyName}
                        onChange={e => setCompanyName(e.target.value)}
                        required
                        className="w-full pl-10"
                      />
                    </div>

                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Port data from</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'sentry', label: 'Sentry' },
                          { value: 'asm', label: 'ASM' },
                          { value: 'manual', label: 'Manual' },
                        ].map(option => {
                          const active = importSource === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setImportSource(option.value)}
                              className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs transition-all"
                              style={{
                                background: active ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${active ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.08)'}`,
                                color: active ? '#c9a84c' : 'rgba(255,255,255,0.45)',
                                fontWeight: active ? 600 : 400,
                              }}
                            >
                              <Database className="w-3 h-3" />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full pl-10"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', padding: 0 }}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {mode === 'login' && (
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-left text-sm px-1"
                style={{ color: '#c9a84c', background: 'none', border: 'none', padding: 0 }}
              >
                Forgot password?
              </button>
            )}

            {error && (
              <p className="text-sm px-1" style={{ color: '#ff4757' }}>{error}</p>
            )}

            {info && (
              <p className="text-sm px-1" style={{ color: '#7ee787' }}>{info}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-gold w-full py-3 mt-1"
              style={{ opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          {mode === 'signup' && (
            <p className="text-xs text-center mt-4" style={{ color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
              {signupRole === 'company'
                ? 'Company accounts can start onboarding immediately and choose to port data from Sentry, ASM, or manual setup.'
                : 'Dispatcher accounts are created for platform operations and internal dispatch use.'}
            </p>
          )}
        </div>

        <p className="text-center mt-4 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Penthouse Dispatch v1.0 — Powered by AI
        </p>
      </div>
    </div>
  );
}
