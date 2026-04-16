import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/+/, '');

    if (!path.endsWith('health-check')) {
      return json({ error: 'Not found' }, 404);
    }

    const body = await req.json();
    const baseUrl = String(body.base_url || '').replace(/\/$/, '');
    const authType = String(body.auth_type || 'basic');
    const username = String(body.username || '');
    const password = String(body.password_enc || '');
    const apiKey = String(body.api_key || '');

    if (!baseUrl) {
      return json({ authenticated: false, error: 'Missing base_url' }, 400);
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (authType === 'basic' && username) {
      headers.Authorization = `Basic ${btoa(`${username}:${password}`)}`;
    } else if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const started = Date.now();
    const res = await fetch(`${baseUrl}/rest/transportation_provider_facade/v4.0/trips.json`, {
      method: 'GET',
      headers,
    });
    const latencyMs = Date.now() - started;
    const text = await res.text();

    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // keep text
    }

    const authenticated = res.ok || res.status === 400 || res.status === 206;
    let hint: string | null = null;

    if (res.status === 400) {
      hint = 'Connected. Sentry responded with 400 because the trips endpoint expects date parameters.';
    } else if (res.status === 401) {
      hint = 'Authentication failed. Double-check the saved Sentry username/password or bearer token.';
    } else if (res.status === 403) {
      hint = 'Authenticated, but this account does not have permission for the endpoint.';
    } else if (res.status === 404) {
      hint = 'The saved Sentry base URL looks incorrect.';
    }

    return json({
      authenticated,
      latencyMs,
      status: res.status,
      error: authenticated ? null : `HTTP ${res.status}`,
      hint,
      data,
    });
  } catch (error) {
    return json({
      authenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});
