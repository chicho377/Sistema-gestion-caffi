"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { appOrigin, getActiveProfile } from "@/lib/auth";
import {
  allowPasswordChange,
  canChangePassword,
  clearPasswordChange,
} from "@/lib/password-flow";

export type FormState = { error?: string; success?: string };
async function clearSessionCookies() {
  const jar = await cookies();
  for (const cookie of jar.getAll())
    if (cookie.name.startsWith("sb-")) jar.delete(cookie.name);
}
const emailFrom = (form: FormData) =>
  String(form.get("email") || "")
    .trim()
    .toLowerCase();
const validEmail = (email: string) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = emailFrom(form);
  const password = String(form.get("password") || "");
  if (!validEmail(email) || !password || password.length > 4096)
    return { error: "Revisa el correo y la contraseña." };
  try {
    const client = await createClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error)
      return {
        error:
          "No fue posible iniciar sesión. Revisa tus datos o consulta al Administrador.",
      };
    if (!(await getActiveProfile())) {
      await client.auth.signOut({ scope: "local" });
      return {
        error:
          "No fue posible iniciar sesión. Revisa tus datos o consulta al Administrador.",
      };
    }
    const { error: accessError } = await client.rpc("record_access");
    if (accessError) {
      await client.auth.signOut({ scope: "local" });
      return { error: "No pudimos completar el acceso. Intenta nuevamente." };
    }
  } catch {
    return {
      error: "El servicio de acceso no está disponible. Intenta nuevamente.",
    };
  }
  redirect("/dashboard");
}

export async function recover(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const email = emailFrom(form);
  if (!validEmail(email))
    return { error: "Ingresa un correo electrónico válido." };
  try {
    const client = await createClient();
    // Respuesta uniforme: no revelar si una cuenta existe ni su estado.
    await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${appOrigin()}/auth/confirm`,
    });
  } catch {
    return {
      error: "El servicio de correo no está disponible. Intenta más tarde.",
    };
  }
  return {
    success:
      "Si el correo corresponde a una cuenta, recibirás un enlace para recuperar tu acceso. Revisa también la carpeta de spam.",
  };
}

export async function acceptEmailLink(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const token_hash = String(form.get("token_hash") || "");
  const type = form.get("type");
  if (
    !token_hash ||
    token_hash.length > 2048 ||
    (type !== "recovery" && type !== "invite")
  )
    return { error: "El enlace no es válido. Solicita uno nuevo." };
  try {
    const client = await createClient();
    const { data, error } = await client.auth.verifyOtp({ token_hash, type });
    if (error || !data.user)
      return {
        error: "El enlace venció o ya fue utilizado. Solicita uno nuevo.",
      };
    if (!(await getActiveProfile())) {
      await client.auth.signOut({ scope: "local" });
      return {
        error:
          "Esta cuenta no tiene acceso habilitado. Consulta al Administrador.",
      };
    }
    await allowPasswordChange(data.user.id);
  } catch {
    return {
      error:
        "No pudimos validar el enlace. Intenta nuevamente o solicita uno nuevo.",
    };
  }
  redirect("/nueva-contrasena");
}

export async function updatePassword(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const password = String(form.get("password") || "");
  if (
    !password ||
    password.length > 4096 ||
    password !== String(form.get("confirmation") || "")
  )
    return { error: "Las contraseñas deben coincidir y no estar vacías." };
  try {
    const profile = await getActiveProfile();
    if (!profile || !(await canChangePassword(profile.id)))
      return { error: "Tu enlace ya no es válido. Solicita uno nuevo." };
    const client = await createClient();
    const { error } = await client.auth.updateUser({ password });
    if (error)
      return {
        error:
          error.code === "weak_password"
            ? "La contraseña no cumple la política de seguridad del servicio. Usa una contraseña más larga y variada."
            : "No se pudo actualizar. Prueba una contraseña diferente o solicita otro enlace.",
      };
    await clearPasswordChange();
    await client.auth.signOut({ scope: "global" });
    await clearSessionCookies();
  } catch {
    return { error: "No se pudo completar el cambio. Intenta nuevamente." };
  }
  redirect("/login?notice=password-updated");
}

export async function logout() {
  try {
    const client = await createClient();
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Una caída de Auth no debe impedir abandonar la sesión de este navegador.
  } finally {
    await clearSessionCookies();
    await clearPasswordChange();
  }
  redirect("/login");
}
