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

async function requestText(url, { method = 'GET', headers = {} } = {}) {
  const response = await fetch(url, { method, headers });
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
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
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function del(table, query) {
  const result = await requestText(`${base}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers,
  });
  console.log(`${table} ${result.status} ${result.text.slice(0, 200)}`);
  if (!result.ok) process.exitCode = 1;
}

await del('trip_assignments', 'trip_id=like.AUDIT-QUEUE-*');
await del('marketplace_trips', 'sentry_trip_id=like.AUDIT-OFFER-*');
await del('marketplace_trips', 'sentry_trip_id=like.AUDIT-QUEUE-*');
await del('drivers', 'full_name=like.Audit%20Queue*');
