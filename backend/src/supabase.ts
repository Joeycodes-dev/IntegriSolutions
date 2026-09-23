import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (!cached) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment');
    }

    if (supabaseServiceRoleKey.startsWith('sb_publishable_')) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY must be the Supabase service role key, not a publishable key');
    }

    cached = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        detectSessionInUrl: false
      }
    });
  }
  return cached;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, _receiver) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  }
});
