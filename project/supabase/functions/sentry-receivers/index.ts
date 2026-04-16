import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const pathname = url.pathname;

    const secret = url.searchParams.get('secret') || '';
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const { data: cfg } = await supabase
      .from('sentry_config')
      .select('webhook_secret, enabled')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const providedSecret = secret || bearerToken;

    if (cfg?.webhook_secret && cfg.webhook_secret !== '' && cfg.webhook_secret !== providedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let endpoint = 'unknown';
    if (pathname.includes('trips_receiver')) endpoint = 'trips_receiver';
    else if (pathname.includes('drivers_receiver')) endpoint = 'drivers_receiver';
    else if (pathname.includes('vehicles_receiver')) endpoint = 'vehicles_receiver';

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const idempotencyKey = String(
      (payload as Record<string, unknown>).trip_id ||
      (payload as Record<string, unknown>).id ||
      Date.now()
    );

    const { data: existing } = await supabase
      .from('webhook_logs')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .eq('endpoint', endpoint)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ status: 'duplicate', trip_processing_status_id: 1 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const acceptedIds: string[] = [];
    let logStatus = 'processed';
    let logError = '';

    if (endpoint === 'trips_receiver') {
      const trips = Array.isArray(payload) ? payload : (payload.trips as unknown[] || [payload]);

      for (const raw of trips) {
        const t = raw as Record<string, unknown>;
        const tripId = String(t.trip_id || t.id || '');
        if (!tripId) continue;

        const mapped = {
          sentry_trip_id: tripId,
          sentry_last_modified_at: String(t.last_modified_at || ''),
          date_val: String(t.date || t.schedule_date || ''),
          los: String(t.level_of_service || t.los || ''),
          passengers: String(t.passenger_count || t.passengers || '1'),
          mileage: String(t.mileage || t.estimated_miles || ''),
          pu_address: String(t.pickup_address || t.pu_address || ''),
          pu_city: String(t.pickup_city || t.pu_city || ''),
          pu_zip: String(t.pickup_zip || t.pu_zip || ''),
          pu_time: String(t.scheduled_pickup_time || t.pu_time || ''),
          do_address: String(t.dropoff_address || t.do_address || ''),
          do_city: String(t.dropoff_city || t.do_city || ''),
          do_zip: String(t.dropoff_zip || t.do_zip || ''),
          do_time: String(t.scheduled_dropoff_time || t.do_time || ''),
          delivery_price: String(t.total_amount || t.delivery_price || ''),
          status: 'available',
          loaded_at: new Date().toISOString(),
        };

        const { error: upsertErr } = await supabase
          .from('marketplace_trips')
          .upsert(mapped, { onConflict: 'sentry_trip_id' });

        if (!upsertErr) {
          acceptedIds.push(tripId);

          const { data: schedCfg } = await supabase
            .from('auto_scheduler_config')
            .select('auto_accept_inbound, auto_assign, enabled')
            .maybeSingle();

          if (schedCfg?.auto_accept_inbound && schedCfg?.auto_assign && schedCfg?.enabled) {
            const { data: onlineDrivers } = await supabase
              .from('drivers')
              .select('id, full_name, current_lat, current_lng, status')
              .in('status', ['online', 'on_trip'])
              .eq('is_active', true);

            if (onlineDrivers && onlineDrivers.length > 0) {
              const { data: existingAssignments } = await supabase
                .from('trip_assignments')
                .select('driver_id, count')
                .in('status', ['pending', 'accepted'])
                .select('driver_id');

              const assignedDriverIds = new Set(
                (existingAssignments || []).map((a: Record<string, unknown>) => a.driver_id)
              );

              const freeDrivers = onlineDrivers.filter(
                (d: Record<string, unknown>) => !assignedDriverIds.has(d.id)
              );

              if (freeDrivers.length > 0) {
                const driver = freeDrivers[0] as Record<string, unknown>;
                const nextOrder = (existingAssignments || []).filter(
                  (a: Record<string, unknown>) => a.driver_id === driver.id
                ).length + 1;

                await supabase.from('trip_assignments').insert({
                  trip_id: tripId,
                  driver_id: driver.id,
                  driver_name: driver.full_name,
                  status: 'pending',
                  trip_processing_status_id: 1,
                  pu_address: mapped.pu_address,
                  do_address: mapped.do_address,
                  pu_time: mapped.pu_time,
                  delivery_price: parseFloat(mapped.delivery_price) || 0,
                  mileage: parseFloat(mapped.mileage) || 0,
                  scheduled_order: nextOrder,
                  assigned_at: new Date().toISOString(),
                });

                await supabase
                  .from('marketplace_trips')
                  .update({ status: 'assigned', taken_by: driver.id })
                  .eq('sentry_trip_id', tripId);
              }
            }
          }
        } else {
          logStatus = 'error';
          logError = upsertErr.message;
        }
      }
    } else if (endpoint === 'drivers_receiver') {
      const drivers = Array.isArray(payload) ? payload : (payload.drivers as unknown[] || [payload]);
      for (const raw of drivers) {
        const d = raw as Record<string, unknown>;
        const sentryId = String(d.id || d.driver_id || '');
        if (!sentryId) continue;

        const { data: existing } = await supabase
          .from('drivers')
          .select('id')
          .eq('sentry_driver_id', sentryId)
          .maybeSingle();

        if (existing) {
          await supabase.from('drivers').update({
            full_name: String(d.name || d.full_name || ''),
            phone: String(d.phone || ''),
            email: String(d.email || ''),
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id);
        }
      }
    } else if (endpoint === 'vehicles_receiver') {
      const vehicles = Array.isArray(payload) ? payload : (payload.vehicles as unknown[] || [payload]);
      for (const raw of vehicles) {
        const v = raw as Record<string, unknown>;
        const sentryVehicleId = String(v.id || v.vehicle_id || '');
        if (!sentryVehicleId) continue;

        await supabase.from('drivers').update({
          updated_at: new Date().toISOString(),
        }).eq('sentry_vehicle_id', sentryVehicleId);
      }
    }

    await supabase.from('webhook_logs').insert({
      endpoint,
      raw_payload: payload,
      processed: logStatus !== 'error',
      idempotency_key: idempotencyKey,
      error_message: logError,
      trip_ids_accepted: acceptedIds,
      received_at: new Date().toISOString(),
    });

    const response: Record<string, unknown> = {
      status: logStatus,
      trip_processing_status_id: 1,
      accepted_count: acceptedIds.length,
    };
    if (acceptedIds.length > 0) response.accepted_trip_ids = acceptedIds;

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
