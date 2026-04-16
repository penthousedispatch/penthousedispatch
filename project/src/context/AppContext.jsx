import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { sentryApi } from '../lib/sentryApi';
import { handleSupabaseError, logFailure, toastError } from '../utils/errorHandler';
import { runAutoScheduler } from '../utils/autoScheduler';
import { DEFAULT_BILLING_RATE_PER_MILE, syncCompletedTripBilling } from '../utils/billingAutomation';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [org, setOrg] = useState(null);
  const [company, setCompany] = useState(null);
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) logFailure('getSession', error);
      setUser(session?.user ?? null);
      if (session?.user) loadUserData(session.user);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => { await loadUserData(session.user); })();
      } else {
        setProfile(null);
        setOrg(null);
        setCompany(null);
        setLoading(false);
        if (autoPullRef.current) { clearInterval(autoPullRef.current); autoPullRef.current = null; }
      }
    });
    return () => {
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
      const { data: prof, error: profErr } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
      if (profErr) logFailure('loadUserData:profiles', profErr);
      setProfile(prof);

      if (prof?.role === 'company') {
        const { data: comp, error: compErr } = await supabase.from('companies').select('*').eq('owner_user_id', u.id).maybeSingle();
        if (compErr) logFailure('loadUserData:companies', compErr);
        setCompany(comp);
        if (comp) {
          await loadDrivers();
          await loadTrips();
          await loadAssignments();
        }
      } else {
        const { data: membership, error: memErr } = await supabase.from('org_members').select('*, organizations(*)').eq('user_id', u.id).maybeSingle();
        if (memErr) logFailure('loadUserData:org_members', memErr);
        if (membership?.organizations) {
          setOrg(membership.organizations);
          orgIdRef.current = membership.org_id;
          configureSentry(membership.organizations);
          await loadDrivers();
          await loadTrips();
          await loadAssignments();
        }

        const { data: cfg, error: cfgErr } = await supabase.from('sentry_config').select('*').maybeSingle();
        if (cfgErr) logFailure('loadUserData:sentry_config', cfgErr);
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
      }
      if (!autoPullRef.current) {
        autoPullRef.current = setInterval(async () => {
          if (!sentryApi.enabled) return;

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
                  const { data } = await supabase.from('marketplace_trips').select('*').eq('status', 'available').order('loaded_at', { ascending: false });
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

  async function loadDrivers() {
    const { data, error } = await supabase.from('drivers').select('*').eq('is_active', true).order('full_name');
    if (error) {
      handleSupabaseError(error, 'loadDrivers', { fallback: 'Failed to load drivers.' });
      return [];
    }
    setDrivers(data || []);
    return data || [];
  }

  async function loadTrips() {
    const { data, error } = await supabase.from('marketplace_trips').select('*').eq('status', 'available').order('loaded_at', { ascending: false });
    if (error) {
      handleSupabaseError(error, 'loadTrips', { fallback: 'Failed to load trips.' });
      return [];
    }
    setTrips(data || []);
    return data || [];
  }

  async function loadAssignments() {
    const { data, error } = await supabase.from('trip_assignments').select('*, drivers(full_name, photo_data, status, company_id)').order('assigned_at', { ascending: false }).limit(200);
    if (error) {
      handleSupabaseError(error, 'loadAssignments', { fallback: 'Failed to load assignments.' });
      return [];
    }
    setAssignments(data || []);

    const now = Date.now();
    if (['admin', 'dispatcher'].includes(profile?.role) && (now - billingSyncRef.current) > 120000) {
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

  function mapSentryTrip(t) {
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
      loaded_at: new Date().toISOString(),
    };
  }

  async function refreshTripsFromSentry() {
    let totalCount = 0;
    let lastError = null;

    if (sentryApi.features.marketplaceTrips) {
      const result = await sentryApi.getMarketplaceTrips();
      if (result.ok) {
        const rawTrips = Array.isArray(result.data) ? result.data : (result.data?.trips || []);
        if (rawTrips.length > 0) {
          const mapped = rawTrips.map(mapSentryTrip);
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
          const mapped = rawTrips.map(mapSentryTrip);
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

    for (const sd of list) {
      const sentryId = String(sd.id || sd.driver_id || '');
      if (!sentryId) continue;

      const { data: existing, error: lookupErr } = await supabase.from('drivers').select('id').eq('sentry_driver_id', sentryId).maybeSingle();
      if (lookupErr) { logFailure('syncDrivers:lookup', lookupErr); continue; }

      if (existing) {
        const { error: updateErr } = await supabase.from('drivers').update({
          full_name: sd.name || sd.full_name || existing.full_name,
          phone: sd.phone || '',
          email: sd.email || '',
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
      if (!cfg?.enabled || !cfg?.auto_assign) return;

      const { data: currentDrivers } = await supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true)
        .in('status', ['online', 'on_trip']);

      const { data: availableTrips } = await supabase
        .from('marketplace_trips')
        .select('*')
        .eq('status', 'available')
        .order('loaded_at', { ascending: true });

      const { data: currentAssignments } = await supabase
        .from('trip_assignments')
        .select('*')
        .not('status', 'in', '("completed","cancelled","rejected")');

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
        if (profile?.role === 'company' || profile?.role === 'admin') {
          scheduleLiveRefresh('company', () => loadUserData(user), 500);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        scheduleLiveRefresh('profile', () => loadUserData(user), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sentry_config' }, async () => {
        const { data: cfg } = await supabase.from('sentry_config').select('*').maybeSingle();
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
  }, [user?.id, profile?.role, company?.id]);

  const value = {
    user, profile, org, company, drivers, trips, assignments, schedules,
    sentryConfig, sentryStatus, loading,
    loadDrivers, loadTrips, loadAssignments,
    refreshTripsFromSentry, checkSentryHealth,
    syncDriversFromSentry, pushAllLocationsToSentry,
    runAISchedulerPipeline,
    setSchedules, setSentryConfig, setCompany,
    supabase,
    role: profile?.role || null,
    isAdmin: profile?.role === 'admin',
    isCompany: profile?.role === 'company',
    isDispatcher: profile?.role === 'dispatcher' || profile?.role === 'admin',
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
