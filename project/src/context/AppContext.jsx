import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { sentryApi } from '../lib/sentryApi';
import { isSyntheticMarketplaceTrip } from '../lib/sentrySyntheticTrips';
import { getEdgeFunctionHeaders } from '../lib/edgeHeaders';
import { handleSupabaseError, logFailure, toastError } from '../utils/errorHandler';
import { runAutoScheduler } from '../utils/autoScheduler';
import { DEFAULT_BILLING_RATE_PER_MILE, syncCompletedTripBilling } from '../utils/billingAutomation';
import { normalizeAppRole } from '../lib/roles';
import { readCompanySchedulerPrefs } from '../lib/companySchedulerPrefs';
import { ensurePlatformAdminOrg } from '../lib/platformAdminOrg';
import { APP_VARIANT } from '../lib/appVariant';
import {
  deriveMarketplaceTripStatus,
  pickAssignmentTypeCode,
  pickExternalTripStatus,
} from '../lib/sentryTripInbound';

function inboundSentryTripId(t = {}) {
  const v = t.trip_id ?? t.id;
  if (v == null) return '';
  return String(v).trim();
}

function mapInboundSentryTripToMarketplaceRow(t, scopedCompanyId) {
  const pickup = t.pick_up_location || {};
  const dropoff = t.drop_off_location || {};
  const prices = t.prices || {};
  const extStatus = pickExternalTripStatus(t);
  return {
    sentry_trip_id: inboundSentryTripId(t),
    sentry_last_modified_at: String(t.last_modified_at || ''),
    date_val: t.date || t.schedule_date || '',
    los: t.service_level_code || t.level_of_service || t.los || '',
    passengers: String(
      t.passenger_count ||
      t.passengers ||
      t.client_count ||
      (t.client ? 1 : '') ||
      '1'
    ),
    mileage: String(t.mileage || t.estimated_miles || ''),
    pu_address: t.pickup_address || t.pu_address || pickup.address || '',
    pu_city: t.pickup_city || t.pu_city || pickup.city || '',
    pu_zip: String(t.pickup_zip || t.pu_zip || pickup.zip_code || ''),
    pu_time: t.scheduled_pickup_time || t.scheduled_pick_up_timestamp || t.pu_time || '',
    do_address: t.dropoff_address || t.do_address || dropoff.address || '',
    do_city: t.dropoff_city || t.do_city || dropoff.city || '',
    do_zip: String(t.dropoff_zip || t.do_zip || dropoff.zip_code || ''),
    do_time: t.scheduled_dropoff_time || t.scheduled_drop_off_timestamp || t.do_time || '',
    delivery_price: String(
      t.total_amount ||
      t.delivery_price ||
      prices.delivery_cost ||
      prices.actual_cost ||
      ''
    ),
    status: deriveMarketplaceTripStatus(t),
    assignment_type_code: pickAssignmentTypeCode(t),
    external_trip_status: extStatus,
    company_id: scopedCompanyId,
    pu_lat: pickup.lat ?? null,
    pu_lng: pickup.lng ?? null,
    do_lat: dropoff.lat ?? null,
    do_lng: dropoff.lng ?? null,
    raw_payload: t,
    loaded_at: new Date().toISOString(),
  };
}

function ingestibleInboundMarketplaceRow(row = {}) {
  return Boolean(row.sentry_trip_id) && !isSyntheticMarketplaceTrip(row);
}

const AppContext = createContext(null);
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;
const PLATFORM_OWNER_EMAILS = new Set([
  'frankny84@gmail.com',
  'thepenthousebrandcorp@gmail.com',
]);

function isApprovedCompanyRecord(company) {
  return Boolean(
    company?.is_approved ||
    String(company?.onboarding_status || '').toLowerCase() === 'approved'
  );
}

function pickBestCompanyRecord(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => {
    const aApproved = isApprovedCompanyRecord(a) ? 1 : 0;
    const bApproved = isApprovedCompanyRecord(b) ? 1 : 0;
    if (aApproved !== bApproved) return bApproved - aApproved;

    const aUpdated = new Date(a?.updated_at || a?.created_at || 0).getTime();
    const bUpdated = new Date(b?.updated_at || b?.created_at || 0).getTime();
    return bUpdated - aUpdated;
  });

  return sorted[0] || null;
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [org, setOrg] = useState(null);
  const [company, setCompany] = useState(null);
  const [adminPreviewCompany, setAdminPreviewCompany] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [trips, setTrips] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [sentryConfig, setSentryConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sentryStatus, setSentryStatus] = useState({ ok: false, checked: false });
  const autoPullRef = useRef(null);
  const schedRunningRef = useRef(false);
  const orgIdRef = useRef(null);
  /** Always-current company id for Sentry poll (interval closures were stale vs React state). */
  const sentryPollCompanyIdRef = useRef(null);
  const billingSyncRef = useRef(0);
  const liveChannelRef = useRef(null);
  const liveRefreshTimersRef = useRef({});
  const initialSessionResolvedRef = useRef(false);
  // Tracks the most recent time the client wrote to the profiles row for this user.
  // Used to ignore the realtime echo of our own write so the client + DB triggers
  // can't ping-pong the role and stall the dashboard in a loadUserData loop.
  const selfProfileWriteRef = useRef(0);
  const SELF_PROFILE_WRITE_ECHO_MS = 2500;
  /** Tracks prior pause_sandbox_outbound so we can notify driver clients to re-sync accept/status2. */
  const pauseSandboxOutboundPrevRef = useRef(null);
  const normalizedRole = normalizeAppRole(profile?.role);
  const activeCompany = normalizedRole === 'admin' && adminPreviewCompany ? adminPreviewCompany : company;
  const isCompanyRole = normalizedRole === 'company';

  useEffect(() => {
    if (normalizedRole === 'admin') {
      sentryPollCompanyIdRef.current = adminPreviewCompany?.id ?? null;
    } else if (isCompanyRole) {
      sentryPollCompanyIdRef.current = company?.id ?? profile?.company_id ?? null;
    } else {
      sentryPollCompanyIdRef.current = null;
    }
  }, [normalizedRole, isCompanyRole, company?.id, adminPreviewCompany?.id, profile?.company_id]);

  async function resolveAuthRole(u) {
    const directRole =
      normalizeAppRole(u?.user_metadata?.role) ||
      normalizeAppRole(u?.app_metadata?.role);

    if (directRole) return directRole;

    try {
      const { data } = await supabase.auth.getSession();
      return (
        normalizeAppRole(data?.session?.user?.user_metadata?.role) ||
        normalizeAppRole(data?.session?.user?.app_metadata?.role) ||
        null
      );
    } catch (error) {
      logFailure('resolveAuthRole', error);
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const authStorageKey = Object.keys(window.localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
        if (authStorageKey) {
          const rawSession = window.localStorage.getItem(authStorageKey);
          const parsedSession = rawSession ? JSON.parse(rawSession) : null;
          return (
            normalizeAppRole(parsedSession?.user?.user_metadata?.role) ||
            normalizeAppRole(parsedSession?.user?.app_metadata?.role) ||
            null
          );
        }
      }
    } catch (error) {
      logFailure('resolveAuthRole:localStorage', error);
    }

    return null;
  }

  async function fetchProfileWithRetry(userId, attempts = 2) {
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const result = await Promise.race([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Profile lookup timed out (attempt ${attempt + 1})`)), 1500)
          ),
        ]);

        if (result?.error) {
          lastError = result.error;
        } else if (result?.data) {
          return result.data;
        }
      } catch (error) {
        lastError = error;
      }

      if (attempt < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    if (lastError) {
      logFailure('fetchProfileWithRetry', lastError);
    }

    return null;
  }

  async function fetchAdminMembership(userId) {
    try {
      const result = await Promise.race([
        supabase
          .from('org_members')
          .select('role, org_id')
          .eq('user_id', userId)
          .in('role', ['admin', 'superadmin'])
          .limit(1)
          .maybeSingle(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Admin membership lookup timed out')), 1500)
        ),
      ]);

      if (result?.error) {
        logFailure('fetchAdminMembership', result.error);
        return null;
      }

      return result?.data || null;
    } catch (error) {
      logFailure('fetchAdminMembership', error);
      return null;
    }
  }

  async function inferFallbackIdentity(u) {
    const metadataRole = await resolveAuthRole(u);

    if (metadataRole) {
      return {
        role: metadataRole,
        companyId: u?.user_metadata?.company_id || null,
      };
    }

    const email = (u?.email || '').trim().toLowerCase();

    if (email && PLATFORM_OWNER_EMAILS.has(email)) {
      return { role: 'admin', companyId: null };
    }

    const adminMembership = await fetchAdminMembership(u.id);

    if (adminMembership?.org_id) {
      return { role: 'admin', companyId: null };
    }

    const ownerCompanyResult = await supabase
      .from('companies')
      .select('id, company_name, is_approved, onboarding_status, updated_at, created_at')
      .eq('owner_user_id', u.id)
      .limit(10);

    const ownerCompany = pickBestCompanyRecord(ownerCompanyResult.data || []);
    if (ownerCompany?.id) {
      return { role: 'company', companyId: ownerCompany.id };
    }

    if (email) {
      const billingCompanyResult = await supabase
        .from('companies')
        .select('id, company_name, is_approved, onboarding_status, updated_at, created_at')
        .ilike('billing_contact_email', email)
        .limit(10);

      const billingCompany = pickBestCompanyRecord(billingCompanyResult.data || []);
      if (billingCompany?.id) {
        return { role: 'company', companyId: billingCompany.id };
      }

      const driverResult = await supabase
        .from('drivers')
        .select('id, company_id')
        .ilike('email', email)
        .maybeSingle();

      if (driverResult.data?.id) {
        return { role: 'driver', companyId: driverResult.data.company_id || null };
      }
    }

    if (APP_VARIANT === 'rider') {
      return { role: 'rider', companyId: null };
    }

    if (APP_VARIANT === 'driver') {
      return { role: 'driver', companyId: null };
    }

    return { role: 'admin', companyId: null };
  }

  async function ensureFallbackProfile(u) {
    const inferredIdentity = await inferFallbackIdentity(u);
    const fallbackRole = inferredIdentity?.role;

    if (!fallbackRole) return null;

    const fallbackProfile = {
      id: u.id,
      email: u.email || '',
      full_name:
        u?.user_metadata?.full_name ||
        u?.user_metadata?.name ||
        (u.email ? u.email.split('@')[0] : 'User'),
      role: fallbackRole,
      company_id: inferredIdentity?.companyId || null,
    };

    setProfile(fallbackProfile);

    selfProfileWriteRef.current = Date.now();
    const { data, error } = await supabase
      .from('profiles')
      .upsert(fallbackProfile, { onConflict: 'id' })
      .select('*')
      .maybeSingle();

    if (error) {
      logFailure('ensureFallbackProfile', error);
      return fallbackProfile;
    }

    return data || fallbackProfile;
  }

  async function fetchLatestSentryConfig() {
    const { data, error } = await supabase
      .from('sentry_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  function buildSentryFeatureConfig(cfg = {}) {
    return {
      assignedTrips: cfg.feat_assigned_trips !== false,
      marketplaceTrips: cfg.feat_marketplace_trips !== false,
      tripAcceptReject: cfg.feat_trip_accept_reject !== false,
      tripStatusUpdate: cfg.feat_trip_status_update !== false,
      drivers: cfg.feat_drivers !== false,
      vehicles: cfg.feat_vehicles !== false,
      vehicleLocations: cfg.feat_vehicle_locations !== false,
      vehicleWaypointEtas: cfg.feat_waypoint_etas !== false,
      driverWorkShifts: cfg.feat_driver_work_shifts !== false,
      retrieveTrips: cfg.feat_retrieve_trips !== false,
    };
  }

  function applySentryConfig(cfg) {
    if (!cfg) {
      setSentryConfig(null);
      setSentryStatus({ ok: false, checked: false });
      sentryApi.configure({
        baseUrl: '',
        username: '',
        password: '',
        apiKey: '',
        authType: 'basic',
        enabled: false,
        features: buildSentryFeatureConfig({}),
      });
      return;
    }

    setSentryConfig(cfg);
    sentryApi.configure({
      baseUrl: cfg.base_url,
      username: cfg.username,
      password: cfg.password_enc,
      apiKey: cfg.api_key,
      authType: cfg.auth_type,
      enabled: cfg.enabled,
      sandbox: cfg.sandbox !== false,
      pauseSandboxOutbound: cfg.pause_sandbox_outbound === true,
      features: buildSentryFeatureConfig(cfg),
    });
  }

  async function loadSavedSentryConfig() {
    const cfg = await fetchLatestSentryConfig().catch((cfgErr) => {
      logFailure('loadUserData:sentry_config', cfgErr);
      return null;
    });
    applySentryConfig(cfg);
    return cfg;
  }

  // When the tab/app returns to foreground, refresh Sentry config so driver sessions
  // pick up Admin changes (e.g. turning off "pause sandbox outbound") without a full reload.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible' || !user?.id) return;
      fetchLatestSentryConfig()
        .then(cfg => {
          applySentryConfig(cfg);
        })
        .catch(err => logFailure('visibility:sentry_config', err));
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [user?.id]);

  // When outbound pause is cleared, tell the driver app to re-send accept + status 2 for the active trip.
  useEffect(() => {
    const paused = sentryConfig?.pause_sandbox_outbound === true;
    const prev = pauseSandboxOutboundPrevRef.current;
    pauseSandboxOutboundPrevRef.current = paused;
    if (prev === true && paused === false && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pd-sentry-outbound-resumed'));
    }
  }, [sentryConfig?.pause_sandbox_outbound, sentryConfig?.updated_at]);

  useEffect(() => {
    let mounted = true;
    const SESSION_BOOT_TIMEOUT_MS = 3500;

    async function bootstrapSession() {
      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Initial session bootstrap timed out')), SESSION_BOOT_TIMEOUT_MS)
          ),
        ]);

        if (!mounted) return;

        const { data: { session }, error } = sessionResult;
        initialSessionResolvedRef.current = true;

        if (error) logFailure('getSession', error);
        setUser(session?.user ?? null);
        if (session?.user) {
          setLoading(true);
          await loadUserData(session.user);
        } else {
          setLoading(false);
        }
      } catch (error) {
        initialSessionResolvedRef.current = true;
        logFailure('bootstrapSession', error);
        if (!mounted) return;
        setUser(null);
        setProfile(null);
        setOrg(null);
        setCompany(null);
        setAdminPreviewCompany(null);
        sentryPollCompanyIdRef.current = null;
        setLoading(false);
      }
    }

    bootstrapSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      initialSessionResolvedRef.current = true;
      setUser(session?.user ?? null);
      if (session?.user) {
        // Token refresh must not flip the whole app into <LoadingScreen /> — that unmounts Driver/Dispatch
        // and wipes in-memory session (embedded driver, trip offer, etc.).
        if (event === 'TOKEN_REFRESHED') {
          return;
        }
        setLoading(true);
        (async () => { await loadUserData(session.user); })();
      } else {
        try {
          if (typeof window !== 'undefined') {
            window.localStorage?.removeItem('pd_driver_embed_session_v1');
          }
        } catch {}
        setProfile(null);
        setOrg(null);
        setCompany(null);
        setAdminPreviewCompany(null);
        sentryPollCompanyIdRef.current = null;
        setLoading(false);
        if (autoPullRef.current) { clearInterval(autoPullRef.current); autoPullRef.current = null; }
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (autoPullRef.current) clearInterval(autoPullRef.current);
    };
  }, []);

  function scheduleLiveRefresh(key, fn, delay = 350) {
    if (liveRefreshTimersRef.current[key]) clearTimeout(liveRefreshTimersRef.current[key]);
    liveRefreshTimersRef.current[key] = setTimeout(() => {
      fn();
      delete liveRefreshTimersRef.current[key];
    }, delay);
  }

  async function loadUserData(u) {
    try {
      const metadataRole = await resolveAuthRole(u);

      if (metadataRole && !profile) {
        setProfile(prev => prev || {
          id: u.id,
          email: u.email || '',
          full_name:
            u?.user_metadata?.full_name ||
            u?.user_metadata?.name ||
            (u.email ? u.email.split('@')[0] : 'User'),
          role: metadataRole,
          company_id: u?.user_metadata?.company_id || null,
        });
      }

      let prof = await fetchProfileWithRetry(u.id);
      const adminMembership = await fetchAdminMembership(u.id);
      const normalizedEmail = (u?.email || '').trim().toLowerCase();
      const isPlatformOwnerEmail = normalizedEmail && PLATFORM_OWNER_EMAILS.has(normalizedEmail);

      if (!prof) {
        prof = await ensureFallbackProfile(u);
      }

      if ((isPlatformOwnerEmail || adminMembership?.org_id) && normalizeAppRole(prof?.role) !== 'admin') {
        prof = {
          ...(prof || {
            id: u.id,
            email: u.email || '',
            full_name:
              u?.user_metadata?.full_name ||
              u?.user_metadata?.name ||
              (u.email ? u.email.split('@')[0] : 'User'),
          }),
          role: 'admin',
          company_id: null,
        };

        setProfile(prof);

        selfProfileWriteRef.current = Date.now();
        supabase
          .from('profiles')
          .upsert(prof, { onConflict: 'id' })
          .then(({ error }) => {
            if (error) logFailure('loadUserData:forceAdminProfile', error);
          });
      }

      const normalizedStoredRole = normalizeAppRole(prof?.role);
      if (
        metadataRole &&
        metadataRole !== normalizedStoredRole &&
        !isPlatformOwnerEmail &&
        !adminMembership?.org_id
      ) {
        prof = {
          ...(prof || {
            id: u.id,
            email: u.email || '',
            full_name:
              u?.user_metadata?.full_name ||
              u?.user_metadata?.name ||
              (u.email ? u.email.split('@')[0] : 'User'),
          }),
          role: metadataRole,
          company_id:
            metadataRole === 'company'
              ? (u?.user_metadata?.company_id || prof?.company_id || null)
              : (prof?.company_id || null),
        };

        setProfile(prof);

        selfProfileWriteRef.current = Date.now();
        supabase
          .from('profiles')
          .upsert(prof, { onConflict: 'id' })
          .then(({ error }) => {
            if (error) logFailure('loadUserData:syncMetadataRole', error);
          });
      }

      setProfile(prof);

      let normalizedProfRole = normalizeAppRole(prof?.role);

      if (!normalizedProfRole) {
        prof = await ensureFallbackProfile(u);
        setProfile(prof);
        normalizedProfRole = normalizeAppRole(prof?.role);
      }

      if (!normalizedProfRole) {
        setOrg(null);
        setCompany(null);
        setAdminPreviewCompany(null);
        setDrivers([]);
        setTrips([]);
        setAssignments([]);
        applySentryConfig(null);
        return;
      }

      await loadSavedSentryConfig();

      if (normalizedProfRole === 'admin') {
        setOrg(null);
        setCompany(null);
        setDrivers([]);
        setTrips([]);
        setAssignments([]);
        setLoading(false);
      }

      if (normalizedProfRole === 'company') {
        let comp = null;
        let compErr = null;
        const normalizedUserEmail = (u?.email || '').trim().toLowerCase();

      if (prof.company_id) {
        const result = await supabase.from('companies').select('*').eq('id', prof.company_id).maybeSingle();
        comp = result.data;
        compErr = result.error;
      }

        if ((!comp || !isApprovedCompanyRecord(comp)) && !compErr) {
          const result = await supabase
            .from('companies')
            .select('*')
            .eq('owner_user_id', u.id)
            .limit(10);
          comp = pickBestCompanyRecord(result.data || []);
          compErr = result.error;
        }

        if ((!comp || !isApprovedCompanyRecord(comp)) && !compErr && normalizedUserEmail) {
          const result = await supabase
            .from('companies')
            .select('*')
            .ilike('billing_contact_email', normalizedUserEmail)
            .limit(10);
          comp = pickBestCompanyRecord(result.data || []);
          compErr = result.error;
        }

        if (compErr) logFailure('loadUserData:companies', compErr);

        if (comp?.id) {
          const normalizedCompanyBillingEmail = (comp.billing_contact_email || '').trim().toLowerCase();

          if (!comp.owner_user_id && normalizedUserEmail && normalizedCompanyBillingEmail === normalizedUserEmail) {
            supabase
              .from('companies')
              .update({ owner_user_id: u.id, updated_at: new Date().toISOString() })
              .eq('id', comp.id)
              .is('owner_user_id', null)
              .then(({ error }) => {
                if (error) {
                  logFailure('loadUserData:syncOwnerUserId', error);
                  return;
                }

                setCompany(prev => (prev?.id === comp.id ? { ...prev, owner_user_id: u.id } : prev));
              });

            comp = { ...comp, owner_user_id: u.id };
          }
        }

        setCompany(comp);
        if (comp?.id && prof.company_id !== comp.id) {
          selfProfileWriteRef.current = Date.now();
          supabase
            .from('profiles')
            .update({ company_id: comp.id, updated_at: new Date().toISOString() })
            .eq('id', u.id)
            .then(({ error }) => {
              if (error) logFailure('loadUserData:syncCompanyId', error);
            });
        }
        if (comp) {
          setLoading(false);
          Promise.allSettled([
            loadDrivers({ companyId: comp.id }),
            loadTrips({ companyId: comp.id }),
            loadAssignments({ companyId: comp.id }),
          ]).then(results => {
            results.forEach((result, index) => {
              if (result.status === 'rejected') {
                const labels = ['drivers', 'trips', 'assignments'];
                logFailure(`loadUserData:company:${labels[index]}`, result.reason);
              }
            });
          });
        }
        if (!comp) {
          setDrivers([]);
          setTrips([]);
          setAssignments([]);
          setLoading(false);
        }
      } else {
        setCompany(null);
        const { data: membership, error: memErr } = await supabase.from('org_members').select('*, organizations(*)').eq('user_id', u.id).maybeSingle();
        if (memErr) logFailure('loadUserData:org_members', memErr);
        if (membership?.organizations) {
          setOrg(membership.organizations);
          orgIdRef.current = membership.org_id;
          configureSentry(membership.organizations);
          if (normalizedProfRole === 'company') {
            await loadDrivers();
            await loadTrips();
            await loadAssignments();
          } else {
            setDrivers([]);
            setTrips([]);
            setAssignments([]);
          }
        } else if (normalizedProfRole === 'admin') {
          try {
            const platformOrg = await ensurePlatformAdminOrg(u, { forceBootstrap: true });
            if (platformOrg?.id) {
              setOrg(platformOrg);
              orgIdRef.current = platformOrg.id;
              configureSentry(platformOrg);
            } else {
              setOrg(null);
              orgIdRef.current = null;
            }
          } catch (bootstrapOrgError) {
            logFailure('loadUserData:ensurePlatformAdminOrg', bootstrapOrgError);
            setOrg(null);
            orgIdRef.current = null;
          }
          setDrivers([]);
          setTrips([]);
          setAssignments([]);
        }

        setLoading(false);
      }
      if (!autoPullRef.current && normalizedProfRole === 'company') {
        autoPullRef.current = setInterval(async () => {
          if (!sentryApi.enabled) return;
          const scopedCompanyId = sentryPollCompanyIdRef.current;
          if (!scopedCompanyId) return;

          let newTripsArrived = false;

          if (sentryApi.features.marketplaceTrips) {
            const result = await sentryApi.getMarketplaceTrips();
            if (result.ok) {
              const rawTrips = Array.isArray(result.data) ? result.data : (result.data?.trips || []);
              if (rawTrips.length > 0) {
                const mapped = rawTrips
                  .map(t => mapInboundSentryTripToMarketplaceRow(t, scopedCompanyId))
                  .filter(ingestibleInboundMarketplaceRow);
                if (mapped.length > 0) {
                  const { error } = await supabase.from('marketplace_trips').upsert(mapped, { onConflict: 'sentry_trip_id' });
                  if (!error) {
                    let refreshQuery = supabase
                      .from('marketplace_trips')
                      .select('*')
                      .in('status', ['available', 'assigned', 'accepted', 'arrived', 'picked_up'])
                      .order('loaded_at', { ascending: false });
                    refreshQuery = refreshQuery.eq('company_id', scopedCompanyId);
                    const { data } = await refreshQuery;
                    if (data) {
                      setTrips((data || []).filter(trip => !isSyntheticMarketplaceTrip(trip)));
                      newTripsArrived = true;
                    }
                  }
                }
              }
            }
          }

          if (sentryApi.features.assignedTrips) {
            const result = await sentryApi.getAssignedTrips();
            if (result.ok) {
              const rawTrips = Array.isArray(result.data) ? result.data : (result.data?.trips || []);
              if (rawTrips.length > 0) {
                const mapped = rawTrips
                  .map(t => mapInboundSentryTripToMarketplaceRow(t, scopedCompanyId))
                  .filter(ingestibleInboundMarketplaceRow);
                if (mapped.length > 0) {
                  await supabase.from('marketplace_trips').upsert(mapped, { onConflict: 'sentry_trip_id' });
                  newTripsArrived = true;
                }
              }
            }
          }

          if (newTripsArrived) {
            runAISchedulerPipeline();
          }
        }, 90000);
      }
    } catch (err) {
      logFailure('loadUserData', err);
      toastError('Failed to load user data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }

  async function repairAccountProfile() {
    if (!user?.id) return false;

    try {
      const repairedProfile = await ensureFallbackProfile(user);
      if (!repairedProfile) return false;
      setProfile(repairedProfile);
      await loadUserData(user);
      return true;
    } catch (error) {
      logFailure('repairAccountProfile', error);
      return false;
    }
  }

  function configureSentry(organization) {
    if (organization?.sentry_base_url && (organization.sentry_username || organization.sentry_api_key)) {
      sentryApi.configure({
        baseUrl: organization.sentry_base_url,
        username: organization.sentry_username || '',
        password: organization.sentry_password || '',
        apiKey: organization.sentry_api_key || '',
      });
    }
  }

  async function loadDrivers(options = {}) {
    const inAdminPreview = normalizedRole === 'admin' && !!(options.companyId || adminPreviewCompany?.id);
    const scopedCompanyId =
      options.companyId ||
      (isCompanyRole
        ? activeCompany?.id
        : normalizedRole === 'admin'
          ? adminPreviewCompany?.id
          : null);
    if (normalizedRole === 'admin' && !options.companyId && !adminPreviewCompany?.id) {
      setDrivers([]);
      return [];
    }
    let query = supabase.from('drivers').select('*').eq('is_active', true);
    if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
    const { data, error } = await query.order('full_name');
    if (error) {
      handleSupabaseError(error, 'loadDrivers', { silent: inAdminPreview, fallback: 'Failed to load drivers.' });
      return [];
    }
    setDrivers(data || []);
    return data || [];
  }

  async function loadTrips(options = {}) {
    const inAdminPreview = normalizedRole === 'admin' && !!(options.companyId || adminPreviewCompany?.id);
    const scopedCompanyId =
      options.companyId ||
      (isCompanyRole
        ? activeCompany?.id
        : normalizedRole === 'admin'
          ? adminPreviewCompany?.id
          : null);
    if (normalizedRole === 'admin' && !options.companyId && !adminPreviewCompany?.id) {
      setTrips([]);
      return [];
    }
    let query = supabase
      .from('marketplace_trips')
      .select('*')
      .eq('status', 'available')
      .order('loaded_at', { ascending: false });

    if (scopedCompanyId) {
      query = query.eq('company_id', scopedCompanyId).limit(250);
    }

    const { data, error } = await query;
    if (error) {
      handleSupabaseError(error, 'loadTrips', { silent: inAdminPreview, fallback: 'Failed to load trips.' });
      return [];
    }
    const rows = (data || []).filter(trip => !isSyntheticMarketplaceTrip(trip));
    setTrips(rows);
    return rows;
  }

  async function loadAssignments(options = {}) {
    const inAdminPreview = normalizedRole === 'admin' && !!(options.companyId || adminPreviewCompany?.id);
    const scopedCompanyId =
      options.companyId ||
      (isCompanyRole
        ? activeCompany?.id
        : normalizedRole === 'admin'
          ? adminPreviewCompany?.id
          : null);
    if (normalizedRole === 'admin' && !options.companyId && !adminPreviewCompany?.id) {
      setAssignments([]);
      return [];
    }
    let query = supabase
      .from('trip_assignments')
      .select('*, drivers(full_name, photo_data, status, company_id, is_active)')
      .order('assigned_at', { ascending: false })
      .limit(200);

    if (scopedCompanyId) {
      const { data: companyDrivers, error: companyDriversError } = await supabase
        .from('drivers')
        .select('id')
        .eq('company_id', scopedCompanyId);

      if (companyDriversError) {
        handleSupabaseError(companyDriversError, 'loadAssignments:companyDrivers', { silent: inAdminPreview, fallback: 'Failed to scope company assignments.' });
        return [];
      }

      const driverIds = (companyDrivers || []).map(row => row.id).filter(Boolean);
      if (driverIds.length) {
        query = query.or(
          `company_id.eq.${scopedCompanyId},driver_id.in.(${driverIds.join(',')})`
        );
      } else {
        query = query.eq('company_id', scopedCompanyId);
      }
    }

    const { data, error } = await query;
    if (error) {
      handleSupabaseError(error, 'loadAssignments', { silent: inAdminPreview, fallback: 'Failed to load assignments.' });
      return [];
    }
    setAssignments(data || []);

    const now = Date.now();
    if (['admin', 'company'].includes(normalizedRole) && (now - billingSyncRef.current) > 120000) {
      billingSyncRef.current = now;
      supabase
        .from('auto_scheduler_config')
        .select('billing_rate_per_mile')
        .eq('org_id', orgIdRef.current)
        .maybeSingle()
        .then(({ data: schedulerConfig, error: schedulerConfigError }) => {
          if (schedulerConfigError) {
            logFailure('loadAssignments:schedulerBillingRate', schedulerConfigError);
          }

          return syncCompletedTripBilling({
            supabase,
            role: profile?.role,
            ratePerMile: Number(schedulerConfig?.billing_rate_per_mile || DEFAULT_BILLING_RATE_PER_MILE),
          });
        })
        .catch(err => logFailure('loadAssignments:syncCompletedTripBilling', err));
    }

    return data || [];
  }

  function mapSentryTrip(t, scopedCompanyId = null) {
    return mapInboundSentryTripToMarketplaceRow(t, scopedCompanyId);
  }

  async function refreshTripsFromSentry() {
    let totalCount = 0;
    let lastError = null;
    const scopedCompanyId =
      isCompanyRole
        ? activeCompany?.id || profile?.company_id || sentryPollCompanyIdRef.current || null
        : normalizedRole === 'admin'
          ? adminPreviewCompany?.id || null
          : null;

    if (isCompanyRole && !scopedCompanyId) {
      await loadTrips();
      return {
        count: 0,
        error: 'Company scope is not ready (no company id). Reload the page or finish company onboarding.',
      };
    }

    if (sentryApi.features.marketplaceTrips) {
      const result = await sentryApi.getMarketplaceTrips();
      if (result.ok) {
        const rawTrips = Array.isArray(result.data) ? result.data : (result.data?.trips || []);
        if (rawTrips.length > 0) {
          const mapped = rawTrips
            .map(trip => mapSentryTrip(trip, scopedCompanyId))
            .filter(ingestibleInboundMarketplaceRow);
          if (mapped.length > 0) {
            const { error } = await supabase.from('marketplace_trips').upsert(mapped, { onConflict: 'sentry_trip_id' });
            if (error) {
              handleSupabaseError(error, 'refreshTripsFromSentry:marketplace', { fallback: 'Failed to save marketplace trips.' });
              lastError = error.message;
            } else {
              totalCount += mapped.length;
            }
          }
        }
      } else {
        lastError = result.error || 'Marketplace trips API error';
      }
    }

    if (sentryApi.features.assignedTrips) {
      const result = await sentryApi.getAssignedTrips();
      if (result.ok) {
        const rawTrips = Array.isArray(result.data) ? result.data : (result.data?.trips || []);
        if (rawTrips.length > 0) {
          const mapped = rawTrips
            .map(trip => mapSentryTrip(trip, scopedCompanyId))
            .filter(ingestibleInboundMarketplaceRow);
          if (mapped.length > 0) {
            const { error } = await supabase.from('marketplace_trips').upsert(mapped, { onConflict: 'sentry_trip_id' });
            if (!error) totalCount += mapped.length;
          }
        }
      }
    }

    await loadTrips();
    return { count: totalCount, error: lastError };
  }

  async function checkSentryHealth() {
    if (!sentryConfig?.base_url || sentryConfig.enabled === false) {
      const disabledStatus = {
        authenticated: false,
        latencyMs: null,
        status: null,
        error: sentryConfig?.enabled === false ? 'Sentry disabled' : 'No saved Sentry config',
        hint: null,
      };
      setSentryStatus({ ok: false, checked: true, latency: null, error: disabledStatus.error });
      return disabledStatus;
    }

    try {
      const res = await fetch(`${EDGE_BASE}/sentry-diagnostics/health-check`, {
        method: 'POST',
        headers: await getEdgeFunctionHeaders(),
        body: JSON.stringify({
          base_url: sentryConfig.base_url,
          auth_type: sentryConfig.auth_type || 'basic',
          username: sentryConfig.username || '',
          password_enc: sentryConfig.password_enc || '',
          api_key: sentryConfig.api_key || '',
        }),
      });

      const result = await res.json().catch(() => ({
        authenticated: false,
        error: 'Invalid diagnostics response',
      }));

      setSentryStatus({
        ok: Boolean(result.authenticated),
        checked: true,
        latency: result.latencyMs ?? null,
        error: result.error || null,
      });
      return result;
    } catch (error) {
      const fallbackResult = await sentryApi.healthCheck();
      setSentryStatus({
        ok: fallbackResult.authenticated,
        checked: true,
        latency: fallbackResult.latencyMs ?? null,
        error: fallbackResult.error || (error instanceof Error ? error.message : 'Connection check failed'),
      });
      return fallbackResult;
    }
  }

  async function syncDriversFromSentry() {
    const result = await sentryApi.getDrivers();
    if (!result.ok) return { error: result.error || 'API error', created: 0, updated: 0 };

    const list = Array.isArray(result.data) ? result.data : (result.data?.drivers || []);
    let created = 0;
    let updated = 0;
    const scopedCompanyId =
      isCompanyRole
        ? activeCompany?.id || profile?.company_id || sentryPollCompanyIdRef.current || null
        : normalizedRole === 'admin'
          ? adminPreviewCompany?.id || null
          : null;

    for (const sd of list) {
      const sentryId = String(sd.id || sd.driver_id || '');
      if (!sentryId) continue;

      let lookupQuery = supabase.from('drivers').select('id').eq('sentry_driver_id', sentryId);
      if (scopedCompanyId) {
        lookupQuery = lookupQuery.eq('company_id', scopedCompanyId);
      }
      const { data: existing, error: lookupErr } = await lookupQuery.maybeSingle();
      if (lookupErr) { logFailure('syncDrivers:lookup', lookupErr); continue; }

      if (existing) {
        const { error: updateErr } = await supabase.from('drivers').update({
          full_name: sd.name || sd.full_name || existing.full_name,
          phone: sd.phone || '',
          email: sd.email || '',
          company_id: scopedCompanyId,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
        if (updateErr) { logFailure('syncDrivers:update', updateErr); continue; }
        updated++;
      } else {
        const driverNum = 'D' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
        const { error: insertErr } = await supabase.from('drivers').insert({
          driver_number: driverNum,
          full_name: sd.name || sd.full_name || 'Unknown Driver',
          phone: sd.phone || '',
          email: sd.email || '',
          sentry_driver_id: sentryId,
          company_id: scopedCompanyId,
          status: 'offline',
          is_active: true,
        });
        if (insertErr) { logFailure('syncDrivers:insert', insertErr); continue; }
        created++;
      }

      await supabase.from('sentry_sync_log').insert({
        sync_type: 'driver_pull',
        direction: 'import',
        record_type: 'driver',
        external_id: sentryId,
        status: 'success',
        payload: { name: sd.name || sd.full_name },
      });
    }

    await loadDrivers();
    return { created, updated, total: list.length };
  }

  async function runAISchedulerPipeline() {
    if (schedRunningRef.current) return;
    schedRunningRef.current = true;
    try {
      const { data: cfg } = await supabase.from('auto_scheduler_config').select('*').maybeSingle();
      if ((isCompanyRole || normalizedRole === 'admin') && activeCompany) {
        if (activeCompany.ai_routing_enabled === false || activeCompany.ai_auto_assign_enabled === false) return;
      }
      if (!cfg?.enabled || !cfg?.auto_assign) return;

      let driverQuery = supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true)
        .in('status', ['online', 'on_trip']);

      if ((isCompanyRole || normalizedRole === 'admin') && activeCompany?.id) {
        driverQuery = driverQuery.eq('company_id', activeCompany.id);
      }

      const { data: currentDrivers } = await driverQuery;

      let tripQuery = supabase
        .from('marketplace_trips')
        .select('*')
        .eq('status', 'available')
        .is('taken_by', null)
        .order('pu_time', { ascending: true, nullsFirst: false })
        .order('loaded_at', { ascending: true });

      if ((isCompanyRole || normalizedRole === 'admin') && activeCompany?.id) {
        tripQuery = tripQuery.eq('company_id', activeCompany.id);
      }

      const { data: availableTrips } = await tripQuery;

      let currentAssignments = [];
      if ((isCompanyRole || normalizedRole === 'admin') && activeCompany?.id) {
        const companyDriverIds = (currentDrivers || []).map(driver => driver.id).filter(Boolean);
        if (companyDriverIds.length) {
          const { data } = await supabase
            .from('trip_assignments')
            .select('*')
            .in('driver_id', companyDriverIds)
            .not('status', 'in', '("completed","cancelled","rejected")');
          currentAssignments = data || [];
        }
      } else {
        const { data } = await supabase
          .from('trip_assignments')
          .select('*')
          .not('status', 'in', '("completed","cancelled","rejected")');
        currentAssignments = data || [];
      }

      if (!currentDrivers?.length || !availableTrips?.length) return;

      const companySchedulerPrefs = activeCompany ? readCompanySchedulerPrefs(activeCompany) : null;
      const effectiveConfig = {
        ...(cfg || {}),
        ...(companySchedulerPrefs || {}),
        auto_assign: activeCompany?.ai_auto_assign_enabled === false ? false : cfg?.auto_assign,
      };

      await runAutoScheduler({
        drivers: currentDrivers,
        trips: availableTrips,
        assignments: currentAssignments || [],
        config: effectiveConfig,
        orgId: orgIdRef.current,
        dryRun: false,
      });

      await loadTrips();
      await loadAssignments();
    } catch (err) {
      logFailure('runAISchedulerPipeline', err);
    } finally {
      schedRunningRef.current = false;
    }
  }

  async function pushAllLocationsToSentry() {
    const { data: activeDrivers, error: fetchErr } = await supabase.from('drivers')
      .select('id, sentry_vehicle_id, current_lat, current_lng')
      .eq('is_active', true)
      .not('sentry_vehicle_id', 'is', null)
      .neq('sentry_vehicle_id', '');

    if (fetchErr) {
      logFailure('pushAllLocationsToSentry:fetch', fetchErr);
      return { pushed: 0, error: fetchErr.message };
    }

    if (!activeDrivers?.length) return { pushed: 0 };

    const result = await sentryApi.pushAllVehicleLocations(activeDrivers);

    const { error: updateErr } = await supabase.from('sentry_config')
      .update({ last_gps_push_at: new Date().toISOString() })
      .not('id', 'is', null);
    if (updateErr) logFailure('pushAllLocationsToSentry:updateConfig', updateErr);

    return result;
  }

  useEffect(() => {
    if (liveChannelRef.current) {
      supabase.removeChannel(liveChannelRef.current);
      liveChannelRef.current = null;
    }

    if (!user?.id) return;

    const channel = supabase
      .channel(`app-live-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        scheduleLiveRefresh('drivers', loadDrivers);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_trips' }, () => {
        scheduleLiveRefresh('trips', loadTrips);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_assignments' }, () => {
        scheduleLiveRefresh('assignments', loadAssignments);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => {
        if (isCompanyRole || (normalizedRole === 'admin' && !adminPreviewCompany?.id)) {
          scheduleLiveRefresh('company', () => loadUserData(user), 500);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, payload => {
        const changedProfileId = payload?.new?.id || payload?.old?.id;
        if (changedProfileId !== user.id) return;

        // Suppress our own write echoes. Without this, a DB trigger that rewrites the
        // role we just upserted would tail-chase loadUserData() forever.
        if (Date.now() - selfProfileWriteRef.current < SELF_PROFILE_WRITE_ECHO_MS) {
          return;
        }

        scheduleLiveRefresh('profile', () => loadUserData(user), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sentry_config' }, async () => {
        const cfg = await fetchLatestSentryConfig().catch((error) => {
          logFailure('realtime:sentry_config', error);
          return null;
        });
        applySentryConfig(cfg);
      })
      .subscribe();

    liveChannelRef.current = channel;

    return () => {
      if (liveChannelRef.current) {
        supabase.removeChannel(liveChannelRef.current);
        liveChannelRef.current = null;
      }
      Object.values(liveRefreshTimersRef.current).forEach(timer => clearTimeout(timer));
      liveRefreshTimersRef.current = {};
    };
  }, [user?.id, normalizedRole, activeCompany?.id, adminPreviewCompany?.id]);

  useEffect(() => {
    if (!sentryConfig?.base_url) {
      setSentryStatus({ ok: false, checked: false });
      return;
    }

    if (sentryConfig.enabled === false) {
      setSentryStatus({ ok: false, checked: true, error: 'Sentry disabled' });
      return;
    }

    checkSentryHealth().catch(error => {
      logFailure('useEffect:checkSentryHealth', error);
    });
  }, [sentryConfig?.id, sentryConfig?.updated_at, sentryConfig?.base_url, sentryConfig?.enabled]);

  const value = {
    user, profile, org, company: activeCompany, platformCompany: company, adminPreviewCompany, drivers, trips, assignments, schedules,
    sentryConfig, sentryStatus, loading,
    loadDrivers, loadTrips, loadAssignments,
    refreshTripsFromSentry, checkSentryHealth,
    syncDriversFromSentry, pushAllLocationsToSentry,
    runAISchedulerPipeline,
    repairAccountProfile,
    setSchedules, setSentryConfig, setCompany, setAdminPreviewCompany,
    supabase,
    role: normalizedRole,
    isAdmin: normalizedRole === 'admin',
    isPlatformOwner: normalizedRole === 'admin' && PLATFORM_OWNER_EMAILS.has((user?.email || '').trim().toLowerCase()),
    requiresOwnerApproval: normalizedRole === 'admin' && !PLATFORM_OWNER_EMAILS.has((user?.email || '').trim().toLowerCase()),
    isCompany: isCompanyRole,
    isDispatcher: isCompanyRole || normalizedRole === 'admin',
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
