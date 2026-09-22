"use server";
import { revalidatePath } from "next/cache";
import { getActiveProfile, appOrigin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/features/auth/actions";

export async function inviteUser(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const name = String(form.get("full_name") || "").trim();
  const email = String(form.get("email") || "")
    .trim()
    .toLowerCase();
  if (
    !name ||
    name.length > 120 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    return { error: "Revisa el nombre y el correo electrónico." };
  try {
    const actor = await getActiveProfile();
    if (actor?.role !== "admin")
      return { error: "No tienes permiso para invitar usuarios." };
    const client = await createClient();
    // Registrar intención con el cliente del actor, sujeto a autorización vigente.
    const { error: auditError } = await client.rpc("record_invitation", {
      target_email: email,
    });
    if (auditError) return { error: "No fue posible autorizar la invitación." };
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name },
      redirectTo: `${appOrigin()}/auth/confirm`,
    });
    if (error)
      return {
        error:
          "No se pudo enviar la invitación. Comprueba si el usuario ya existe o intenta más tarde.",
      };
  } catch {
    return { error: "El servicio de invitaciones no está disponible." };
  }
  revalidatePath("/usuarios");
  return { success: "Invitación enviada. El usuario tendrá rol Colaborador." };
}

export async function updateUser(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const id = String(form.get("id") || "");
  const role = String(form.get("role") || "");
  const status = String(form.get("status") || "");
  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !["admin", "collaborator"].includes(role) ||
    !["active", "inactive"].includes(status)
  )
    return { error: "Revisa el rol y el estado." };
  try {
    const actor = await getActiveProfile();
    if (actor?.role !== "admin")
      return { error: "No tienes permiso para administrar usuarios." };
    if (actor.id === id && actor.role !== role)
      return { error: "No puedes cambiar tu propio rol." };
    const client = await createClient();
    const { data, error } = await client
      .from("profiles")
      .update({ role, status })
      .eq("id", id)
      .select("id");
    if (error || !data?.length)
      return {
        error:
          "No se pudo actualizar el usuario. Verifica tus permisos e intenta nuevamente.",
      };
  } catch {
    return { error: "No se pudo conectar con el servicio." };
  }
  revalidatePath("/usuarios");
  return { success: "Usuario actualizado." };
}
