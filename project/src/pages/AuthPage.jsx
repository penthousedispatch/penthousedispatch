import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, User, Building2, Database } from 'lucide-react';
import { getAuthRedirectUrl } from '../lib/mobileRuntime';
import { APP_VARIANT, APP_VARIANT_META, allowsSelfSignup, getSignupRolesForVariant, isRiderVariant } from '../lib/appVariant';
import { COMPANY_SEGMENTS, DEFAULT_COMPANY_SEGMENT, normalizeCompanySegment } from '../lib/companyType';

const LIVE_COMPANY_SIGNUP_SEGMENTS = ['transport_company'];

function isApprovedCompanyRecord(company) {
  return Boolean(
    company?.is_approved ||
    String(company?.onboarding_status || '').toLowerCase() === 'approved'
  );
}

export default function AuthPage() {
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [signupRole, setSignupRole] = useState('company');
  const [companySegment, setCompanySegment] = useState(DEFAULT_COMPANY_SEGMENT);
  const [importSource, setImportSource] = useState('sentry');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const signupRoles = getSignupRolesForVariant();
  const signupEnabled = allowsSelfSignup();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const authState = params.get('auth');
    const requestedPath = params.get('next');

    if (authState === 'verified') {
      setMode('login');
      setInfo('Email confirmed. Please sign in with your password.');
    } else if (authState === 'magic') {
      setMode('login');
      setInfo('Magic link confirmed. Please continue from the sign-in screen.');
    } else if (requestedPath && requestedPath.startsWith('/')) {
      setMode('login');
      setInfo('Please sign in to continue.');
    }
  }, [location.search]);

  useEffect(() => {
    if (!signupEnabled) {
      setMode('login');
      return;
    }

    if (!signupRoles.includes(signupRole)) {
      setSignupRole(signupRoles[0] || 'company');
    }
  }, [signupEnabled, signupRole, signupRoles]);

  async function findApprovedCompanyCandidate(cleanEmail, cleanCompanyName) {
    const lookups = [];

    if (cleanEmail) {
      lookups.push(
        supabase
          .from('companies')
          .select('*')
          .ilike('billing_contact_email', cleanEmail)
          .order('updated_at', { ascending: false })
          .limit(5)
      );
    }

    if (cleanCompanyName) {
      lookups.push(
        supabase
          .from('companies')
          .select('*')
          .ilike('company_name', cleanCompanyName)
          .order('updated_at', { ascending: false })
          .limit(5)
      );
    }

    for (const lookup of lookups) {
      const { data, error: lookupError } = await lookup;
      if (lookupError) throw lookupError;
      const approvedMatch = (data || []).find(isApprovedCompanyRecord);
      if (approvedMatch?.id) return approvedMatch;
    }

    return null;
  }

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
      let approvedCompany = null;

      if (nextRole === 'company') {
        try {
          approvedCompany = await findApprovedCompanyCandidate(cleanEmail, cleanCompanyName);
        } catch (lookupError) {
          setError(lookupError.message || 'Failed to check existing company approval.');
          setLoading(false);
          return;
        }
      }

      if (approvedCompany?.owner_user_id) {
        setMode('login');
        setPassword('');
        setInfo(`${approvedCompany.company_name || 'This company'} is already approved and linked to an account. Sign in instead, or use Forgot password if needed.`);
        setLoading(false);
        return;
      }

      const { data, error: err } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: getAuthRedirectUrl('/auth?auth=verified'),
          data: {
            full_name: cleanName,
            role: nextRole,
            company_name: cleanCompanyName,
            company_segment: normalizeCompanySegment(companySegment),
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

        if (nextRole === 'company' && approvedCompany?.id) {
          const now = new Date().toISOString();
          const { error: companyLinkError } = await supabase
            .from('companies')
            .update({
              owner_user_id: data.user.id,
              billing_contact_name: approvedCompany.billing_contact_name || cleanName,
              billing_contact_email: approvedCompany.billing_contact_email || cleanEmail,
              updated_at: now,
            })
            .eq('id', approvedCompany.id)
            .is('owner_user_id', null);

          if (companyLinkError) {
            setError(companyLinkError.message || 'Your account was created, but linking the approved company failed.');
            setLoading(false);
            return;
          }

          const { error: profileCompanyError } = await supabase
            .from('profiles')
            .update({
              role: 'company',
              company_id: approvedCompany.id,
              updated_at: now,
            })
            .eq('id', data.user.id);

          if (profileCompanyError) {
            setError(profileCompanyError.message || 'Your account was created, but linking your company profile failed.');
            setLoading(false);
            return;
          }
        }
      }

      if (nextRole === 'company') {
        localStorage.setItem('pd_company_signup_seed', JSON.stringify({
          company_name: approvedCompany?.company_name || cleanCompanyName,
          company_segment: normalizeCompanySegment(companySegment),
          billing_contact_name: approvedCompany?.billing_contact_name || cleanName,
          billing_contact_email: approvedCompany?.billing_contact_email || cleanEmail,
          import_source: importSource,
          company_id: approvedCompany?.id || null,
        }));
      }

      if (data.user && !data.session) {
        setInfo(
          nextRole === 'company' && approvedCompany?.id
            ? 'Account created and linked to your approved company. Check your email for the confirmation link, then sign in here.'
            : 'Account created. Check your email for the confirmation link, then sign in here.'
        );
        setMode('login');
        setPassword('');
      } else {
        await supabase.auth.signOut();
        setMode('login');
        setPassword('');
        setInfo(
          nextRole === 'company' && approvedCompany?.id
            ? 'Approved company linked successfully. Please sign in with your password.'
            : 'Account created successfully. Please sign in with your password.'
        );
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
      redirectTo: getAuthRedirectUrl('/change-password'),
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
            <p style={{ color: '#c9a84c', fontSize: 18, fontWeight: 800 }}>{APP_VARIANT_META[APP_VARIANT].authTitle}</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{APP_VARIANT_META[APP_VARIANT].authSubtitle}</p>
          </div>
        </div>

        <div className="rounded-2xl p-6" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          {signupEnabled ? (
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
          ) : (
            <div className="rounded-xl px-4 py-3 mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.56)' }}>
                {APP_VARIANT_META[APP_VARIANT].authHelp}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    signupRoles.includes('company') ? { value: 'company', label: 'Company', icon: Building2 } : null,
                    signupRoles.includes('rider') ? { value: 'rider', label: 'Rider', icon: User } : null,
                  ].filter(Boolean).map(option => {
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
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Signup track</label>
                      <div className="grid grid-cols-1 gap-2">
                        {LIVE_COMPANY_SIGNUP_SEGMENTS.map(segmentId => {
                          const option = COMPANY_SEGMENTS[segmentId];
                          const active = companySegment === segmentId;

                          return (
                            <button
                              key={segmentId}
                              type="button"
                              onClick={() => setCompanySegment(segmentId)}
                              className="text-left rounded-xl px-3 py-3 transition-all"
                              style={{
                                background: active ? `${option.accent}18` : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${active ? `${option.accent}50` : 'rgba(255,255,255,0.08)'}`,
                                color: active ? option.accent : 'rgba(255,255,255,0.62)',
                              }}
                            >
                              <p className="text-sm font-600 mb-1" style={{ fontWeight: 600 }}>{option.label}</p>
                              <p className="text-xs leading-5" style={{ color: active ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.42)' }}>
                                {option.description}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

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
              {loading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : (isRiderVariant() ? 'Create Rider Account' : 'Create Account'))}
            </button>

            {mode === 'login' && (
              <button
                type="button"
                disabled={loading}
                className="btn-ghost w-full py-3"
                onClick={async () => {
                  setError('');
                  setInfo('');

                  if (!email.trim()) {
                    setError('Enter your email first, then tap Send Magic Link.');
                    return;
                  }

                  setLoading(true);
                  const { error: otpError } = await supabase.auth.signInWithOtp({
                    email: email.trim(),
                    options: {
                      emailRedirectTo: getAuthRedirectUrl('/auth?auth=magic'),
                    },
                  });

                  if (otpError) {
                    setError(otpError.message);
                  } else {
                    setInfo('Magic link sent. Open it, then continue from the sign-in screen.');
                  }

                  setLoading(false);
                }}
              >
                Send Magic Link
              </button>
            )}
          </form>

          {mode === 'signup' && (
            <p className="text-xs text-center mt-4" style={{ color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
              {signupRole === 'company'
                ? 'Transportation companies sign up here first, then finish onboarding and connect their dispatch setup.'
                : 'Rider accounts let passengers save their sign-in and reopen trip tracking links from the native Rider app.'}
            </p>
          )}
        </div>

        <p className="text-center mt-4 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {APP_VARIANT_META[APP_VARIANT].label} v1.0
        </p>
        <div className="mt-3 flex items-center justify-center gap-4 text-xs">
          <Link to="/privacy" style={{ color: 'rgba(255,255,255,0.42)' }}>Privacy</Link>
          <Link to="/terms" style={{ color: 'rgba(255,255,255,0.42)' }}>Terms</Link>
          <Link to="/support" style={{ color: 'rgba(255,255,255,0.42)' }}>Support</Link>
        </div>
      </div>
    </div>
  );
}
