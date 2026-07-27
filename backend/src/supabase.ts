import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const envFile = fs.existsSync(path.resolve(process.cwd(), '.env.local'))
  ? '.env.local'
  : '.env';

dotenv.config({ path: envFile });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment');
}

if (supabaseServiceRoleKey.startsWith('sb_publishable_')) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY must be the Supabase service role key, not a publishable key');
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    detectSessionInUrl: false
  }
});
