import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { publicSupabaseEnv } from "./supabase/env";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "collaborator";
  status: "active" | "inactive";
  created_at: string;
  last_access_at: string | null;
};
export async function getActiveProfile() {
  if (!publicSupabaseEnv()) return null;
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await client
    .from("profiles")
    .select("id,full_name,email,role,status,created_at,last_access_at")
    .eq("id", user.id)
    .single();
  return profile?.status === "active" ? (profile as Profile) : null;
}
export async function requireProfile() {
  const profile = await getActiveProfile();
  if (!profile) redirect("/login?notice=session");
  return profile;
}
export async function requireAdmin() {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard?notice=forbidden");
  return profile;
}
export function appOrigin() {
  const value = process.env.APP_URL;
  if (!value) throw new Error("APP_URL no configurada.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("Origen inválido.");
  return url.origin;
}
