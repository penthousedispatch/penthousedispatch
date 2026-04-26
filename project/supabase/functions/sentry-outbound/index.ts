import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const cleanAuthValue = (value: unknown) => String(value ?? '').replace(/\u00a0/g, ' ').trim();
const resolveAuthMode = (authType: unknown, username: string, apiKey: string) => {
  const normalized = cleanAuthValue(authType).toLowerCase();
  if ((normalized === 'bearer' || normalized === 'api_key') && apiKey) return 'bearer';
  if (username) return 'basic';
  if (apiKey) return 'bearer';
  return 'none';
};
const TIMEOUT_MS = 15000;

const isWriteMethod = (method: string) => !['GET', 'HEAD', 'OPTIONS'].includes(method);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const extractErrorMessage = (payload: unknown, fallbackStatus?: number) => {
  if (!payload) return fallbackStatus ? `HTTP ${fallbackStatus}` : 'Unknown outbound error';
  if (typeof payload === 'string') return payload || (fallbackStatus ? `HTTP ${fallbackStatus}` : 'Unknown outbound error');
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    return String(
      record.message ||
      record.error ||
      record.detail ||
      record.hint ||
      (fallbackStatus ? `HTTP ${fallbackStatus}` : 'Unknown outbound error')
    );
  }
  return fallbackStatus ? `HTTP ${fallbackStatus}` : 'Unknown outbound error';
};

const classifyHttpError = (status: number) => {
  if (status === 401 || status === 403) return 'auth';
  if (status >= 400 && status < 500) return 'upstream_http';
  if (status >= 500) return 'upstream_http';
  return 'upstream_http';
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const url = new URL(req.url);
    if (!url.pathname.endsWith('/request')) {
      return json({ error: 'Not found' }, 404);
    }

    const body = await req.json().catch(() => ({}));
    const method = String(body.method || 'GET').toUpperCase();
    const path = String(body.path || '');
    const outboundBody = body.body ?? null;

    if (!path.startsWith('/rest/')) {
      return json({ error: 'Invalid Sentry path' }, 400);
    }

    const { data: cfg, error: cfgError } = await supabase
      .from('sentry_config')
      .select('base_url, auth_type, username, password_enc, api_key, enabled, sandbox, pause_sandbox_outbound')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cfgError) {
      return json({ phase: 'edge', error_type: 'config', message: cfgError.message, status: 500 }, 500);
    }

    if (!cfg?.base_url || cfg.enabled === false) {
      return json({ phase: 'edge', error_type: 'config', message: 'Sentry config is missing or disabled', status: 400 }, 400);
    }

    if (cfg.sandbox !== false && cfg.pause_sandbox_outbound === true && isWriteMethod(method)) {
      return json(
        {
          latencyMs: 0,
          status: 202,
          data: {
            skipped: true,
            reason: 'sandbox_outbound_paused',
            message: 'Sandbox outbound writes are paused in admin settings.',
            method,
            path,
          },
        },
        202,
      );
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    const username = cleanAuthValue(cfg.username);
    const password = cleanAuthValue(cfg.password_enc);
    const apiKey = cleanAuthValue(cfg.api_key);
    const authMode = resolveAuthMode(cfg.auth_type, username, apiKey);

    if (authMode === 'basic' && username) {
      headers.Authorization = `Basic ${btoa(`${username}:${password}`)}`;
    } else if (authMode === 'bearer' && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const upstreamBase = String(cfg.base_url).replace(/\/$/, '');
    const upstreamUrl = `${upstreamBase}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);

    try {
      const started = Date.now();
      const response = await fetch(upstreamUrl, {
        method,
        headers,
        signal: controller.signal,
        ...(outboundBody ? { body: JSON.stringify(outboundBody) } : {}),
      });
      const latencyMs = Date.now() - started;
      const text = await response.text();

      let data: unknown = text;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        // Keep text response as-is.
      }

      if (!response.ok) {
        return json(
          {
            phase: 'upstream',
            error_type: classifyHttpError(response.status),
            message: extractErrorMessage(data, response.status),
            status: response.status,
            latencyMs,
            upstream_host: new URL(upstreamBase).host,
            upstream_path: path,
            data,
          },
          response.status,
        );
      }

      return json(
        {
          latencyMs,
          status: response.status,
          data,
        },
        response.status,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isAbort = error instanceof DOMException ? error.name === 'AbortError' : message === 'timeout';
      return json(
        {
          phase: 'upstream',
          error_type: isAbort ? 'timeout' : 'network',
          message: isAbort ? `Outbound request timed out after ${TIMEOUT_MS}ms` : message,
          status: 502,
          upstream_host: new URL(upstreamBase).host,
          upstream_path: path,
        },
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return json(
      {
        phase: 'edge',
        error_type: 'config',
        message: error instanceof Error ? error.message : 'Unknown error',
        status: 500,
      },
      500,
    );
  }
});
