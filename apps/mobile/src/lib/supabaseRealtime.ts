import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseRealtimeConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseRealtime = hasSupabaseRealtimeConfig
  ? createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;
