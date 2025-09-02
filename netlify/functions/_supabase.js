// netlify/functions/_supabase.js
import { createClient } from '@supabase/supabase-js';

export const getAdminClient = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE; // SERVICE ROLE (server-side only)
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  return createClient(url, key, { auth: { persistSession: false } });
};
