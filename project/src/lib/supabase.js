import { createClient } from '@supabase/supabase-js';
import { isNativeApp } from './mobileRuntime';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'pkce',
    // Native auth links are handled by Capacitor and then routed back into the app.
    detectSessionInUrl: !isNativeApp(),
  },
});
