import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicSupabaseEnv } from "./env";
// Solo llamar después de comprobar Administrador activo con el cliente del usuario.
export function createAdminClient() {
  const env = publicSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !key) throw new Error("Invitaciones no configuradas.");
  return createClient(env.url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
