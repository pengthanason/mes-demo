import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[MES] Missing Supabase env vars.\n' +
    'Create a .env.local file with:\n' +
    '  VITE_SUPABASE_URL=https://xxxx.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=your-anon-key'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
