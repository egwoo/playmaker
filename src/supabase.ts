import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://ofdoctaucbdsfzqqekds.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_aVerXhWzFFacGGyy4lLCSA_26Z9altV';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
