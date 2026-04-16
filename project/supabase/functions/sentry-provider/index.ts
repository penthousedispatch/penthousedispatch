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
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    const respond = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    const { data: cfg } = await supabase
      .from('sentry_config')
      .select('webhook_secret')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cfg?.webhook_secret && cfg.webhook_secret !== '' && cfg.webhook_secret !== bearerToken) {
      return respond({ error: 'Unauthorized' }, 401);
    }

    // GET /rest/gc/vehicle_locations.json — all online driver locations
    if (pathname.includes('vehicle_locations')) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, sentry_vehicle_id, current_lat, current_lng, status, full_name, updated_at')
        .eq('is_active', true)
        .in('status', ['online', 'on_trip']);

      const locations = (drivers || [])
        .filter((d: Record<string, unknown>) => d.current_lat && d.current_lng)
        .map((d: Record<string, unknown>) => ({
          vehicle_id: d.sentry_vehicle_id || d.id,
          driver_id: d.id,
          driver_name: d.full_name,
          lat: parseFloat(String(d.current_lat)),
          lng: parseFloat(String(d.current_lng)),
          status: d.status,
          timestamp: d.updated_at,
        }));

      return respond({ vehicle_locations: locations, count: locations.length });
    }

    // GET /rest/gc/vehicle_location.json?vehicle_id=X — single vehicle
    if (pathname.includes('vehicle_location')) {
      const vehicleId = url.searchParams.get('vehicle_id');
      if (!vehicleId) return respond({ error: 'vehicle_id required' }, 400);

      const { data: driver } = await supabase
        .from('drivers')
        .select('id, sentry_vehicle_id, current_lat, current_lng, status, full_name, updated_at')
        .eq('sentry_vehicle_id', vehicleId)
        .maybeSingle();

      if (!driver) return respond({ error: 'Vehicle not found' }, 404);

      return respond({
        vehicle_id: vehicleId,
        lat: parseFloat(String(driver.current_lat)),
        lng: parseFloat(String(driver.current_lng)),
        status: driver.status,
        timestamp: driver.updated_at,
      });
    }

    // GET /rest/gc/vehicle_waypoint_etas.json — waypoint ETAs
    if (pathname.includes('vehicle_waypoint_etas')) {
      const { data: assignments } = await supabase
        .from('trip_assignments')
        .select('*, drivers(sentry_vehicle_id, current_lat, current_lng, full_name)')
        .in('status', ['accepted', 'pending'])
        .order('assigned_at', { ascending: false })
        .limit(50);

      const etas = (assignments || []).map((a: Record<string, unknown>) => {
        const driver = a.drivers as Record<string, unknown> | null;
        return {
          vehicle_id: driver?.sentry_vehicle_id || a.driver_id,
          trip_id: a.trip_id,
          driver_name: a.driver_name,
          pu_address: a.pu_address,
          pu_time: a.pu_time,
          scheduled_order: a.scheduled_order,
          travel_time_mins: a.travel_time_mins,
          status: a.status,
        };
      });

      return respond({ vehicle_waypoint_etas: etas });
    }

    // GET /rest/gc/retrieve_trips.json — TP-stored trips
    if (pathname.includes('retrieve_trips')) {
      const { data: trips } = await supabase
        .from('marketplace_trips')
        .select('*')
        .in('status', ['available', 'assigned'])
        .order('loaded_at', { ascending: false })
        .limit(200);

      const mapped = (trips || []).map((t: Record<string, unknown>) => ({
        trip_id: t.sentry_trip_id,
        date: t.date_val,
        level_of_service: t.los,
        passenger_count: t.passengers,
        mileage: t.mileage,
        pickup_address: t.pu_address,
        pickup_city: t.pu_city,
        pickup_zip: t.pu_zip,
        scheduled_pickup_time: t.pu_time,
        dropoff_address: t.do_address,
        dropoff_city: t.do_city,
        dropoff_zip: t.do_zip,
        scheduled_dropoff_time: t.do_time,
        total_amount: t.delivery_price,
        status: t.status,
        last_modified_at: t.sentry_last_modified_at,
      }));

      return respond({ trips: mapped, count: mapped.length });
    }

    // GET /driver_work_shifts.json — driver shift schedules
    if (pathname.includes('driver_work_shifts')) {
      const { data: config } = await supabase
        .from('auto_scheduler_config')
        .select('shift_hours')
        .maybeSingle();

      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, sentry_driver_id, full_name, status')
        .eq('is_active', true);

      const shifts = (drivers || []).map((d: Record<string, unknown>) => ({
        driver_id: d.sentry_driver_id || d.id,
        driver_name: d.full_name,
        shift_hours: config?.shift_hours || '7am-5pm',
        status: d.status,
      }));

      return respond({ driver_work_shifts: shifts });
    }

    return respond({ error: 'Unknown endpoint', path: pathname }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
