import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawUrl = (
  import.meta.env.VITE_SUPABASE_URL ??
  import.meta.env.VITE_SUPBASE_URL ??
  ""
).trim();
const rawKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPBASE_ANON_KEY ??
  ""
).trim();

export const isSupabaseConfigured = Boolean(rawUrl && rawKey);

const fallbackUrl = "https://placeholder.supabase.co";
const fallbackKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.placeholder";

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? rawUrl : fallbackUrl,
  isSupabaseConfigured ? rawKey : fallbackKey,
);
