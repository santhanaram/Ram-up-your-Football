import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Null until the Supabase project is configured (Stage 3), so the game still runs offline.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
