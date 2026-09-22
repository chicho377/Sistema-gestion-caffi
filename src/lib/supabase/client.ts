"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "./env";
export function createClient() {
  const env = publicSupabaseEnv();
  if (!env) throw new Error("El servicio de acceso no está configurado.");
  return createBrowserClient(env.url, env.key);
}
