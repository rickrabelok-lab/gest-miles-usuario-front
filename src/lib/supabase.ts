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

/** False em produção se o Vercel não tiver definido as envs no build → mostrar aviso em vez de tela branca. */
export const isSupabaseConfigured = Boolean(rawUrl && rawKey);

// Placeholders só para satisfazer o tipo; com isSupabaseConfigured false a UI não usa o client de verdade.
const fallbackUrl = "https://placeholder.supabase.co";
const fallbackKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.placeholder";

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? rawUrl : fallbackUrl,
  isSupabaseConfigured ? rawKey : fallbackKey,
);
