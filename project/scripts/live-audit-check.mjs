#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readEnvFile(relPath) {
  const out = {};
  const filePath = path.join(root, relPath);
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function getJson(url, headers) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    data,
    text,
  };
}

function encodeInList(values) {
  return values
    .map(value => `"${String(value).replace(/"/g, '\\"')}"`)
    .join(',');
}

const env = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local'),
};

const base = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!base || !serviceRole) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  apikey: serviceRole,
  Authorization: `Bearer ${serviceRole}`,
};

const sentryConfig = await getJson(
  `${base}/rest/v1/sentry_config?select=id,enabled,base_url,auth_type,webhook_auth_mode,webhook_secret,updated_at&order=updated_at.desc&limit=1`,
  headers,
);

const aiSettings = await getJson(
  `${base}/rest/v1/ai_settings?select=org_id,provider,model,api_key,motivation_enabled,scheduling_enabled,updated_at&order=updated_at.desc&limit=5`,
  headers,
);

const failedSyncs = await getJson(
  `${base}/rest/v1/sentry_sync_log?select=sync_type,status,error_message,created_at&status=eq.failed&order=created_at.desc&limit=8`,
  headers,
);

const pendingWebhookLogs = await getJson(
  `${base}/rest/v1/webhook_logs?select=webhook_type,processed,error_message,received_at&processed=eq.false&order=received_at.desc&limit=8`,
  headers,
);

const webhookLogsSample = await getJson(
  `${base}/rest/v1/webhook_logs?select=*&limit=1`,
  headers,
);

const recentAssignments = await getJson(
  `${base}/rest/v1/trip_assignments?select=trip_id,status,driver_id,company_id,assigned_at,accepted_at,trip_processing_status_id,notes&order=assigned_at.desc&limit=50`,
  headers,
);

let marketplaceTrips = { data: [] };
if (Array.isArray(recentAssignments.data) && recentAssignments.data.length) {
  const tripIds = [...new Set(recentAssignments.data.map(row => row.trip_id).filter(Boolean))];
  const inList = encodeURIComponent(encodeInList(tripIds));
  marketplaceTrips = await getJson(
    `${base}/rest/v1/marketplace_trips?select=sentry_trip_id,status,external_trip_status,taken_by,raw_payload&sentry_trip_id=in.(${inList})`,
    headers,
  );
}

const marketplaceMap = new Map(
  (marketplaceTrips.data || []).map(row => [row.sentry_trip_id, row]),
);

const anomalies = (recentAssignments.data || [])
  .map(assignment => {
    const marketplace = marketplaceMap.get(assignment.trip_id);
    if (!marketplace) return null;

    const assignmentStatus = String(assignment.status || '').toLowerCase();
    const marketplaceStatus = String(marketplace.status || '').toLowerCase();
    const externalStatus = String(marketplace.external_trip_status || '').toLowerCase();
    const rawStatusId = marketplace.raw_payload?.status_id ?? null;
    const takenBy = marketplace.taken_by || null;

    const mismatch =
      (['pending', 'assigned'].includes(assignmentStatus) && Boolean(takenBy)) ||
      (assignmentStatus === 'accepted' &&
        ['available', 'pending', 'assigned'].includes(marketplaceStatus));

    if (!mismatch) return null;

    return {
      trip_id: assignment.trip_id,
      assignment_status: assignmentStatus,
      marketplace_status: marketplaceStatus,
      external_trip_status: externalStatus,
      raw_status_id: rawStatusId,
      taken_by: takenBy,
    };
  })
  .filter(Boolean);

const currentSentryConfig = sentryConfig.data?.[0] || null;
const currentAiSettings = aiSettings.data?.[0] || null;

let receiverSmoke = null;
if (currentSentryConfig?.webhook_secret) {
  const smokeId = `audit-vehicle-${Date.now()}`;
  const receiverUrl = `${base}/functions/v1/sentry-receivers/vehicles_receiver?secret=${encodeURIComponent(currentSentryConfig.webhook_secret)}`;
  const response = await fetch(receiverUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_ANON_KEY || '',
      Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY || ''}`,
    },
    body: JSON.stringify({
      vehicles: [{ id: smokeId, make: 'Audit', model: 'Probe', year: 2026 }],
    }),
  });
  const text = await response.text();
  receiverSmoke = {
    ok: response.ok,
    status: response.status,
    body: text.slice(0, 300),
  };
}

let aiProbe = null;
if (currentAiSettings?.provider && currentAiSettings?.provider !== 'disabled' && currentAiSettings?.api_key) {
  const response = await fetch(`${base}/functions/v1/ai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_ANON_KEY || '',
      Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY || ''}`,
    },
    body: JSON.stringify({
      settings: currentAiSettings,
      messages: [
        { role: 'system', content: 'Reply with the single word OK.' },
        { role: 'user', content: 'Health check.' },
      ],
      options: { max_tokens: 24 },
    }),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  aiProbe = {
    ok: response.ok,
    status: response.status,
    error: parsed?.error || null,
    text: parsed?.text || text.slice(0, 200),
    model: parsed?.model || currentAiSettings.model || '',
  };
}

console.log(
  JSON.stringify(
    {
      sentry_config: currentSentryConfig
        ? {
            ...currentSentryConfig,
            webhook_secret: currentSentryConfig.webhook_secret ? '[present]' : '',
          }
        : null,
      ai_settings: (aiSettings.data || []).map(row => ({
        ...row,
        api_key: row.api_key ? '[present]' : '',
      })),
      failed_syncs: failedSyncs.data || [],
      pending_webhooks: pendingWebhookLogs.data || [],
      webhook_logs_sample: webhookLogsSample.data || webhookLogsSample.text || null,
      receiver_smoke: receiverSmoke,
      ai_probe: aiProbe,
      anomaly_count: anomalies.length,
      anomalies,
    },
    null,
    2,
  ),
);
