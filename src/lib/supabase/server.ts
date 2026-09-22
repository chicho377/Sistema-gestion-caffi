import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicSupabaseEnv } from "./env";
export async function createClient() {
  const env = publicSupabaseEnv();
  if (!env) throw new Error("El servicio de acceso no está configurado.");
  const jar = await cookies();
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Server Components no escriben cookies; proxy renueva sesión. */
        }
      },
    },
  });
}
