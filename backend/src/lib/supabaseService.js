import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseService =
  url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

export function assertSupabaseService() {
  if (!supabaseService) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no backend.");
  }
  return supabaseService;
}
