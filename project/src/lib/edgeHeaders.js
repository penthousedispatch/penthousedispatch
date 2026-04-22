import { supabase } from './supabase';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export async function getEdgeFunctionHeaders() {
  if (!SUPABASE_ANON_KEY) {
    throw new Error('Missing VITE_SUPABASE_ANON_KEY for edge function call');
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message || 'Failed to read Supabase session');
  }

  const accessToken = data?.session?.access_token || '';
  if (!accessToken) {
    throw new Error('Missing Supabase session token for edge function call');
  }

  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  };
}
