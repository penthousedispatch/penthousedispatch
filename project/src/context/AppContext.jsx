import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { sentryApi } from '../lib/sentryApi';
import { handleSupabaseError, logFailure, toastError } from '../utils/errorHandler';
import { runAutoScheduler } from '../utils/autoScheduler';
import { DEFAULT_BILLING_RATE_PER_MILE, syncCompletedTripBilling } from '../utils/billingAutomation';
import { normalizeAppRole } from '../lib/roles';

const AppContext = createContext(null);

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
  const billingSyncRef = useRef(0);
  const liveChannelRef = useRef(null);
  const liveRefreshTimersRef = useRef({});
  const initialSessionResolvedRef = useRef(false);
  const normalizedRole = normalizeAppRole(profile?.role);
  const activeCompany = normalizedRole === 'admin' && adminPreviewCompany ? adminPreviewCompany : company;
  const isCompanyRole = normalizedRole === 'company';

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

  async function inferFallbackIdentity(u) {
    const metadataRole =
      normalizeAppRole(u?.user_metadata?.role) ||
      normalizeAppRole(u?.app_metadata?.role);

    if (metadataRole) {
      return {
        role: metadataRole,
        companyId: u?.user_metadata?.company_id || null,
      };
    }

    const email = (u?.email || '').trim().toLowerCase();

    const adminMembershipResult = await supabase
      .from('org_members')
      .select('role, org_id')
      .eq('user_id', u.id)
      .in('role', ['admin', 'superadmin'])
      .limit(1)
      .maybeSingle();

    if (adminMembershipResult.data?.org_id) {
      return { role: 'admin', companyId: null };
    }

    const ownerCompanyResult = await supabase
      .from('companies')
      .select('id, company_name')
      .eq('owner_user_id', u.id)
      .maybeSingle();

    if (ownerCompanyResult.data?.id) {
      return { role: 'company', companyId: ownerCompanyResult.data.id };
    }

    if (email) {
      const billingCompanyResult = await supabase
        .from('companies')
        .select('id, company_name')
        .ilike('billing_contact_email', email)
        .maybeSingle();

      if (billingCompanyResult.data?.id) {
        return { role: 'company', companyId: billingCompanyResult.data.id };
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
          setLoading(false);
          loadUserData(session.user);
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
        setLoading(false);
      }
    }

    bootstrapSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      initialSessionResolvedRef.current = true;
      setUser(session?.user ?? null);
      if (session?.user) {
        setLoading(false);
        (async () => { await loadUserData(session.user); })();
      } else {
        setProfile(null);
        setOrg(null);
        setCompany(null);
        setAdminPreviewCompany(null);
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
      const metadataRole =
        normalizeAppRole(u?.user_metadata?.role) ||
        normalizeAppRole(u?.app_metadata?.role);

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

      if (!prof) {
        prof = await ensureFallbackProfile(u);
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
        return;
      }

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

        if (prof.company_id) {
          const result = await supabase.from('companies').select('*').eq('id', prof.company_id).maybeSingle();
          comp = result.data;
          compErr = result.error;
        }

        if (!comp && !compErr) {
          const result = await supabase.from('companies').select('*').eq('owner_user_id', u.id).maybeSingle();
          comp = result.data;
          compErr = result.error;
        }

        if (compErr) logFailure('loadUserData:companies', compErr);
        setCompany(comp);
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
          setDrivers([]);
          setTrips([]);
          setAssignments([]);
        }

        const cfg = await fetchLatestSentryConfig().catch((cfgErr) => {
          logFailure('loadUserData:sentry_config', cfgErr);
          return null;
        });
        if (cfg) {
          setSentryConfig(cfg);
          sentryApi.configure({
            baseUrl: cfg.base_url,
            username: cfg.username,
            password: cfg.password_enc,
            apiKey: cfg.api_key,
            authType: cfg.auth_type,
            enabled: cfg.enabled,
            features: {
              assignedTrips:      cfg.feat_assigned_trips !== false,
              marketplaceTrips:   cfg.feat_marketplace_trips !== false,
              tripAcceptReject:   cfg.feat_trip_accept_reject !== false,
              tripStatusUpdate:   cfg.feat_trip_status_update !== false,
              drivers:            cfg.feat_drivers !== false,
              vehicles:           cfg.feat_vehicles !== false,
              vehicleLocations:   cfg.feat_vehicle_locations !== false,
              vehicleWaypointEtas: cfg.feat_waypoint_etas !== false,
              driverWorkShifts:   cfg.feat_driver_work_shifts !== false,
              retrieveTrips:      cfg.feat_retrieve_trips !== false,
            },
          });
        }
        setLoading(false);
      }
      if (!autoPullRef.current) {
        autoPullRef.current = setInterval(async () => {
          if (!sentryApi.enabled) return;
          const scopedCompanyId =
            isCompanyRole
              ? activeCompany?.id || null
              : normalizedRole === 'admin'
                ? adminPreviewCompany?.id || null
                : null;

          function mapTrip(t) {
            return {
              sentry_trip_id: String(t.trip_id || t.id || Math.random()),
              sentry_last_modified_at: String(t.last_modified_at || ''),
              date_val: t.date || t.schedule_date || '',
              los: t.level_of_service || t.los || '',
              passengers: String(t.passenger_count || t.passengers || '1'),
              mileage: String(t.mileage || t.estimated_miles || ''),
              pu_address: t.pickup_address || t.pu_address || '',
              pu_city: t.pickup_city || t.pu_city || '',
              pu_zip: t.pickup_zip || t.pu_zip || '',
              pu_time: t.scheduled_pickup_time || t.pu_time || '',
              do_address: t.dropoff_address || t.do_address || '',
              do_city: t.dropoff_city || t.do_city || '',
              do_zip: t.dropoff_zip || t.do_zip || '',
              do_time: t.scheduled_dropoff_time || t.do_time || '',
              delivery_price: String(t.total_amount || t.delivery_price || ''),
              status: 'available',
              company_id: scopedCompanyId,
              loaded_at: new Date().toISOString(),
            };
          }

          let newTripsArrived = false;

          if (sentryApi.features.marketplaceTrips) {
            const result = await sentryApi.getMarketplaceTrips();
            if (result.ok) {
              const rawTrips = Array.isArray(result.data) ? result.data : (result.data?.trips || []);
              if (rawTrips.length > 0) {
                const mapped = rawTrips.map(mapTrip);
                const { error } = await supabase.from('marketplace_trips').upsert(mapped, { onConflict: 'sentry_trip_id' });
                if (!error) {
                  let refreshQuery = supabase
                    .from('marketplace_trips')
                    .select('*')
                    .eq('status', 'available')
                    .order('loaded_at', { ascending: false });
                  if (scopedCompanyId) refreshQuery = refreshQuery.eq('company_id', scopedCompanyId);
                  const { data } = await refreshQuery;
                  if (data) { setTrips(data); newTripsArrived = true; }
                }
              }
            }
          }

          if (sentryApi.features.assignedTrips) {
            const result = await sentryApi.getAssignedTrips();
            if (result.ok) {
              const rawTrips = Array.isArray(result.data) ? result.data : (result.data?.trips || []);
              if (rawTrips.length > 0) {
                const mapped = rawTrips.map(mapTrip);
                await supabase.from('marketplace_trips').upsert(mapped, { onConflict: 'sentry_trip_id' });
                newTripsArrived = true;
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
      handleSupabaseError(error, 'loadDrivers', { fallback: 'Failed to load drivers.' });
      return [];
    }
    setDrivers(data || []);
    return data || [];
  }

  async function loadTrips(options = {}) {
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
      handleSupabaseError(error, 'loadTrips', { fallback: 'Failed to load trips.' });
      return [];
    }
    setTrips(data || []);
    return data || [];
  }

  async function loadAssignments(options = {}) {
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
      .select('*, drivers(full_name, photo_data, status, company_id)')
      .order('assigned_at', { ascending: false })
      .limit(200);

    if (scopedCompanyId) {
      const { data: companyDrivers, error: companyDriversError } = await supabase
        .from('drivers')
        .select('id')
        .eq('company_id', scopedCompanyId);

      if (companyDriversError) {
        handleSupabaseError(companyDriversError, 'loadAssignments:companyDrivers', { fallback: 'Failed to scope company assignments.' });
        return [];
      }

      const driverIds = (companyDrivers || []).map(row => row.id).filter(Boolean);
      if (!driverIds.length) {
        setAssignments([]);
        return [];
      }
      query = query.in('driver_id', driverIds);
    }

    const { data, error } = await query;
    if (error) {
      handleSupabaseError(error, 'loadAssignments', { fallback: 'Failed to load assignments.' });
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
    return {
      sentry_trip_id: String(t.trip_id || t.id || Math.random()),
      sentry_last_modified_at: String(t.last_modified_at || ''),
      date_val: t.date || t.schedule_date || '',
      los: t.level_of_service || t.los || '',
      passengers: String(t.passenger_count || t.passengers || '1'),
      mileage: String(t.mileage || t.estimated_miles || ''),
      pu_address: t.pickup_address || t.pu_address || '',
      pu_city: t.pickup_city || t.pu_city || '',
      pu_zip: t.pickup_zip || t.pu_zip || '',
      pu_time: t.scheduled_pickup_time || t.pu_time || '',
      do_address: t.dropoff_address || t.do_address || '',
      do_city: t.dropoff_city || t.do_city || '',
      do_zip: t.dropoff_zip || t.do_zip || '',
      do_time: t.scheduled_dropoff_time || t.do_time || '',
      delivery_price: String(t.total_amount || t.delivery_price || ''),
      status: 'available',
      company_id: scopedCompanyId,
      loaded_at: new Date().toISOString(),
    };
  }

  async function refreshTripsFromSentry() {
    let totalCount = 0;
    let lastError = null;
    const scopedCompanyId =
      isCompanyRole
        ? activeCompany?.id || null
        : normalizedRole === 'admin'
          ? adminPreviewCompany?.id || null
          : null;

    if (sentryApi.features.marketplaceTrips) {
      const result = await sentryApi.getMarketplaceTrips();
      if (result.ok) {
        const rawTrips = Array.isArray(result.data) ? result.data : (result.data?.trips || []);
        if (rawTrips.length > 0) {
          const mapped = rawTrips.map(trip => mapSentryTrip(trip, scopedCompanyId));
          const { error } = await supabase.from('marketplace_trips').upsert(mapped, { onConflict: 'sentry_trip_id' });
          if (error) {
            handleSupabaseError(error, 'refreshTripsFromSentry:marketplace', { fallback: 'Failed to save marketplace trips.' });
            lastError = error.message;
          } else {
            totalCount += mapped.length;
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
          const mapped = rawTrips.map(trip => mapSentryTrip(trip, scopedCompanyId));
          const { error } = await supabase.from('marketplace_trips').upsert(mapped, { onConflict: 'sentry_trip_id' });
          if (!error) totalCount += mapped.length;
        }
      }
    }

    await loadTrips();
    return { count: totalCount, error: lastError };
  }

  async function checkSentryHealth() {
    const result = await sentryApi.healthCheck();
    setSentryStatus({ ok: result.authenticated, checked: true, latency: result.latencyMs, error: result.error });
    return result;
  }

  async function syncDriversFromSentry() {
    const result = await sentryApi.getDrivers();
    if (!result.ok) return { error: result.error || 'API error', created: 0, updated: 0 };

    const list = Array.isArray(result.data) ? result.data : (result.data?.drivers || []);
    let created = 0;
    let updated = 0;
    const scopedCompanyId =
      isCompanyRole
        ? activeCompany?.id || null
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

      await runAutoScheduler({
        drivers: currentDrivers,
        trips: availableTrips,
        assignments: currentAssignments || [],
        config: cfg,
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
        if (isCompanyRole || normalizedRole === 'admin') {
          scheduleLiveRefresh('company', () => loadUserData(user), 500);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        scheduleLiveRefresh('profile', () => loadUserData(user), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sentry_config' }, async () => {
        const cfg = await fetchLatestSentryConfig().catch((error) => {
          logFailure('realtime:sentry_config', error);
          return null;
        });
        if (cfg) setSentryConfig(cfg);
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
